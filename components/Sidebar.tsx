import React, { useRef } from 'react';
import { Upload, Settings, Camera, Trash2, CheckCircle, XCircle, Loader2, CheckSquare, Sun, Moon } from 'lucide-react';
import { useTheme } from '../app/context/ThemeContext';

interface SidebarImage {
  id: string;
  url: string;
  name: string;
  status: 'pending' | 'processing' | 'detected' | 'failed';
  error?: string;
}

interface SidebarProps {
  images: SidebarImage[];
  onAddImages: (files: FileList) => void;
  onRemoveImage: (id: string) => void;
  onSelectImage: (id: string) => void;
  selectedImageId: string | null;
  onCalibrate: () => void;
  onShowResults: () => void;
  isCalibrating: boolean;
  canCalibrate: boolean;
  hasResults: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  images,
  onAddImages,
  onRemoveImage,
  onSelectImage,
  selectedImageId,
  onCalibrate,
  onShowResults,
  isCalibrating,
  canCalibrate,
  hasResults,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddImages(e.target.files);
    }
  };

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkDelete = () => {
    selectedIds.forEach(id => onRemoveImage(id));
    setSelectedIds(new Set());
  };

  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="w-80 h-full bg-white dark:bg-neutral-900 border-r border-gray-200 dark:border-neutral-800 flex flex-col shadow-sm z-10 transition-colors duration-200">
      <div className="p-4 border-b border-gray-200 dark:border-neutral-800 flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2 text-black dark:text-white">
          <Camera className="w-6 h-6" />
          Camera Calibrator
        </h1>
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800 transition-colors"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="p-4 flex-1 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wider">
                Images ({images.length})
              </h2>
              {selectedIds.size > 0 && (
                  <button 
                    onClick={handleBulkDelete}
                    className="p-1 rounded text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30 transition-colors"
                    title={`Delete ${selectedIds.size} images`}
                  >
                      <Trash2 className="w-4 h-4" />
                  </button>
              )}
          </div>
          <div className="flex gap-1">
              <button
                onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    if (isSelectionMode) setSelectedIds(new Set()); // Clear selection when exiting mode
                }}
                className={`p-1 rounded transition-colors ${
                    isSelectionMode 
                    ? 'bg-black text-white dark:bg-neutral-700 dark:text-white' 
                    : 'text-gray-500 hover:bg-gray-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
                title="Select multiple"
              >
                <CheckSquare className="w-4 h-4" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1 rounded text-black hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
                title="Add images"
              >
                <Upload className="w-4 h-4" />
              </button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept="image/*"
            className="hidden"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
          {images.map((img, index) => (
            <div
              key={img.id}
              onClick={() => onSelectImage(img.id)}
              className={`flex items-center gap-3 p-2 rounded cursor-pointer border transition-all ${
                selectedImageId === img.id
                  ? 'bg-gray-100 border-gray-300 dark:bg-neutral-800 dark:border-neutral-600'
                  : 'bg-white border-transparent hover:bg-gray-50 dark:bg-neutral-900 dark:hover:bg-neutral-800'
              }`}
            >
              <div className="flex-shrink-0 flex items-center justify-center w-5">
                  {isSelectionMode ? (
                      <input 
                        type="checkbox"
                        checked={selectedIds.has(img.id)}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(img.id); }}
                        onChange={() => {}}
                        className="w-4 h-4 text-black rounded border-gray-300 focus:ring-black dark:text-white dark:bg-neutral-700 dark:border-neutral-600"
                      />
                  ) : (
                      <span className="text-sm font-semibold text-gray-400 dark:text-neutral-500">
                        {index + 1}
                      </span>
                  )}
              </div>
              <div className="w-10 h-10 bg-gray-200 dark:bg-neutral-700 rounded overflow-hidden flex-shrink-0 relative">
                 {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-gray-700 dark:text-neutral-200">{img.name}</p>
                <div className="flex items-center gap-1">
                  {img.status === 'pending' && <span className="text-xs text-gray-400 dark:text-neutral-500">Waiting...</span>}
                  {img.status === 'processing' && (
                    <span className="text-xs text-gray-600 dark:text-neutral-300 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin"/> Processing...
                    </span>
                  )}
                  {img.status === 'detected' && <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-0.5"><CheckCircle className="w-3 h-3"/> Ready</span>}
                  {img.status === 'failed' && (
                    <div className="flex flex-col">
                        <span 
                            className="text-xs text-red-500 dark:text-red-400 flex items-center gap-0.5 font-medium"
                        >
                            <XCircle className="w-3 h-3"/> Failed
                        </span>
                        {img.error && (
                            <span className="text-[10px] text-red-400 dark:text-red-300 leading-tight mt-0.5 break-words">
                                {img.error}
                            </span>
                        )}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveImage(img.id);
                }}
                className="text-gray-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400 p-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          
          {images.length === 0 && (
             <div className="text-center py-8 text-gray-400 dark:text-neutral-500 text-sm">
                No images added.
             </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-900/50 space-y-2">
        {hasResults && (
            <button
                onClick={onShowResults}
                className="w-full py-2.5 px-4 rounded-lg font-medium border border-black text-black hover:bg-gray-100 dark:border-neutral-500 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-all"
            >
                View Results
            </button>
        )}
        <button
          onClick={onCalibrate}
          disabled={!canCalibrate || isCalibrating}
          className={`w-full py-2.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
            canCalibrate && !isCalibrating
              ? 'bg-black text-white hover:bg-gray-800 shadow-md hover:shadow-lg dark:bg-neutral-700 dark:text-white dark:hover:bg-neutral-600'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-neutral-800 dark:text-neutral-600'
          }`}
        >
          {isCalibrating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Calibrating...
            </>
          ) : (
            <>Calibrate</>
          )}
        </button>
      </div>
    </div>
  );
};
