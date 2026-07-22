import { db } from '../src/lib/db';
import { mergeOntologiesGraph } from '../src/lib/ontologyMerger';

async function runTests() {
  console.log('🧪 Running Ontology Merger & Connected Graph Tests...\n');
  let testCount = 0;
  let passCount = 0;

  function assert(condition: boolean, message: string) {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`  ✅ [PASS] ${message}`);
    } else {
      console.log(`  ❌ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  try {
    // 1. Create two test source ontologies
    console.log('📦 Setting up test source ontologies...');
    const ontoA = await db.ontology.create({
      data: {
        name: 'Test Source A',
        namespaceUri: `urn:tse:test:onto-a-${Date.now()}`,
        description: 'Test Source A for merge verification',
        version: '1.0.0',
        layer: 'PROJECT',
      },
    });

    const ontoB = await db.ontology.create({
      data: {
        name: 'Test Source B',
        namespaceUri: `urn:tse:test:onto-b-${Date.now()}`,
        description: 'Test Source B for merge verification',
        version: '1.0.0',
        layer: 'PROJECT',
      },
    });

    // Populate Ontology A
    // - Leukapheresis (Process)
    // - PatientBatch (Entity)
    // - Relationship: Leukapheresis (Process) -> PatientBatch
    const conceptA1 = await db.concept.create({
      data: {
        label: 'Leukapheresis',
        conceptType: 'Process',
        ontologyId: ontoA.id,
      },
    });

    const conceptA2 = await db.concept.create({
      data: {
        label: 'PatientBatch',
        conceptType: 'Entity',
        ontologyId: ontoA.id,
      },
    });

    await db.relationship.create({
      data: {
        name: 'tracksBatch',
        sourceId: conceptA1.id,
        targetId: conceptA2.id,
        ontologyId: ontoA.id,
      },
    });

    // Populate Ontology B
    // - Leukapheresis (Entity) - duplicate label but different type
    // - CryoCourier (Persona)
    // - Relationship: CryoCourier -> Leukapheresis (Entity)
    const conceptB1 = await db.concept.create({
      data: {
        label: 'Leukapheresis',
        conceptType: 'Entity',
        ontologyId: ontoB.id,
      },
    });

    const conceptB2 = await db.concept.create({
      data: {
        label: 'CryoCourier',
        conceptType: 'Persona',
        ontologyId: ontoB.id,
      },
    });

    await db.relationship.create({
      data: {
        name: 'managesLogistics',
        sourceId: conceptB2.id,
        targetId: conceptB1.id,
        ontologyId: ontoB.id,
      },
    });

    // 2. Create the target merged ontology
    console.log('🔄 Executing mergeOntologiesGraph...');
    const mergedOnto = await db.ontology.create({
      data: {
        name: 'Test Merged Ontology',
        namespaceUri: `urn:tse:test:merged-${Date.now()}`,
        description: 'Test Merged Ontology for verification',
        version: '1.0.0',
        layer: 'FUNCTION',
      },
    });

    // Load full source structures for merge input
    const fullOntoA = await db.ontology.findUnique({
      where: { id: ontoA.id },
      include: {
        concepts: { include: { attributes: true } },
        relationships: true,
        competencyQuestions: true,
        driverTrees: { include: { edges: true } },
        causalCycles: { include: { edges: true } },
        rules: true,
        constraints: true,
      },
    });

    const fullOntoB = await db.ontology.findUnique({
      where: { id: ontoB.id },
      include: {
        concepts: { include: { attributes: true } },
        relationships: true,
        competencyQuestions: true,
        driverTrees: { include: { edges: true } },
        causalCycles: { include: { edges: true } },
        rules: true,
        constraints: true,
      },
    });

    await mergeOntologiesGraph([fullOntoA, fullOntoB], mergedOnto);

    // 3. Retrieve merged results
    const mergedConcepts = await db.concept.findMany({
      where: { ontologyId: mergedOnto.id },
      include: { attributes: true },
    });

    const mergedRels = await db.relationship.findMany({
      where: { ontologyId: mergedOnto.id },
    });

    console.log('\n📊 Merged Output Metadata:');
    console.log(`  - Total Concepts: ${mergedConcepts.length}`);
    console.log(`  - Total Relationships: ${mergedRels.length}`);
    mergedConcepts.forEach(c => {
      console.log(`    * Concept: "${c.label}" (${c.conceptType})`);
    });
    mergedRels.forEach(r => {
      const src = mergedConcepts.find(c => c.id === r.sourceId)?.label;
      const tgt = mergedConcepts.find(c => c.id === r.targetId)?.label;
      console.log(`    * Relationship: [${src}] --(${r.name})--> [${tgt}]`);
    });
    console.log('');

    // 4. Assert uniqueness and deduplication
    assert(
      mergedConcepts.length === 3,
      'Should deduplicate concepts to exactly 3 unique labels: Leukapheresis, PatientBatch, CryoCourier.'
    );

    const leukaConcept = mergedConcepts.find(c => c.label.toLowerCase() === 'leukapheresis');
    assert(
      !!leukaConcept,
      'Leukapheresis concept must exist in the merged ontology.'
    );
    assert(
      leukaConcept?.conceptType === 'Process',
      'Leukapheresis type must be upgraded to "Process" due to precedence rules (Process > Entity).'
    );

    // 5. Connected Component Verification (BFS traversal)
    console.log('🕸️ Verifying graph connectedness (BFS traversal)...');
    
    // Build adjacency list for undirected graph representation
    const adjList: Record<string, string[]> = {};
    mergedConcepts.forEach(c => {
      adjList[c.id] = [];
    });
    mergedRels.forEach(r => {
      adjList[r.sourceId].push(r.targetId);
      adjList[r.targetId].push(r.sourceId);
    });

    const visited = new Set<string>();
    const queue: string[] = [mergedConcepts[0].id];
    visited.add(mergedConcepts[0].id);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of adjList[current]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    assert(
      visited.size === mergedConcepts.length,
      `Graph must be fully connected. Visited ${visited.size} of ${mergedConcepts.length} concepts in traversal.`
    );

    // 6. Cleanup database records
    console.log('\n🧹 Cleaning up test database records...');
    await db.ontology.delete({ where: { id: ontoA.id } });
    await db.ontology.delete({ where: { id: ontoB.id } });
    await db.ontology.delete({ where: { id: mergedOnto.id } });

    console.log(`\n🎉 Tests completed successfully: ${passCount}/${testCount} assertions passed!`);
  } catch (error: any) {
    console.error('\n🚨 Test suite failed with error:', error.message);
    process.exit(1);
  }
}

runTests();
