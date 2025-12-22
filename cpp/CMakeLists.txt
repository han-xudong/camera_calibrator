cmake_minimum_required(VERSION 3.10)
project(CameraCalibrator)

set(CMAKE_CXX_STANDARD 11)

if(EMSCRIPTEN)
    # WASM Build
    
    # Allow user to specify custom OpenCV directory
    if(DEFINED ENV{OPENCV_DIR})
        set(OpenCV_DIR $ENV{OPENCV_DIR})
    endif()
    
    find_package(OpenCV REQUIRED)
    include_directories(${OpenCV_INCLUDE_DIRS})
    
    # Debug info
    message(STATUS "OpenCV Libs: ${OpenCV_LIBS}")
    message(STATUS "OpenCV Include: ${OpenCV_INCLUDE_DIRS}")

    add_executable(camera_calibrator wasm_interface.cpp)
    
    # Emscripten Link Flags
    # -s MODULARIZE=1: Returns a Promise-returning factory
    # -s EXPORT_NAME='createCameraCalibrator': The name of the factory function
    # -s ALLOW_MEMORY_GROWTH=1: Allow heap to resize
    # -s WASM=1: Output WASM
    # -s SINGLE_FILE=0: Separate .js and .wasm (better for caching)
    # -O3: Aggressive optimization
    # --bind: Use Embind
    set_target_properties(camera_calibrator PROPERTIES 
        LINK_FLAGS "-bind -s MODULARIZE=1 -s EXPORT_NAME='createCameraCalibrator' -s ALLOW_MEMORY_GROWTH=1 -s WASM=1 -s NO_DISABLE_EXCEPTION_CATCHING -O3"
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