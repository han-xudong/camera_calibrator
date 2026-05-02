# Camera Calibrator

[![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/) [![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/) [![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/) [![OpenCV](https://img.shields.io/badge/OpenCV-5C3EE8?style=flat-square&logo=opencv&logoColor=white)](https://opencv.org/) [![Hugging Face](https://img.shields.io/badge/Hugging_Face-FFD21E?style=flat-square&logo=huggingface&logoColor=black)](https://huggingface.co/spaces/han-xudong/opencv_camera_calibration)

A modern, web-based tool for camera calibration built with Next.js and OpenCV.

![Screenshot](./public/assets/screenshot.jpg)

## 🚀 Features

- **Web-Based Interface**: Clean, responsive UI built with Next.js and Tailwind CSS.
- **Robust Detection**: Utilizes a Python backend (FastAPI + OpenCV) for reliable chessboard detection and calibration.
- **Real-time Feedback**: Visualizes detected corners and reprojection errors.
- **Frontend Deployment**: Next.js (React) and Tailwind CSS on Vercel.
- **Backend Deployment**: Python, FastAPI, and OpenCV on Hugging Face Spaces.
- **Fallbacks**: Robust error handling with fallback to specific backend endpoints.

## 🛠️ Architecture

This project uses a split architecture to combine the interactivity of a modern web app with the computational power of Python's OpenCV libraries.

- **Frontend (`/app`)**: Handles image upload, UI interaction, and result visualization.
- **Backend (`/hf_space`)**: A FastAPI service running inside a Docker container. It processes images, detects chessboard corners, and performs the camera calibration math.

## 🏁 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Python (v3.9 or higher) - for local backend development

### Local Development

#### 1. Frontend Setup

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at `http://localhost:3000`.

#### 2. Backend Setup

To run the backend locally:

```bash
cd hf_space

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn app:app --reload --port 7860
```

#### 3. Connect Frontend to Backend

Create a `.env.local` file in the root of the project to tell the frontend where the backend is running:

```env
# For local development
NEXT_PUBLIC_BACKEND_API_URL=http://localhost:7860
```

## 📦 Deployment

### Frontend (Vercel)

Deploy the Next.js app with Vercel Git integration, and use GitHub Actions only for CI checks.

1. Connect this repository to a Vercel project.
2. In Vercel project settings, add these environment variables:
   - `NEXT_PUBLIC_BACKEND_API_URL=https://your-space-name.hf.space`
   - `NEXT_PUBLIC_SITE_URL=https://your-production-domain`
3. Vercel will automatically deploy pushes to `main` and create preview deployments for pull requests.
4. GitHub Actions runs `.github/workflows/deploy-vercel.yml` as a CI workflow to verify the project still builds.
5. No Vercel deployment secrets are required in GitHub unless you later choose to move deployment back into Actions.

### Backend (Hugging Face Spaces)

The backend is designed to run on Hugging Face Spaces (Docker SDK).

1. Create a new Space on Hugging Face.
2. Select **Docker** as the SDK.
3. Push the contents of the `hf_space/` directory to the Space (or connect it to this repo).
   - *Note*: You can use the included `deploy_to_hf.sh` script if you have the Hugging Face CLI configured.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
