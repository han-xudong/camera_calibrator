import React from 'react';
import { X, Download, Copy } from 'lucide-react';

interface ResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: any;
}

export const ResultsModal: React.FC<ResultsModalProps> = ({ isOpen, onClose, result }) => {
  if (!isOpen || !result) return null;

  console.log('[ResultsModal] Received result:', result);

  // Fallback to snake_case if camelCase is missing
  const cameraMatrix = result.cameraMatrix || result.camera_matrix;
  const distCoeffs = result.distCoeffs || result.dist_coeffs;
  const rms = result.rms;

  const formatMatrix = (data: any, rows: number, cols: number) => {
    // Safety check
    if (!data) return '[]';

    // Check if data is array of arrays (C++ backend) or flat array (Worker)
    // Be careful accessing data[0] if empty
    const isArrayOfArrays = Array.isArray(data) && data.length > 0 && Array.isArray(data[0]);
    
    let str = '[\n';
    for (let i = 0; i < rows; i++) {
        str += '  [';
        for (let j = 0; j < cols; j++) {
            let val = 0;
            if (isArrayOfArrays) {
                // Handle 2D array: data[i][j]
                if (rows === 1) {
                    // 1D vector case (distCoeffs)
                    // If distCoeffs is [ [k1, k2...] ]
                    if (Array.isArray(data[0])) {
                         val = data[0][j] || 0; 
                    } else {
                         // Should not happen if isArrayOfArrays is true but let's be safe
                         // @ts-ignore
                         val = data[j] || 0;
                    }
                } else {
                    // Normal Matrix
                    if (data[i]) {
                        val = data[i][j] || 0;
                    }
                }
            } else {
                // Flat array or simple 1D array
                if (rows === 1) {
                    val = data[j] || 0;
                } else {
                    val = data[i * cols + j] || 0;
                }
            }
            
            str += (val || 0).toFixed(6) + (j < cols - 1 ? ', ' : '');
        }
        str += ']' + (i < rows - 1 ? ',\n' : '\n');
    }
    str += ']';
    return str;
  };

  const handleExport = () => {
    const data = JSON.stringify(result, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'camera_calibration.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col transition-colors">
        <div className="flex items-center justify-between p-4 border-b dark:border-neutral-800">
          <h2 className="text-xl font-bold dark:text-white">Calibration Results</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded dark:text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">RMS Error</h3>
            <p className="text-2xl font-mono text-black dark:text-neutral-200">{rms.toFixed(5)} px</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Camera Matrix (Intrinsics)</h3>
            <pre className="bg-gray-50 dark:bg-neutral-800 p-4 rounded border dark:border-neutral-700 text-sm font-mono overflow-x-auto dark:text-gray-300">
              {formatMatrix(cameraMatrix, 3, 3)}
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Distortion Coefficients</h3>
            <pre className="bg-gray-50 dark:bg-neutral-800 p-4 rounded border dark:border-neutral-700 text-sm font-mono overflow-x-auto dark:text-gray-300">
              {formatMatrix(distCoeffs, 1, 5)} 
              {/* Assuming 5 coeffs usually, but flexible */}
            </pre>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Order: k1, k2, p1, p2, k3, ...</p>
          </div>
        </div>

        <div className="p-4 border-t dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/50 flex justify-end gap-2">
          <button 
            onClick={handleExport}
            className="bg-black text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-gray-800 dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:text-white"
          >
            <Download className="w-4 h-4" /> Export JSON
          </button>
        </div>
      </div>
    </div>
  );
};
