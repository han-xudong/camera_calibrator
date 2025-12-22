#include <emscripten/bind.h>
#include <opencv2/opencv.hpp>
#include <opencv2/core/mat.hpp>
#include <vector>
#include <iostream>

using namespace cv;
using namespace emscripten;
using namespace std;

// Helper to convert JS Uint8Array to cv::Mat
Mat uint8ArrayToMat(val uint8Array, int rows, int cols, int type) {
    // Get the underlying buffer length
    int length = uint8Array["length"].as<int>();
    
    // Allocate memory in C++ heap (vector is easiest to manage scope)
    // Actually, for Mat we can wrap the data if we keep it alive, 
    // but usually safest to copy from JS to C++ heap.
    
    // Get pointer to data in JS side? 
    // No, cleaner to read into C++ vector.
    // memory_view approach:
    
    /*
     // In JS:
     module.detect(uint8Array, ...)
     
     // In C++:
     val memory = val::module_property("HEAPU8");
     // This is complex.
    */
    
    // Simpler: use std::string as binary buffer from JS side if possible, 
    // OR just iterate. (Slow)
    
    // Best: Pass memory pointer from JS (malloc in JS, write data, pass ptr).
    // But Embind supports "std::string" as binary data automatically if passed from Uint8Array? 
    // No, std::string matches JS string.
    
    // Recommended Embind way for binary data:
    // Pass 'val' of Uint8Array.
    std::vector<uint8_t> cppVector;
    cppVector.resize(length);
    
    // Copy data from JS to C++
    // This requires <emscripten/val.h>
    val memory = val::global("Uint8Array").new_(uint8Array);
    // Actually, 'uint8Array' passed in IS a Uint8Array (or clamped).
    
    // Direct memory access if we assume shared memory or just copy.
    // memory_view<uint8_t> view(uint8Array); // Doesn't exist in Embind directly like this.
    
    // Let's use the standard "typed_memory_view" if available or just manual copy loop for simplicity/portability
    // manual copy:
    // for(int i=0; i<length; i++) cppVector[i] = uint8Array[i].as<uint8_t>(); 
    // ^ Too slow.
    
    // Efficient way:
    // JS side: module.HEAPU8.set(data, ptr);
    // C++ side: takes 'ptr'.
    // This is the standard "C-style" export. Embind can do it too.
    
    return Mat(); // Placeholder, logic moved to main functions
}

// -------------------------------------------------------------------------
// 1. Detect Corners
// -------------------------------------------------------------------------

// We accept a raw pointer to image data (RGBA or Gray) allocated on the heap by JS
val detectCorners(int imgPtr, int width, int height, int rows, int cols) {
    // Assume input is RGBA (4 channels) from ImageData, or Grayscale (1 channel)
    // Let's assume JS converts to Grayscale before sending? Or send RGBA.
    // Usually sending RGBA is easier from Canvas.
    
    uint8_t* data = reinterpret_cast<uint8_t*>(imgPtr);
    Mat img(height, width, CV_8UC4, data); // Wrap existing memory
    
    Mat gray;
    cvtColor(img, gray, COLOR_RGBA2GRAY);
    
    // Detection Logic (copied from detect_corners.cpp)
    vector<Size> sizesToTry;
    
    if (rows > 0 && cols > 0) {
        sizesToTry.push_back(Size(cols, rows));
        sizesToTry.push_back(Size(rows, cols));
        if (cols > 1 && rows > 1) {
            sizesToTry.push_back(Size(cols - 1, rows - 1));
            sizesToTry.push_back(Size(rows - 1, cols - 1));
        }
    } else {
        // Auto-detect: GoodFeatures
        vector<Point2f> features;
        goodFeaturesToTrack(gray, features, 0, 0.01, 10);
        int detectedCount = features.size();
        
        for (int r = 3; r <= 20; r++) {
            for (int c = 3; c <= 20; c++) {
                if (r * c <= detectedCount + 20) {
                    sizesToTry.push_back(Size(c, r));
                }
            }
        }
        std::sort(sizesToTry.begin(), sizesToTry.end(), [](const Size& a, const Size& b) {
            return (a.width * a.height) > (b.width * b.height);
        });
    }

    int flags = CALIB_CB_ADAPTIVE_THRESH | CALIB_CB_NORMALIZE_IMAGE | CALIB_CB_FAST_CHECK;
    bool found = false;
    Size foundSize;
    vector<Point2f> corners;

    for (const auto& size : sizesToTry) {
        corners.clear();
        found = findChessboardCorners(gray, size, corners, flags);
        if (found) {
            foundSize = size;
            break;
        }
    }

    val result = val::object();
    result.set("found", found);
    
    if (found) {
        cornerSubPix(gray, corners, Size(11, 11), Size(-1, -1),
            TermCriteria(TermCriteria::EPS + TermCriteria::COUNT, 30, 0.1));

        result.set("rows", foundSize.height);
        result.set("cols", foundSize.width);
        
        val cornersArray = val::array();
        for (size_t i = 0; i < corners.size(); i++) {
            val pt = val::object();
            pt.set("x", corners[i].x);
            pt.set("y", corners[i].y);
            cornersArray.call<void>("push", pt);
        }
        result.set("corners", cornersArray);
    }

    return result;
}

// -------------------------------------------------------------------------
// 2. Calibrate
// -------------------------------------------------------------------------

val calibrateCamera(val allImagePointsJS, val objPointsJS, int width, int height) {
    // Parse JS arrays
    int N = allImagePointsJS["length"].as<int>();
    
    vector<vector<Point2f>> imagePoints(N);
    vector<vector<Point3f>> objectPoints(N);
    
    // We assume objPointsJS is an array of arrays (one per image) OR single array
    // Check type of first element?
    // Let's implement robustly.
    bool sharedObjPoints = false;
    int objLen = objPointsJS["length"].as<int>();
    if (objLen != N) {
        // Assume shared object points if length doesn't match N
        // Or it's a single array of points
        sharedObjPoints = true;
    }
    
    // Parse Image Points
    for (int i = 0; i < N; i++) {
        val imgPts = allImagePointsJS[i];
        int M = imgPts["length"].as<int>();
        imagePoints[i].resize(M);
        
        for (int j = 0; j < M; j++) {
            val pt = imgPts[j];
            imagePoints[i][j] = Point2f(pt["x"].as<float>(), pt["y"].as<float>());
        }
    }
    
    // Parse Object Points
    vector<Point3f> sharedObjPtsVec;
    if (sharedObjPoints) {
        int M = objPointsJS["length"].as<int>();
        sharedObjPtsVec.resize(M);
        for(int j=0; j<M; j++) {
             val pt = objPointsJS[j];
             // Support both z-less and z-full
             float z = pt.call<bool>("hasOwnProperty", string("z")) ? pt["z"].as<float>() : 0.0f;
             sharedObjPtsVec[j] = Point3f(pt["x"].as<float>(), pt["y"].as<float>(), z);
        }
        // Replicate for all
        for(int i=0; i<N; i++) objectPoints[i] = sharedObjPtsVec;
    } else {
        // Per-image object points
         for (int i = 0; i < N; i++) {
            val objPts = objPointsJS[i];
            int M = objPts["length"].as<int>();
            objectPoints[i].resize(M);
            for (int j = 0; j < M; j++) {
                val pt = objPts[j];
                float z = pt.call<bool>("hasOwnProperty", string("z")) ? pt["z"].as<float>() : 0.0f;
                objectPoints[i][j] = Point3f(pt["x"].as<float>(), pt["y"].as<float>(), z);
            }
        }
    }

    Mat cameraMatrix, distCoeffs;
    vector<Mat> rvecs, tvecs;
    Size imageSize(width, height);
    
    double rms = 0;
    try {
        rms = calibrateCamera(objectPoints, imagePoints, imageSize, cameraMatrix, distCoeffs, rvecs, tvecs);
    } catch (cv::Exception& e) {
        val err = val::object();
        err.set("error", string(e.what()));
        return err;
    }
    
    // Compute reprojection errors
    val perViewErrors = val::array();
    for (size_t i = 0; i < objectPoints.size(); i++) {
        vector<Point2f> imagePoints2;
        projectPoints(objectPoints[i], rvecs[i], tvecs[i], cameraMatrix, distCoeffs, imagePoints2);
        double err = norm(imagePoints[i], imagePoints2, NORM_L2);
        double perViewError = std::sqrt(err*err/imagePoints[i].size());
        perViewErrors.call<void>("push", perViewError);
    }
    
    // Construct Result
    val result = val::object();
    result.set("success", true);
    result.set("rms", rms);
    result.set("perViewErrors", perViewErrors);
    
    // Camera Matrix (3x3)
    val km = val::array();
    for(int i=0; i<3; i++) {
        val row = val::array();
        for(int j=0; j<3; j++) row.call<void>("push", cameraMatrix.at<double>(i,j));
        km.call<void>("push", row);
    }
    result.set("camera_matrix", km);
    
    // Dist Coeffs
    val dc = val::array();
    for(int i=0; i<distCoeffs.total(); i++) dc.call<void>("push", distCoeffs.at<double>(i));
    result.set("dist_coeffs", dc);
    
    // Extrinsics
    val rv = val::array();
    val tv = val::array();
    for(size_t i=0; i<rvecs.size(); i++) {
        val r = val::array();
        val t = val::array();
        for(int j=0; j<3; j++) {
            r.call<void>("push", rvecs[i].at<double>(j));
            t.call<void>("push", tvecs[i].at<double>(j));
        }
        rv.call<void>("push", r);
        tv.call<void>("push", t);
    }
    result.set("rvecs", rv);
    result.set("tvecs", tv);
    
    return result;
}

EMSCRIPTEN_BINDINGS(camera_calibrator) {
    function("detectCorners", &detectCorners);
    function("calibrateCamera", &calibrateCamera);
}
