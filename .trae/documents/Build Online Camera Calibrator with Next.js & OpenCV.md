I will build a modern, online Camera Calibrator web application using **Next.js** and **OpenCV.js** (WebAssembly). This ensures the application runs entirely in the browser (client-side), offering speed, privacy, and no server maintenance.

### **Architecture**
*   **Framework**: Next.js (React) with TypeScript.
*   **Styling**: Tailwind CSS for a clean, modern interface.
*   **Core Processing**: `opencv.js` running in a Web Worker to prevent UI freezing during heavy calculation steps like corner detection and calibration.
*   **Visualization**:
    *   **3D Extrinsics**: `Three.js` (`@react-three/fiber`) to visualize camera positions relative to the calibration board.
    *   **Charts**: `Recharts` for displaying reprojection errors.

### **Key Features (Matching MATLAB App)**
1.  **Image Management**:
    *   Drag & drop upload for calibration images.
    *   List view with status indicators (e.g., "Corners Detected", "Rejected").
    *   Instant feedback on corner detection success/failure.
2.  **Calibration Settings**:
    *   Input for Checkerboard Square Size and Units (mm, cm, in).
    *   Checkerboard Dimensions (Rows x Cols).
    *   Option for Standard vs. Fisheye (if supported by the WASM build, otherwise Standard).
3.  **Visualization Tabs**:
    *   **Image View**: Displays original images with detected corners overlaid.
    *   **Undistorted View**: Shows the result of applying the calibration to remove lens distortion.
    *   **Reprojection Errors**: Interactive bar chart showing the mean error per image, helping users identify and remove bad images.
    *   **3D View**: Interactive 3D scene showing the position of the camera for each shot relative to the calibration board.
4.  **Results & Export**:
    *   Display Camera Matrix (Intrinsics) and Distortion Coefficients.
    *   Export parameters to JSON/YAML.

### **Implementation Plan**
1.  **Setup**: Initialize Next.js project and configure Tailwind CSS.
2.  **OpenCV Integration**: Implement a robust loading mechanism for `opencv.js` and set up the Web Worker architecture.
3.  **Core Logic (Worker)**:
    *   Implement `findChessboardCorners` for detection.
    *   Implement `calibrateCamera` to solve for intrinsics/extrinsics.
    *   Implement `undistort` for image correction.
4.  **UI Development**:
    *   Build the Sidebar (Controls & Image List).
    *   Build the Main Visualization Area (Tabs for Image/3D/Charts).
    *   Implement the Results Panel.
5.  **3D & Charts**: Integrate Three.js for the extrinsics view and Recharts for error plotting.
6.  **Refinement**: optimize performance and polish the UX.
