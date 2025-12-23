'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

interface CalibrationContextType {
  isReady: boolean;
  initError: string | null;
  loadingStatus: string | null;
  detect: (imageData: ImageData, settings: any) => Promise<any>;
  calibrate: (allImagePoints: any[], objPoints: any[], imageSize: any) => Promise<any>;
}

const CalibrationContext = createContext<CalibrationContextType | null>(null);

export const CalibrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string | null>('Initializing...');
  const [isBackendWakingUp, setIsBackendWakingUp] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const promiseMap = useRef<Map<string, { resolve: Function; reject: Function }>>(new Map());

  // Check backend status on init
  useEffect(() => {
      const checkBackend = async () => {
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;
          if (backendUrl) {
              try {
                  // Set a short timeout to check if it's awake
                  const controller = new AbortController();
                  const id = setTimeout(() => controller.abort(), 2000);
                  
                  await fetch(backendUrl, { signal: controller.signal });
                  clearTimeout(id);
              } catch (e) {
                  // If it fails or times out, it might be sleeping
                  console.log('Backend might be sleeping or unreachable');
              }
          }
      };
      checkBackend();
  }, []);

  useEffect(() => {
    // Add timestamp to force cache busting for the worker
    const worker = new Worker(new URL('../workers/calibration.worker.ts', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, id, payload, error, message } = e.data;

      if (type === 'INIT_SUCCESS') {
        console.log('Worker Init Success');
        setIsReady(true);
        setLoadingStatus(null);
        const p = promiseMap.current.get(id);
        if (p) p.resolve();
      } else if (type === 'PROGRESS') {
          setLoadingStatus(message);
      } else if (error) {
        console.error('Worker Error:', error);
        if (type === 'ERROR' && id && id.startsWith('init_')) {
             setInitError(error);
             setLoadingStatus(null);
        }
        const p = promiseMap.current.get(id);
        if (p) p.reject(new Error(error));
      } else {
        const p = promiseMap.current.get(id);
        if (p) {
            p.resolve(payload);
            promiseMap.current.delete(id);
        }
      }
    };
    
    worker.onerror = (err) => {
        console.error('Worker script error:', err);
        setInitError('Failed to load worker script.');
    };

    // Use a relative path or construct absolute path based on current location
    // This helps with GitHub Pages deployment where the app might be in a subdirectory
    const getPublicPath = (file: string) => {
        // If we are in a subdirectory (e.g. /camera_calibrator/), we need to prepend it
        // However, Next.js 'basePath' usually handles routing, but for static files accessed manually:
        const path = window.location.pathname.replace(/\/[^/]*$/, ''); // Get directory
        // Actually, easiest is just relative to root if base tag is not used, but let's try origin + pathname prefix
        // If the user navigates to /camera_calibrator/, that's the root.
        // A simple hack: check if we are on localhost or github.io
        
        // Better: assume 'file' is at the root of the deployment
        // If we are at https://domain.com/repo/, we want https://domain.com/repo/file
        
        // Let's use document.baseURI if available, or location
        const baseUrl = new URL('.', window.location.href).href;
        return new URL(file, baseUrl).href;
    };

    const initId = 'init_' + Date.now();
    promiseMap.current.set(initId, { resolve: () => {}, reject: (e: any) => setInitError(e.message) });
    
    // We pass the full URL for apriltag.js just in case
    // For local dev, it's usually http://localhost:3000/apriltag.js
    // For gh-pages, it's https://user.github.io/repo/apriltag.js
    // We can rely on the fact that public assets are served at the root of the paths
    
    // Attempt to detect base path from window.location
    // If we are at /camera_calibrator/, we want /camera_calibrator/apriltag.js
    // We can just pass the filename and let the worker try to figure it out, OR pass the full absolute URL
    
    // NOTE: NEXT_PUBLIC_BASE_PATH usually starts with / if set, or is empty.
    // If it's set, we should use it.
    
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    
    // Ensure we don't double slash if basePath ends with / (it shouldn't)
    // and ensure we have a slash between base and file
    const cleanBasePath = basePath.replace(/\/$/, '');
    const fullApriltagUrl = `${window.location.origin}${cleanBasePath}/apriltag.js`;

    console.log('[Context] Initializing worker with AprilTag URL:', fullApriltagUrl);

    worker.postMessage({ type: 'INIT', id: initId, payload: { url: fullApriltagUrl } });

    return () => {
      worker.terminate();
    };
  }, []);

  const callWorker = (type: string, payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }
      const id = type + '_' + Date.now() + '_' + Math.random();
      
      // Timeout safety net (60 seconds for calibration)
      const timeoutId = setTimeout(() => {
          if (promiseMap.current.has(id)) {
              promiseMap.current.delete(id);
              reject(new Error(`Worker timed out for ${type}`));
          }
      }, 60000);

      promiseMap.current.set(id, { 
          resolve: (res: any) => { clearTimeout(timeoutId); resolve(res); }, 
          reject: (err: any) => { clearTimeout(timeoutId); reject(err); } 
      });
      
      workerRef.current.postMessage({ type, id, payload });
    });
  };

  const detect = async (imageData: ImageData, settings: any) => {
    // 1. Try Remote Backend (if configured)
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;
    if (backendUrl && (settings.boardType === 'checkerboard' || settings.boardType === 'chessboard')) {
        try {
             return await detectWithBackend(imageData, settings, backendUrl);
        } catch (e) {
             console.warn('Remote Backend detection failed, falling back to worker:', e);
        }
    }

    // 2. Try Local Backend (if in dev mode)
    if ((settings.boardType === 'checkerboard' || settings.boardType === 'chessboard') && process.env.NODE_ENV === 'development' && !backendUrl) {
        try {
             return await detectWithBackend(imageData, settings, ''); // Empty means local relative path
        } catch (e) {
             console.warn('Local Backend detection failed, falling back to worker:', e);
        }
    }

    // 3. Fallback to Worker (WASM/JS)
    return callWorker('DETECT', { imageData, settings });
  };
  
  const detectWithBackend = async (imageData: ImageData, settings: any, baseUrl: string) => {
        // We do not set loadingStatus here to avoid blocking overlay during image detection.
        // The individual image card spinner will indicate processing.
        // setIsBackendWakingUp(true); // Optional: could be used for non-blocking indicators
        
        try {
            const canvas = document.createElement('canvas');
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not create canvas context');
            ctx.putImageData(imageData, 0, 0);
            
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
            if (!blob) throw new Error('Failed to create image blob');
            
            const formData = new FormData();
            formData.append('image', blob, 'upload.jpg');
            formData.append('rows', String(settings.rows || 0));
            formData.append('cols', String(settings.cols || 0));
            
            // Construct URL: 
            // If baseUrl is set (e.g. https://hf.space/...), append /detect
            // If baseUrl is empty (local), use /api/detect
            const url = baseUrl ? `${baseUrl}/detect` : '/api/detect';
            
            const res = await fetch(url, {
                method: 'POST',
                body: formData
            });
            
            const result = await res.json();
            
            // Map C++ 'success' to frontend 'found'
            if (result.success !== undefined) {
                result.found = result.success;
            }
            if (result.camera_matrix) result.cameraMatrix = result.camera_matrix;
            if (result.dist_coeffs) result.distCoeffs = result.dist_coeffs;

            if (!res.ok) {
                 throw new Error(result.error || 'Backend detection failed');
            }
            
            return result;
        } finally {
            // setIsBackendWakingUp(false);
            // setLoadingStatus(null);
        }
  };

  const calibrate = async (allImagePoints: any[], objPoints: any[], imageSize: any) => {
      // 1. Try Remote Backend (if configured)
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;
      if (backendUrl) {
          try {
              console.log('[Context] Attempting Remote Backend Calibration...');
              return await calibrateWithBackend(allImagePoints, objPoints, imageSize, backendUrl);
          } catch (e) {
              console.warn('[Context] Remote Backend calibration failed, falling back to worker:', e);
          }
      }

      // 2. Try Local Backend (if in dev mode)
      if (process.env.NODE_ENV === 'development' && !backendUrl) {
          try {
              console.log('[Context] Attempting Local Backend Calibration...');
              return await calibrateWithBackend(allImagePoints, objPoints, imageSize, '');
          } catch (e) {
              console.warn('[Context] Local Backend calibration failed, falling back to worker:', e);
          }
      }

      return callWorker('CALIBRATE', { allImagePoints, objPoints, imageSize });
  };
  
  const calibrateWithBackend = async (allImagePoints: any[], objPoints: any[], imageSize: any, baseUrl: string) => {
      // setIsBackendWakingUp(true);
      // setLoadingStatus("Calculating calibration... (may take 30s if backend is waking up)");

      try {
          // Construct URL:
          // Remote: /calibrate
          // Local: /api/calibrate_compute
          const url = baseUrl ? `${baseUrl}/calibrate` : '/api/calibrate_compute';

          const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ allImagePoints, objPoints, imageSize })
          });
          
          const result = await res.json();
          
          if (!res.ok) {
              throw new Error(result.error || 'Backend calibration failed');
          }
          
          return result;
      } finally {
          // setIsBackendWakingUp(false);
          // setLoadingStatus(null);
      }
  };

  return (
    <CalibrationContext.Provider value={{ isReady, initError, loadingStatus, detect, calibrate }}>
      {children}
    </CalibrationContext.Provider>
  );
};

export const useCalibration = () => {
  const context = useContext(CalibrationContext);
  if (!context) {
    throw new Error('useCalibration must be used within an CalibrationProvider');
  }
  return context;
};
