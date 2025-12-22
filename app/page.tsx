'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { MainContent } from '@/components/MainContent';
import { ResultsModal } from '@/components/ResultsModal';
import { SettingsModal, CalibrationSettings } from '@/components/SettingsModal';
import { useCalibration } from '@/app/context/CalibrationContext';
import { loadImageData } from '@/app/utils/image';

interface CalibrationImage {
  id: string;
  url: string;
  name: string;
  status: 'pending' | 'processing' | 'detected' | 'failed';
  corners?: { x: number; y: number }[]; // Reused for Tag corners
  detections?: any[]; // AprilTag detections
  boardSize?: { rows: number; cols: number }; // Detected board size
  error?: string; // Reason for failure
  file: File;
  width?: number;
  height?: number;
}

export default function Home() {
  const { isReady, initError, loadingStatus, detect, calibrate } = useCalibration();
  
  // State
  const [images, setImages] = useState<CalibrationImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('image');
  
  const [showSettings, setShowSettings] = useState(false);
  const [calibrationSettings, setCalibrationSettings] = useState<CalibrationSettings>({
    boardType: 'chessboard',
    rows: 0,
    cols: 0,
    squareSize: 25,
    tagFamily: 'tag36h11'
  });
  
  const [calibrationResult, setCalibrationResult] = useState<any>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [usedImageIds, setUsedImageIds] = useState<string[]>([]);

  const selectedImage = images.find(img => img.id === selectedImageId);
  
  // Helper to select image by calibration index
  const handleSelectCalibrationImage = (index: number) => {
      if (index >= 0 && index < usedImageIds.length) {
          setSelectedImageId(usedImageIds[index]);
      }
  };

  if (!isReady) {
    if (initError) {
        return (
            <div className="flex items-center justify-center h-screen w-screen bg-gray-50 p-4">
                <div className="text-center max-w-md bg-white p-8 rounded-lg shadow-lg">
                    <div className="text-red-500 mb-4">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Initialization Error</h2>
                    <p className="text-gray-600 mb-4">{initError}</p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-gray-50">
        <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-700">Loading Detector...</h2>
            {loadingStatus && <p className="text-gray-500 text-sm mt-2">{loadingStatus}</p>}
            <p className="text-gray-400 text-xs mt-1">This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  // Add Images
  const handleAddImages = async (files: FileList) => {
    const newImages: CalibrationImage[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      url: URL.createObjectURL(file),
      name: file.name,
      status: 'pending',
      file
    }));

    setImages(prev => [...prev, ...newImages]);
    
    // Trigger Settings Modal immediately after adding images
    setShowSettings(true);
  };

  const handleSettingsConfirm = async (settings: CalibrationSettings) => {
      setCalibrationSettings(settings);
      setShowSettings(false);
      
      const imagesToProcess = images.map(img => img.id); // Process all current images
      
      let currentSettings = { ...settings };

      for (const id of imagesToProcess) {
          const img = images.find(i => i.id === id);
          if (img) {
              const result = await processImage(img.id, img.url, currentSettings);
              
              // If we were in auto-detect mode (0,0) and we found dimensions, update currentSettings for next images
              if (currentSettings.rows === 0 && result && result.found && result.rows && result.cols) {
                  console.log(`Auto-detected board size: ${result.rows}x${result.cols}. Applying to subsequent images.`);
                  currentSettings = {
                      ...currentSettings,
                      rows: result.rows,
                      cols: result.cols
                  };
                  
                  // Update global state immediately so UI and future operations use it
                  setCalibrationSettings(prev => ({
                      ...prev,
                      rows: result.rows,
                      cols: result.cols
                  }));
              }
          }
      }
  };

  const processImage = async (id: string, url: string, settings: CalibrationSettings) => {
    setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'processing' } : img));
    
    try {
        const imageData = await loadImageData(url);
        
        // Update dimensions
        setImages(prev => prev.map(img => img.id === id ? { ...img, width: imageData.width, height: imageData.height } : img));

        console.log(`Processing image ${id} with settings:`, settings);
        const result = await detect(imageData, settings);
        console.log(`Detection result for ${id}:`, result);
        
        if (result.found) {
            setImages(prev => prev.map(img => 
                img.id === id ? { 
                    ...img, 
                    status: 'detected', 
                    detections: result.detections, 
                    corners: result.corners || result.detections.flatMap((d: any) => d.corners), 
                    boardSize: (result.rows && result.cols) ? { rows: result.rows, cols: result.cols } : undefined,
                    error: undefined 
                } : img
            ));
        } else {
            setImages(prev => prev.map(img => 
                img.id === id ? { ...img, status: 'failed', error: result.error || 'Detection failed' } : img
            ));
        }
        return result;
    } catch (err: any) {
        console.error(err);
        setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'failed', error: err.message } : img));
        return null;
    }
  };

  const handleRemoveImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
    if (selectedImageId === id) setSelectedImageId(null);
  };

  // Calibration Logic
  const handleCalibrate = async () => {
        const validImages = images.filter(img => img.status === 'detected');
        if (validImages.length < 3) {
            alert('Need at least 3 images with detected corners to calibrate.');
            return;
        }

        // Validate that all images have the same number of corners
        // Use the most frequent corner count as the target
        const cornerCounts = validImages.map(img => img.corners?.length || 0);
        const countsMap = new Map<number, number>();
        cornerCounts.forEach(c => countsMap.set(c, (countsMap.get(c) || 0) + 1));
        
        let targetCount = 0;
        let maxFreq = 0;
        countsMap.forEach((freq, count) => {
            if (freq > maxFreq && count > 0) {
                maxFreq = freq;
                targetCount = count;
            }
        });

        if (targetCount === 0) {
            alert('No valid corners detected.');
            return;
        }

        const imagesToUse = validImages.filter(img => (img.corners?.length || 0) === targetCount);
        if (imagesToUse.length < 3) {
             alert(`Found ${imagesToUse.length} images with ${targetCount} corners, but need at least 3. (Discarded ${validImages.length - imagesToUse.length} images with mismatched counts)`);
             return;
        }

        // Store the IDs of images used for calibration
        setUsedImageIds(imagesToUse.map(img => img.id));

        if (imagesToUse.length < validImages.length) {
            console.warn(`Discarding ${validImages.length - imagesToUse.length} images due to mismatched corner counts.`);
        }
        
        setIsCalibrating(true);
        
        try {
            const allImagePoints: {x: number, y: number}[][] = [];
            const objPoints: {x: number, y: number}[] = [];
            
            // Generate Object Points based on Settings
            let currentObjPoints: {x: number, y: number}[] = [];
    
            if (calibrationSettings.boardType === 'chessboard') {
                // Standard Chessboard (inner corners)
                let foundRows = calibrationSettings.rows;
                let foundCols = calibrationSettings.cols;

                // Auto-detect dimensions if not set
                if (foundRows === 0 || foundCols === 0) {
                    // Try to infer from detected images
                    const sizes = imagesToUse.map(img => img.boardSize).filter(s => s);
                    if (sizes.length > 0) {
                         // Use the most frequent size
                         // Simple approach: Use the first one that matches targetCount
                         const match = sizes.find(s => s && s.rows * s.cols === targetCount);
                         if (match) {
                             foundRows = match.rows;
                             foundCols = match.cols;
                         } else {
                             // Fallback: If we have targetCount, and no boardSize matches (unlikely if detection worked),
                             // we can't easily guess rows/cols without more info.
                             // But wait, detection logic returned boardSize only if it found it.
                             // So we should trust boardSize.
                             // If targetCount != boardSize.rows * boardSize.cols, then something is wrong.
                             // Let's just take the first valid size.
                             foundRows = sizes[0]!.rows;
                             foundCols = sizes[0]!.cols;
                         }
                         
                         // Update settings for visualization
                         setCalibrationSettings(prev => ({ ...prev, rows: foundRows, cols: foundCols }));
                    } else {
                        throw new Error('Could not auto-detect board dimensions. Please ensure detection was successful.');
                    }
                }
                
                if (foundRows * foundCols !== targetCount) {
                     // Try squares - 1 (in case user entered squares but we need inner corners, 
                     // or if detection found squares but we need inner corners? 
                     // No, detection (C++) returns inner corners count (rows, cols).
                     // So foundRows * foundCols SHOULD equal targetCount.
                     
                     // However, if we came from manual settings, we might need adjustment.
                     // If we came from auto-detect, it should match.
                     
                     // Try squares - 1 logic only if manual settings were used?
                     // Or just generic fallback.
                     if ((foundRows - 1) * (foundCols - 1) === targetCount) {
                         foundRows -= 1;
                         foundCols -= 1;
                     }
                     // Try swapped
                     else if (foundCols * foundRows !== targetCount) {
                        // Try squares - 1 swapped
                        if ((foundCols - 1) * (foundRows - 1) === targetCount) {
                             foundRows = calibrationSettings.cols - 1;
                             foundCols = calibrationSettings.rows - 1;
                        }
                     }
                }
                
                // Final check
                if (foundRows * foundCols !== targetCount) {
                     throw new Error(`Detected ${targetCount} corners, but expect ${foundRows}x${foundCols} (${foundRows * foundCols}). Please check your settings.`);
                }
    
                // Z=0
                for (let i = 0; i < foundRows; i++) {
                    for (let j = 0; j < foundCols; j++) {
                        currentObjPoints.push({
                            x: j * calibrationSettings.squareSize,
                            y: i * calibrationSettings.squareSize,
                            // z: 0 (backend assumes 0 if not sent, but we send x,y,z usually? route.ts sends x,y,z. We need z here?)
                            // calibration.ts usually expects {x,y,z}. 
                            // Let's add z:0 to be safe.
                            // @ts-ignore
                            z: 0
                        });
                    }
                }
            } else if (calibrationSettings.boardType === 'aprilgrid') {
            // Grid of AprilTags
            // This is complex because we need to know WHICH tags were detected.
            // But if we assume a FULL grid is detected, or we filter based on Tag ID.
            // For now, let's implement the SINGLE TAG case if user selects AprilGrid but only 1 tag is found?
            // Or assume the detector returns consistent order?
            // AprilTag detector returns random order. We MUST use IDs.
            
            // For this demo, let's simplify: 
            // If AprilGrid, we assume a single large tag or just use the first tag found (fallback to previous logic).
            // OR better: Assume user wants to calibrate using a single tag (common for simple tasks).
            // IF user specified Rows/Cols > 1, then we need ID mapping.
            // Let's stick to the previous Single Tag logic for now if AprilTag is used, 
            // OR just use the first detected tag as the target.
            
             const s = calibrationSettings.squareSize / 2;
             currentObjPoints = [
                 { x: -s, y: s }, // 0
                 { x: s, y: s },  // 1
                 { x: s, y: -s }, // 2
                 { x: -s, y: -s } // 3
             ];
             // Note: This logic only works for 1 tag. 
             // Ideally we should use the "board" definition.
        }
        
        imagesToUse.forEach(img => {
            if (calibrationSettings.boardType === 'aprilgrid') {
                 if (img.detections && img.detections.length > 0) {
                    const tag = img.detections[0];
                    allImagePoints.push(tag.corners); 
                 }
            } else {
                // Checkerboard / ChArUco
                if (img.corners) {
                    allImagePoints.push(img.corners);
                }
            }
        });
        
        // Object points are same for all images (assuming same target)
        objPoints.push(...currentObjPoints);
        
        const imageSize = { width: imagesToUse[0].width, height: imagesToUse[0].height };
        
        const result = await calibrate(
            allImagePoints,
            objPoints,
            imageSize
        );
        
        setCalibrationResult(result);
        setShowResultsModal(true);
        
    } catch (e: any) {
        alert('Calibration failed: ' + e.message);
    } finally {
        setIsCalibrating(false);
    }
  };

  // Check if all images are processed (either detected or failed)
  // This ensures we don't calibrate while detection is running
  const areAllImagesProcessed = images.length > 0 && images.every(img => img.status === 'detected' || img.status === 'failed');

  // Check if we have enough valid images for calibration
  const canCalibrate = areAllImagesProcessed && images.filter(i => i.status === 'detected').length >= 3;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar
        images={images}
        onAddImages={handleAddImages}
        onRemoveImage={handleRemoveImage}
        onSelectImage={setSelectedImageId}
        selectedImageId={selectedImageId}
        onCalibrate={handleCalibrate}
        onShowResults={() => setShowResultsModal(true)}
        isCalibrating={isCalibrating}
        canCalibrate={canCalibrate}
        hasResults={!!calibrationResult}
      />
      
      <MainContent
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedImage={selectedImage}
        calibrationResult={calibrationResult}
        reprojectionErrors={calibrationResult?.perViewErrors}
        boardConfig={{
             width: (calibrationSettings.cols - 1) * calibrationSettings.squareSize,
             height: (calibrationSettings.rows - 1) * calibrationSettings.squareSize,
             squareSize: calibrationSettings.squareSize
        }}
        onSelectCalibrationImage={handleSelectCalibrationImage}
        selectedIndex={selectedImageId ? usedImageIds.indexOf(selectedImageId) : -1}
      />
      
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onConfirm={handleSettingsConfirm}
        initialSettings={calibrationSettings}
      />

      <ResultsModal 
        isOpen={showResultsModal}
        onClose={() => setShowResultsModal(false)}
        result={calibrationResult}
      />
    </div>
  );
}
