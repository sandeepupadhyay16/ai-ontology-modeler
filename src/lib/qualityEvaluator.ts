export interface OntologyQualityReport {
  healthScore: number; // 0 - 100
  cqCoveragePercent: number;
  orphanConceptCount: number;
  conceptCount: number;
  relationshipCount: number;
  causalCycleCount: number;
  issues: Array<{
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    code: string;
    message: string;
    autoFixable: boolean;
    remediationAction?: any;
  }>;
}

export function evaluateOntologyQuality(ontology: any): OntologyQualityReport {
  if (!ontology) {
    return {
      healthScore: 0,
      cqCoveragePercent: 0,
      orphanConceptCount: 0,
      conceptCount: 0,
      relationshipCount: 0,
      causalCycleCount: 0,
      issues: [
        {
          severity: 'HIGH',
          code: 'EMPTY_ONTOLOGY',
          message: 'Ontology is empty. Run the Agentic Quality Pipeline to initialize concepts.',
          autoFixable: true,
          remediationAction: 'RUN_INITIAL_PIPELINE',
        },
      ],
    };
  }

  const concepts = ontology.concepts || [];
  const relationships = ontology.relationships || [];
  const competencyQuestions = ontology.competencyQuestions || [];
  const causalCycles = ontology.causalCycles || [];

  // Blank / Empty Ontology Handling: Health & Coverage are 0%
  if (concepts.length === 0) {
    return {
      healthScore: 0,
      cqCoveragePercent: 0,
      orphanConceptCount: 0,
      conceptCount: 0,
      relationshipCount: 0,
      causalCycleCount: 0,
      issues: [
        {
          severity: 'HIGH',
          code: 'EMPTY_ONTOLOGY',
          message: 'Ontology is empty. Run the 5-Stage Agentic Pipeline or use AI Modeler to generate concepts.',
          autoFixable: true,
          remediationAction: 'RUN_INITIAL_PIPELINE',
        },
      ],
    };
  }

  // 1. Check for Orphan concepts (no incoming or outgoing relationships or driver edges)
  const connectedConceptIds = new Set<string>();
  const connectedLabels = new Set<string>();

  relationships.forEach((rel: any) => {
    if (rel.sourceConceptId) connectedConceptIds.add(rel.sourceConceptId);
    if (rel.targetConceptId) connectedConceptIds.add(rel.targetConceptId);
    if (rel.sourceId) connectedConceptIds.add(rel.sourceId);
    if (rel.targetId) connectedConceptIds.add(rel.targetId);
    if (rel.source) connectedLabels.add(String(rel.source).trim().toLowerCase());
    if (rel.target) connectedLabels.add(String(rel.target).trim().toLowerCase());
  });

  const driverEdges = ontology.driverEdges || ontology.driverLinks || [];
  driverEdges.forEach((edge: any) => {
    if (edge.sourceConceptId) connectedConceptIds.add(edge.sourceConceptId);
    if (edge.targetConceptId) connectedConceptIds.add(edge.targetConceptId);
    if (edge.sourceId) connectedConceptIds.add(edge.sourceId);
    if (edge.targetId) connectedConceptIds.add(edge.targetId);
    if (edge.source) connectedLabels.add(String(edge.source).trim().toLowerCase());
    if (edge.target) connectedLabels.add(String(edge.target).trim().toLowerCase());
  });

  const orphanConcepts = concepts.filter((c: any) => {
    const hasId = c.id && connectedConceptIds.has(c.id);
    const hasLabel = c.label && connectedLabels.has(String(c.label).trim().toLowerCase());
    return !hasId && !hasLabel;
  });

function splitCamelCase(label: string): string[] {
  return String(label)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

  // 2. CQ Coverage evaluation (supports polymorphic string and object CQs)
  const answeredCqs = competencyQuestions.filter((cq: any) => {
    if (!cq) return false;
    const mapped = cq.mappedConceptIds || [];
    if (Array.isArray(mapped) && mapped.length > 0) return true;
    const qText = typeof cq === 'string' ? cq : (cq.question || cq.text || cq.prompt || cq.title || '');
    const qLower = String(qText).toLowerCase();
    return concepts.some((c: any) => {
      const lbl = String(c?.label || '');
      const labelWords = splitCamelCase(lbl);
      const matchedLabelWords = labelWords.filter(w => qLower.includes(w));
      const labelMatched = matchedLabelWords.length >= 2 || (labelWords.length === 1 && matchedLabelWords.length === 1);
      
      let descMatched = false;
      if (c.description) {
        const descWords = String(c.description).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
        descMatched = descWords.filter(w => qLower.includes(w)).length >= 2;
      }
      
      return labelMatched || descMatched;
    });
  });

  const cqCoveragePercent = competencyQuestions.length > 0
    ? Math.round((answeredCqs.length / competencyQuestions.length) * 100)
    : 100;

  // 3. Health Score Deduction
  let healthScore = 100;
  const issues: OntologyQualityReport['issues'] = [];

  // Penalty for no Competency Questions
  if (competencyQuestions.length === 0) {
    healthScore -= 20;
    issues.push({
      severity: 'MEDIUM',
      code: 'NO_COMPETENCY_QUESTIONS',
      message: 'No competency questions defined to validate domain coverage.',
      autoFixable: true,
      remediationAction: 'GENERATE_CQS',
    });
  } else if (cqCoveragePercent < 80) {
    healthScore -= 15;
    issues.push({
      severity: 'MEDIUM',
      code: 'LOW_CQ_COVERAGE',
      message: `Competency question coverage is ${cqCoveragePercent}%. Some questions cannot be answered by graph pathways.`,
      autoFixable: true,
      remediationAction: 'ENRICH_CQ_CONCEPTS',
    });
  }

  // Penalty for Orphan Concepts
  if (orphanConcepts.length > 0) {
    const penalty = Math.min(30, orphanConcepts.length * 5);
    healthScore -= penalty;
    issues.push({
      severity: orphanConcepts.length > 3 ? 'HIGH' : 'MEDIUM',
      code: 'ORPHAN_NODES',
      message: `Found ${orphanConcepts.length} unconnected concept(s): ${orphanConcepts.map((c: any) => c.label).slice(0, 4).join(', ')}`,
      autoFixable: true,
      remediationAction: 'CONNECT_ORPHANS',
    });
  }

  // Penalty for No Relationships
  if (relationships.length === 0 && concepts.length > 1) {
    healthScore -= 35;
    issues.push({
      severity: 'HIGH',
      code: 'NO_RELATIONSHIPS',
      message: 'No relationships defined between concepts in ontology.',
      autoFixable: true,
      remediationAction: 'GENERATE_RELATIONSHIPS',
    });
  }

  // 1. Attribute density
  if (concepts.length > 0) {
    let totalAttributes = 0;
    concepts.forEach((c: any) => {
      if (Array.isArray(c.attributes)) totalAttributes += c.attributes.length;
    });
    const avgAttributes = totalAttributes / concepts.length;
    if (avgAttributes < 2.0) {
      healthScore -= 10;
      issues.push({
        severity: 'MEDIUM',
        code: 'LOW_ATTRIBUTE_DENSITY',
        message: `Average attributes per concept is ${avgAttributes.toFixed(1)}. Expected at least 2.0.`,
        autoFixable: false,
        remediationAction: 'ENRICH_ATTRIBUTES',
      });
    }
  }

  // 2. Relationship density
  if (concepts.length > 0) {
    const relDensity = relationships.length / concepts.length;
    if (relDensity < 1.0) {
      healthScore -= 10;
      issues.push({
        severity: 'MEDIUM',
        code: 'LOW_RELATIONSHIP_DENSITY',
        message: `Relationship density is ${relDensity.toFixed(1)}. Expected at least 1.0.`,
        autoFixable: false,
        remediationAction: 'ADD_RELATIONSHIPS',
      });
    }
  }

  // 3. Concept type diversity
  if (concepts.length > 0) {
    const types = new Set<string>();
    concepts.forEach((c: any) => {
      if (c.conceptType) types.add(c.conceptType);
    });
    if (types.size < 3) {
      healthScore -= 10;
      const typesPresent = Array.from(types).join(', ') || 'None';
      issues.push({
        severity: 'MEDIUM',
        code: 'LOW_TYPE_DIVERSITY',
        message: `Only ${types.size} concept type(s) found (${typesPresent}). Expected at least 3 distinct types.`,
        autoFixable: false,
        remediationAction: 'DIVERSIFY_CONCEPT_TYPES',
      });
    }
  }

  // 4. Generic descriptions
  const genericDescCount = concepts.filter((c: any) => 
    c.description && String(c.description).toLowerCase().includes('domain concept for')
  ).length;
  if (genericDescCount > 2) {
    const excess = genericDescCount - 2;
    const penalty = Math.min(15, excess * 5);
    healthScore -= penalty;
    issues.push({
      severity: 'LOW',
      code: 'GENERIC_DESCRIPTIONS',
      message: `Found ${genericDescCount} concepts with generic descriptions ("Domain concept for...").`,
      autoFixable: true,
      remediationAction: 'IMPROVE_DESCRIPTIONS',
    });
  }

  return {
    healthScore: Math.max(0, healthScore),
    cqCoveragePercent,
    orphanConceptCount: orphanConcepts.length,
    conceptCount: concepts.length,
    relationshipCount: relationships.length,
    causalCycleCount: causalCycles.length,
    issues,
  };
}
