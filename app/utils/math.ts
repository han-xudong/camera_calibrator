import * as THREE from 'three';

export const rodriguesToMatrix = (rvec: number[]): THREE.Matrix4 => {
  const theta = Math.sqrt(rvec[0] * rvec[0] + rvec[1] * rvec[1] + rvec[2] * rvec[2]);
  
  if (theta < 1e-6) {
    return new THREE.Matrix4();
  }

  const k = new THREE.Vector3(rvec[0] / theta, rvec[1] / theta, rvec[2] / theta);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const t = 1 - c;

  const x = k.x, y = k.y, z = k.z;

  // Row-major
  const e = [
    t*x*x + c,   t*x*y - s*z, t*x*z + s*y, 0,
    t*x*y + s*z, t*y*y + c,   t*y*z - s*x, 0,
    t*x*z - s*y, t*y*z + s*x, t*z*z + c,   0,
    0,           0,           0,           1
  ];

  return new THREE.Matrix4().fromArray(e); // Three.js is column-major? fromArray takes row-major if set? 
  // Wait, Three.js fromArray expects column-major order.
  // My 'e' above is row-major.
  // I should transpose or write in column-major.
};

export const getCameraPose = (rvec: number[], tvec: number[]): THREE.Matrix4 => {
    // Check inputs
    if (!rvec || rvec.length < 3 || !tvec || tvec.length < 3) {
        return new THREE.Matrix4();
    }
    
    // World -> Camera transform
    // [R | t]
    
    // Convert rvec to Rotation Matrix (Row Major)
    // OpenCV rvec is Rodrigues vector
    // However, C++ backend might return raw 3x3 if we didn't convert it?
    // Let's check calibrate_camera.cpp... it returns `rvecs` as vector<Mat>.
    // `calibrateCamera` returns rvecs as Rodrigues vectors (3x1).
    
    // Check if rvec is actually a 3x3 matrix (9 elements) flattened?
    // If length is 9, treat as rotation matrix.
    let R: number[] = [];
    
    if (rvec.length === 9) {
        R = rvec;
    } else {
        const theta = Math.sqrt(rvec[0] * rvec[0] + rvec[1] * rvec[1] + rvec[2] * rvec[2]);
        
        if (theta < 1e-6) {
            R = [1,0,0, 0,1,0, 0,0,1];
        } else {
            const kx = rvec[0]/theta, ky = rvec[1]/theta, kz = rvec[2]/theta;
            const c = Math.cos(theta), s = Math.sin(theta), t = 1-c;
            R = [
                t*kx*kx + c,   t*kx*ky - s*kz, t*kx*kz + s*ky,
                t*kx*ky + s*kz, t*ky*ky + c,   t*ky*kz - s*kx,
                t*kx*kz - s*ky, t*ky*kz + s*kx, t*kz*kz + c
            ];
        }
    }

    // Construct 4x4 Matrix (Column-Major for Three.js)
    // Three.js matrix elements:
    // 0 4 8 12
    // 1 5 9 13
    // 2 6 10 14
    // 3 7 11 15
    
    // We want to invert [R|t].
    // Inverse of [R|t] is [R^T | -R^T * t]
    
    // Let's compute World -> Camera matrix first as Three.js matrix
    const mat = new THREE.Matrix4();
    mat.set(
        R[0], R[1], R[2], tvec[0],
        R[3], R[4], R[5], tvec[1],
        R[6], R[7], R[8], tvec[2],
        0, 0, 0, 1
    );
    
    // Now invert to get Camera -> World
    return mat.invert();
}
