/// <reference lib="webworker" />

declare global {
  interface WorkerGlobalScope {
    AprilTagWasm: any;
    Module: any;
    cv: any;
  }
}

let atag_module: any = null;
let atag_detect: any = null;
let atag_init: any = null;
let atag_set_img_buffer: any = null;
let atag_set_detector_options: any = null;
let atag_destroy: any = null;

let cv: any = null;
let isOpenCVLoaded = false;

import { performCalibration } from '../utils/calibration';

async function loadOpenCV(): Promise<void> {
    if (isOpenCVLoaded) return;
    
    return new Promise((resolve, reject) => {
        // 1. Setup Emscripten Module Config
        // This is the standard way to detect when WASM/ASM.js is ready.
        const Module: any = {
            onRuntimeInitialized: () => {
                console.log('[Worker] OpenCV Runtime Initialized via Module callback');
                // In some builds, 'cv' is the Module itself, in others it's global 'cv'
                if ((self as any).cv && (self as any).cv.Mat) {
                    cv = (self as any).cv;
                } else {
                    cv = Module;
                }
                isOpenCVLoaded = true;
                resolve();
            },
            onError: (err: any) => {
                console.error('[Worker] OpenCV Module Error:', err);
            },
            print: (text: string) => console.log('[OpenCV]', text),
            printErr: (text: string) => console.warn('[OpenCV]', text)
        };
        (self as any).Module = Module;

        // 2. Prepare Global Environment Hacks
        (self as any).module = undefined;
        (self as any).exports = undefined;
        (self as any).define = undefined;
        if (!(self as any).window) (self as any).window = self;

        // 3. Start Loading
        const loadScript = () => {
            console.log('[Worker] Loading OpenCV script...');
            try {
                 const origin = self.location.origin;
                 // Try local first
                 importScripts(`${origin}/opencv.js`);
                 console.log('[Worker] importScripts executed');
            } catch (e) {
                 console.warn('[Worker] Local load failed, trying CDN', e);
                 try {
                     importScripts('https://docs.opencv.org/4.5.0/opencv.js');
                 } catch (e2) {
                     reject(new Error(`Failed to load OpenCV: ${e2}`));
                 }
            }
        };

        // 4. Polling Fallback (Crucial for some builds that don't fire callback)
        let checks = 0;
        const checkInterval = setInterval(() => {
            checks++;
            const globalCv = (self as any).cv;
            
            // Check if global cv is ready and has Mat (basic check)
            // AND specifically check for findChessboardCorners which we need
            if (globalCv && globalCv.Mat && globalCv.findChessboardCorners) {
                clearInterval(checkInterval);
                if (!isOpenCVLoaded) {
                    console.log('[Worker] OpenCV (fully loaded) found via Polling');
                    cv = globalCv;
                    isOpenCVLoaded = true;
                    resolve();
                }
            } 
            // If we found 'cv' but it's missing functions, it might still be initializing or it's a minimal build
            else if (globalCv && globalCv.Mat && !globalCv.findChessboardCorners) {
                // Keep waiting, maybe it's being attached?
                if (checks % 10 === 0) console.log('[Worker] OpenCV found but findChessboardCorners missing. Waiting...');
            }
            // Check if it's a factory (older builds)
            else if (typeof globalCv === 'function' && !isOpenCVLoaded && checks < 5) {
                // Try calling it if it hasn't started
                console.log('[Worker] cv is function, attempting call...');
                Promise.resolve(globalCv(Module)).then((instance: any) => {
                     cv = instance;
                     isOpenCVLoaded = true;
                     resolve();
                }).catch(() => {}); // Ignore error, let polling continue
            }

            if (checks > 200) { // 20 seconds
                // Don't kill it, just warn
                if (checks % 50 === 0) console.warn('[Worker] Still waiting for OpenCV...');
            }
        }, 100);

        // Execute load
        loadScript();
    });
}

async function detect(imageData: ImageData, settings: any) {
    const { boardType } = settings;
    
    if (boardType === 'aprilgrid') {
        if (!atag_module) throw new Error('AprilTag not initialized');
        // We use the existing detectTags function
        // Note: Settings like tagFamily are ignored by this specific WASM build (hardcoded to 36h11)
        return detectTags({ imageData });
    } 
    else if (boardType === 'checkerboard' || boardType === 'chessboard') {
        // NOTE: For static GitHub Pages, we rely on public/opencv.js which MUST be the full version.
        // If "findChessboardCorners is not a function", the user must replace public/opencv.js
        await loadOpenCV();
        
        // Final safety check with user-friendly error
        if (!cv || !cv.findChessboardCorners) {
             throw new Error('OpenCV loaded but calibration functions are missing. Please replace public/opencv.js with a full build (including calib3d).');
        }

        return detectCheckerboard(imageData, settings);
    } 
    else if (boardType === 'charuco') {
        await loadOpenCV();
        if (!cv || !cv.aruco) {
             throw new Error('OpenCV loaded but ArUco module is missing. Please replace public/opencv.js with a full build (including aruco/objdetect).');
        }
        return detectChArUco(imageData, settings);
    }
    
    throw new Error(`Unknown board type: ${boardType}`);
}

function detectCheckerboard(imageData: ImageData, settings: any) {
    try {
        const { rows, cols } = settings;
        console.log(`[Worker] Detecting Chessboard: ${cols}x${rows} (inner corners)`);
        
        if (!cv) {
            console.error('[Worker] OpenCV not loaded');
            return { found: false, corners: [], error: 'OpenCV not loaded' };
    }

        const src = cv.matFromImageData(imageData);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        const corners = new cv.Mat();
        
        // CALIB_CB_ADAPTIVE_THRESH + CALIB_CB_NORMALIZE_IMAGE
        // Removed CALIB_CB_FAST_CHECK (8) to be more thorough
        const flags = 1 + 2; 
        
        // Attempt 1: Use provided rows/cols
        let patternSize = new cv.Size(cols, rows);
        console.log(`[Worker] Attempt 1: ${cols}x${rows}`);
        let found = cv.findChessboardCorners(gray, patternSize, corners, flags);
        
        // Attempt 2: Try rows-1, cols-1 (User might have counted squares)
        if (!found) {
            console.log('[Worker] Attempt 1 failed. Trying (cols-1)x(rows-1)...');
            patternSize = new cv.Size(cols - 1, rows - 1);
            found = cv.findChessboardCorners(gray, patternSize, corners, flags);
        }

        // Attempt 3: Try swapping rows/cols (User might have mixed them up)
        if (!found) {
             console.log('[Worker] Attempt 2 failed. Trying swapped cols/rows...');
             patternSize = new cv.Size(rows, cols);
             found = cv.findChessboardCorners(gray, patternSize, corners, flags);
        }

        if (found) {
            console.log(`[Worker] Checkerboard found! Size: ${patternSize.width}x${patternSize.height}`);
            
            // Refine corners
            const winSize = new cv.Size(5, 5);
            const zeroZone = new cv.Size(-1, -1);
            const criteria = new cv.TermCriteria(cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_COUNT, 30, 0.001);
            cv.cornerSubPix(gray, corners, winSize, zeroZone, criteria);
            
            // Convert corners to array
            const detectedCorners = [];
            for (let i = 0; i < corners.rows; ++i) {
                detectedCorners.push({
                    x: corners.data32F[i * 2],
                    y: corners.data32F[i * 2 + 1]
                });
            }
            
            src.delete(); gray.delete(); corners.delete();
            return { found: true, corners: detectedCorners };
        }
        
        console.log('[Worker] Checkerboard NOT found.');
        src.delete(); gray.delete(); corners.delete();
        return { found: false, corners: [], error: 'Checkerboard pattern not found. Tried normal, inner-corners, and swapped dimensions.' };
    } catch (e: any) {
        console.error('OpenCV Checkerboard Error:', e);
        return { found: false, corners: [], error: `OpenCV Error: ${e.message || e}` };
    }
}

function detectChArUco(imageData: ImageData, settings: any) {
    // Check if ArUco is available
    if (!cv.aruco) {
        console.error('OpenCV build does not support ArUco');
        return { found: false, error: 'ArUco module not found in OpenCV build' };
    }
    
    try {
        const { rows, cols, squareSize, markerSize, dictionary: dictName } = settings;
        
        const src = cv.matFromImageData(imageData);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        const dictionary = cv.aruco.getPredefinedDictionary(cv.aruco[dictName]);
        const board = new cv.aruco.CharucoBoard(cols, rows, squareSize, markerSize, dictionary);
        
        const corners = new cv.Mat();
        const ids = new cv.Mat();
        const rejected = new cv.Mat();
        const params = new cv.aruco.DetectorParameters();
        
        cv.aruco.detectMarkers(gray, dictionary, corners, ids, params, rejected);
        
        if (ids.rows > 0) {
            const charucoCorners = new cv.Mat();
            const charucoIds = new cv.Mat();
            
            const count = cv.aruco.interpolateCornersCharuco(corners, ids, gray, board, charucoCorners, charucoIds);
            
            if (count > 0) {
                 const detectedCorners = [];
                 // TODO: Map charucoIds to corners correctly?
                 // For simple calibration, we usually just need the points.
                 // But strictly, we need to know WHICH corner is WHICH to match object points.
                 // calibration.ts currently expects a flat list of corners matching object points.
                 // This is tricky for ChArUco if some are missing.
                 
                 // For now, return what we have.
                 for (let i = 0; i < charucoCorners.rows; ++i) {
                    detectedCorners.push({
                        x: charucoCorners.data32F[i * 2],
                        y: charucoCorners.data32F[i * 2 + 1],
                        id: charucoIds.data32S[i] // Keep ID for matching
                    });
                }
                
                src.delete(); gray.delete(); corners.delete(); ids.delete(); rejected.delete();
                charucoCorners.delete(); charucoIds.delete(); board.delete(); params.delete(); dictionary.delete(); // Check if dictionary needs delete
                
                return { found: true, corners: detectedCorners, isCharuco: true };
            }
            
            src.delete(); gray.delete(); corners.delete(); ids.delete(); rejected.delete();
            board.delete(); params.delete();
            return { found: false, corners: [], error: 'Markers found but ChArUco board interpolation failed (count=0).' };
        }
        
        src.delete(); gray.delete(); corners.delete(); ids.delete(); rejected.delete();
        board.delete(); params.delete();
        return { found: false, corners: [], error: 'No ArUco markers detected for ChArUco board.' };
        
    } catch (e: any) {
        console.error('OpenCV ChArUco Error:', e);
        return { found: false, corners: [], error: `OpenCV ChArUco Error: ${e.message || e}` };
    }
}

function performOpenCVCalibration(allImagePoints: any[], objPoints: any[], imageSize: any) {
    const N = allImagePoints.length;
    
    // Prepare OpenCV vectors
    const objectPointsVec = new cv.MatVector();
    const imagePointsVec = new cv.MatVector();
    
    // Convert JS arrays to cv.Mat
    for (let i = 0; i < N; i++) {
        const imgPts = allImagePoints[i];
        // objPoints might be shared (1D array) or per-image (2D array)
        // Check input format
        const currentObjPts = Array.isArray(objPoints[0]) ? objPoints[i] : objPoints;
        
        // Image Points (2D: x, y)
        const imgMat = new cv.Mat(imgPts.length, 1, cv.CV_32FC2);
        for (let j = 0; j < imgPts.length; j++) {
            imgMat.data32F[j * 2] = imgPts[j].x;
            imgMat.data32F[j * 2 + 1] = imgPts[j].y;
        }
        imagePointsVec.push_back(imgMat);
        imgMat.delete();
        
        // Object Points (3D: x, y, z)
        const objMat = new cv.Mat(currentObjPts.length, 1, cv.CV_32FC3);
        for (let j = 0; j < currentObjPts.length; j++) {
            objMat.data32F[j * 3] = currentObjPts[j].x;
            objMat.data32F[j * 3 + 1] = currentObjPts[j].y;
            objMat.data32F[j * 3 + 2] = currentObjPts[j].z || 0;
        }
        objectPointsVec.push_back(objMat);
        objMat.delete();
    }
    
    const cameraMatrix = new cv.Mat(); // 3x3
    const distCoeffs = new cv.Mat(); // 5x1 or 8x1
    const rvecs = new cv.MatVector();
    const tvecs = new cv.MatVector();
    const stdDevIntrinsics = new cv.Mat();
    const stdDevExtrinsics = new cv.Mat();
    const perViewErrors = new cv.Mat();
    
    const size = new cv.Size(imageSize.width, imageSize.height);
    // Flags: None by default
    const flags = 0;
    
    const rms = cv.calibrateCameraExtended(
        objectPointsVec, 
        imagePointsVec, 
        size, 
        cameraMatrix, 
        distCoeffs, 
        rvecs, 
        tvecs, 
        stdDevIntrinsics, 
        stdDevExtrinsics, 
        perViewErrors, 
        flags
    );
    
    // Convert results back to JS
    const result: any = {
        cameraMatrix: [],
        distCoeffs: [],
        rvecs: [],
        tvecs: [],
        rms: rms,
        perViewErrors: []
    };
    
    // Camera Matrix
    for (let i = 0; i < 9; i++) result.cameraMatrix.push(cameraMatrix.data64F[i]);
    
    // Dist Coeffs
    for (let i = 0; i < distCoeffs.rows * distCoeffs.cols; i++) result.distCoeffs.push(distCoeffs.data64F[i]);
    
    // Per View Errors
    for (let i = 0; i < perViewErrors.rows; i++) result.perViewErrors.push(perViewErrors.data64F[i]);
    
    // Extrinsics
    for (let i = 0; i < rvecs.size(); i++) {
        const r = rvecs.get(i);
        const t = tvecs.get(i);
        
        const rArr = [r.data64F[0], r.data64F[1], r.data64F[2]];
        const tArr = [t.data64F[0], t.data64F[1], t.data64F[2]];
        
        result.rvecs.push(rArr);
        result.tvecs.push(tArr);
        
        r.delete(); t.delete();
    }
    
    // Cleanup
    objectPointsVec.delete();
    imagePointsVec.delete();
    cameraMatrix.delete();
    distCoeffs.delete();
    rvecs.delete();
    tvecs.delete();
    stdDevIntrinsics.delete();
    stdDevExtrinsics.delete();
    perViewErrors.delete();
    
    return result;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  try {
    switch (type) {
      case 'INIT':
        await loadAprilTag(payload.url);
        self.postMessage({ type: 'INIT_SUCCESS', id });
        break;
        
      case 'DETECT':
        const detectionResult = await detect(payload.imageData, payload.settings);
        self.postMessage({ type: 'DETECT_SUCCESS', id, payload: detectionResult });
        break;
        
      case 'DETECT_TAGS':
        // Legacy support
        if (!atag_module) throw new Error('AprilTag not initialized');
        const legacyResult = detectTags(payload);
        self.postMessage({ type: 'DETECT_SUCCESS', id, payload: legacyResult });
        break;
        
      case 'CALIBRATE':
        // payload: { allImagePoints, objPoints, imageSize }
        // allImagePoints: {x,y}[][]
        // objPoints: {x,y}[]
        
        // Try to use OpenCV WASM calibration first if available (Faster & Standard)
        if (cv && cv.calibrateCamera && cv.Mat) {
            try {
                const result = performOpenCVCalibration(payload.allImagePoints, payload.objPoints, payload.imageSize);
                self.postMessage({ type: 'CALIBRATE_SUCCESS', id, payload: result });
                break;
            } catch (e) {
                console.error('[Worker] OpenCV Calibration failed, falling back to JS:', e);
            }
        }
        
        // Fallback to JS implementation
        const calibResult = performCalibration(payload.allImagePoints, payload.objPoints, payload.imageSize);
        self.postMessage({ type: 'CALIBRATE_SUCCESS', id, payload: calibResult });
        break;

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error: any) {
    self.postMessage({ type: 'ERROR', id, error: error.message });
  }
};

async function loadAprilTag(url: string): Promise<void> {
    if (atag_module) return;
    
    return new Promise((resolve, reject) => {
        const absoluteUrl = new URL(url, self.location.origin).toString();
        
        // Define Module for Emscripten
        // @ts-ignore
        self.Module = {
            locateFile: (path: string) => {
                if (path.endsWith('.wasm')) {
                    return new URL('/apriltag.wasm', self.location.origin).toString();
                }
                return path;
            },
            onRuntimeInitialized: () => {
                console.log('AprilTag WASM Initialized');
            }
        };

        importScripts(absoluteUrl);

        // Wait for AprilTagWasm to be available
        const check = async () => {
             // @ts-ignore
            if (self.AprilTagWasm) {
                // @ts-ignore
                atag_module = await self.AprilTagWasm(self.Module);
                
                // Bind C functions
                atag_init = atag_module.cwrap('atagjs_init', 'number', []);
                atag_destroy = atag_module.cwrap('atagjs_destroy', 'number', []);
                atag_set_detector_options = atag_module.cwrap('atagjs_set_detector_options', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number']);
                atag_set_img_buffer = atag_module.cwrap('atagjs_set_img_buffer', 'number', ['number', 'number', 'number']);
                atag_detect = atag_module.cwrap('atagjs_detect', 'number', []);
                
                // Initialize detector
                // Based on failure of atag_init, we try to call it and then also set options to force initialization.
                // If atag_init returns 0, it might mean success or failure depending on implementation.
                // Let's assume we need to be very careful with memory.
                
                const initResult = atag_init();
                console.log('atag_init returned:', initResult);

                // Re-enable options setting but use safe values
                // decimate=2.0 (faster), sigma=0.0 (sharp), nthreads=1 (safe for wasm), 
                // refine_edges=1, max_detections=10, return_pose=0, return_solutions=0
                atag_set_detector_options(2.0, 0.0, 1, 1, 10, 0, 0); 
                
                console.log('AprilTag WASM Initialized (Safe Options Set)');
                resolve();
            } else {
                setTimeout(check, 100);
            }
        }
        check();
    });
}

function detectTags({ imageData }: { imageData: ImageData }) {
    const { width, height, data } = imageData;
    
    // Convert to Grayscale
    const grayData = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
        // Simple RGB average or luminance
        // RGBA
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        grayData[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    
    console.log(`[Worker] Image size: ${width}x${height}, Buffer size: ${grayData.length}`);

    // Allocate buffer in WASM heap
    const imgBufPtr = atag_set_img_buffer(width, height, width);
    if (imgBufPtr === 0) {
        throw new Error('Failed to allocate memory for image in WASM');
    }
    
    // Copy data to WASM heap
    atag_module.HEAPU8.set(grayData, imgBufPtr);
    
    // Detect
    const resultPtr = atag_detect();
    console.log('[Worker] Detect Result Ptr:', resultPtr);
    
    if (resultPtr === 0) {
        console.error('[Worker] Detection failed: returned NULL pointer');
        return { found: false, detections: [], error: 'WASM Internal Error: Returned NULL pointer' };
    }
    
    // Parse result (pointer to JSON string)
    // struct t_str_json { char *data; size_t len; };
    
    const jsonStrPtr = atag_module.getValue(resultPtr, 'i32'); // char* data
    const jsonLen = atag_module.getValue(resultPtr + 4, 'i32'); // size_t len
    
    console.log('[Worker] JSON Ptr:', jsonStrPtr, 'Len:', jsonLen);
    
    if (jsonLen > 0 && jsonStrPtr !== 0) {
        try {
            const jsonBytes = atag_module.HEAPU8.subarray(jsonStrPtr, jsonStrPtr + jsonLen);
            let jsonString = new TextDecoder('utf8').decode(jsonBytes);
            // Limit log length
            console.log('[Worker] JSON String Start:', jsonString.substring(0, 100));
            
            // Remove null characters if any
            // eslint-disable-next-line no-control-regex
            jsonString = jsonString.replace(/\u0000/g, '');
            
            // Heuristic check for valid JSON start
            if (!jsonString.trim().startsWith('[')) {
                console.error('[Worker] Invalid JSON format (does not start with [). Full string:', jsonString);
                return { found: false, detections: [], error: `WASM Output Error: ${jsonString}` };
            }

            const detections = JSON.parse(jsonString);
            
            if (detections.length === 0) {
                return { found: false, detections: [], error: 'No AprilTags detected' };
            }
            
            return { found: detections.length > 0, detections };
        } catch (e: any) {
            console.error('[Worker] JSON Parse Error:', e.message);
            return { found: false, detections: [], error: `JSON Parse Error: ${e.message}` };
        }
    }
    
    return { found: false, detections: [], error: 'No detection result returned from WASM' };
}
