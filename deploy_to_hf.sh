#!/bin/bash

# Configuration
HF_USERNAME="han-xudong"
SPACE_NAME="opencv_camera_calibration"
SPACE_URL="https://huggingface.co/spaces/$HF_USERNAME/$SPACE_NAME"
CLONE_DIR="hf_deploy_temp"

echo "🚀 Starting deployment to Hugging Face Space: $SPACE_NAME"

# 1. Clone the Space
if [ -d "$CLONE_DIR" ]; then
    echo "Cleaning up previous deployment directory..."
    rm -rf "$CLONE_DIR"
fi

echo "📥 Cloning repository..."
git clone "$SPACE_URL" "$CLONE_DIR"

if [ ! -d "$CLONE_DIR" ]; then
    echo "❌ Failed to clone repository. Please check your permissions or if the Space exists."
    exit 1
fi

# 2. Copy files
echo "📋 Copying files..."
cp hf_space/Dockerfile "$CLONE_DIR/"
cp hf_space/app.py "$CLONE_DIR/"
cp hf_space/requirements.txt "$CLONE_DIR/"
cp hf_space/README.md "$CLONE_DIR/"

mkdir -p "$CLONE_DIR/cpp"
cp hf_space/cpp/*.cpp "$CLONE_DIR/cpp/"
# Note: We don't copy CMakeLists.txt as we compile manually in Dockerfile, 
# but if we wanted to support CMake in future, we could.

# 3. Commit and Push
echo "📤 Pushing to Hugging Face..."
cd "$CLONE_DIR"
git config user.name "Deploy Script"
git config user.email "deploy@script.local"
git add .
git commit -m "Deploy from local script: $(date)"
git push

# 4. Cleanup
cd ..
rm -rf "$CLONE_DIR"

echo "✅ Deployment command finished!"
echo "NOTE: If git push failed, you may need to log in manually or use a token."
