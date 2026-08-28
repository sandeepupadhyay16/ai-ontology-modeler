import {
  normalizeOntologyJSON,
  normalizeAttributes,
  inferDatatypeFromName,
  NormalizedOntology,
  NormalizedConcept,
  NormalizedRelationship,
} from '@/lib/schemaNormalizer';

export type WovenOntology = NormalizedOntology;

/**
 * Deterministic Graph Weaver Utility
 * Ensures 100% connectivity across all concepts in an ontology.
 * Auto-detects orphan nodes and infers semantic relationship links.
 * Guarantees rich, valid typed attributes for every concept.
 */
export function weaveOrphanConcepts(rawOntology: any): NormalizedOntology {
  // First, normalize any model variance (unwrap roots, map string attrs, string CQs, synonyms)
  const normalized = normalizeOntologyJSON(rawOntology);

  const concepts = [...normalized.concepts];
  const relationships = [...normalized.relationships];
  const competencyQuestions = [...normalized.competencyQuestions];
  const driverTrees = [...normalized.driverTrees];
  const causalCycles = [...normalized.causalCycles];
  const perspectives = [...normalized.perspectives];

  if (concepts.length === 0) {
    return normalized;
  }

  // Track connected concept labels (case-insensitive)
  const connectedLabels = new Set<string>();
  relationships.forEach(rel => {
    if (rel.source) connectedLabels.add(rel.source.trim().toLowerCase());
    if (rel.target) connectedLabels.add(rel.target.trim().toLowerCase());
  });

  // Identify orphan concepts
  const orphanConcepts = concepts.filter(
    c => c.label && !connectedLabels.has(c.label.trim().toLowerCase())
  );

  // Group connected concepts by type
  const processes = concepts.filter(c => (c.conceptType || '').toLowerCase() === 'process');
  const entities = concepts.filter(c => (c.conceptType || '').toLowerCase() === 'entity');
  const metrics = concepts.filter(c => (c.conceptType || '').toLowerCase() === 'metric');
  const personas = concepts.filter(c => (c.conceptType || '').toLowerCase() === 'persona');
  const systems = concepts.filter(c => ['system', 'datasource'].includes((c.conceptType || '').toLowerCase()));
  const events = concepts.filter(c => (c.conceptType || '').toLowerCase() === 'event');

  // Existing relationship signature set to prevent duplicate links
  const existingRelSigs = new Set<string>();
  relationships.forEach(r => {
    if (r.source && r.target && r.name) {
      existingRelSigs.add(`${r.name.toLowerCase()}:${r.source.toLowerCase()}->${r.target.toLowerCase()}`);
    }
  });

  const addRelationship = (name: string, source: string, target: string, cardinality = 'one-to-many') => {
    if (!source || !target || source.toLowerCase() === target.toLowerCase()) return;
    const sig = `${name.toLowerCase()}:${source.toLowerCase()}->${target.toLowerCase()}`;
    if (!existingRelSigs.has(sig)) {
      existingRelSigs.add(sig);
      relationships.push({
        name,
        source,
        target,
        description: `Auto-woven link: ${source} ${name} ${target}`,
        cardinality,
        propertyType: 'ObjectProperty',
      });
      connectedLabels.add(source.toLowerCase());
      connectedLabels.add(target.toLowerCase());
    }
  };

  // Weave orphan nodes into relational pathways
  for (const orphan of orphanConcepts) {
    const orphanLabel = orphan.label;
    const typeLower = (orphan.conceptType || 'entity').toLowerCase();

    if (typeLower === 'persona') {
      const targetProc = processes[0] || concepts.find(c => c.label !== orphanLabel);
      if (targetProc) {
        addRelationship('executesProcess', orphanLabel, targetProc.label);
      }
    } else if (typeLower === 'process') {
      const targetEnt = entities[0] || concepts.find(c => c.label !== orphanLabel);
      if (targetEnt) {
        addRelationship('producesOutput', orphanLabel, targetEnt.label);
      }
    } else if (typeLower === 'metric') {
      const targetTarget = entities[0] || processes[0] || concepts.find(c => c.label !== orphanLabel);
      if (targetTarget) {
        addRelationship('measuresPerformance', orphanLabel, targetTarget.label, 'one-to-one');
      }
    } else if (['system', 'datasource'].includes(typeLower)) {
      const targetEnt = entities[0] || processes[0] || concepts.find(c => c.label !== orphanLabel);
      if (targetEnt) {
        addRelationship('populatesDataStore', orphanLabel, targetEnt.label);
      }
    } else if (typeLower === 'event') {
      const targetProc = processes[0] || concepts.find(c => c.label !== orphanLabel);
      if (targetProc) {
        addRelationship('triggersProcessStep', orphanLabel, targetProc.label);
      }
    } else {
      const targetProc = processes[0] || entities.find(c => c.label !== orphanLabel) || concepts.find(c => c.label !== orphanLabel);
      if (targetProc) {
        addRelationship('isAssociatedWith', orphanLabel, targetProc.label);
      }
    }
  }

  // Ensure every concept has 2-4 rich typed attributes if empty
  const defaultAttributesForType = (type: string, label: string) => {
    const tLower = type.toLowerCase();
    if (tLower === 'entity') {
      return [
        { name: `${label.toLowerCase()}Id`, datatype: 'string', required: true, description: `Unique identifier for ${label}` },
        { name: 'status', datatype: 'string', required: true, description: `Current lifecycle status of ${label}` },
        { name: 'createdTimestamp', datatype: 'dateTime', required: true, description: `Audit timestamp when ${label} was logged` },
        { name: 'isVerified', datatype: 'boolean', required: false, description: `Validation indicator for ${label}` },
      ];
    }
    if (tLower === 'process') {
      return [
        { name: 'processOwner', datatype: 'string', required: true, description: `Responsible role owning ${label}` },
        { name: 'cycleTimeMinutes', datatype: 'float', required: false, description: `Average execution duration of ${label}` },
        { name: 'slaDeadlineHours', datatype: 'integer', required: true, description: `Maximum allowed SLA threshold` },
      ];
    }
    if (tLower === 'metric') {
      return [
        { name: 'currentValue', datatype: 'float', required: true, description: `Real-time metric value` },
        { name: 'targetThreshold', datatype: 'float', required: true, description: `Target KPI threshold` },
        { name: 'unitOfMeasure', datatype: 'string', required: true, description: `Unit of measurement` },
      ];
    }
    return [
      { name: 'name', datatype: 'string', required: true, description: `Name of ${label}` },
      { name: 'description', datatype: 'string', required: false, description: `Details for ${label}` },
    ];
  };

  const enrichedConcepts: NormalizedConcept[] = concepts.map(c => {
    const labelClean = (c.label || 'Concept').replace(/\s+/g, '');
    const uri = c.uri || `http://enterprise.org/ontologies/domain#${labelClean}`;

    // Normalize any existing attributes defensively (guaranteeing array of objects)
    const normalizedAttrs = normalizeAttributes(c.attributes, c.label || 'Concept');
    const finalAttrs = normalizedAttrs.length === 0
      ? defaultAttributesForType(c.conceptType || 'Entity', c.label || 'Concept')
      : normalizedAttrs;

    return {
      ...c,
      uri,
      attributes: finalAttrs,
    };
  });

  const enrichedRelationships: NormalizedRelationship[] = relationships.map(r => ({
    ...r,
    uri: r.uri || `http://enterprise.org/ontologies/domain#${r.name ? r.name.replace(/\s+/g, '') : 'rel'}`,
    propertyType: r.propertyType || 'ObjectProperty',
  }));

  return {
    concepts: enrichedConcepts,
    relationships: enrichedRelationships,
    competencyQuestions,
    driverTrees,
    causalCycles,
    perspectives,
  };
}
