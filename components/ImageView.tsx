import React, { useEffect, useRef } from 'react';

interface ImageViewProps {
  url: string;
  corners?: { x: number; y: number }[];
  width?: number;
  height?: number;
}

export const ImageView: React.FC<ImageViewProps> = ({ url, corners, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !imgRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Wait for image to load/layout to get actual display size
    const img = imgRef.current;
    
    const draw = () => {
        // Calculate scale
        const displayWidth = img.clientWidth;
        const displayHeight = img.clientHeight;
        
        // Check if image is truly rendered (width > 0)
        if (displayWidth === 0 || displayHeight === 0) {
            // Retry quickly if layout not ready
            requestAnimationFrame(draw);
            return;
        }

        // Match canvas resolution to display size for sharp lines
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        
        // Match canvas style size to display size
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        if (!corners || !width || !height) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        
        const scaleX = displayWidth / width;
        const scaleY = displayHeight / height;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw corners
        corners.forEach((corner, index) => {
            const x = corner.x * scaleX;
            const y = corner.y * scaleY;
            
            // Draw point
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fillStyle = index === 0 ? 'red' : 'lime'; // Mark first corner red
            ctx.fill();
            
            // Draw order line
            if (index > 0) {
                const prev = corners[index - 1];
                ctx.beginPath();
                ctx.moveTo(prev.x * scaleX, prev.y * scaleY);
                ctx.lineTo(x, y);
                ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        });
    };

    // Use requestAnimationFrame to ensure we draw AFTER layout update
    // The previous issue was likely a race condition where the image loaded/switched
    // but the layout (clientWidth) wasn't fully updated or settled when draw() was called.
    const rafId = requestAnimationFrame(draw);

    if (img.complete) {
        draw();
    } else {
        img.onload = draw;
    }
    
    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(draw);
    });
    resizeObserver.observe(img);
    
    return () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(rafId);
        img.onload = null;
    };
  }, [url, corners, width, height]);

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={url}
        alt="Calibration"
        className="max-w-full max-h-full object-contain shadow-lg"
      />
      <canvas
        ref={canvasRef}
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      />
    </div>
  );
};
