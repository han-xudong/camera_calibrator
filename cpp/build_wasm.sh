#!/bin/bash
# Build script for compiling C++ to WASM using Emscripten
# Prerequisite: Emscripten SDK (emsdk) must be installed and activated.
# Prerequisite: OpenCV for WebAssembly must be built/installed.
# You may need to set OpenCV_DIR to the directory containing OpenCVConfig.cmake for WASM.

mkdir -p build_wasm
cd build_wasm

# Example: emcmake cmake .. -DOpenCV_DIR=/path/to/opencv/build_wasm
echo "Configuring CMake..."
emcmake cmake ..

echo "Building..."
emmake make

echo "Copying artifacts to public/..."
# The output filename matches the target name in CMakeLists.txt (camera_calibrator)
cp camera_calibrator.js ../../public/
cp camera_calibrator.wasm ../../public/

echo "Done. Please check public/camera_calibrator.js and .wasm"
