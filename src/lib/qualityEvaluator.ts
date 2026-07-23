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
  relationships.forEach((rel: any) => {
    if (rel.sourceConceptId) connectedConceptIds.add(rel.sourceConceptId);
    if (rel.targetConceptId) connectedConceptIds.add(rel.targetConceptId);
    if (rel.sourceId) connectedConceptIds.add(rel.sourceId);
    if (rel.targetId) connectedConceptIds.add(rel.targetId);
  });

  const driverEdges = ontology.driverEdges || ontology.driverLinks || [];
  driverEdges.forEach((edge: any) => {
    if (edge.sourceConceptId) connectedConceptIds.add(edge.sourceConceptId);
    if (edge.targetConceptId) connectedConceptIds.add(edge.targetConceptId);
    if (edge.sourceId) connectedConceptIds.add(edge.sourceId);
    if (edge.targetId) connectedConceptIds.add(edge.targetId);
  });

  const orphanConcepts = concepts.filter(
    (c: any) => !connectedConceptIds.has(c.id)
  );

  // 2. CQ Coverage evaluation
  const answeredCqs = competencyQuestions.filter((cq: any) => {
    const mapped = cq.mappedConceptIds || [];
    if (Array.isArray(mapped) && mapped.length > 0) return true;
    const qLower = (cq.question || '').toLowerCase();
    return concepts.some((c: any) => qLower.includes((c.label || '').toLowerCase()));
  });

  const cqCoveragePercent = competencyQuestions.length > 0
    ? Math.round((answeredCqs.length / competencyQuestions.length) * 100)
    : 0;

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
