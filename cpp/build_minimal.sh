#!/bin/bash
set -e

# Script to build a MINIMAL OpenCV for WebAssembly and then compile the project.
# Usage: ./build_minimal.sh

# 1. Environment Check
if ! command -v emcmake &> /dev/null
then
    echo "Error: 'emcmake' not found."
    echo "Please activate Emscripten SDK environment:"
    echo "  source /path/to/emsdk/emsdk_env.sh"
    exit 1
fi

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
WORK_DIR="$SCRIPT_DIR/wasm_work"
INSTALL_DIR="$WORK_DIR/opencv_install"
OPENCV_VERSION="4.10.0"

mkdir -p "$WORK_DIR"

# 2. Download OpenCV Source (if not present)
cd "$WORK_DIR"
if [ ! -d "opencv" ]; then
    echo "Cloning OpenCV $OPENCV_VERSION..."
    # Using 4.5.5 known to work well with older Emscripten, or 4.8.0. 
    # 4.10.0 might have build issues with certain emsdk versions.
    # Let's stick to 4.10.0 but ensure we clean up if it failed previously.
    git clone --depth 1 --branch $OPENCV_VERSION https://github.com/opencv/opencv.git
fi

# 3. Configure and Build Minimal OpenCV
# We build STATIC libraries for Emscripten.
echo "Configuring Minimal OpenCV..."
# Clean build directory to prevent cache issues
rm -rf build_opencv
mkdir -p build_opencv
cd build_opencv

# Flags to DISABLE unnecessary modules
emcmake cmake ../opencv \
    -DCMAKE_INSTALL_PREFIX="$INSTALL_DIR" \
    -DBUILD_SHARED_LIBS=OFF \
    -DBUILD_opencv_apps=OFF \
    -DBUILD_EXAMPLES=OFF \
    -DBUILD_TESTS=OFF \
    -DBUILD_PERF_TESTS=OFF \
    -DBUILD_DOCS=OFF \
    -DBUILD_opencv_python2=OFF \
    -DBUILD_opencv_python3=OFF \
    -DBUILD_opencv_java=OFF \
    -DBUILD_opencv_js=OFF \
    -DENABLE_PIC=FALSE \
    -DCV_ENABLE_INTRINSICS=OFF \
    \
    -DBUILD_opencv_core=ON \
    -DBUILD_opencv_imgproc=ON \
    -DBUILD_opencv_calib3d=ON \
    -DBUILD_opencv_features2d=ON \
    -DBUILD_opencv_flann=ON \
    \
    -DBUILD_opencv_dnn=OFF \
    -DBUILD_opencv_ml=OFF \
    -DBUILD_opencv_photo=OFF \
    -DBUILD_opencv_video=OFF \
    -DBUILD_opencv_videoio=OFF \
    -DBUILD_opencv_highgui=OFF \
    -DBUILD_opencv_objdetect=OFF \
    -DBUILD_opencv_stitching=OFF \
    -DBUILD_opencv_gapi=OFF \
    \
    -DWITH_PNG=OFF \
    -DWITH_JPEG=OFF \
    -DWITH_TIFF=OFF \
    -DWITH_WEBP=OFF \
    -DWITH_OPENEXR=OFF \
    -DWITH_JASPER=OFF \
    -DWITH_PROTOBUF=OFF \
    -DWITH_QUIRC=OFF \
    -DWITH_ADE=OFF \
    -DWITH_ITT=OFF \
    -DWITH_PTHREADS_PF=OFF \
    -DOPENCV_ENABLE_NONFREE=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    -DOPENCV_FORCE_3RDPARTY_BUILD=ON

echo "Building OpenCV (Libraries)..."
# Detect core count for parallel build
if [[ "$OSTYPE" == "darwin"* ]]; then
    CORES=$(sysctl -n hw.ncpu)
else
    CORES=$(nproc)
fi
emmake make -j$CORES install

# Verify installation
if [ ! -d "$INSTALL_DIR" ]; then
    echo "Error: OpenCV installation failed. Directory $INSTALL_DIR does not exist."
    exit 1
fi

# 4. Build Our Project Linking to Minimal OpenCV
echo "Building Camera Calibrator WASM..."
cd "$SCRIPT_DIR"
rm -rf build_wasm
mkdir -p build_wasm
cd build_wasm

# Find where OpenCVConfig.cmake is
echo "Searching for OpenCVConfig.cmake in $INSTALL_DIR..."
OPENCV_CONFIG_PATH=$(find "$INSTALL_DIR" -name "OpenCVConfig.cmake" | head -n 1)

if [ -z "$OPENCV_CONFIG_PATH" ]; then
    echo "Error: OpenCVConfig.cmake not found! OpenCV build might have failed."
    exit 1
fi

export OPENCV_DIR=$(dirname "$OPENCV_CONFIG_PATH")
echo "Found OpenCV at: $OPENCV_DIR"

emcmake cmake ..
emmake make

# 5. Copy Artifacts
PUBLIC_DIR="$SCRIPT_DIR/../public"
echo "Copying to $PUBLIC_DIR..."
cp camera_calibrator.js "$PUBLIC_DIR/"
cp camera_calibrator.wasm "$PUBLIC_DIR/"

echo "========================================================"
echo "Build Complete!"
echo "Files created:"
echo "  $PUBLIC_DIR/camera_calibrator.js"
echo "  $PUBLIC_DIR/camera_calibrator.wasm"
echo "========================================================"
