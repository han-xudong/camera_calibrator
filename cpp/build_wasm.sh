#!/bin/bash
# Build script for compiling C++ to WASM using Emscripten
# Prerequisite: Emscripten SDK (emsdk) must be installed and activated.
# Prerequisite: OpenCV for WebAssembly must be built/installed.

# Ensure we are in the cpp directory or navigate to it
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

mkdir -p build_wasm
cd build_wasm

# Check if emcmake is available
if ! command -v emcmake &> /dev/null
then
    echo "emcmake could not be found. Please ensure Emscripten SDK is installed and activated (source emsdk_env.sh)."
    exit 1
fi

# Try to find OpenCV WASM build automatically or use provided env var
# Common locations:
# 1. $OPENCV_WASM_DIR
# 2. ../opencv/build_wasm
# 3. /usr/local/share/opencv4 (unlikely for wasm)

OPENCV_DIR_FLAG=""
if [ -n "$OPENCV_WASM_DIR" ]; then
    OPENCV_DIR_FLAG="-DOpenCV_DIR=$OPENCV_WASM_DIR"
    echo "Using OpenCV from env: $OPENCV_WASM_DIR"
elif [ -d "../opencv/build_wasm" ]; then
    # Assuming standard structure where opencv is sibling to camera_calibrator
    OPENCV_DIR_FLAG="-DOpenCV_DIR=$(pwd)/../../opencv/build_wasm"
    echo "Found local OpenCV build at ../opencv/build_wasm"
fi

echo "Configuring CMake..."
# Add -DOpenCV_DIR=... if you have a specific path
# emcmake cmake .. $OPENCV_DIR_FLAG
# If it fails, user must edit this line or set env var.
emcmake cmake .. $OPENCV_DIR_FLAG

echo "Building..."
emmake make

echo "Copying artifacts to public/..."
PUBLIC_DIR="$SCRIPT_DIR/../public"

if [ -f "camera_calibrator.js" ]; then
    cp camera_calibrator.js "$PUBLIC_DIR/"
    cp camera_calibrator.wasm "$PUBLIC_DIR/"
    echo "Success! Artifacts copied to public/"
else
    echo "Error: Build failed. camera_calibrator.js not found."
    exit 1
fi
