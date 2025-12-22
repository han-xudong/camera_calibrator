#include <opencv2/opencv.hpp>
#include <iostream>
#include <vector>
#include <fstream>
// #include <nlohmann/json.hpp> // Standard JSON lib would be nice, but let's try to parse manually or expect simple format?
// Actually, parsing JSON in raw C++ without libs is painful.
// Let's assume the input file contains raw numbers or a specific format.
// Or we can require `nlohmann/json`? It's a header only lib but might not be present.
// Let's use OpenCV's FileStorage if possible? No, that's YAML/XML.

// Simpler approach:
// The input file will be a text file where:
// Line 1: width height
// Line 2: N (number of images)
// Then N blocks.
// Each block: M (number of points)
// Then M lines of "x y" (image points)
// Then M lines of "X Y Z" (object points)

using namespace cv;
using namespace std;

int main(int argc, char** argv) {
    if (argc < 2) {
        cerr << "Usage: ./calibrate_camera <data_file_path>" << endl;
        return 1;
    }

    string dataPath = argv[1];
    ifstream infile(dataPath);
    if (!infile.is_open()) {
        cout << "{\"error\": \"Could not open data file\"}" << endl;
        return 1;
    }

    int width, height, N;
    if (!(infile >> width >> height >> N)) {
        cout << "{\"error\": \"Invalid data header\"}" << endl;
        return 1;
    }

    vector<vector<Point2f>> imagePoints(N);
    vector<vector<Point3f>> objectPoints(N);
    Size imageSize(width, height);

    for (int i = 0; i < N; i++) {
        int M;
        infile >> M;
        imagePoints[i].resize(M);
        objectPoints[i].resize(M);

        for (int j = 0; j < M; j++) {
            infile >> imagePoints[i][j].x >> imagePoints[i][j].y;
        }
        for (int j = 0; j < M; j++) {
            infile >> objectPoints[i][j].x >> objectPoints[i][j].y >> objectPoints[i][j].z;
        }
    }

    Mat cameraMatrix, distCoeffs;
    vector<Mat> rvecs, tvecs;

    // Fixed aspect ratio is often good for initial guess, or just default
    // Flags: CALIB_FIX_ASPECT_RATIO ? No, usually we want full calib.
    double rms = 0;
    try {
        rms = calibrateCamera(objectPoints, imagePoints, imageSize, cameraMatrix, distCoeffs, rvecs, tvecs);
    } catch (cv::Exception& e) {
        cout << "{\"success\": false, \"error\": \"OpenCV Calibration Error: " << e.what() << "\"}" << endl;
        return 0;
    }

    // Compute reprojection errors
    vector<double> perViewErrors;
    double totalError = 0;
    try {
        for (size_t i = 0; i < objectPoints.size(); i++) {
            vector<Point2f> imagePoints2;
            projectPoints(objectPoints[i], rvecs[i], tvecs[i], cameraMatrix, distCoeffs, imagePoints2);
            double err = norm(imagePoints[i], imagePoints2, NORM_L2);
            double perViewError = std::sqrt(err*err/imagePoints[i].size());
            perViewErrors.push_back(perViewError);
            totalError += err*err;
        }
    } catch (cv::Exception& e) {
        cout << "{\"success\": false, \"error\": \"OpenCV Reprojection Error: " << e.what() << "\"}" << endl;
        return 0;
    }

    cout << "{";
    cout << "\"success\": true,";
    cout << "\"rms\": " << rms << ",";
    
    cout << "\"camera_matrix\": [";
    for(int i=0; i<3; i++) {
        cout << "[";
        for(int j=0; j<3; j++) {
            cout << cameraMatrix.at<double>(i,j) << (j<2 ? "," : "");
        }
        cout << "]" << (i<2 ? "," : "");
    }
    cout << "],";

    cout << "\"dist_coeffs\": [";
    for(int i=0; i<distCoeffs.total(); i++) {
        cout << distCoeffs.at<double>(i) << (i<distCoeffs.total()-1 ? "," : "");
    }
    cout << "]"; // Closed bracket for dist_coeffs
    cout << ",";

    cout << "\"rvecs\": [";
    for(size_t i=0; i<rvecs.size(); i++) {
        cout << "[";
        // rvec is 3x1 or 1x3
        for(int j=0; j<3; j++) {
            cout << rvecs[i].at<double>(j) << (j<2 ? "," : "");
        }
        cout << "]" << (i<rvecs.size()-1 ? "," : "");
    }
    cout << "],";

    cout << "\"tvecs\": [";
    for(size_t i=0; i<tvecs.size(); i++) {
        cout << "[";
        for(int j=0; j<3; j++) {
            cout << tvecs[i].at<double>(j) << (j<2 ? "," : "");
        }
        cout << "]" << (i<tvecs.size()-1 ? "," : "");
    }
    cout << "],";

    cout << "\"perViewErrors\": [";
    for(size_t i=0; i<perViewErrors.size(); i++) {
        cout << perViewErrors[i] << (i<perViewErrors.size()-1 ? "," : "");
    }
    cout << "]";
    
    cout << "}" << endl;

    return 0;
}