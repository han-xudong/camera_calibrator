/// <reference lib="webworker" />

declare global {
  interface WorkerGlobalScope {
    AprilTagWasm: any;
    Module: any;
    createCameraCalibrator: any;
  }
}

// AprilTag variables
let atag_module: any = null;
let atag_detect: any = null;
let atag_init: any = null;
let atag_set_img_buffer: any = null;
let atag_set_detector_options: any = null;
let atag_destroy: any = null;

// Custom WASM variables
let cameraCalibratorModule: any = null;
let isCalibratorLoaded = false;

import { performCalibration } from '../utils/calibration';

async function loadCameraCalibrator(): Promise<void> {
    if (isCalibratorLoaded) return;
    
    return new Promise((resolve, reject) => {
        try {
            const origin = self.location.origin;
            console.log('[Worker] Loading camera_calibrator.js...');
            importScripts(`${origin}/camera_calibrator.js`);
            
            // @ts-ignore
            if (typeof createCameraCalibrator === 'undefined') {
                throw new Error('createCameraCalibrator is undefined. Please run cpp/build_wasm.sh and copy artifacts to public/');
            }
            
            // @ts-ignore
            createCameraCalibrator({
                locateFile: (path: string) => {
                    if (path.endsWith('.wasm')) return `${origin}/${path}`;
                    return path;
                }
            }).then((instance: any) => {
                cameraCalibratorModule = instance;
                isCalibratorLoaded = true;
                console.log('[Worker] Custom Camera Calibrator WASM loaded successfully');
                resolve();
            }).catch((e: any) => {
                console.error('[Worker] WASM Instantiation failed:', e);
                reject(e);
            });
            
        } catch (e: any) {
            console.error('[Worker] Failed to load camera_calibrator.js:', e);
            reject(new Error(`Failed to load camera_calibrator.js: ${e.message}. Ensure you have built the WASM module.`));
        }
    });
}

async function detect(imageData: ImageData, settings: any) {
    const { boardType } = settings;
    
    if (boardType === 'aprilgrid') {
        if (!atag_module) throw new Error('AprilTag not initialized');
        return detectTags({ imageData });
    } 
    else if (boardType === 'checkerboard' || boardType === 'chessboard') {
        await loadCameraCalibrator();
        return detectCheckerboard(imageData, settings);
    } 
    else if (boardType === 'charuco') {
        throw new Error('ChArUco detection not yet ported to custom WASM module.');
    }
    
    throw new Error(`Unknown board type: ${boardType}`);
}

function detectCheckerboard(imageData: ImageData, settings: any) {
    if (!cameraCalibratorModule) return { found: false, corners: [], error: 'WASM module not loaded' };
    
    const { width, height, data } = imageData;
    const { rows, cols } = settings;
    
    // Allocate memory
    const numBytes = width * height * 4; // RGBA
    const ptr = cameraCalibratorModule._malloc(numBytes);
    const heapBytes = new Uint8Array(cameraCalibratorModule.HEAPU8.buffer, ptr, numBytes);
    heapBytes.set(data);
    
    try {
        const result = cameraCalibratorModule.detectCorners(ptr, width, height, rows, cols);
        
        // Free memory
        cameraCalibratorModule._free(ptr);
        
        if (result.found) {
            // Convert Embind vector to JS array
            const cornersVec = result.corners;
            const corners = [];
            for (let i = 0; i < cornersVec.size(); i++) { // .size() for std::vector in Embind? No, usually .get(i) or .size()
                // Embind vectors usually have .size() and .get(i)
                const pt = cornersVec.get(i);
                corners.push({ x: pt.x, y: pt.y });
            }
            cornersVec.delete(); // Important to delete C++ objects returned by value if they are classes
            
            return { 
                found: true, 
                corners: corners, 
                rows: result.rows, 
                cols: result.cols 
            };
        } else {
             return { found: false, corners: [], error: 'Chessboard not found' };
        }
    } catch (e: any) {
        cameraCalibratorModule._free(ptr);
        console.error('WASM Detection Error:', e);
        return { found: false, corners: [], error: e.message };
    }
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
        
      case 'CALIBRATE':
        // We can use the C++ WASM for calibration too!
        if (cameraCalibratorModule) {
             const { allImagePoints, objPoints, imageSize } = payload;
             const result = cameraCalibratorModule.calibrateCamera(allImagePoints, objPoints, imageSize.width, imageSize.height);
             
             // Convert result
             // Embind returns JS objects for structs/vals, but if we returned 'val::object', it's a JS object.
             // However, nested arrays might need conversion if they are vectors.
             // My implementation returns 'val' which maps to JS object directly.
             
             self.postMessage({ type: 'CALIBRATE_SUCCESS', id, payload: result });
        } else {
             // Fallback to JS implementation
             const calibResult = performCalibration(payload.allImagePoints, payload.objPoints, payload.imageSize);
             self.postMessage({ type: 'CALIBRATE_SUCCESS', id, payload: calibResult });
        }
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
                
                const initResult = atag_init();
                console.log('atag_init returned:', initResult);

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
