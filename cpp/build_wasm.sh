#!/bin/bash
# Build script for compiling C++ to WASM using Emscripten
# Prerequisite: Emscripten SDK (emsdk) must be installed and activated.
# Prerequisite: OpenCV for WebAssembly must be built/installed.
# You may need to set OpenCV_DIR to the directory containing OpenCVConfig.cmake for WASM.

mkdir -p build_wasm
cd build_wasm

# Check if emcmake is available
if ! command -v emcmake &> /dev/null
then
    echo "emcmake could not be found. Please ensure Emscripten SDK is installed and activated (source emsdk_env.sh)."
    exit 1
fi

# Example: emcmake cmake .. -DOpenCV_DIR=/path/to/opencv/build_wasm
echo "Configuring CMake..."
emcmake cmake ..

echo "Building..."
emmake make

echo "Copying artifacts to public/..."
# The output filename matches the target name in CMakeLists.txt (camera_calibrator)
# Note: Output goes to build_wasm/camera_calibrator.js and .wasm
# Correct path to public is ../../public relative to build_wasm? No, build_wasm is in cpp/
# Script is run from project root or cpp/?
# If run from cpp/, then ../public
# If run from root, then public/

# Let's use absolute path relative to script location
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PUBLIC_DIR="$SCRIPT_DIR/../public"

cp camera_calibrator.js "$PUBLIC_DIR/"
cp camera_calibrator.wasm "$PUBLIC_DIR/"

echo "Done. Please check public/camera_calibrator.js and .wasm"
