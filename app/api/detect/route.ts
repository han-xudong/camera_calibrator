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
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const rows = formData.get('rows');
    const cols = formData.get('cols');

    if (!file || !rows || !cols) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to temp file
    const tempDir = os.tmpdir();
    const tempFilePath = join(tempDir, `calib_${Date.now()}_${Math.random()}.jpg`);
    await writeFile(tempFilePath, buffer);

    // Path to C++ executable
    // Assuming the user compiles it to <project_root>/cpp/build/detect_corners
    const projectRoot = process.cwd();
    const binaryPath = join(projectRoot, 'cpp', 'build', 'detect_corners');

    if (!fs.existsSync(binaryPath)) {
       await unlink(tempFilePath);
       return NextResponse.json({ 
         error: 'C++ binary not found. Please compile the backend.',
         instruction: 'Run: cd cpp && mkdir build && cd build && cmake .. && make' 
       }, { status: 500 });
    }

    try {
      const { stdout, stderr } = await execAsync(`"${binaryPath}" "${tempFilePath}" ${rows} ${cols}`);
      
      // Cleanup
      await unlink(tempFilePath);

      try {
          // Parse C++ output
          // Note: stdout might contain extra logs if C++ code printed something else.
          // We should look for the JSON part.
          const jsonStart = stdout.indexOf('{');
          const jsonEnd = stdout.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
              const jsonStr = stdout.substring(jsonStart, jsonEnd + 1);
              const result = JSON.parse(jsonStr);
              return NextResponse.json(result);
          }
          throw new Error('No JSON found in output');
      } catch (e) {
          console.error('Failed to parse C++ output:', stdout);
          return NextResponse.json({ error: 'Invalid output from C++ backend', details: stdout }, { status: 500 });
      }

    } catch (execError: any) {
      await unlink(tempFilePath).catch(() => {});
      console.error('Execution error:', execError);
      return NextResponse.json({ error: 'Backend execution failed', details: execError.message }, { status: 500 });
    }

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}