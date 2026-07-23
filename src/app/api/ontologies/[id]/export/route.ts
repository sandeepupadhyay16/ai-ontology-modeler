import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let tempFilePath = '';
  try {
    const { id: ontologyId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'turtle';

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

    // Prepare JSON payload for export script
    const tempDir = os.tmpdir();
    tempFilePath = join(tempDir, `tse_export_${Date.now()}.json`);
    await writeFile(tempFilePath, JSON.stringify(ontology, null, 2));

    const scriptPath = join(process.cwd(), 'scripts', 'export_rdf.py');
    const cmd = `python3 "${scriptPath}" "${tempFilePath}" "${format}"`;

    const { stdout, stderr } = await execAsync(cmd);

    if (stderr && stderr.trim() && !stdout.trim()) {
      console.error('Export script error:', stderr);
      return NextResponse.json({ error: 'Export failed', details: stderr }, { status: 500 });
    }

    // Set MIME content types for standard W3C formats
    let contentType = 'text/turtle';
    let fileExt = 'ttl';
    const fmtLower = format.toLowerCase();

    if (fmtLower === 'xml' || fmtLower === 'owl' || fmtLower === 'rdf') {
      contentType = 'application/rdf+xml';
      fileExt = 'owl';
    } else if (fmtLower === 'jsonld' || fmtLower === 'json-ld') {
      contentType = 'application/ld+json';
      fileExt = 'jsonld';
    } else if (fmtLower === 'nt') {
      contentType = 'application/n-triples';
      fileExt = 'nt';
    }

    const safeName = ontology.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filename = `${safeName}_v${ontology.version}.${fileExt}`;

    return new Response(stdout, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json({ error: error.message || 'Failed to export ontology' }, { status: 500 });
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
