import React, { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Text as DreiText, GizmoHelper, GizmoViewport, Bounds, useBounds, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { getCameraPose } from '@/app/utils/math';

interface ExtrinsicsViewProps {
  rvecs: number[][];
  tvecs: number[][];
  boardSize?: { width: number; height: number; squareSize?: number };
  onSelect?: (index: number) => void;
  selectedIndex?: number;
}

// -----------------------------------------------------------------------------
// Component: Camera Frustum (Visual representation of a camera)
// -----------------------------------------------------------------------------
const CameraFrustum: React.FC<{ 
    color: string; 
    label: string;
    scale?: number;
    showFrustum?: boolean;
    isSelected?: boolean;
    onClick?: () => void;
}> = ({ color, label, scale = 1, showFrustum = true, isSelected = false, onClick }) => {
  
  // Dimensions
  const w = 15 * scale;
  const h = 10 * scale;
  const d = 25 * scale;

  // Geometry for the Camera Pyramid Lines
  const lineGeometry = useMemo(() => {
    const pts = [
        // Apex to Base Corners
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(-w, -h, d),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, -h, d),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(w, h, d),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(-w, h, d),

        // Base Rectangle
        new THREE.Vector3(-w, -h, d), new THREE.Vector3(w, -h, d),
        new THREE.Vector3(w, -h, d), new THREE.Vector3(w, h, d),
        new THREE.Vector3(w, h, d), new THREE.Vector3(-w, h, d),
        new THREE.Vector3(-w, h, d), new THREE.Vector3(-w, -h, d),
        
        // Up Vector Indicator (Triangle on top)
        new THREE.Vector3(-w/2, -h, d), new THREE.Vector3(0, -h - (5*scale), d),
        new THREE.Vector3(0, -h - (5*scale), d), new THREE.Vector3(w/2, -h, d),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [scale, w, h, d]);

  // Geometry for the Camera Body Fill
  const meshGeometry = useMemo(() => {
      const vertices = new Float32Array([
          0, 0, 0,    // 0: Apex
          -w, -h, d,  // 1: TL
          w, -h, d,   // 2: TR
          w, h, d,    // 3: BR
          -w, h, d    // 4: BL
      ]);
      
      const indices = [
          // Sides
          0, 1, 2,
          0, 2, 3,
          0, 3, 4,
          0, 4, 1,
          // Base
          1, 4, 3,
          1, 3, 2
      ];
      
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      return geom;
  }, [scale, w, h, d]);

  const displayColor = isSelected ? '#ea580c' : color; // Orange highlight if selected

  return (
    <group onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
      {showFrustum && (
          <>
            {/* Transparent Fill */}
            <mesh geometry={meshGeometry}>
                <meshBasicMaterial 
                    color={displayColor} 
                    transparent 
                    opacity={isSelected ? 0.4 : 0.15} 
                    side={THREE.DoubleSide} 
                    depthWrite={false} // Prevents z-fighting/occlusion issues with lines
                />
            </mesh>
            {/* Thick Outlines */}
            <lineSegments geometry={lineGeometry}>
                <lineBasicMaterial color={displayColor} linewidth={2} />
            </lineSegments>
          </>
      )}
      
      {/* Camera Center Point */}
      <mesh position={[0,0,0]}>
          <sphereGeometry args={[2 * scale, 16, 16]} />
          <meshBasicMaterial color={displayColor} />
      </mesh>

      {/* Label */}
      <Billboard
        position={[0, -15 * scale, 0]} 
        follow={true}
        lockX={false}
        lockY={false}
        lockZ={false}
      >
        <DreiText 
            fontSize={4 * scale} 
            color={isSelected ? '#ea580c' : displayColor}
            anchorX="center" 
            anchorY="middle"
            fontWeight={isSelected ? 'bold' : 'normal'}
        >
            {label}
        </DreiText>
      </Billboard>
    </group>
  );
};

// -----------------------------------------------------------------------------
// Component: Calibration Board (Visual representation of the pattern)
// -----------------------------------------------------------------------------
const CalibrationBoard: React.FC<{
    width: number;
    height: number;
    color: string;
    label?: string;
    isSelected?: boolean;
    onClick?: () => void;
}> = ({ width, height, color, label, isSelected = false, onClick }) => {
    const displayColor = isSelected ? '#ea580c' : color;
    
    return (
        <group onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
             {/* Board Background */}
            <mesh>
                <boxGeometry args={[width, height, 2]} />
                <meshStandardMaterial color={displayColor} transparent opacity={isSelected ? 0.8 : 0.6} />
            </mesh>
            
            {/* Checker Pattern Wireframe */}
            <mesh position={[0, 0, 1.1]}>
                 <planeGeometry args={[width, height]} />
                 <meshBasicMaterial color={displayColor} wireframe />
            </mesh>
            
            {label && (
                <Billboard
                    position={[-width/2, -height/2 - 10, 0]}
                    follow={true}
                >
                    <DreiText 
                        fontSize={6} 
                        color={displayColor} 
                        fontWeight={isSelected ? 'bold' : 'normal'}
                        anchorX="center"
                        anchorY="middle"
                    >
                        {label}
                    </DreiText>
                </Billboard>
            )}
            
            {/* Origin Axis on Board */}
            <axesHelper args={[20]} position={[-width/2, -height/2, 2]} />
        </group>
    );
};


// -----------------------------------------------------------------------------
// Main View
// -----------------------------------------------------------------------------
export const ExtrinsicsView: React.FC<ExtrinsicsViewProps> = ({ rvecs, tvecs, boardSize = { width: 200, height: 150 }, onSelect, selectedIndex = -1 }) => {
  const [viewMode, setViewMode] = useState<'pattern-centric' | 'camera-centric'>('pattern-centric');

  // Determine schematic scale for cameras based on board size
  // We force the board to be rendered as if it was composed of 5mm squares for visualization consistency.
  // Real square size might be 25mm, 100mm, etc. but we normalize the visual scale.
  // Or simpler: Just set schematic scale to a fixed reasonable size relative to the grid.
  
  // Let's normalize the board visualization. 
  // If we render the board with its REAL dimensions, we must scale the camera to match.
  // The user asked to make the board size effectively fixed for visualization purposes (e.g. as if squareSize=5mm).
  // But our `CalibrationBoard` takes real width/height.
  // If we want to "fake" the size, we should scale everything down?
  // No, the user probably means the RELATIVE scale of camera vs board should be consistent.
  // If we assume a "standard" visualization size where the camera is always size X.
  
  // Actually, the user said: "board size doesn't need to be real, just set it to size corresponding to 5mm squares".
  // This implies we should ignore `boardSize.width` (real) and use a calculated size based on rows/cols * 5mm.
  // However, we don't have rows/cols passed in directly here, just the total width/height.
  // We can infer rows/cols if we had squareSize, or we can just scale the provided width/height.
  
  // Let's interpret "square size 5mm" as: Visual Scale Factor = 5 / Real_Square_Size.
  // If real square is 25mm, we scale everything by 0.2.
  // But wait, Three.js doesn't care about units.
  // If we just change the `boardSize` passed to `<CalibrationBoard>` to be `(w/squareSize)*5`, 
  // then the board will look smaller in the scene.
  
  // Let's implement exactly what was asked:
  // "Set board size to what it would be if squareSize was 5mm"
  // We need to know the grid dimensions (rows/cols).
  // We can estimate grid dimensions:
  // visualWidth = (realWidth / realSquareSize) * 5
  // visualHeight = (realHeight / realSquareSize) * 5
  
  // Colors for Camera Centric mode (each board gets a color)
  const colors = [
      '#FF4136', '#2ECC40', '#0074D9', '#FF851B', '#B10DC9', 
      '#FFDC00', '#39CCCC', '#F012BE', '#01FF70', '#85144b'
  ];
  
  const realSquareSize = boardSize.squareSize || 1; // Avoid divide by zero
  const visualSquareSize = 5;
  const scaleFactor = visualSquareSize / realSquareSize;
  
  const visualBoardWidth = boardSize.width * scaleFactor;
  const visualBoardHeight = boardSize.height * scaleFactor;
  
  // Now we need to scale the POSITIONS (tvecs) too! 
  // Because if the board shrinks, the cameras must move closer to maintain the same relative geometry.
  // tvecs are in real units. We must scale them by `scaleFactor`.
  
  const scaledPoses = useMemo(() => {
      return rvecs.map((rvec, i) => {
          // Scale translation
          const t = new THREE.Vector3(
              tvecs[i][0] * scaleFactor, 
              tvecs[i][1] * scaleFactor, 
              tvecs[i][2] * scaleFactor
          );
          
          // Rotation is invariant to scale
          const theta = Math.sqrt(rvec[0]**2 + rvec[1]**2 + rvec[2]**2);
          const axis = theta < 1e-6 ? new THREE.Vector3(1,0,0) : new THREE.Vector3(rvec[0]/theta, rvec[1]/theta, rvec[2]/theta);
          const quat = new THREE.Quaternion().setFromAxisAngle(axis, theta);
          
          const camToWorld = new THREE.Matrix4().compose(t, quat, new THREE.Vector3(1,1,1)).invert(); // Wait, getCameraPose logic?
          // getCameraPose returns World->Camera or Camera->World?
          // OpenCV provides Pattern->Camera (ModelView).
          // We usually want Camera->World (inverse of ModelView) for Pattern-Centric.
          
          // Let's reuse the logic from getCameraPose but apply scaling
          // Standard getCameraPose:
          // R = rodrigues(rvec)
          // T = tvec
          // ModelView = [R | T]
          // CamPose = ModelView^-1 = [R' | -R'T]
          
          // Scaled Version:
          // T_scaled = T * s
          // ModelView_scaled = [R | T_scaled]
          // CamPose_scaled = [R' | -R' * T_scaled]
          
          const R = new THREE.Matrix4().makeRotationFromQuaternion(quat);
          const T_scaled = t; // Already scaled above
          
          const modelView = new THREE.Matrix4().copy(R).setPosition(T_scaled);
          const camToWorldMatrix = modelView.clone().invert();
          
          // For Camera-Centric:
          // We want to show Board relative to Camera.
          // That is just ModelView_scaled.
          // BUT, our board component is centered.
          // OpenCV assumes top-left is origin.
          // We handle that offset in the render loop, not here.
          
          return {
              camToWorld: camToWorldMatrix,
              boardToCamMatrix: modelView
          };
      });
  }, [rvecs, tvecs, scaleFactor]);

  // Recalculate schematic scale for cameras based on the NEW visual board size
   const maxVisualDim = Math.max(visualBoardWidth, visualBoardHeight);
   // Keep the camera size logic: 1/25 of the board size (larger)
   const schematicScale = maxVisualDim / 32; 

  return (
    <div className="w-full h-full bg-white dark:bg-neutral-900 relative flex flex-col transition-colors duration-200">
      {/* Toggle Header */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 dark:bg-neutral-800/90 rounded shadow p-1 flex space-x-1">
          <button 
             onClick={() => setViewMode('pattern-centric')}
             className={`px-3 py-1 text-xs font-medium rounded transition-colors ${viewMode === 'pattern-centric' ? 'bg-black text-white dark:bg-neutral-700 dark:text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-700'}`}
          >
              Pattern Centric
          </button>
          <button 
             onClick={() => setViewMode('camera-centric')}
             className={`px-3 py-1 text-xs font-medium rounded transition-colors ${viewMode === 'camera-centric' ? 'bg-black text-white dark:bg-neutral-700 dark:text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-neutral-700'}`}
          >
              Camera Centric
          </button>
      </div>

      <Canvas camera={{ up: [0, 0, 1], fov: 45 }}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[100, 100, 200]} intensity={1} />
        <OrbitControls makeDefault />
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
            <GizmoViewport axisColors={['#EF4444', '#22C55E', '#3B82F6']} labelColor="black" />
        </GizmoHelper>

        <Bounds fit clip observe margin={1.2}>
            {viewMode === 'pattern-centric' ? (
                <group rotation={[0, 0, 0]}>
                    {/* Fixed Board at Origin */}
                    <group position={[visualBoardWidth/2, visualBoardHeight/2, 0]}>
                        <CalibrationBoard width={visualBoardWidth} height={visualBoardHeight} color="#aaaaaa" label="Fixed Pattern" />
                    </group>

                    {/* Moving Cameras */}
                    {scaledPoses.map((pose, i) => (
                        <group key={i} matrix={pose.camToWorld} matrixAutoUpdate={false}>
                            <CameraFrustum 
                                color={colors[i % colors.length]} 
                                label={`${i+1}`} 
                                isSelected={i === selectedIndex}
                                onClick={() => onSelect?.(i)}
                                scale={schematicScale}
                            />
                        </group>
                    ))}
                </group>
            ) : (
                <>
                    {/* Fixed Camera at Origin */}
                    <group position={[0,0,0]} rotation={[0,0,0]}>
                        {/* We draw a camera facing +Z */}
                        <CameraFrustum color="#0074D9" label="Fixed Camera" scale={schematicScale} />
                    </group>

                    {/* Moving Boards */}
                    {scaledPoses.map((pose, i) => (
                        <group key={i} matrix={pose.boardToCamMatrix} matrixAutoUpdate={false}>
                            <group position={[visualBoardWidth/2, visualBoardHeight/2, 0]}>
                                <CalibrationBoard 
                                    width={visualBoardWidth} 
                                    height={visualBoardHeight} 
                                    color={colors[i % colors.length]} 
                                    label={`${i+1}`}
                                    isSelected={i === selectedIndex}
                                    onClick={() => onSelect?.(i)}
                                />
                            </group>
                        </group>
                    ))}
                </>
            )}
        </Bounds>
      </Canvas>
    </div>
  );
};
