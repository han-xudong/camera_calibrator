import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { useTheme } from '../app/context/ThemeContext';

interface ReprojectionErrorChartProps {
  errors: number[];
  onSelect?: (index: number) => void;
  selectedIndex?: number;
}

export const ReprojectionErrorChart: React.FC<ReprojectionErrorChartProps> = ({ errors, onSelect, selectedIndex = -1 }) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const textColor = isDark ? '#9ca3af' : '#666'; // gray-400 : gray-500
  const gridColor = isDark ? '#374151' : '#e5e7eb'; // gray-700 : gray-200
  const tooltipBg = isDark ? '#171717' : '#ffffff'; // neutral-900 : white
  const tooltipBorder = isDark ? '#262626' : '#e5e7eb'; // neutral-800 : gray-200
  const tooltipText = isDark ? '#d4d4d4' : '#111827'; // neutral-300 : gray-900

  const data = errors.map((err, idx) => ({
    name: `${idx + 1}`,
    error: err,
    index: idx
  }));

  const meanError = errors.reduce((a, b) => a + b, 0) / errors.length;

  return (
    <div className="w-full h-full p-4 flex flex-col">
      <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Mean Reprojection Error: {meanError.toFixed(4)} px</h3>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{
              top: 10,
              right: 10,
              left: 0,
              bottom: 20,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis 
                dataKey="name" 
                label={{ value: 'Image Index', position: 'insideBottom', offset: -10, fill: textColor }} 
                tick={{ fill: textColor }}
                stroke={gridColor}
            />
            <YAxis 
                label={{ value: 'Error (pixels)', angle: -90, position: 'insideLeft', offset: 10, style: { textAnchor: 'middle' }, fill: textColor }} 
                tick={{ fill: textColor }}
                stroke={gridColor}
            />
            <Tooltip 
                cursor={{ fill: isDark ? 'rgba(255,255,255,0.05)' : 'transparent' }}
                content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                        <div 
                            className="p-2 border shadow-md rounded text-sm"
                            style={{ backgroundColor: tooltipBg, borderColor: tooltipBorder, color: tooltipText }}
                        >
                            <p className="font-semibold">Image {d.index + 1}</p>
                            <p>Error: {Number(d.error).toFixed(4)} px</p>
                        </div>
                    );
                    }
                    return null;
                }}
            />
            <Bar 
                dataKey="error" 
                name="Mean Error" 
                onClick={(data: any) => {
                    if (data && data.payload && typeof data.payload.index === 'number') {
                        onSelect?.(data.payload.index);
                    } else if (data && typeof data.index === 'number') {
                         // Sometimes it's directly on data depending on version
                         onSelect?.(data.index);
                    }
                }}
                cursor="pointer"
            >
                {data.map((entry, index) => (
                    <Cell 
                        key={`cell-${index}`} 
                        fill={index === selectedIndex 
                            ? '#ea580c' // ALWAYS orange for selected
                            : (isDark ? '#525252' : '#9ca3af') // default: dark gray in dark, gray-400 in light
                        } 
                    />
                ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
