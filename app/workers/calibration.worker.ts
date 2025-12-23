/// <reference lib="webworker" />

declare global {
  interface WorkerGlobalScope {
    AprilTagWasm: any;
    Module: any;
    cv: any;
  }
}

let AprilTagWasm: any = null;
let atag_module: any = null;
let atag_detect: any = null;
let atag_init: any = null;
let atag_set_img_buffer: any = null;
let atag_set_detector_options: any = null;
let atag_destroy: any = null;
let aprilTagUrl = ''; // Store the URL passed during INIT

let cv: any = null;
let isOpenCVLoaded = false;

import { performCalibration } from '../utils/calibration';

async function loadOpenCV(): Promise<void> {
    if (isOpenCVLoaded) return;
    
    self.postMessage({ type: 'PROGRESS', message: 'Loading OpenCV...' });
    
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
                 // Determine base path for OpenCV similar to AprilTag
                 const origin = self.location.origin;
                 // We can reuse the path logic passed for AprilTag if we had it, 
                 // but typically opencv.js is at the root or base path.
                 
                 // If we are in GH Pages, we need to respect the path.
                 // A simple heuristic: if location.pathname has a directory, try that.
                 // But worker location might be different from page location (blob vs file).
                 
                 // Best bet: Try relative path first (./opencv.js) then root (/opencv.js)
                 // Or better, let's just try to import from the same base as apriltag.js was supposed to be?
                 // No, loadOpenCV doesn't take a url arg currently.
                 
                 // Let's use the global scope to store the base URL if passed during init?
                 // But loadOpenCV might be called before init if user selects checkerboard first.
                 
                 // Fallback: Just try standard paths.
                 // For GH Pages, /repo/opencv.js is needed.
                 
                 // Let's try to construct it from the worker's own location if it's not a blob.
                 // If worker is blob, location.href is blob:...
                 
                 // Simplest fix: Just try a few standard paths.
                 const paths = [
                     'opencv.js', // Relative to worker if file, or base if blob
                     '/opencv.js', // Root
                     '/camera_calibrator/opencv.js', // Known repo name
                 ];
                 
                 // If we have aprilTagUrl (passed from main thread which knows the correct base path), use it to derive opencv path
                 if (aprilTagUrl) {
                     // aprilTagUrl is like ".../base/path/apriltag.js"
                     const base = aprilTagUrl.substring(0, aprilTagUrl.lastIndexOf('/') + 1);
                     // Add to the front of the list
                     paths.unshift(base + 'opencv.js');
                 }

                 let loaded = false;
                 for(const p of paths) {
                     try {
                         importScripts(p);
                         loaded = true;
                         console.log(`[Worker] Loaded OpenCV from ${p}`);
                         break;
                     } catch(e) {
                         // continue
                     }
                 }
                 
                 if(!loaded) throw new Error("Could not load opencv.js from standard paths");

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
        return detectTags({ imageData });
    } 
    else if (boardType === 'checkerboard' || boardType === 'chessboard') {
        // NOTE: For static GitHub Pages, we rely on public/opencv.js which MUST be the full version.
        // If "findChessboardCorners is not a function", the user must replace public/opencv.js
        // await loadOpenCV();
        
        // Final safety check with user-friendly error
        // if (!cv || !cv.findChessboardCorners) {
        //      throw new Error('OpenCV loaded but calibration functions are missing. Please replace public/opencv.js with a full build (including calib3d).');
        // }

        // return detectCheckerboard(imageData, settings);
        throw new Error('Please use backend for chessboard detection.');
    } 
    else if (boardType === 'charuco') {
        throw new Error('ChArUco detection not yet implemented in worker.');
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

self.onmessage = async (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  try {
    switch (type) {
      case 'INIT':
        aprilTagUrl = payload.url;
        await loadAprilTag(payload.url);
        self.postMessage({ type: 'INIT_SUCCESS', id });
        break;
        
      case 'DETECT':
        const detectionResult = await detect(payload.imageData, payload.settings);
        self.postMessage({ type: 'DETECT_SUCCESS', id, payload: detectionResult });
        break;
        
      case 'CALIBRATE':
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
                    // We must use the directory of the script that was loaded (url)
                    // url is like "https://domain.com/base/apriltag.js"
                    // We want "https://domain.com/base/apriltag.wasm"
                    const scriptBase = url.substring(0, url.lastIndexOf('/') + 1);
                    return new URL('apriltag.wasm', scriptBase).toString();
                }
                return path;
            },
            onRuntimeInitialized: () => {
                console.log('AprilTag WASM Initialized');
            }
        };

        importScripts(absoluteUrl);
        self.postMessage({ type: 'PROGRESS', message: 'Loading AprilTag WASM...' });

        // Wait for AprilTagWasm to be available
        const check = async () => {
             // @ts-ignore
            if (self.AprilTagWasm) {
                try {
                    self.postMessage({ type: 'PROGRESS', message: 'Initializing AprilTag...' });
                    
                    // Add a timeout for the factory call itself
                    const factoryPromise = new Promise(async (res, rej) => {
                        const t = setTimeout(() => rej(new Error('AprilTagWasm factory timeout')), 10000);
                        try {
                            // @ts-ignore
                            const instance = await self.AprilTagWasm(self.Module);
                            clearTimeout(t);
                            res(instance);
                        } catch(e) {
                            clearTimeout(t);
                            rej(e);
                        }
                    });
                    
                    atag_module = await factoryPromise;
                    
                    // Bind C functions
                    atag_init = atag_module.cwrap('atagjs_init', 'number', []);
                    atag_destroy = atag_module.cwrap('atagjs_destroy', 'number', []);
                    atag_set_detector_options = atag_module.cwrap('atagjs_set_detector_options', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number']);
                    atag_set_img_buffer = atag_module.cwrap('atagjs_set_img_buffer', 'number', ['number', 'number', 'number']);
                    atag_detect = atag_module.cwrap('atagjs_detect', 'number', []);
                    
                    const initResult = atag_init();
                    console.log('atag_init returned:', initResult);

                    atag_set_detector_options(2.0, 0.0, 1, 1, 10, 0, 0); 
                    
                    console.log('AprilTag WASM Initialized (Safe Options Set)');
                    resolve();
                } catch(e: any) {
                    console.error("AprilTag WASM Init Failed:", e);
                    reject(e);
                }
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
        // RGBA
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        grayData[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    
    // Allocate buffer in WASM heap
    const imgBufPtr = atag_set_img_buffer(width, height, width);
    if (imgBufPtr === 0) {
        throw new Error('Failed to allocate memory for image in WASM');
    }
    
    // Copy data to WASM heap
    atag_module.HEAPU8.set(grayData, imgBufPtr);
    
    // Detect
    const resultPtr = atag_detect();
    
    if (resultPtr === 0) {
        return { found: false, detections: [], error: 'WASM Internal Error: Returned NULL pointer' };
    }
    
    const jsonStrPtr = atag_module.getValue(resultPtr, 'i32'); // char* data
    const jsonLen = atag_module.getValue(resultPtr + 4, 'i32'); // size_t len
    
    if (jsonLen > 0 && jsonStrPtr !== 0) {
        try {
            const jsonBytes = atag_module.HEAPU8.subarray(jsonStrPtr, jsonStrPtr + jsonLen);
            let jsonString = new TextDecoder('utf8').decode(jsonBytes);
            // eslint-disable-next-line no-control-regex
            jsonString = jsonString.replace(/\u0000/g, '');
            
            if (!jsonString.trim().startsWith('[')) {
                return { found: false, detections: [], error: `WASM Output Error: ${jsonString}` };
            }

            const detections = JSON.parse(jsonString);
            
            return { found: detections.length > 0, detections };
        } catch (e: any) {
            return { found: false, detections: [], error: `JSON Parse Error: ${e.message}` };
        }
    }
    
    return { found: false, detections: [], error: 'No detection result returned from WASM' };
}
