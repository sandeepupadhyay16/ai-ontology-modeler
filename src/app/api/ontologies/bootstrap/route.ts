import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveDomainProfile } from '@/lib/domainProfiles';
import { curatedTemplate, EMPTY_SEED } from '@/lib/seed';
import { isTagRootConcept } from '@/lib/upperOntology';
import { resolveTagRoot } from '@/lib/promotion';

/**
 * V3 create wizard backend (docs/V3_FLOW.md §1 + §4, Stage V1).
 *
 * Atomically bootstraps a new ontology from an Industry × Domain (optionally linked to an
 * existing ontology), materializing the seed into STAGING — not into the live graph:
 *   1. Ontology (moduleScope/extendsOntologyId set when linked → it becomes an extension)
 *   2. ModelingSession bound to it (domainProfile resolved from industry+domain)
 *   3. ONE synthetic "seed" ConversationTurn (ordinal 0, role 'system') — gives seed rows a
 *      real provenance anchor without weakening CandidateConcept.sourceTurnId's non-null FK
 *      (resolved decision Q1). The turns route computes nextOrdinal = maxOrdinal + 1, so the
 *      first real user turn is ordinal 1 — no collision.
 *   4. One PENDING CandidateConcept per seed class/relationship, payload-shaped exactly like
 *      the extraction pipeline emits (turns/route.ts), so Staging + promotion consume them
 *      with no special-casing.
 *
 * No live Concept/Relationship is written here — that happens only when the user checks a
 * candidate in (Stage V2, promoteCandidateDirect). No embedding/LLM call at seed time: a
 * brand-new ontology has no existing concepts to dedup against, so dupStatus stays UNCHECKED
 * and this route is fully deterministic and offline.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, industry, domain, linkedOntologyId, participant, description, namespaceUri, version } = body ?? {};

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!industry || !industry.trim()) {
      return NextResponse.json({ error: 'industry is required' }, { status: 400 });
    }
    if (!domain || !domain.trim()) {
      return NextResponse.json({ error: 'domain is required' }, { status: 400 });
    }

    // Standalone duplicate-name guard (mirrors POST /api/ontologies).
    const existing = await db.ontology.findFirst({
      where: { name: name.trim(), businessFunctionId: null, projectId: null },
    });
    if (existing) {
      return NextResponse.json({ error: 'An ontology with this name already exists' }, { status: 409 });
    }

    const profile = resolveDomainProfile(industry, domain);
    const isExtension = !!linkedOntologyId;
    const moduleScope = isExtension ? `extension:${profile.key.toLowerCase()}` : 'core';

    // Resolve the seed BEFORE opening the write transaction (reads first, then writes).
    // Linked → TRUE import: the base ontology's classes are NOT copied. They stay in the base and
    // are imported (owl:imports via extendsOntologyId); Staging starts empty and the user extends
    // by adding new classes that can reference the imported base (see directPromotion family logic).
    // Unlinked → the curated, standards-aligned template for the industry × domain.
    let resolved: { origin: string; ref: string | null; label: string | null; seed: typeof EMPTY_SEED };
    let importedConceptCount = 0;
    if (isExtension) {
      const linked = await db.ontology.findUnique({ where: { id: linkedOntologyId }, select: { id: true, name: true } });
      if (!linked) {
        return NextResponse.json({ error: `Linked ontology not found: ${linkedOntologyId}` }, { status: 400 });
      }
      const baseConcepts = await db.concept.findMany({ where: { ontologyId: linked.id }, select: { typeFields: true } });
      importedConceptCount = baseConcepts.filter((c) => !isTagRootConcept(c)).length;
      resolved = { origin: 'linked', ref: linked.id, label: linked.name, seed: EMPTY_SEED };
    } else {
      const t = curatedTemplate(industry, domain);
      resolved = { origin: t.origin, ref: t.ref, label: t.label, seed: t.seed };
    }
    const seed = resolved.seed;

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const finalNamespaceUri = namespaceUri?.trim() || `urn:tse:v3:${slug}:${Date.now()}`;

    const result = await db.$transaction(async (tx) => {
      const ontology = await tx.ontology.create({
        data: {
          name: name.trim(),
          namespaceUri: finalNamespaceUri,
          description: description?.trim() || 'V3 conversational ontology',
          version: version?.trim() || '1.0.0',
          layer: 'PROJECT',
          industry: industry.trim(),
          businessFunction: domain.trim(),
          objective: 'Direct Modeling',
          moduleScope,
          extendsOntologyId: isExtension ? linkedOntologyId : null,
        },
      });

      const session = await tx.modelingSession.create({
        data: {
          ontologyId: ontology.id,
          domainProfile: profile.key,
          participant: participant?.trim() || null,
        },
      });

      const seedTurn = await tx.conversationTurn.create({
        data: {
          sessionId: session.id,
          ordinal: 0,
          role: 'system',
          content: `Seed: ${resolved.origin} (${resolved.label ?? 'none'}) for ${industry.trim()} / ${domain.trim()}`,
        },
      });

      // Template seed → materialized LIVE on the canvas (not staged). Picking the industry IS
      // accepting its starter classes: they become real Concept/Relationship rows here, so a new
      // ontology opens with its starter map already drawn. Staging is reserved for chat-extracted
      // proposals awaiting the human gate. Concepts attach under their Layer-1 tag-root anchor
      // (reusing promotion.ts's resolveTagRoot — "never a disconnected tree"). No embedding at seed
      // time (deterministic/offline; the exact-label dup guard still protects chat additions).
      // Linked/import seed is empty: the base graph is imported read-only, not materialized here.
      const labelToConceptId = new Map<string, string>();
      let liveClassCount = 0;
      let liveRelationshipCount = 0;
      for (const c of seed.classes) {
        const parentConceptId = await resolveTagRoot(tx, ontology.id, c.upperOntologyTag);
        const concept = await tx.concept.create({
          data: { label: c.label, conceptType: c.conceptType, description: c.description || null, businessJustification: c.businessJustification || null, uri: c.uri || null, parentConceptId, ontologyId: ontology.id },
        });
        labelToConceptId.set(c.label, concept.id);
        liveClassCount++;
        for (const a of c.attributes || []) {
          if (!a?.name) continue;
          await tx.attribute.create({ data: { name: a.name, datatype: a.datatype || 'string', description: a.description || null, conceptId: concept.id } });
        }
      }
      for (const r of seed.relationships) {
        const sourceId = labelToConceptId.get(r.source);
        const targetId = labelToConceptId.get(r.target);
        if (!sourceId || !targetId) continue;
        await tx.relationship.create({
          data: { name: r.name, description: r.description || null, businessJustification: r.businessJustification || null, cardinality: r.cardinality || 'one-to-many', uri: r.uri || null, sourceId, targetId, ontologyId: ontology.id },
        });
        liveRelationshipCount++;
      }

      return { ontology, session, seedTurn, liveClassCount, liveRelationshipCount };
    });

    return NextResponse.json(
      {
        ontology: result.ontology,
        session: result.session,
        seedTurn: result.seedTurn,
        seedMeta: {
          origin: resolved.origin,
          ref: resolved.ref,
          label: resolved.label,
          moduleScope,
          classCount: result.liveClassCount,
          relationshipCount: result.liveRelationshipCount,
          importedConceptCount,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'An ontology with this namespace URI already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to bootstrap ontology' }, { status: 500 });
  }
}
