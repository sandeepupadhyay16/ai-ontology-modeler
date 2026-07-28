# Stage 2 — Conversational extraction (per-turn, non-destructive)

## Result
`POST /api/sessions/[id]/turns` persists a `ConversationTurn`, runs a structured-JSON extraction LLM call scoped to concepts + relationships only, and writes `CandidateConcept` rows tagged with `sourceTurnId`. It never reads or writes `Concept`/`Relationship`/`Attribute`. Verified end-to-end against a real seeded ontology with a real LLM call across 3 sequential turns: candidates accumulate (7 → 14 → 21), every candidate has a valid `sourceTurnId`, and live graph row counts are byte-for-byte unchanged before/after. `callLLMProvider`/`cleanAndParseJSON` are now a single shared implementation in `src/lib/llm.ts`, used by all 3 call sites that previously each had their own copy.

## Files changed
- `src/lib/llm.ts` (new) — `callLLMProvider` (multi-provider: LM Studio/OpenAI/Anthropic/Google) and `cleanAndParseJSON` (think-tag stripping, markdown-fence stripping, brace-balancing repair for truncated output), plus the shared HTTP/undici timeout overrides. This is the single implementation Stage 2's spec asked for.
- `src/app/api/sessions/[id]/turns/route.ts` (new) — the Stage 2 endpoint. `POST`: loads the session, appends a `ConversationTurn` at the next ordinal, builds a trimmed extraction prompt (domain fragment + recent turn context), calls the LLM, parses the structured JSON, and writes one `CandidateConcept` row per extracted concept/relationship. Returns `{ turn, newCandidates, candidates }` (the last being the full running list for the session).
- `src/lib/agentPipeline.ts` (modified) — deleted its local `callLLMProvider`/`cleanAndParseJSON` (166 lines) and the duplicated HTTP-timeout/undici setup; now imports both from `src/lib/llm.ts`. No behavior change to `runIntentParser`/`runDomainTaxonomist`/`runProcessModeler`/`evaluateOntologyQuality` — they call the same functions, just from a shared module.
- `src/app/api/ontologies/[id]/ai-generate/route.ts` (modified) — same deletion (168 lines: provider dispatch + JSON repair + timeout setup), now imports from `src/lib/llm.ts`. `generateFallbackOntology`, the full-state-sync transaction, `isCart`/pharma branches, and everything else in this route is untouched — this route is not being extended or wired into the new flow, per your instruction.
- `src/app/api/ontologies/[id]/agent-pipeline/route.ts` (modified, 1-line) — it imported `cleanAndParseJSON` from `@/lib/agentPipeline`, which no longer re-exports it (it now only imports it internally). Changed that one import to come from `@/lib/llm` directly. No logic change.
- `docs/worklog/STAGE-2.md` — this file.

Not touched: `suggest-objectives/route.ts` and `ai-dashboard/route.ts` also each have their own local `callLLMProvider`/`cleanAndParseJSON` (with a slightly different `cleanAndParseJSON(reply, fallbackData)` signature). The plan named `agentPipeline.ts` and `ai-generate/route.ts` specifically as the duplication to collapse this stage; the plan's own cleanup-track entry describes this as "Ongoing... started in Stage 2," implying it continues rather than finishes here. Folding those two in would mean reconciling a different function signature for marginal benefit this stage, so I left them — flagging as a known gap below rather than silently doing extra scope.

## Extraction prompt design
Trimmed from `ai-generate/route.ts`'s generator schema (`concepts`/`relationships`/`attributes`) per the plan's instruction, with everything else stripped:
- **Removed:** `competencyQuestions`, `driverTrees`, `perspectives`, `causalCycles` (out of scope for extraction — competency questions and driver trees are later-stage concerns, perspectives/causal cycles are out-of-scope models entirely).
- **Removed:** rule 5, "MANDATORY 100% GRAPH CONNECTIVITY WEAVING... Zero orphan concepts allowed" — candidates are allowed to be unconnected; weaving/parenting happens at promotion time (Stage 5), never at extraction time.
- **Removed:** all `isCart`/pharma hardcoded instruction blocks (`cartInstruction`, `PHARMA BUSINESS ACCURACY RULES`) — replaced entirely by injecting the Stage 1b `buildDomainPromptFragment(profile)` string instead.
- **Removed:** the "preserve all pre-existing concepts... never omit" full-state-sync language — irrelevant here since nothing is being synced; candidates are additive proposals only.
- **Added:** an explicit "CANDIDATES ONLY... nothing you output here is written directly to the live ontology graph" framing, and a recent-turn context block (last `CONTEXT_TURN_LIMIT = 6` turns, oldest-first) so pronoun/reference resolution across turns works without re-extracting things already covered.
- **Kept:** CamelCase/camelCase labeling rules, the requirement that relationship `source`/`target` match a concept label (either in this turn's output or already established in context), and "return ONLY the JSON object" formatting discipline.

## Decisions & rejected alternatives
1. **No assistant-role turns persisted.** `ConversationTurn.role` supports `user|assistant`, but this endpoint only ever creates `role: "user"` rows — it doesn't synthesize an assistant acknowledgment turn (e.g. "I found 3 concepts..."). The plan's acceptance criteria only require accumulation and traceability, not a two-sided transcript, and there's no UI yet consuming assistant turns. Kept it to the minimum that satisfies the stage; easy to add later (e.g. once `ChatPanel` needs a rendered assistant reply) without a schema change.
2. **Persist the `ConversationTurn` before calling the LLM, not after.** If extraction fails (bad JSON, provider error), the turn is still saved and the route returns it with an empty `newCandidates` array and a 502 — so a flaky LLM call never silently loses a turn or misattributes a later turn's `sourceTurnId`. Confirmed this path by testing against models that don't exist (`gemini-1.5-flash`, retired) and models that were rate-limited (`gemini-2.0-flash`, `gemini-2.0-flash-lite`) during verification — both failed cleanly with the turn already persisted.
3. **One `CandidateConcept` row per extracted concept AND per extracted relationship, distinguished by `candidateType`.** Relationships are stored with `candidateType: "Relationship"` and `payload.kind: "relationship"` (carrying `source`/`target`/`cardinality`), rather than nesting relationships inside their source concept's candidate row. Matches the schema's comment (`candidateType String // Entity|Relationship|Attribute|Event|...`) which already anticipated `Relationship` as a valid candidate type, and keeps every candidate independently reviewable/acceptable/rejectable in Stage 5 (a relationship candidate can be rejected without touching the concept candidates it references).
4. **Context window capped at the last 6 turns**, not the full session history. Arbitrary but bounded choice to keep the prompt from growing unboundedly across a long session; revisit if Stage 5's review UI reveals extraction is missing references to older turns.

No OPEN QUESTIONs from the plan apply to this stage (those start at Stage 4/8/12).

## Deviations from the plan
None. Endpoint path, non-destructive guarantee, shared `llm.ts` module, and trimmed schema all match the Stage 2 spec as written.

## Verification environment note
No LLM provider was reachable in this environment by default — `LlmConfiguration` had zero rows (defaults to LM Studio at `localhost:1234`, which wasn't running). You provided a Gemini API key for this verification pass only. I temporarily inserted an active `LlmConfiguration` row (`provider: GOOGLE`), had to try several model names before finding one this key's project quota allowed (`gemini-2.0-flash`, `gemini-2.0-flash-lite` were rate-limited/exhausted on the free tier; `gemini-1.5-flash` and `gemini-2.5-flash-lite` are retired/not-found; `gemini-flash-latest` worked), ran the verification below, then **deleted the temporary `LlmConfiguration` row** immediately after — the API key is not stored anywhere in the repo, DB, or this worklog.

## Example: turn → candidates
Real output from the live verification run (Cell Therapy Vein-to-Vein ontology, `CELL_GENE_THERAPY` domain profile), turn 1 of 3:

**Turn (persisted):**
```json
{
  "ordinal": 1,
  "role": "user",
  "content": "We need to track the CryoCourier who transports the LN2 dry shipper from the apheresis site to the manufacturing facility. Each courier is certified and has a certificationExpiry date."
}
```

**Candidates produced (7, all `sourceTurnId` = this turn's id):**
```json
[
  { "label": "CryoCourier", "candidateType": "Persona",
    "payload": { "kind": "concept", "description": "A specialized courier certified to transport cryogenic shipments, such as LN2 dry shippers.",
      "attributes": [
        { "name": "isCertified", "datatype": "boolean", "description": "Flag indicating whether the courier is currently certified." },
        { "name": "certificationExpiry", "datatype": "string", "description": "Expiration date of the courier's transport certification." }
      ] } },
  { "label": "LN2DryShipper", "candidateType": "Entity",
    "payload": { "kind": "concept", "description": "A liquid nitrogen dry shipper container used to maintain cryogenic cold-chain temperatures during transport.", "attributes": [] } },
  { "label": "ApheresisSite", "candidateType": "Entity",
    "payload": { "kind": "concept", "description": "The clinical location where leukapheresis or patient blood cell collection takes place.", "attributes": [] } },
  { "label": "ManufacturingFacility", "candidateType": "Entity",
    "payload": { "kind": "concept", "description": "The facility responsible for processing, transducing, expanding, or manufacturing the cell therapy product.", "attributes": [] } },
  { "label": "transports", "candidateType": "Relationship",
    "payload": { "kind": "relationship", "source": "CryoCourier", "target": "LN2DryShipper", "cardinality": "one-to-many", "description": "Relates the courier to the cryogenic shipper they are transporting." } },
  { "label": "originatesFrom", "candidateType": "Relationship",
    "payload": { "kind": "relationship", "source": "LN2DryShipper", "target": "ApheresisSite", "cardinality": "many-to-one", "description": "Indicates the apheresis site where the shipment originates." } },
  { "label": "destinedFor", "candidateType": "Relationship",
    "payload": { "kind": "relationship", "source": "LN2DryShipper", "target": "ManufacturingFacility", "cardinality": "many-to-one", "description": "Indicates the manufacturing facility receiving the shipment." } }
]
```

**Turns 2 and 3** (paraphrased for brevity): turn 2 ("the LN2DryShipper has a temperature sensor... if temperature exceeds -150C raise an AlertEvent") produced 7 more candidates (`TemperatureSensor`, `TemperatureReading` [Metric], `AlertEvent` [Process], + 4 relationships), correctly re-referencing `LN2DryShipper` from turn 1's context rather than re-extracting it as a duplicate concept row. Turn 3 ("QC release... QualityReleaseTechnician signs off on ChainOfIdentity before ReinfusionEvent") produced 7 more (`QualityReleaseTechnician`, `QCRelease`, `ChainOfIdentity`, `ReinfusionEvent` + 3 relationships) — all cell-therapy-domain-appropriate, confirming the Stage 1b `CELL_GENE_THERAPY` prompt fragment was actually being used by the model, not just injected inertly.

## How verified
| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean after refactor (caught and fixed one broken import: `agent-pipeline/route.ts` importing `cleanAndParseJSON` from `agentPipeline.ts`, which no longer re-exports it) |
| `npm run build` | succeeds; `/api/sessions/[id]/turns` compiled in alongside all existing routes |
| Live-table counts **before** any turn was sent | Ontology 3 / Concept 35 / Relationship 33 / CompetencyQuestion 11 / ConversationTurn 0 / CandidateConcept 0 |
| `POST /api/sessions` against the seeded Cell Therapy ontology | resolves `CELL_GENE_THERAPY` (re-confirms Stage 1b) |
| Turn 1 → `POST /api/sessions/[id]/turns` | 7 candidates created, `ordinal: 1` |
| Turn 2 → same endpoint | 7 *new* candidates created; turn 1's 7 still present unchanged — **14 total**, confirming accumulation (not full-state sync) |
| Turn 3 → same endpoint | 7 more new candidates; **21 total**, 3 distinct turns each with exactly 7 candidates |
| `SELECT COUNT(*) FROM "CandidateConcept" cc LEFT JOIN "ConversationTurn" ct ON cc."sourceTurnId" = ct.id WHERE ct.id IS NULL` | **0** — every candidate has a valid, resolvable `sourceTurnId` |
| Live-table counts **after** 3 turns | Ontology 3 / Concept 35 / Relationship 33 / CompetencyQuestion 11 — **identical to before**; only `ConversationTurn` (3) and `CandidateConcept` (21) grew, and only in the new staging tables |
| Extraction-failure path | tested against a retired model (`gemini-1.5-flash`) and rate-limited models — turn is still persisted, response is a 502 with the turn + empty `newCandidates`, no partial/corrupt candidate rows |
| No `weaveOrphanConcepts` / auditor / corrector call in the new route | confirmed by inspection — `src/app/api/sessions/[id]/turns/route.ts` imports only `db`, `callLLMProvider`, `cleanAndParseJSON`, `getDomainProfileByKey`, `buildDomainPromptFragment`; no import of `graphWeaver` |
| App still builds/serves after cleanup | `npm run build` succeeds; dev server (pid unchanged, hot-reloaded the new route) still serves `GET /` and `GET /api/ontologies` at 200 |
| Test-data cleanup | deleted the test `ModelingSession` (cascade-deleted its 3 turns + 21 candidates) and the temporary `LlmConfiguration` row; final counts confirmed back to Session 0 / Turn 0 / Candidate 0 / LlmConfiguration 0 |

## Known gaps / TODOs carried forward
- `suggest-objectives/route.ts` and `ai-dashboard/route.ts` still have their own local `callLLMProvider`/`cleanAndParseJSON` copies (different signature — `cleanAndParseJSON(reply, fallbackData)`). Not folded into `src/lib/llm.ts` this stage; the plan frames this collapse as ongoing across stages, not a one-shot Stage 2 requirement. Worth doing whenever one of those routes is touched next.
- No assistant-role `ConversationTurn` rows are created yet (Decision 1) — fine for now since nothing renders them, but the review UI (Stage 5) or a chat-style front-end may want them.
- This environment has no standing LLM provider configured (`LlmConfiguration` is empty by default) — anyone testing this locally needs LM Studio running or a provider key configured first; not a code issue, just an environment note.
- `quickstart_for_mac.md` / `db push` divergence — still on you, untouched.

## Ready for review
Stage 2 acceptance criteria met: 3 sequential turns accumulate candidates without wiping prior turns, every candidate has a valid `sourceTurnId`, live graph row counts are unchanged after a full conversation, and the worklog shows a real turn → candidates example. `callLLMProvider`/`cleanAndParseJSON` duplication between `agentPipeline.ts` and `ai-generate/route.ts` is collapsed into `src/lib/llm.ts`. Awaiting review before Stage 3 (upper-ontology/Layer 1 mapping).
