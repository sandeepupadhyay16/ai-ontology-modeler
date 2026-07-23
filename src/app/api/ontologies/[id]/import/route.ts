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

    // Verify ontology exists
    const ontology = await db.ontology.findUnique({
      where: { id: ontologyId },
    });

    if (!ontology) {
      return NextResponse.json({ error: 'Ontology not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Save uploaded file to temp directory
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const tempDir = os.tmpdir();
    tempFilePath = join(tempDir, `tse_import_${Date.now()}_${file.name}`);
    await writeFile(tempFilePath, buffer);

    // Get file format
    const format = formData.get('format') as string | null;

    // Construct command to run python script
    // Ensure we use the workspace python script path
    const scriptPath = join(process.cwd(), 'scripts', 'parse_rdf.py');
    const cmd = format
      ? `python3 "${scriptPath}" "${tempFilePath}" "${format}"`
      : `python3 "${scriptPath}" "${tempFilePath}"`;

    const { stdout, stderr } = await execAsync(cmd);
    
    if (stderr && stderr.trim()) {
      console.error('Python script stderr:', stderr);
    }

    const result = JSON.parse(stdout);

    if (result.error) {
      return NextResponse.json({ error: result.error, traceback: result.traceback }, { status: 400 });
    }

    const { concepts, relationships, name, namespace_uri, description } = result;

    // Use a transaction to populate the imported elements
    const importSummary = await db.$transaction(async (tx: any) => {
      // 1. Optionally update ontology metadata if name is generic or empty
      await tx.ontology.update({
        where: { id: ontologyId },
        data: {
          name: name && name !== 'imported' ? name : ontology.name,
          namespaceUri: namespace_uri || ontology.namespaceUri,
          description: description || ontology.description,
        },
      });

      // 2. Create concepts and their attributes
      const createdConcepts: Record<string, any> = {};
      for (const concept of concepts) {
        const dbConcept = await tx.concept.create({
          data: {
            uri: concept.uri || null,
            label: concept.label,
            conceptType: concept.concept_type || 'Entity',
            ontologyId,
            attributes: {
              create: (concept.attributes || []).map((attr: any) => ({
                uri: attr.uri || null,
                name: attr.name,
                datatype: attr.datatype || 'string',
                description: attr.description || '',
                required: !!attr.required,
              })),
            },
          },
        });
        createdConcepts[concept.uri] = dbConcept;
      }

      // 2b. Connect parent concept hierarchy (rdfs:subClassOf)
      for (const concept of concepts) {
        if (concept.parent_uri && createdConcepts[concept.parent_uri] && createdConcepts[concept.uri]) {
          await tx.concept.update({
            where: { id: createdConcepts[concept.uri].id },
            data: { parentConceptId: createdConcepts[concept.parent_uri].id },
          });
        }
      }

      // 3. Create relationships
      let relationshipsCreated = 0;
      for (const rel of relationships) {
        const sourceConcept = createdConcepts[rel.source_uri];
        const targetConcept = createdConcepts[rel.target_uri];

        if (sourceConcept && targetConcept) {
          const relData: any = {
            uri: rel.uri || null,
            name: rel.name,
            description: rel.description || '',
            cardinality: rel.cardinality || 'one-to-many',
            sourceId: sourceConcept.id,
            targetId: targetConcept.id,
            ontologyId,
          };
          if (rel.property_type && rel.property_type !== 'ObjectProperty') {
            relData.propertyType = rel.property_type;
          }

          await tx.relationship.create({ data: relData });
          relationshipsCreated++;
        }
      }

      return {
        conceptsCreated: Object.keys(createdConcepts).length,
        relationshipsCreated,
      };
    });

    const summaryText = `📥 **Ontology Import Complete!**\n\n- **Concepts Created**: ${importSummary.conceptsCreated}\n- **Relationships Created**: ${importSummary.relationshipsCreated}`;

    return NextResponse.json({
      success: true,
      message: 'Ontology imported successfully',
      summary: summaryText,
      stats: importSummary,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ error: error.message || 'Failed to import ontology' }, { status: 500 });
  } finally {
    // Cleanup temporary file
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch (err) {
        console.error('Failed to cleanup temp file:', err);
      }
    }
  }
}
