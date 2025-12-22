#include <opencv2/opencv.hpp>
#include <iostream>
#include <vector>
#include <string>

using namespace cv;
using namespace std;

int main(int argc, char** argv) {
    // Expected args: <image_path> <rows> <cols>
    if (argc < 4) {
        cout << "{\"error\": \"Usage: ./detect_corners <image_path> <rows> <cols>\"}" << endl;
        return 1;
    }

    string imagePath = argv[1];
    int rows = 0, cols = 0;
    
    try {
        rows = stoi(argv[2]);
        cols = stoi(argv[3]);
    } catch (...) {
        cout << "{\"error\": \"Invalid rows/cols arguments\"}" << endl;
        return 1;
    }

    Mat img = imread(imagePath);
    if (img.empty()) {
        cout << "{\"error\": \"Could not read image at " << imagePath << "\"}" << endl;
        return 0;
    }

    Mat gray;
    cvtColor(img, gray, COLOR_BGR2GRAY);

    vector<Size> sizesToTry;
    
    if (rows > 0 && cols > 0) {
        // 1. As provided
        sizesToTry.push_back(Size(cols, rows));
        sizesToTry.push_back(Size(rows, cols));
        
        // 2. As squares (user entered squares, so we need squares-1)
        if (cols > 1 && rows > 1) {
            sizesToTry.push_back(Size(cols - 1, rows - 1));
            sizesToTry.push_back(Size(rows - 1, cols - 1));
        }
    } else {
        // Auto-detect mode
        
        // 1. Estimate number of corners using goodFeaturesToTrack
        // This helps us set an upper bound on the board size
        vector<Point2f> features;
        // maxCorners=0 (unlimited), quality=0.01, minDistance=10
        goodFeaturesToTrack(gray, features, 0, 0.01, 10);
        int detectedCount = features.size();
        
        // cout << "Detected features: " << detectedCount << endl; // Debug
        
        // 2. Generate candidates
        // Range: 3x3 to 20x20 (covers most boards)
        // We also want to support rectangular boards
        for (int r = 3; r <= 20; r++) {
            for (int c = 3; c <= 20; c++) {
                // Heuristic: The board cannot have more corners than we detected features
                // (with some margin for error/occlusion/noise vs missed features)
                // Actually, goodFeatures usually finds MORE than just the inner corners (outer corners, noise).
                // So if Area > detectedCount, it's very unlikely to be the board.
                // We add a small margin just in case.
                if (r * c <= detectedCount + 20) {
                    sizesToTry.push_back(Size(c, r));
                }
            }
        }
        
        // 3. Sort by Area Descending
        // This ensures we find the LARGEST valid board first, preventing
        // finding a sub-grid (e.g. 5x5 inside a 8x8).
        std::sort(sizesToTry.begin(), sizesToTry.end(), [](const Size& a, const Size& b) {
            return (a.width * a.height) > (b.width * b.height);
        });
        
        // 4. Remove duplicates (optional but good)
        // (Not strictly necessary if loop order was unique pairs, but r,c and c,r can be dupes if square)
    }

    // Flags: Adaptive threshold + Normalize + Fast Check
    int flags = CALIB_CB_ADAPTIVE_THRESH | CALIB_CB_NORMALIZE_IMAGE | CALIB_CB_FAST_CHECK;
    
    bool found = false;
    Size foundSize;
    vector<Point2f> corners;

    for (const auto& size : sizesToTry) {
        // Clear previous attempts
        corners.clear();
        
        // Use standard findChessboardCorners with Fast Check
        found = findChessboardCorners(gray, size, corners, flags);
        
        if (found) {
            foundSize = size;
            break;
        }
    }

    if (found) {
        // Refine corner locations
        cornerSubPix(gray, corners, Size(11, 11), Size(-1, -1),
            TermCriteria(TermCriteria::EPS + TermCriteria::COUNT, 30, 0.1));

        // Draw corners (optional, for debug image saving, but we just need JSON now)
        // drawChessboardCorners(img, foundSize, Mat(corners), found);

        cout << "{";
        cout << "\"success\": true,";
        cout << "\"rows\": " << foundSize.height << ",";
        cout << "\"cols\": " << foundSize.width << ",";
        cout << "\"width\": " << img.cols << ",";
        cout << "\"height\": " << img.rows << ",";
        cout << "\"corners\": [";
        for (size_t i = 0; i < corners.size(); i++) {
            cout << "{\"x\": " << corners[i].x << ", \"y\": " << corners[i].y << "}";
            if (i < corners.size() - 1) cout << ",";
        }
        cout << "]";
        cout << "}" << endl;
    } else {
        if (rows > 0) {
             cout << "{\"success\": false, \"error\": \"Chessboard pattern not found. Tried " 
                  << cols << "x" << rows << " and " << (cols-1) << "x" << (rows-1) << "\"}" << endl;
        } else {
             cout << "{\"success\": false, \"error\": \"Auto-detection failed. Could not find any valid chessboard pattern.\"}" << endl;
        }
    }

    return 0;
}