import { db } from './db';

export async function mergeOntologiesGraph(
  sourceOntologies: any[],
  mergedOntology: any
) {
  const oldConceptIdToNewConceptId: Record<string, string> = {};
  const oldEdgeIdToNewEdgeId: Record<string, string> = {};

  // Map to group concepts to merge duplicate labels within the same conceptType
  // Key: label_type
  const mergedConceptsMap: Record<
    string,
    { id: string; label: string; conceptType: string; typeFields: any; attributes: any[] }
  > = {};

  // 2. Process and merge Concepts and Attributes
  for (const onto of sourceOntologies) {
    for (const concept of onto.concepts) {
      const key = concept.label.trim().toLowerCase();
      const existing = mergedConceptsMap[key];

      if (!existing) {
        // Create the new concept in the database
        const newConcept = await db.concept.create({
          data: {
            label: concept.label.trim(),
            conceptType: concept.conceptType,
            typeFields: concept.typeFields || {},
            ontologyId: mergedOntology.id,
          },
        });

        // Save remapping ID
        oldConceptIdToNewConceptId[concept.id] = newConcept.id;

        // Copy attributes
        const newAttributes = [];
        for (const attr of concept.attributes) {
          const newAttr = await db.attribute.create({
            data: {
              name: attr.name,
              datatype: attr.datatype,
              description: attr.description,
              required: attr.required,
              conceptId: newConcept.id,
            },
          });
          newAttributes.push(newAttr);
        }

        // Store in map for subsequent duplicate detection
        mergedConceptsMap[key] = {
          id: newConcept.id,
          label: concept.label,
          conceptType: concept.conceptType,
          typeFields: concept.typeFields,
          attributes: newAttributes,
        };
      } else {
        // Reuse existing merged concept ID
        oldConceptIdToNewConceptId[concept.id] = existing.id;

        // Upgrade conceptType if this concept has a higher precedence type
        const typePrecedence = (type: string) => {
          const t = (type || '').toLowerCase();
          if (t === 'process') return 4;
          if (t === 'entity') return 3;
          if (t === 'metric') return 2;
          if (t === 'persona') return 1;
          return 0;
        };

        if (typePrecedence(concept.conceptType) > typePrecedence(existing.conceptType)) {
          await db.concept.update({
            where: { id: existing.id },
            data: {
              conceptType: concept.conceptType,
              typeFields: concept.typeFields || {},
            }
          });
          existing.conceptType = concept.conceptType;
          existing.typeFields = concept.typeFields;
        }

        // Add attributes from this duplicate concept if they don't exist by name
        for (const attr of concept.attributes) {
          const hasAttr = existing.attributes.some(
            (a) => a.name.toLowerCase() === attr.name.toLowerCase()
          );
          if (!hasAttr) {
            const newAttr = await db.attribute.create({
              data: {
                name: attr.name,
                datatype: attr.datatype,
                description: attr.description,
                required: attr.required,
                conceptId: existing.id,
              },
            });
            existing.attributes.push(newAttr);
          }
        }
      }
    }
  }

  // 3. Process and merge Relationships (remap source/target IDs, deduplicate)
  const relationshipsAdded = new Set<string>();
  for (const onto of sourceOntologies) {
    for (const rel of onto.relationships) {
      const newSourceId = oldConceptIdToNewConceptId[rel.sourceId];
      const newTargetId = oldConceptIdToNewConceptId[rel.targetId];

      if (newSourceId && newTargetId) {
        const relKey = `${newSourceId}_${newTargetId}_${rel.name.toLowerCase()}`;
        if (!relationshipsAdded.has(relKey)) {
          await db.relationship.create({
            data: {
              name: rel.name,
              description: rel.description,
              cardinality: rel.cardinality,
              sourceId: newSourceId,
              targetId: newTargetId,
              ontologyId: mergedOntology.id,
            },
          });
          relationshipsAdded.add(relKey);
        }
      }
    }
  }

  // 4. Process Competency Questions
  const cqsAdded = new Set<string>();
  for (const onto of sourceOntologies) {
    for (const cq of onto.competencyQuestions) {
      const qKey = cq.question.trim().toLowerCase();
      if (!cqsAdded.has(qKey)) {
        await db.competencyQuestion.create({
          data: {
            question: cq.question,
            status: cq.status,
            remediation: cq.remediation,
            ontologyId: mergedOntology.id,
          },
        });
        cqsAdded.add(qKey);
      }
    }
  }

  // 5. Process Rules
  for (const onto of sourceOntologies) {
    for (const rule of onto.rules) {
      await db.rule.create({
        data: {
          name: rule.name,
          kind: rule.kind,
          antecedent: rule.antecedent || {},
          consequent: rule.consequent || {},
          description: rule.description,
          ontologyId: mergedOntology.id,
        },
      });
    }
  }

  // 6. Process Constraints
  for (const onto of sourceOntologies) {
    for (const constraint of onto.constraints) {
      await db.constraint.create({
        data: {
          name: constraint.name,
          kind: constraint.kind,
          params: constraint.params || {},
          description: constraint.description,
          ontologyId: mergedOntology.id,
        },
      });
    }
  }

  // 7. Process Driver Trees and Causal Cycles
  for (const onto of sourceOntologies) {
    for (const tree of onto.driverTrees) {
      const newTree = await db.driverTree.create({
        data: {
          name: tree.name,
          ontologyId: mergedOntology.id,
        },
      });

      // Copy and map all driver edges
      for (const edge of tree.edges) {
        const newSourceConceptId =
          oldConceptIdToNewConceptId[edge.sourceId] || edge.sourceId;
        const newTargetConceptId =
          oldConceptIdToNewConceptId[edge.targetId] || edge.targetId;

        const newEdge = await db.driverEdge.create({
          data: {
            name: edge.name,
            sourceId: newSourceConceptId,
            targetId: newTargetConceptId,
            polarity: edge.polarity,
            weight: edge.weight,
            treeId: newTree.id,
          },
        });

        oldEdgeIdToNewEdgeId[edge.id] = newEdge.id;
      }
    }

    // Copy causal feedback cycles
    for (const cycle of onto.causalCycles) {
      // Collect new edge IDs
      const newCycleEdgeIds = cycle.edges
        .map((e: any) => oldEdgeIdToNewEdgeId[e.id])
        .filter(Boolean);

      await db.causalCycle.create({
        data: {
          name: cycle.name,
          cycleType: cycle.cycleType,
          description: cycle.description,
          ontologyId: mergedOntology.id,
          edges: {
            connect: newCycleEdgeIds.map((id: string) => ({ id })),
          },
        },
      });
    }

    // Copy perspectives
    for (const pers of onto.perspectives || []) {
      const newPersonaId = pers.personaId ? (oldConceptIdToNewConceptId[pers.personaId] || null) : null;
      
      const newPers = await db.perspective.create({
        data: {
          name: pers.name,
          description: pers.description,
          personaId: newPersonaId,
          ontologyId: mergedOntology.id,
        },
      });

      // Connect the concepts inside this perspective view
      const newConceptIds = (pers.concepts || [])
        .map((c: any) => oldConceptIdToNewConceptId[c.id])
        .filter(Boolean);

      if (newConceptIds.length > 0) {
        await db.perspective.update({
          where: { id: newPers.id },
          data: {
            concepts: {
              connect: newConceptIds.map((id: string) => ({ id })),
            },
          },
        });
      }
    }
  }
}
