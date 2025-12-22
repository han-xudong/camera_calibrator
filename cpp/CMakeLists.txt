cmake_minimum_required(VERSION 3.10)
project(CameraCalibrator)

set(CMAKE_CXX_STANDARD 11)

if(EMSCRIPTEN)
    # WASM Build
    # This requires OpenCV to be built for Emscripten and available in the search path.
    # You might need to pass -DOpenCV_DIR=<path_to_opencv_wasm_build>
    
    find_package(OpenCV REQUIRED)
    include_directories(${OpenCV_INCLUDE_DIRS})

    add_executable(camera_calibrator wasm_interface.cpp)
    
    # Emscripten Link Flags
    # -bind: Embind
    # -s MODULARIZE=1: Returns a Promise-returning factory
    # -s EXPORT_NAME='createCameraCalibrator'
    # -s ALLOW_MEMORY_GROWTH=1
    # -O3: Optimize
    set_target_properties(camera_calibrator PROPERTIES 
        LINK_FLAGS "-bind -s MODULARIZE=1 -s EXPORT_NAME='createCameraCalibrator' -s ALLOW_MEMORY_GROWTH=1 -s WASM=1 -O3"
    )
    
    target_link_libraries(camera_calibrator ${OpenCV_LIBS})
    
else()
    # Native Build
    find_package(OpenCV REQUIRED)
    include_directories(${OpenCV_INCLUDE_DIRS})

    add_executable(detect_corners detect_corners.cpp)
    target_link_libraries(detect_corners ${OpenCV_LIBS})

    add_executable(calibrate_camera calibrate_camera.cpp)
    target_link_libraries(calibrate_camera ${OpenCV_LIBS})
endif()