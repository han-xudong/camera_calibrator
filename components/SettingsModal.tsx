import React from 'react';
import { Settings, X } from 'lucide-react';

export type BoardType = 'chessboard' | 'charuco' | 'aprilgrid';

export interface CalibrationSettings {
  boardType: BoardType;
  rows: number;
  cols: number;
  squareSize: number;
  markerSize?: number; // For ChArUco
  dictionary?: string; // For ChArUco
  tagFamily?: string; // For AprilGrid
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (settings: CalibrationSettings) => void;
  initialSettings?: Partial<CalibrationSettings>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialSettings
}) => {
  const [settings, setSettings] = React.useState<CalibrationSettings>({
    boardType: 'chessboard',
    rows: 0,
    cols: 0,
    squareSize: 25,
    tagFamily: 'tag36h11',
    ...initialSettings
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(settings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden transition-colors">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-neutral-800">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-black dark:text-neutral-400" />
            Calibration Settings
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Board Type Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Calibration Board Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['chessboard', 'charuco', 'aprilgrid'] as BoardType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSettings({ ...settings, boardType: type })}
                  className={`px-3 py-2 text-sm font-medium rounded-lg capitalize transition-all ${
                    settings.boardType === type
                      ? 'bg-black text-white shadow-md dark:bg-neutral-700 dark:text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-neutral-800 dark:text-gray-400 dark:hover:bg-neutral-700'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Square Size (mm)</label>
              <input
                type="number"
                min="1"
                step="0.1"
                value={settings.squareSize}
                onChange={(e) => setSettings({ ...settings, squareSize: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-black focus:border-black dark:bg-neutral-800 dark:text-white dark:focus:ring-neutral-600 dark:focus:border-neutral-600"
              />
            </div>
            
            {settings.boardType === 'charuco' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Marker Size (mm)</label>
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={settings.markerSize || settings.squareSize * 0.6}
                  onChange={(e) => setSettings({ ...settings, markerSize: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-black focus:border-black dark:bg-neutral-800 dark:text-white dark:focus:ring-neutral-600 dark:focus:border-neutral-600"
                />
              </div>
            )}
          </div>

          {settings.boardType === 'aprilgrid' && (
            <div>
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tag Family</label>
               <select
                 value={settings.tagFamily}
                 onChange={(e) => setSettings({ ...settings, tagFamily: e.target.value })}
                 className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-black focus:border-black bg-white dark:bg-neutral-800 dark:text-white dark:focus:ring-neutral-600 dark:focus:border-neutral-600"
               >
                 <option value="tag36h11">Tag36h11 (Standard)</option>
                 <option value="tagStandard41h12">TagStandard41h12</option>
                 <option value="tag25h9">Tag25h9</option>
                 <option value="tag16h5">Tag16h5</option>
               </select>
            </div>
          )}
          
          {settings.boardType === 'charuco' && (
            <div>
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dictionary</label>
               <select
                 value={settings.dictionary || 'DICT_6X6_250'}
                 onChange={(e) => setSettings({ ...settings, dictionary: e.target.value })}
                 className="w-full px-3 py-2 border border-gray-300 dark:border-neutral-700 rounded-lg focus:ring-2 focus:ring-black focus:border-black bg-white dark:bg-neutral-800 dark:text-white dark:focus:ring-neutral-600 dark:focus:border-neutral-600"
               >
                 <option value="DICT_4X4_50">DICT_4X4_50</option>
                 <option value="DICT_5X5_100">DICT_5X5_100</option>
                 <option value="DICT_6X6_250">DICT_6X6_250</option>
                 <option value="DICT_7X7_1000">DICT_7X7_1000</option>
               </select>
            </div>
          )}

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors dark:text-gray-300 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 rounded-lg shadow-md transition-colors dark:bg-neutral-700 dark:hover:bg-neutral-600"
            >
              Confirm & Detect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};