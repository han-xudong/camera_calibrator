FROM python:3.9-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    cmake \
    g++ \
    libopencv-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy C++ source code
COPY cpp/ /app/cpp/

# Build C++ executables
# We don't use the existing CMakeLists.txt because it might have WASM stuff or hardcoded paths.
# A simple direct compilation is often easier for this specific deployment.
# Or we can create a minimal CMakeLists.txt. Let's try direct g++ first as it's less error prone with env vars.
# Note: linking against opencv
RUN g++ -O3 -std=c++11 cpp/detect_corners.cpp -o detect_corners `pkg-config --cflags --libs opencv4` || \
    g++ -O3 -std=c++11 cpp/detect_corners.cpp -o detect_corners `pkg-config --cflags --libs opencv`

RUN g++ -O3 -std=c++11 cpp/calibrate_camera.cpp -o calibrate_camera `pkg-config --cflags --libs opencv4` || \
    g++ -O3 -std=c++11 cpp/calibrate_camera.cpp -o calibrate_camera `pkg-config --cflags --libs opencv`

# Copy Python requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Python app
COPY app.py .

# Create a user to run the application (Hugging Face Spaces requirement for security)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Expose port (7860 is default for HF Spaces)
EXPOSE 7860

# Run the application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
