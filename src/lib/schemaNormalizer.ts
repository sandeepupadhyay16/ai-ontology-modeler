/**
 * Resilient Schema Normalizer for Local & Frontier LLM Ingress
 *
 * Implements empirical best practices from /local-llm-inference:
 * 1. Balanced brace JSON extraction & syntax healing (trailing commas, think tags, markdown fences).
 * 2. Polymorphic attribute normalization (string arrays, object arrays, key-value maps).
 * 3. Polymorphic competency question normalization (string arrays, object arrays).
 * 4. Root envelope unwrapping (ontology, data, result, domain_ontology, model).
 * 5. Synonym mapping (entities -> concepts, relations/edges -> relationships, etc.).
 * 6. Concept type canonicalization (DataSystem -> System, Role -> Persona, etc.).
 */

export interface NormalizedAttribute {
  name: string;
  datatype: string;
  description: string;
  required: boolean;
}

export interface NormalizedConcept {
  label: string;
  conceptType: 'Entity' | 'Process' | 'Metric' | 'Persona' | 'System' | 'Event' | 'DataSource';
  description: string;
  attributes: NormalizedAttribute[];
  typeFields?: Record<string, any>;
  uri?: string;
}

export interface NormalizedRelationship {
  name: string;
  description: string;
  source: string;
  target: string;
  cardinality: string;
  propertyType: string;
  uri?: string;
}

export interface NormalizedCompetencyQuestion {
  question: string;
  status: string;
  remediation: string;
}

export interface NormalizedDriverEdge {
  name: string;
  source: string;
  target: string;
  polarity?: string;
  weight?: number;
}

export interface NormalizedDriverTree {
  name: string;
  edges: NormalizedDriverEdge[];
}

export interface NormalizedCausalCycle {
  name: string;
  cycleType: string;
  description: string;
  edges: Array<{ source: string; target: string }>;
}

export interface NormalizedPerspective {
  name: string;
  description: string;
  persona?: string;
  concepts: string[];
}

export interface NormalizedOntology {
  concepts: NormalizedConcept[];
  relationships: NormalizedRelationship[];
  competencyQuestions: NormalizedCompetencyQuestion[];
  driverTrees: NormalizedDriverTree[];
  causalCycles: NormalizedCausalCycle[];
  perspectives: NormalizedPerspective[];
}

/**
 * Robust JSON extraction & syntax repair
 */
export function cleanAndParseJSON(reply: string, fallback: any = null): any {
  if (!reply || typeof reply !== 'string') return fallback;

  let jsonString = reply.trim();

  // 1. Strip reasoning / thinking tags (<think>...</think>, <thought>...</thought>)
  if (jsonString.includes('</think>')) {
    const parts = jsonString.split('</think>');
    jsonString = parts[parts.length - 1].trim();
  } else if (jsonString.includes('<think>')) {
    const startThink = jsonString.indexOf('<think>');
    const endThink = jsonString.indexOf('</think>');
    if (startThink !== -1 && endThink !== -1) {
      jsonString = (jsonString.substring(0, startThink) + jsonString.substring(endThink + 8)).trim();
    }
  }

  if (jsonString.includes('</thought>')) {
    const parts = jsonString.split('</thought>');
    jsonString = parts[parts.length - 1].trim();
  }

  // 2. Strip markdown code fences (```json ... ``` or ``` ...)
  if (jsonString.includes('```')) {
    const codeBlockMatches = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/g);
    if (codeBlockMatches && codeBlockMatches.length > 0) {
      for (const block of codeBlockMatches) {
        const inner = block.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        if (inner.startsWith('{') && inner.endsWith('}')) {
          jsonString = inner;
          break;
        }
      }
    }
  }

  // 3. Balanced brace extraction (find outermost balanced { ... })
  const firstBrace = jsonString.indexOf('{');
  if (firstBrace !== -1) {
    let braceCount = 0;
    let inString = false;
    let escape = false;
    let lastValidEnd = -1;

    for (let i = firstBrace; i < jsonString.length; i++) {
      const char = jsonString[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            lastValidEnd = i;
            break;
          }
        }
      }
    }

    if (lastValidEnd !== -1) {
      jsonString = jsonString.substring(firstBrace, lastValidEnd + 1);
    } else {
      // Truncated JSON recovery: slice from first brace and close open structures
      jsonString = jsonString.substring(firstBrace);
      let openBraces = 0;
      let openBrackets = 0;
      let inStr = false;
      let esc = false;

      for (let i = 0; i < jsonString.length; i++) {
        const c = jsonString[i];
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (!inStr) {
          if (c === '{') openBraces++;
          else if (c === '}') openBraces = Math.max(0, openBraces - 1);
          else if (c === '[') openBrackets++;
          else if (c === ']') openBrackets = Math.max(0, openBrackets - 1);
        }
      }

      if (inStr) jsonString += '"';
      while (openBrackets > 0) { jsonString += ']'; openBrackets--; }
      while (openBraces > 0) { jsonString += '}'; openBraces--; }
    }
  }

  // 4. Syntax healing: remove trailing commas before closing braces/brackets
  jsonString = jsonString.replace(/,\s*([\]}])/g, '$1');

  try {
    return JSON.parse(jsonString);
  } catch (err: any) {
    try {
      const singleQuoteFixed = jsonString.replace(/'/g, '"');
      return JSON.parse(singleQuoteFixed);
    } catch {
      console.warn('cleanAndParseJSON failed to parse text:', err.message);
      return fallback;
    }
  }
}

/**
 * Infer sensible attribute datatype from field name
 */
export function inferDatatypeFromName(name: string): string {
  if (!name) return 'string';
  const n = name.toLowerCase();

  if (n.endsWith('id') || n.includes('uuid') || n.includes('code') || n.includes('guid')) {
    return 'string';
  }
  if (n.includes('date') || n.includes('timestamp') || n.includes('time') || n.includes('deadline')) {
    return 'dateTime';
  }
  if (n.includes('rate') || n.includes('percent') || n.includes('score') || n.includes('ratio') || n.includes('price') || n.includes('cost') || n.includes('latency') || n.includes('amount') || n.includes('weight')) {
    return 'float';
  }
  if (n.includes('count') || n.includes('quantity') || n.includes('num') || n.includes('minutes') || n.includes('hours') || n.includes('days') || n.includes('total') || n.includes('size')) {
    return 'integer';
  }
  if (n.startsWith('is') || n.startsWith('has') || n.startsWith('should') || n.includes('enabled') || n.includes('verified') || n.includes('active')) {
    return 'boolean';
  }

  return 'string';
}

/**
 * Normalize polymorphic attributes
 */
export function normalizeAttributes(rawAttributes: any, conceptLabel: string): NormalizedAttribute[] {
  if (!rawAttributes) return [];

  // Case 1: Array of plain strings ["industry", "size", "region"]
  if (Array.isArray(rawAttributes) && rawAttributes.length > 0 && typeof rawAttributes[0] === 'string') {
    return rawAttributes
      .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
      .map((attrName: string) => {
        const cleanName = attrName.trim();
        return {
          name: cleanName,
          datatype: inferDatatypeFromName(cleanName),
          description: `${cleanName} attribute for ${conceptLabel}`,
          required: false,
        };
      });
  }

  // Case 2: Array of objects [{ name: "...", datatype: "..." }] or [{ attributeName: "..." }]
  if (Array.isArray(rawAttributes)) {
    return rawAttributes
      .map((attr: any) => {
        if (typeof attr === 'string') {
          return {
            name: attr.trim(),
            datatype: inferDatatypeFromName(attr.trim()),
            description: `${attr.trim()} for ${conceptLabel}`,
            required: false,
          };
        }
        if (attr && typeof attr === 'object') {
          const rawName = attr.name || attr.attributeName || attr.key || attr.fieldName || attr.field || '';
          if (!rawName) return null;
          const cleanName = String(rawName).trim();
          return {
            name: cleanName,
            datatype: attr.datatype || attr.type || inferDatatypeFromName(cleanName),
            description: attr.description || `${cleanName} for ${conceptLabel}`,
            required: !!attr.required,
          };
        }
        return null;
      })
      .filter((a): a is NormalizedAttribute => Boolean(a && a.name));
  }

  // Case 3: Key-Value dictionary { orderId: "string", amount: "float" }
  if (typeof rawAttributes === 'object' && rawAttributes !== null) {
    return Object.entries(rawAttributes)
      .map(([key, val]) => {
        const cleanKey = key.trim();
        if (!cleanKey) return null;
        return {
          name: cleanKey,
          datatype: typeof val === 'string' ? val : inferDatatypeFromName(cleanKey),
          description: `${cleanKey} for ${conceptLabel}`,
          required: false,
        };
      })
      .filter((a): a is NormalizedAttribute => Boolean(a));
  }

  return [];
}

/**
 * Normalize polymorphic competency questions
 */
export function normalizeCompetencyQuestions(rawCQs: any): NormalizedCompetencyQuestion[] {
  if (!rawCQs || !Array.isArray(rawCQs)) return [];

  return rawCQs
    .map((cq: any) => {
      if (typeof cq === 'string') {
        const text = cq.trim();
        if (!text) return null;
        return {
          question: text,
          status: 'Ratified',
          remediation: '',
        };
      }
      if (cq && typeof cq === 'object') {
        const qText = cq.question || cq.text || cq.prompt || cq.title || cq.query || '';
        const cleanText = String(qText).trim();
        if (!cleanText) return null;
        return {
          question: cleanText,
          status: cq.status || 'Ratified',
          remediation: cq.remediation || '',
        };
      }
      return null;
    })
    .filter((cq): cq is NormalizedCompetencyQuestion => Boolean(cq && cq.question));
}

/**
 * Map non-canonical concept types to valid platform types
 */
export function canonicalizeConceptType(rawType: string): NormalizedConcept['conceptType'] {
  if (!rawType) return 'Entity';
  const t = rawType.trim().toLowerCase();

  if (['process', 'workflow', 'task', 'activity', 'procedure', 'job'].includes(t)) {
    return 'Process';
  }
  if (['metric', 'kpi', 'outcome', 'indicator', 'measure', 'score', 'rate'].includes(t)) {
    return 'Metric';
  }
  if (['persona', 'actor', 'role', 'stakeholder', 'user', 'owner', 'operator'].includes(t)) {
    return 'Persona';
  }
  if (['system', 'datasystem', 'platform', 'app', 'application', 'tool', 'service'].includes(t)) {
    return 'System';
  }
  if (['event', 'workflowevent', 'triggerevent', 'milestone', 'alert'].includes(t)) {
    return 'Event';
  }
  if (['datasource', 'database', 'datastore', 'table', 'dataset', 'registry'].includes(t)) {
    return 'DataSource';
  }

  return 'Entity';
}

/**
 * Normalize relationships
 */
export function normalizeRelationships(rawRels: any): NormalizedRelationship[] {
  if (!rawRels || !Array.isArray(rawRels)) return [];

  const results: NormalizedRelationship[] = [];
  for (const rel of rawRels) {
    if (!rel || typeof rel !== 'object') continue;
    const rawSource = rel.source || rel.sourceConcept || rel.src || rel.from || '';
    const rawTarget = rel.target || rel.targetConcept || rel.tgt || rel.to || '';
    const rawName = rel.name || rel.relation || rel.type || rel.predicate || rel.label || 'isAssociatedWith';

    const source = String(rawSource).trim();
    const target = String(rawTarget).trim();
    const name = String(rawName).trim();

    if (!source || !target || source.toLowerCase() === target.toLowerCase()) {
      continue;
    }

    results.push({
      name,
      source,
      target,
      description: rel.description || '',
      cardinality: rel.cardinality || 'one-to-many',
      propertyType: rel.propertyType || 'ObjectProperty',
    });
  }

  return results;
}

/**
 * Universal Ingress Normalizer: Converts any raw LLM JSON structure into a canonical ontology graph
 */
export function normalizeOntologyJSON(rawInput: any): NormalizedOntology {
  if (!rawInput || typeof rawInput !== 'object') {
    return {
      concepts: [],
      relationships: [],
      competencyQuestions: [],
      driverTrees: [],
      causalCycles: [],
      perspectives: [],
    };
  }

  // 1. Unwrap root nesting envelopes if present
  let data = rawInput;
  const rootKeys = ['ontology', 'data', 'result', 'response', 'domain_ontology', 'model', 'graph', 'output'];
  for (const root of rootKeys) {
    if (data[root] && typeof data[root] === 'object' && !Array.isArray(data[root])) {
      data = data[root];
      break;
    }
  }

  // 2. Map synonyms for top-level keys
  const rawConcepts = data.concepts || data.entities || data.nodes || data.classes || data.terms || [];
  const rawRelationships = data.relationships || data.relations || data.edges || data.links || data.connections || [];
  const rawCQs = data.competencyQuestions || data.questions || data.cqs || data.competencies || [];
  const rawDriverTrees = data.driverTrees || data.driver_trees || data.kpi_trees || data.trees || [];
  const rawCausalCycles = data.causalCycles || data.causal_cycles || data.feedback_loops || data.cycles || [];
  const rawPerspectives = data.perspectives || data.views || data.personaPerspectives || [];

  // 3. Normalize concepts
  const conceptList: NormalizedConcept[] = [];
  const seenLabels = new Set<string>();

  if (Array.isArray(rawConcepts)) {
    for (const c of rawConcepts) {
      if (!c) continue;
      const rawLabel = typeof c === 'string' ? c : (c.label || c.name || c.id || c.title || '');
      const cleanLabel = String(rawLabel).trim();
      if (!cleanLabel) continue;

      const labelKey = cleanLabel.toLowerCase();
      if (seenLabels.has(labelKey)) continue;
      seenLabels.add(labelKey);

      const rawType = typeof c === 'object' ? (c.conceptType || c.type || 'Entity') : 'Entity';
      const conceptType = canonicalizeConceptType(rawType);
      const description = typeof c === 'object' ? (c.description || '') : '';
      const rawAttrs = typeof c === 'object' ? c.attributes : [];
      const attributes = normalizeAttributes(rawAttrs, cleanLabel);
      const typeFields = typeof c === 'object' ? (c.typeFields || {}) : {};

      conceptList.push({
        label: cleanLabel,
        conceptType,
        description,
        attributes,
        typeFields,
      });
    }
  }

  // 4. Normalize relationships
  const relationships = normalizeRelationships(rawRelationships);

  // 5. Normalize Competency Questions
  const competencyQuestions = normalizeCompetencyQuestions(rawCQs);

  // 6. Normalize Driver Trees
  const driverTrees: NormalizedDriverTree[] = [];
  if (Array.isArray(rawDriverTrees)) {
    for (const dt of rawDriverTrees) {
      if (!dt || typeof dt !== 'object') continue;
      const treeName = String(dt.name || dt.treeName || 'Performance Driver Tree').trim();
      const rawEdges = dt.edges || dt.links || [];
      const edges: NormalizedDriverEdge[] = [];

      if (Array.isArray(rawEdges)) {
        for (const e of rawEdges) {
          if (!e || typeof e !== 'object') continue;
          const src = String(e.source || e.src || e.from || '').trim();
          const tgt = String(e.target || e.tgt || e.to || '').trim();
          if (!src || !tgt) continue;

          edges.push({
            name: e.name || 'Positively Drives (1.0)',
            source: src,
            target: tgt,
            polarity: e.polarity || '+',
            weight: typeof e.weight === 'number' ? e.weight : 1.0,
          });
        }
      }

      driverTrees.push({ name: treeName, edges });
    }
  }

  // 7. Normalize Causal Cycles
  const causalCycles: NormalizedCausalCycle[] = [];
  if (Array.isArray(rawCausalCycles)) {
    for (const cc of rawCausalCycles) {
      if (!cc || typeof cc !== 'object') continue;
      const cycleName = String(cc.name || 'Feedback Loop').trim();
      const cycleType = (cc.cycleType || 'REINFORCING').toUpperCase();
      const desc = cc.description || '';
      const rawEdges = cc.edges || [];
      const edges: Array<{ source: string; target: string }> = [];

      if (Array.isArray(rawEdges)) {
        for (const e of rawEdges) {
          if (!e || typeof e !== 'object') continue;
          const src = String(e.source || e.src || '').trim();
          const tgt = String(e.target || e.tgt || '').trim();
          if (src && tgt) edges.push({ source: src, target: tgt });
        }
      }

      causalCycles.push({ name: cycleName, cycleType, description: desc, edges });
    }
  }

  // 8. Normalize Perspectives
  const perspectives: NormalizedPerspective[] = [];
  if (Array.isArray(rawPerspectives)) {
    for (const p of rawPerspectives) {
      if (!p || typeof p !== 'object') continue;
      const name = String(p.name || 'Perspective').trim();
      const desc = p.description || '';
      const persona = p.persona ? String(p.persona).trim() : undefined;
      const rawConceptsInView = p.concepts || p.conceptLabels || [];
      const conceptsInView = Array.isArray(rawConceptsInView)
        ? rawConceptsInView.map((x: any) => String(x).trim()).filter(Boolean)
        : [];

      perspectives.push({ name, description: desc, persona, concepts: conceptsInView });
    }
  }

  return {
    concepts: conceptList,
    relationships,
    competencyQuestions,
    driverTrees,
    causalCycles,
    perspectives,
  };
}

/**
 * Compresses an ontology state object into a concise text format (~150-300 tokens)
 * instead of raw JSON (which can be 2000-4000 tokens), preserving LLM context window.
 */
export function formatCompressedState(state: any): string {
  if (!state || typeof state !== 'object') return '';
  const concepts = Array.isArray(state.concepts) ? state.concepts : [];
  if (concepts.length === 0) return '';

  const conceptLines = concepts.map((c: any) => {
    const label = c.label || c.name || 'Concept';
    const type = c.conceptType || 'Entity';
    const attrs = Array.isArray(c.attributes) && c.attributes.length > 0
      ? ` [attrs: ${c.attributes.map((a: any) => typeof a === 'string' ? a : a.name).filter(Boolean).join(', ')}]`
      : '';
    return `- ${label} (${type})${attrs}`;
  }).join('\n');

  const rels = Array.isArray(state.relationships) ? state.relationships : [];
  const relLines = rels.map((r: any) => `- ${r.source} -> [${r.name || 'rel'}] -> ${r.target}`).join('\n');

  const cqs = Array.isArray(state.competencyQuestions) ? state.competencyQuestions : [];
  const cqLines = cqs
    .map((q: any) => `- ${typeof q === 'string' ? q : q.question || q.text || ''}`)
    .filter((l: string) => l.length > 2)
    .join('\n');

  let result = `EXISTING CONCEPTS (${concepts.length}):\n${conceptLines}`;
  if (relLines) result += `\n\nEXISTING RELATIONSHIPS (${rels.length}):\n${relLines}`;
  if (cqLines) result += `\n\nEXISTING COMPETENCY QUESTIONS (${cqs.length}):\n${cqLines}`;
  return result;
}

