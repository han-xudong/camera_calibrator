import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { allImagePoints, objPoints, imageSize } = body;

    if (!allImagePoints || !objPoints || !imageSize) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Serialize to custom text format for C++
    let content = `${imageSize.width} ${imageSize.height} ${allImagePoints.length}\n`;
    
    for (let i = 0; i < allImagePoints.length; i++) {
        const imgPts = allImagePoints[i];
        const objPts = objPoints[i]; // Assuming objPoints is per-image or same for all?
        // JS worker often passes same objPoints for all, or per image.
        // Let's assume input matches structure.
        
        // If objPoints is a single array (shared pattern), repeat it.
        // But usually in calibration logic, we pass array of arrays.
        // Let's check AprilTagContext usage.
        // It passes `allImagePoints` (array of arrays) and `objPoints` (array of arrays).
        
        const currentObjPts = Array.isArray(objPoints[0]) ? objPoints[i] : objPoints;
        
        if (imgPts.length !== currentObjPts.length) {
            return NextResponse.json({ 
                error: `Mismatch between image points and object points for image ${i}`,
                details: `Image points: ${imgPts.length}, Object points: ${currentObjPts.length}`
            }, { status: 400 });
        }

        content += `${imgPts.length}\n`;
        for (const pt of imgPts) {
            content += `${pt.x} ${pt.y}\n`;
        }
        for (const pt of currentObjPts) {
            content += `${pt.x} ${pt.y} ${pt.z}\n`;
        }
    }

    // Save to temp file
    const tempDir = os.tmpdir();
    const tempFilePath = join(tempDir, `calib_data_${Date.now()}_${Math.random()}.txt`);
    await writeFile(tempFilePath, content);

    // Path to C++ executable
    const projectRoot = process.cwd();
    const binaryPath = join(projectRoot, 'cpp', 'build', 'calibrate_camera');

    if (!fs.existsSync(binaryPath)) {
       await unlink(tempFilePath);
       return NextResponse.json({ 
         error: 'C++ binary not found.',
         instruction: 'Run: cd cpp && mkdir build && cd build && cmake .. && make' 
       }, { status: 500 });
    }

    try {
      console.log(`[API] Executing: "${binaryPath}" "${tempFilePath}"`);
      const { stdout, stderr } = await execAsync(`"${binaryPath}" "${tempFilePath}"`);
      
      console.log('[API] stdout:', stdout);
      if (stderr) console.error('[API] stderr:', stderr);

      await unlink(tempFilePath);

      try {
          // Robust JSON parsing
          const jsonStart = stdout.indexOf('{');
          const jsonEnd = stdout.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
             const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
             const result = JSON.parse(jsonStr);
             return NextResponse.json(result);
          }
          // If C++ crashed without JSON, show stdout
          throw new Error('No JSON output found in stdout');
      } catch (e: any) {
          console.error('Failed to parse C++ output:', stdout);
          // Return the raw stdout as error details so we can see what happened
          return NextResponse.json({ 
              error: 'Invalid output from C++ backend', 
              details: stdout.substring(0, 500) + (stdout.length > 500 ? '...' : ''), // Limit length
              fullStdout: stdout,
              parseError: e.message 
          }, { status: 500 });
      }

    } catch (execError: any) {
      await unlink(tempFilePath).catch(() => {});
      console.error('Execution error:', execError);
      return NextResponse.json({ 
          error: 'Backend execution failed', 
          details: execError.message,
          stderr: execError.stderr,
          stdout: execError.stdout
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}