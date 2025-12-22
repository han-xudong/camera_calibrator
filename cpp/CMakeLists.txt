cmake_minimum_required(VERSION 3.10)
project(CameraCalibrator)

set(CMAKE_CXX_STANDARD 11)

# Find OpenCV
find_package(OpenCV REQUIRED)

# Include OpenCV directories
include_directories(${OpenCV_INCLUDE_DIRS})

# Create executables
add_executable(detect_corners detect_corners.cpp)
add_executable(calibrate_camera calibrate_camera.cpp)

# Link OpenCV libraries
target_link_libraries(detect_corners ${OpenCV_LIBS})
target_link_libraries(calibrate_camera ${OpenCV_LIBS})