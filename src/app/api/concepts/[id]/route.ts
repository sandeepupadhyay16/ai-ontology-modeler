import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { label, conceptType, typeFields, attributes } = body;

    const data: any = {};
    if (label !== undefined) data.label = label.trim();
    if (conceptType !== undefined) data.conceptType = conceptType;
    if (typeFields !== undefined) data.typeFields = typeFields;

    // Use a transaction to update concept and replace attributes
    const updatedConcept = await db.$transaction(async (tx: any) => {
      const concept = await tx.concept.update({
        where: { id },
        data,
      });

      if (attributes !== undefined) {
        // Delete all old attributes
        await tx.attribute.deleteMany({
          where: { conceptId: id },
        });

        // Create new attributes
        if (attributes.length > 0) {
          await tx.attribute.createMany({
            data: attributes.map((attr: any) => ({
              name: attr.name.trim(),
              datatype: attr.datatype || 'string',
              description: attr.description || '',
              required: !!attr.required,
              conceptId: id,
            })),
          });
        }
      }

      return tx.concept.findUnique({
        where: { id },
        include: { attributes: true },
      });
    });

    return NextResponse.json(updatedConcept);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to update concept' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.concept.delete({
      where: { id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete concept' }, { status: 500 });
  }
}
