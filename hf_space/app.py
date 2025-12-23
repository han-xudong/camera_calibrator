import os
import subprocess
import tempfile
import json
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any

app = FastAPI()

# Allow CORS for GitHub Pages
origins = [
    "http://localhost:3000",
    "https://han-xudong.github.io",
    # Add your specific github pages domain if different
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
    return {"status": "Camera Calibrator Backend is running"}

@app.post("/detect")
async def detect_corners(
    image: UploadFile = File(...),
    rows: int = Form(...),
    cols: int = Form(...)
):
    # Create temp file for image
    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as tmp:
        shutil.copyfileobj(image.file, tmp)
        tmp_path = tmp.name

    try:
        # Call C++ executable
        # ./detect_corners <image_path> <rows> <cols>
        result = subprocess.run(
            ["./detect_corners", tmp_path, str(rows), str(cols)],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            # Try to parse error output if it's JSON-like, else return raw
            return {"success": False, "error": f"Process failed: {result.stderr or result.stdout}"}
        
        # Parse output JSON
        try:
            output_json = json.loads(result.stdout)
            return output_json
        except json.JSONDecodeError:
            return {"success": False, "error": f"Invalid JSON output: {result.stdout}"}

    finally:
        # Cleanup
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

class CalibrationData(BaseModel):
    allImagePoints: List[List[Dict[str, float]]]
    objPoints: List[List[Dict[str, float]]]
    imageSize: Dict[str, int]

@app.post("/calibrate")
async def calibrate_camera_endpoint(data: CalibrationData):
    # Format data for C++ executable
    # Line 1: width height N
    # Block: M
    # M lines x y
    # M lines X Y Z
    
    width = data.imageSize.get("width", 0)
    height = data.imageSize.get("height", 0)
    N = len(data.allImagePoints)
    
    if N == 0:
        return {"success": False, "error": "No image points provided"}
        
    input_str = f"{width} {height} {N}\n"
    
    for i in range(N):
        img_pts = data.allImagePoints[i]
        obj_pts = data.objPoints[i]
        M = len(img_pts)
        
        if len(obj_pts) != M:
             return {"success": False, "error": f"Mismatch in points count for image {i}"}
             
        input_str += f"{M}\n"
        
        # Image points
        for pt in img_pts:
            input_str += f"{pt['x']} {pt['y']}\n"
            
        # Object points
        for pt in obj_pts:
            z = pt.get('z', 0.0)
            input_str += f"{pt['x']} {pt['y']} {z}\n"

    # Write to temp file
    with tempfile.NamedTemporaryFile(delete=False, mode='w', suffix=".txt") as tmp:
        tmp.write(input_str)
        tmp_path = tmp.name
        
    try:
        # Call C++ executable
        result = subprocess.run(
            ["./calibrate_camera", tmp_path],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            return {"success": False, "error": f"Process failed: {result.stderr or result.stdout}"}
            
        try:
            output_json = json.loads(result.stdout)
            return output_json
        except json.JSONDecodeError:
            return {"success": False, "error": f"Invalid JSON output: {result.stdout}"}
            
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
