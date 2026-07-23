import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let tempFilePath = '';
  try {
    const { id: ontologyId } = await params;

    const ontology = await db.ontology.findUnique({
      where: { id: ontologyId },
      include: {
        concepts: {
          include: {
            attributes: true,
          },
        },
        relationships: {
          include: {
            source: true,
            target: true,
          },
        },
        constraints: true,
      },
    });

    if (!ontology) {
      return NextResponse.json({ error: 'Ontology not found' }, { status: 404 });
    }

    const tempDir = os.tmpdir();
    tempFilePath = join(tempDir, `tse_shacl_${Date.now()}.json`);
    await writeFile(tempFilePath, JSON.stringify(ontology, null, 2));

    const scriptPath = join(process.cwd(), 'scripts', 'validate_shacl.py');
    const cmd = `python3 "${scriptPath}" "${tempFilePath}"`;

    const { stdout, stderr } = await execAsync(cmd);

    if (stderr && stderr.trim() && !stdout.trim()) {
      console.error('SHACL script error:', stderr);
      return NextResponse.json({ error: 'SHACL validation failed', details: stderr }, { status: 500 });
    }

    const result = JSON.parse(stdout);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('SHACL validation error:', error);
    return NextResponse.json({ error: error.message || 'Failed to run SHACL validation' }, { status: 500 });
  } finally {
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch (err) {
        console.error('Failed to cleanup temp file:', err);
      }
    }
  }
}
