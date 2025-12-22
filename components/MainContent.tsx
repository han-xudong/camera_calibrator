import React from 'react';
import { Image as ImageIcon, BarChart2, Box } from 'lucide-react';
import { ImageView } from './ImageView';
import { ReprojectionErrorChart } from './ReprojectionErrorChart';
import { ExtrinsicsView } from './ExtrinsicsView';

interface MainContentProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedImage: any;
  calibrationResult: any;
  reprojectionErrors: number[];
  boardConfig?: { width: number; height: number; squareSize: number };
  onSelectCalibrationImage?: (index: number) => void;
  selectedIndex?: number;
}

export const MainContent: React.FC<MainContentProps> = ({
  activeTab,
  setActiveTab,
  selectedImage,
  calibrationResult,
  reprojectionErrors,
  boardConfig,
  onSelectCalibrationImage,
  selectedIndex = -1
}) => {
  // If no calibration result, show simple single view (Image View)
  if (!calibrationResult) {
      return (
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-neutral-950 transition-colors">
              <div className="flex-1 bg-gray-100 dark:bg-neutral-900/50 p-4 relative overflow-hidden flex flex-col">
                 {selectedImage ? (
                     <ImageView 
                        url={selectedImage.url} 
                        corners={selectedImage.corners}
                        width={selectedImage.width}
                        height={selectedImage.height}
                     />
                 ) : (
                     <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-neutral-500">
                         <ImageIcon className="w-12 h-12 mb-2 opacity-50"/>
                         <p>Select an image to view details</p>
                     </div>
                 )}
              </div>
          </div>
      );
  }

  // Dashboard Layout (Post-Calibration)
  return (
    <div className="flex-1 flex h-full overflow-hidden bg-white dark:bg-neutral-950 transition-colors">
      {/* Left Column: Image View */}
      <div className="w-1/2 flex flex-col border-r border-gray-200 dark:border-neutral-800">
          <div className="flex-1 bg-gray-100 dark:bg-neutral-900/50 p-4 relative overflow-hidden flex flex-col">
             {selectedImage ? (
                 <ImageView 
                    url={selectedImage.url} 
                    corners={selectedImage.corners}
                    width={selectedImage.width}
                    height={selectedImage.height}
                 />
             ) : (
                 <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-neutral-500">
                     <ImageIcon className="w-12 h-12 mb-2 opacity-50"/>
                     <p>Select an image</p>
                 </div>
             )}
          </div>
      </div>

      {/* Right Column: Errors (Top) + Extrinsics (Bottom) */}
      <div className="w-1/2 flex flex-col bg-white dark:bg-neutral-900 border-l border-gray-200 dark:border-neutral-800">
          {/* Top Half: Reprojection Errors */}
          <div className="h-1/2 flex flex-col border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="border-b border-gray-200 dark:border-neutral-800 px-4 py-3 bg-white dark:bg-neutral-900 shadow-sm z-10 flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-black dark:text-neutral-400" />
                  <span className="font-semibold text-gray-700 dark:text-neutral-200 text-sm">Reprojection Errors</span>
              </div>
              <div className="flex-1 relative p-2 bg-white dark:bg-neutral-900">
                  <ReprojectionErrorChart 
                     errors={reprojectionErrors || []} 
                     onSelect={onSelectCalibrationImage}
                     selectedIndex={selectedIndex}
                  />
              </div>
          </div>

          {/* Bottom Half: Extrinsics View */}
          <div className="h-1/2 flex flex-col bg-white dark:bg-neutral-900">
              <div className="border-b border-gray-200 dark:border-neutral-800 px-4 py-3 bg-white dark:bg-neutral-900 shadow-sm z-10 flex items-center gap-2">
                  <Box className="w-5 h-5 text-black dark:text-neutral-400" />
                  <span className="font-semibold text-gray-700 dark:text-neutral-200 text-sm">Extrinsics View</span>
              </div>
              <div className="flex-1 relative bg-white dark:bg-neutral-900">
                 <ExtrinsicsView 
                    rvecs={calibrationResult?.rvecs || []} 
                    tvecs={calibrationResult?.tvecs || []} 
                    boardSize={boardConfig}
                    onSelect={onSelectCalibrationImage}
                    selectedIndex={selectedIndex}
                 />
              </div>
          </div>
      </div>
    </div>
  );
};
