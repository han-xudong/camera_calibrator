import os
import io
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any

app = FastAPI()

# Allow CORS for GitHub Pages
origins = [
    "http://localhost:3000",
    "https://han-xudong.github.io",
    "*" # For testing, you might want to restrict this in production
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "Camera Calibrator Backend is running (Python OpenCV)"}

@app.post("/detect")
async def detect_corners(
    image: UploadFile = File(...),
    rows: int = Form(...),
    cols: int = Form(...)
):
    try:
        # Read image into numpy array
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
             return {"success": False, "error": "Could not decode image"}

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Define flags
        flags = cv2.CALIB_CB_ADAPTIVE_THRESH + cv2.CALIB_CB_NORMALIZE_IMAGE + cv2.CALIB_CB_FAST_CHECK
        
        # Prepare sizes to try
        sizes_to_try = []
        if rows > 0 and cols > 0:
            sizes_to_try.append((cols, rows))
            sizes_to_try.append((rows, cols))
            if cols > 1 and rows > 1:
                sizes_to_try.append((cols - 1, rows - 1))
                sizes_to_try.append((rows - 1, cols - 1))
        else:
            # Auto-detect logic (simplified)
            # Just try common sizes if not specified, or use goodFeaturesToTrack to guess
            # For now, let's assume the user usually provides rows/cols or we try a few standard ones
            for r in range(3, 12):
                for c in range(3, 12):
                    sizes_to_try.append((c, r))
            # Sort by area
            sizes_to_try.sort(key=lambda s: s[0]*s[1], reverse=True)

        found = False
        corners = None
        found_size = None

        for size in sizes_to_try:
            ret, corners_temp = cv2.findChessboardCorners(gray, size, flags)
            if ret:
                found = True
                found_size = size
                corners = corners_temp
                break
        
        if found:
            # Refine corners
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.001)
            corners = cv2.cornerSubPix(gray, corners, (11, 11), (-1, -1), criteria)
            
            # Format output
            corners_list = []
            for i in range(len(corners)):
                corners_list.append({"x": float(corners[i][0][0]), "y": float(corners[i][0][1])})
                
            return {
                "success": True,
                "rows": found_size[1],
                "cols": found_size[0],
                "width": img.shape[1],
                "height": img.shape[0],
                "corners": corners_list
            }
        else:
             msg = f"Chessboard pattern not found. Tried {cols}x{rows}" if rows > 0 else "Auto-detection failed."
             return {"success": False, "error": msg}

    except Exception as e:
        return {"success": False, "error": str(e)}

class CalibrationData(BaseModel):
    allImagePoints: List[List[Dict[str, float]]]
    objPoints: List[List[Dict[str, float]]]
    imageSize: Dict[str, int]

@app.post("/calibrate")
async def calibrate_camera_endpoint(data: CalibrationData):
    try:
        width = data.imageSize.get("width", 0)
        height = data.imageSize.get("height", 0)
        image_size = (width, height)
        
        # Convert to numpy arrays
        obj_points_np = []
        img_points_np = []
        
        for i, pts in enumerate(data.objPoints):
            op = np.zeros((len(pts), 3), np.float32)
            for j, p in enumerate(pts):
                op[j] = [p['x'], p['y'], p.get('z', 0.0)]
            obj_points_np.append(op)
            
        for i, pts in enumerate(data.allImagePoints):
            ip = np.zeros((len(pts), 1, 2), np.float32) # OpenCV expects (N, 1, 2) for image points
            for j, p in enumerate(pts):
                ip[j] = [[p['x'], p['y']]]
            img_points_np.append(ip)
            
        if len(obj_points_np) == 0:
             return {"success": False, "error": "No data points"}

        # Calibrate
        ret, mtx, dist, rvecs, tvecs = cv2.calibrateCamera(
            obj_points_np, img_points_np, image_size, None, None
        )
        
        # Calculate reprojection error
        total_error = 0
        per_view_errors = []
        for i in range(len(obj_points_np)):
            imgpoints2, _ = cv2.projectPoints(obj_points_np[i], rvecs[i], tvecs[i], mtx, dist)
            error = cv2.norm(img_points_np[i], imgpoints2, cv2.NORM_L2) / len(imgpoints2)
            per_view_errors.append(error)
            total_error += error # This is mean error per view? OpenCV's ret is RMS.
            
        # Convert results to list
        rvecs_list = [r.flatten().tolist() for r in rvecs]
        tvecs_list = [t.flatten().tolist() for t in tvecs]
        
        return {
            "success": True,
            "rms": ret,
            "camera_matrix": mtx.tolist(),
            "dist_coeffs": dist.flatten().tolist(),
            "rvecs": rvecs_list,
            "tvecs": tvecs_list,
            "perViewErrors": per_view_errors
        }
        
    except Exception as e:
        return {"success": False, "error": f"Calibration failed: {str(e)}"}

