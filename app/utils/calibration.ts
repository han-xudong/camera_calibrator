import { Matrix, SingularValueDecomposition, inverse, solve } from 'ml-matrix';
import { levenbergMarquardt as LM } from 'ml-levenberg-marquardt';

/**
 * Basic Linear Algebra and Geometric Modeling utils
 * Implementing Zhang's Method components
 */

// Normalize points to improve numerical stability
export function normalizePoints(points: {x: number, y: number}[]) {
    let meanX = 0, meanY = 0;
    points.forEach(p => { meanX += p.x; meanY += p.y; });
    meanX /= points.length;
    meanY /= points.length;

    let meanDist = 0;
    points.forEach(p => {
        meanDist += Math.sqrt((p.x - meanX)**2 + (p.y - meanY)**2);
    });
    meanDist /= points.length;
    
    const scale = Math.sqrt(2) / meanDist;
    
    const T = new Matrix([
        [scale, 0, -scale * meanX],
        [0, scale, -scale * meanY],
        [0, 0, 1]
    ]);
    
    const normalizedPoints = points.map(p => {
        const v = new Matrix([[p.x], [p.y], [1]]);
        const res = T.mmul(v);
        return { x: res.get(0, 0), y: res.get(1, 0) };
    });
    
    return { points: normalizedPoints, T };
}

// Compute Homography between model plane (Z=0) and image plane
// Using DLT (Direct Linear Transformation)
export function computeHomography(objPoints: {x: number, y: number}[], imgPoints: {x: number, y: number}[]) {
    const N = objPoints.length;
    // ml-matrix expects 2D array for Matrix constructor
    const data: number[][] = [];
    
    for (let i = 0; i < N; i++) {
        const X = objPoints[i].x;
        const Y = objPoints[i].y;
        const u = imgPoints[i].x;
        const v = imgPoints[i].y;
        
        // Row 1
        data.push([-X, -Y, -1, 0, 0, 0, u*X, u*Y, u]);
        // Row 2
        data.push([0, 0, 0, -X, -Y, -1, v*X, v*Y, v]);
    }
    
    const A = new Matrix(data);
    
    const svd = new SingularValueDecomposition(A);
    const V = svd.rightSingularVectors;
    // Last column of V corresponds to smallest singular value
    const h = V.getColumn(8);
    
    // h is number[], we need to set row-by-row manually to be safe
    const H = new Matrix(3, 3);
    H.set(0, 0, h[0]); H.set(0, 1, h[1]); H.set(0, 2, h[2]);
    H.set(1, 0, h[3]); H.set(1, 1, h[4]); H.set(1, 2, h[5]);
    H.set(2, 0, h[6]); H.set(2, 1, h[7]); H.set(2, 2, h[8]);
    
    // Normalize H so H(2,2) = 1 (optional, usually done)
    // Actually standard is usually Frobenius norm or H[8]=1.
    return H;
}

// Extract Intrinsics from Homographies (Zhang's Method)
export function computeIntrinsics(homographies: Matrix[]) {
    // V * b = 0
    // b = [B11, B12, B22, B13, B23, B33]
    // B = A^-T * A^-1 (Absolute Conic)
    
    const V = new Matrix(2 * homographies.length, 6);
    
    const v_ij = (h: Matrix, i: number, j: number) => {
        // i, j are 0-based indices of H columns (0, 1, 2)
        const hi = h.getColumn(i);
        const hj = h.getColumn(j);
        
        return [
            hi[0]*hj[0],
            hi[0]*hj[1] + hi[1]*hj[0],
            hi[1]*hj[1],
            hi[2]*hj[0] + hi[0]*hj[2],
            hi[2]*hj[1] + hi[1]*hj[2],
            hi[2]*hj[2]
        ];
    };
    
    homographies.forEach((H, idx) => {
        // Constraint 1: h1^T * B * h2 = 0
        const row1 = v_ij(H, 0, 1);
        // Constraint 2: h1^T * B * h1 - h2^T * B * h2 = 0
        const v11 = v_ij(H, 0, 0);
        const v22 = v_ij(H, 1, 1);
        const row2 = v11.map((v, k) => v - v22[k]);
        
        for(let k=0; k<6; k++) {
            V.set(2*idx, k, row1[k]);
            V.set(2*idx+1, k, row2[k]);
        }
    });
    
    const svd = new SingularValueDecomposition(V);
    const b = svd.rightSingularVectors.getColumn(5);
    
    // Construct B
    const B11 = b[0], B12 = b[1], B22 = b[2], B13 = b[3], B23 = b[4], B33 = b[5];
    
    // Extract parameters
    const v0 = (B12*B13 - B11*B23) / (B11*B22 - B12*B12);
    const lambda = B33 - (B13*B13 + v0*(B12*B13 - B11*B23)) / B11;
    const alpha = Math.sqrt(Math.abs(lambda / B11)); // Use Abs to be safe
    const beta = Math.sqrt(Math.abs(lambda * B11 / (B11*B22 - B12*B12)));
    const gamma = -B12 * alpha * alpha * beta / lambda; // Skew
    const u0 = gamma * v0 / beta - B13 * alpha * alpha / lambda;
    
    return {
        fx: alpha,
        fy: beta,
        cx: u0,
        cy: v0,
        skew: gamma
    };
}

// Extract Extrinsics per view
export function computeExtrinsics(H: Matrix, K: Matrix) {
    const K_inv = inverse(K);
    const h1 = H.getColumn(0);
    const h2 = H.getColumn(1);
    const h3 = H.getColumn(2);
    
    // h1 is number[]
    const h1Mat = new Matrix(3, 1);
    for(let i=0; i<3; i++) h1Mat.set(i, 0, h1[i]);
    const lambda1 = 1 / h1Mat.norm(); // Approx scale
    // Actually lambda = 1 / ||K^-1 * h1||
    
    const h1Vec = new Matrix(3, 1);
    for(let i=0; i<3; i++) h1Vec.set(i, 0, h1[i]);
    
    const h2Vec = new Matrix(3, 1);
    for(let i=0; i<3; i++) h2Vec.set(i, 0, h2[i]);
    
    const h3Vec = new Matrix(3, 1);
    for(let i=0; i<3; i++) h3Vec.set(i, 0, h3[i]);
    
    // const lambda1 = 1 / h1Vec.norm(); 
    // Actually lambda = 1 / ||K^-1 * h1||
    
    const K_inv_h1 = K_inv.mmul(h1Vec);
    const K_inv_h2 = K_inv.mmul(h2Vec);
    const K_inv_h3 = K_inv.mmul(h3Vec);
    
    const lambda_scale = 1 / K_inv_h1.norm();
    
    const r1 = K_inv_h1.mul(lambda_scale);
    const r2 = K_inv_h2.mul(lambda_scale);
    // Cross product manually since ml-matrix might not have it on Matrix
    // r1 and r2 are 3x1 matrices
    const r3 = new Matrix([
        [r1.get(1,0)*r2.get(2,0) - r1.get(2,0)*r2.get(1,0)],
        [r1.get(2,0)*r2.get(0,0) - r1.get(0,0)*r2.get(2,0)],
        [r1.get(0,0)*r2.get(1,0) - r1.get(1,0)*r2.get(0,0)]
    ]);
    const t = K_inv_h3.mul(lambda_scale);
    
    // Refine R to be proper rotation matrix using SVD
    const R_raw = new Matrix(3, 3);
    R_raw.setColumn(0, r1.to1DArray());
    R_raw.setColumn(1, r2.to1DArray());
    R_raw.setColumn(2, r3.to1DArray());
    
    const svd = new SingularValueDecomposition(R_raw);
    const R = svd.leftSingularVectors.mmul(svd.rightSingularVectors.transpose());
    
    // Check if R has determinant -1 (reflection) or if t_z is negative (behind camera)
    // If t_z < 0, the board is behind the camera, which is physically impossible for visible calibration.
    // This often happens if the initial homography scaling factor lambda was ambiguous.
    // We should flip the sign of lambda (and thus t, r1, r2).
    
    // However, since we already computed R from r1, r2, r3, flipping r1, r2 would flip r3 (r3 = r1 x r2).
    // Actually:
    // If lambda -> -lambda
    // r1 -> -r1
    // r2 -> -r2
    // r3 = (-r1) x (-r2) = r1 x r2 = r3.
    // So R_new = [-r1 -r2 r3].
    // t -> -t.
    
    // Let's verify t_z.
    if (t.get(2, 0) < 0) {
        t.mul(-1);
        r1.mul(-1);
        r2.mul(-1);
        // r3 stays same
        R_raw.setColumn(0, r1.to1DArray());
        R_raw.setColumn(1, r2.to1DArray());
        R_raw.setColumn(2, r3.to1DArray());
        
        // Re-orthogonalize
        const svd2 = new SingularValueDecomposition(R_raw);
        // @ts-ignore
        const R2 = svd2.leftSingularVectors.mmul(svd2.rightSingularVectors.transpose());
        return { R: R2, t };
    }
    
    return { R, t };
}

// Project Point
export function projectPoint(X: number, Y: number, Z: number, K: Matrix, R: Matrix, t: Matrix, dist: number[]) {
    // Camera coords
    const P = new Matrix([[X], [Y], [Z]]);
    const Pc = R.mmul(P).add(t);
    
    const x = Pc.get(0, 0) / Pc.get(2, 0);
    const y = Pc.get(1, 0) / Pc.get(2, 0);
    
    // Distortion
    const r2 = x*x + y*y;
    const r4 = r2*r2;
    const k1 = dist[0] || 0;
    const k2 = dist[1] || 0;
    
    const x_d = x * (1 + k1*r2 + k2*r4);
    const y_d = y * (1 + k1*r2 + k2*r4);
    
    // Pixel coords
    const fx = K.get(0, 0);
    const fy = K.get(1, 1);
    const cx = K.get(0, 2);
    const cy = K.get(1, 2);
    
    const u = fx * x_d + cx;
    const v = fy * y_d + cy;
    
    return { u, v };
}

export function performCalibration(
    allImagePoints: {x: number, y: number}[][], // Per image, list of detected corners
    objPoints: {x: number, y: number}[], // Model points (z=0)
    imageSize: {width: number, height: number}
) {
    // 1. Initial Estimation
    const homographies = [];
    
    // Normalize model points once
    const { points: normObjPoints, T: T_obj } = normalizePoints(objPoints);
    
    for (const imgPts of allImagePoints) {
        const { points: normImgPts, T: T_img } = normalizePoints(imgPts);
        const H_norm = computeHomography(normObjPoints, normImgPts);
        
        // Denormalize H: H = T_img^-1 * H_norm * T_obj
        const H = inverse(T_img).mmul(H_norm).mmul(T_obj);
        // Normalize scale
        H.div(H.get(2, 2));
        homographies.push(H);
    }
    
    const intrinsics = computeIntrinsics(homographies);
    
    const K = new Matrix([
        [intrinsics.fx, intrinsics.skew, intrinsics.cx],
        [0, intrinsics.fy, intrinsics.cy],
        [0, 0, 1]
    ]);
    
    const extrinsics = homographies.map(H => computeExtrinsics(H, K));
    
    // 2. Optimization (Levenberg-Marquardt)
    // Params vector: [fx, fy, cx, cy, k1, k2, ...R1(3), t1(3), R2(3), t2(3)...]
    // Using Rodrigues for R (3 params)
    
    // Simplified: Optimize intrinsics + distortion + extrinsics
    // Initial guess
    const initialParams = [
        intrinsics.fx, intrinsics.fy, intrinsics.cx, intrinsics.cy, 0, 0 // Intrinsics + 2 dist
    ];
    
    // ml-levenberg-marquardt v4 requires x to be a single-level array if using simple interface, 
    // OR it handles arbitrary input if the function handles it.
    // However, the issue might be that dataX is an array of arrays.
    // Let's verify what the library expects.
    // Actually, checking the docs again (v2+):
    // function(params) { return (t) => ... }
    // The library calls function(params) ONCE to get the model.
    // Then it calls model(x_i) for each data point x_i.
    
    // Ensure dataX is passed correctly.
    // The previous error "params is not iterable" usually comes from inside the library when it tries to use the result of the function if it wasn't a function.
    // OR if we are using an older version of the library.
    
    const dataX: number[][] = [];
    const dataY: number[] = [];
    
    allImagePoints.forEach((imgPts, imgIdx) => {
        imgPts.forEach((pt, ptIdx) => {
             dataX.push([imgIdx, ptIdx, 0]); 
             dataY.push(pt.x); // u
             dataX.push([imgIdx, ptIdx, 1]); 
             dataY.push(pt.y); // v
        });
    });
    
    const options = {
        damping: 1.5,
        initialValues: initialParams,
        gradientDifference: 10e-2,
        maxIterations: 50,
        errorTolerance: 10e-3
    };
    
    try {
        // @ts-ignore
    const fittedParams = LM(
        // @ts-ignore
        { x: dataX, y: dataY },
            (params: number[]) => {
                const [fx, fy, cx, cy, k1, k2] = params;
                
                return (input: number[]) => {
                    const imgIdx = input[0];
                    const ptIdx = input[1];
                    const isV = input[2] === 1;
                    
                    // Get pre-calculated extrinsics for this image
                    // Note: We are NOT optimizing extrinsics here, so we use the initial ones.
                    // This is "Intrinsics-only bundle adjustment"
                    const { R, t } = extrinsics[imgIdx];
                    const objPt = objPoints[ptIdx]; // Z=0
                    
                    // Camera coords
                    const P = new Matrix([[objPt.x], [objPt.y], [0]]);
                    const Pc = R.mmul(P).add(t);
                    
                    // Prevent division by zero
                    const z = Pc.get(2, 0);
                    if (Math.abs(z) < 1e-6) return 0;

                    const x = Pc.get(0, 0) / z;
                    const y = Pc.get(1, 0) / z;
                    
                    // Distortion
                    const r2 = x*x + y*y;
                    const r4 = r2*r2;
                    // k1, k2
                    
                    const x_d = x * (1 + k1*r2 + k2*r4);
                    const y_d = y * (1 + k1*r2 + k2*r4);
                    
                    if (isV) {
                        return fy * y_d + cy;
                    } else {
                        return fx * x_d + cx;
                    }
                };
            },
            options
        );
        
        // Extract optimized results
        const p = fittedParams.parameterValues || fittedParams; 
        // @ts-ignore
        const [optFx, optFy, optCx, optCy, optK1, optK2] = p;
        
        return {
            cameraMatrix: [optFx, 0, optCx, 0, optFy, optCy, 0, 0, 1], // Flat 3x3
            distCoeffs: [optK1, optK2, 0, 0, 0], 
            rms: fittedParams.parameterError || 0,
            rvecs: extrinsics.map(e => {
                return [0,0,0]; // Placeholder
            }),
            tvecs: extrinsics.map(e => [e.t.get(0,0), e.t.get(1,0), e.t.get(2,0)])
        };
    } catch (e) {
        console.error("Calibration optimization failed:", e);
        // Fallback to initial guess if optimization fails
        return {
            cameraMatrix: [intrinsics.fx, 0, intrinsics.cx, 0, intrinsics.fy, intrinsics.cy, 0, 0, 1],
            distCoeffs: [0, 0, 0, 0, 0],
            rms: -1, // Indicate failure
            rvecs: extrinsics.map(e => [0,0,0]),
            tvecs: extrinsics.map(e => [e.t.get(0,0), e.t.get(1,0), e.t.get(2,0)])
        };
    }
}
