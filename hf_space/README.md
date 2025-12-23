# Hugging Face Space Deployment Guide

This directory contains everything needed to deploy the C++ OpenCV backend to a Hugging Face Space.

## Steps to Deploy

1.  **Create a New Space**:
    *   Go to [Hugging Face Spaces](https://huggingface.co/spaces).
    *   Click "Create new Space".
    *   Enter a name (e.g., `camera-calibrator-backend`).
    *   Select **Docker** as the SDK.
    *   Choose "Public" or "Private" (Public is easier for GitHub Pages CORS).
    *   Click "Create Space".

2.  **Upload Files**:
    *   You can clone the Space repository locally and copy the files from this `hf_space` directory into it.
    *   OR, you can upload files directly via the web interface.
    *   **Crucial**: You need to upload the `cpp` folder as well.
    *   Structure should look like:
        ```
        /
        ├── Dockerfile
        ├── app.py
        ├── requirements.txt
        └── cpp/
            ├── detect_corners.cpp
            └── calibrate_camera.cpp
        ```

3.  **Wait for Build**:
    *   Hugging Face will automatically build the Docker image. This might take a few minutes as it compiles OpenCV and the C++ code.
    *   Check the "Logs" tab to ensure it starts successfully (you should see "Uvicorn running on ...").

4.  **Get the API URL**:
    *   Once running, your API URL will be something like: `https://username-space-name.hf.space`.
    *   You can verify it by visiting `https://username-space-name.hf.space/docs` to see the Swagger UI.

5.  **Connect Frontend**:
    *   Go to your GitHub repository settings -> Secrets and variables -> Actions.
    *   Add a new Repository Variable (or Secret): `NEXT_PUBLIC_BACKEND_API_URL`.
    *   Value: `https://username-space-name.hf.space` (no trailing slash).
    *   Re-run your GitHub Actions workflow to rebuild the frontend with this variable.

## Troubleshooting

*   **CORS Errors**: If the frontend says "Network Error" or CORS issues, check `app.py`. Ensure your GitHub Pages domain is in the `origins` list.
*   **Build Failures**: Check the Space Build Logs. Common issues are missing dependencies (handled in Dockerfile) or C++ compilation errors.
