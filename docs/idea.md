# Ontology Modeling Assistant — Process Flow Specification

> Handoff note for the build agent: this is a **conversational, LLM-driven**
> tool — not a form-based intake system. The user talks to the modeling
> agent; extraction, upper-ontology mapping, and duplicate detection happen
> inline during the conversation, not as separate batch steps the user has
> to trigger. It assumes a layered ontology structure: Layer 1 (upper
> ontology — adopted, not built, e.g. BFO-inspired) → Layer 2 (core domain
> ontology) → Layer 3 (domain-specific extensions). This tool builds and
> extends Layers 2 and 3 only. It does not modify Layer 1.

## Purpose

A conversational tool that lets an ontologist, business analyst, or SME
build and extend a domain ontology — plus the glossary and business rules
layered on top of it — by talking through the domain in plain language,
rather than hand-authoring Turtle syntax or filling out modeling forms.

## Problem this solves

Today, turning discovery-workshop knowledge into formal RDF/OWL requires an
ontologist to manually translate everything, which is slow and creates a
bottleneck — SMEs can't self-serve, and there's no structured way to check
whether a "new" concept someone describes already exists elsewhere in the
ontology. A conversational front end removes the syntax barrier; the
extraction/validation/governance underneath still has to be rigorous.

## Goals

- Let anyone describe a domain conversationally and get a structured
  candidate ontology model back in real time, not after a batch job
- Keep an ontologist in the loop for every accepted change — this is
  assistive, not autonomous
- Detect duplication or conflict against the existing ontology *as the
  conversation happens*, not as a separate downstream check
- Auto-draft glossary definitions and business rules through the same
  conversation, grounded in the ontology terms being defined
- Version and diff every accepted change like code, with a clear
  approval/sign-off step
- Scope every session to a selected industry/domain from the start, so
  extraction is tuned to relevant vocabulary and known reference standards

## Non-goals (v1)

- Fully automating ontology creation with no human review
- Automated reasoning/inference beyond basic consistency checks
- Real-time multi-user collaborative editing (single-editor-at-a-time is
  fine for v1)

## Users

- **Ontologist** — owns the formal model, has final approval on every
  accepted change, resolves conflicts
- **Business analyst / data steward** — has the conversation, drafts
  glossary wording and business rules through it
- **Domain SME** — reviews and signs off on definitions/rules in their
  domain (may only see a generated summary, not the conversational tool
  itself)

---

## High-level process flow

```
1. Domain / industry selection
2. Conversational concept elicitation (extraction + upper-ontology
   mapping + duplicate/conflict check happen inline, turn by turn)
3. Batch review (ontologist gate)
4. OWL/TTL generation
5. Glossary draft (confirmed conversationally)
6. Business rule capture (elicited conversationally)
7. Validation
8. Versioning & diff
9. Sign-off
10. Publish
```

### 1. Domain / industry selection
- **Input:** user selects or types an industry/domain at session start
  (e.g. *"Pharma commercial"*, *"Financial services"*, *"Retail"*)
- **Process:** loads a domain profile — known reference ontologies or
  standards for that industry if any (e.g. FIBO for finance, OMOP/FHIR for
  healthcare), a starter checklist of typical core entities, and
  domain-tuned extraction prompts. This scopes everything downstream —
  extraction quality depends heavily on the agent knowing it's listening
  for "Payer" and "Formulary," not generic nouns.
- **Output:** a domain-scoped modeling session

### 2. Conversational concept elicitation
- **Input:** open conversation — the agent opens with something like *"Tell
  me about the part of the domain you're trying to model"* and asks
  targeted follow-ups (who are the actors, what relationships matter, what
  states or events occur)
- **Process:** after each user turn, the agent runs three things inline
  and surfaces them conversationally rather than silently:
  1. **Concept extraction** — pulls candidate entities/relationships/
     attributes from what was just said
  2. **Upper-ontology mapping** — proposes a Layer 1 parent (Entity, Event,
     Agent, Relation, Process, Quality) for each candidate
  3. **Duplicate/conflict check** — embedding search against the existing
     ontology, surfaced immediately: *"That sounds like a new Agent-type
     entity called Payer — it's similar to an existing Insurer class. Same
     thing, or different?"*
- **Output:** a running, visibly-updating list of candidate concepts, each
  already tagged, that the user can see and correct throughout — never
  hidden until some later "final extraction" step

### 3. Batch review (ontologist gate)
- **Input:** the running candidate list, once the user signals they're
  done or the agent proactively offers a checkpoint (*"Here's what we've
  captured — want to review before I draft the formal model?"*)
- **Process:** ontologist reviews the full batch and can still edit,
  reject, or merge conversationally (*"actually, merge Payer into
  Insurer"*). **This remains a hard gate — nothing publishes without it.**
- **Output:** an approved change set

### 4. OWL/TTL generation
- **Input:** approved change set
- **Process:** serialize into valid Turtle, correctly scoped as an
  extension of the relevant existing class — never a disconnected new tree
- **Output:** a `.ttl` diff/patch file

### 5. Glossary draft
- **Input:** approved change set
- **Process:** agent drafts a plain-English definition for each new
  class/property and confirms it conversationally (*"Does this capture
  what you meant by Payer?"*) rather than routing to a silent review queue
- **Output:** glossary entries, explicitly linked back to the ontology
  term they define

### 6. Business rule capture
- **Input:** approved concepts that imply derived logic
- **Process:** conversational elicitation that turns vague statements into
  explicit thresholds — e.g. if the user says *"formulary tier determines
  access priority,"* the agent asks *"what specific tier levels map to
  which priority?"* rather than leaving it implicit
- **Output:** a structured rule entry (condition → derived value), tagged
  to the ontology property it reads from

### 7. Validation
- **Input:** the full proposed change set (ontology + glossary + rules)
- **Process:** SHACL shape validation / consistency check — the agent
  reports any failure in plain language and asks the user how to resolve
  it, rather than surfacing a raw validator error
- **Output:** pass/fail with specific issues surfaced — never a silent
  merge

### 8. Versioning & diff
- **Process:** every accepted change set becomes a git commit against the
  ontology repo, with a human-readable diff (what changed, in plain terms)
- **Output:** a PR-style change summary

### 9. Sign-off
- **Process:** routes to the relevant domain SME/steward for final
  approval before merge
- **Output:** approved, or sent back with comments

### 10. Publish
- **Process:** merged ontology/glossary/rules load into the triplestore
  and rules store — live and queryable by agents from this point
- **Output:** updated triplestore, changelog entry, notification to
  downstream agent owners (since `get_ontology_schema` calls will now
  return updated results)

---

## Core modules to build

- **Domain profile loader** — industry selection, reference-standard
  lookup, starter vocabulary
- **Conversational orchestrator** — the modeling agent itself; drives the
  dialogue, decides when to extract/check/checkpoint
- **Concept extraction service** — LLM call + structured output, run
  per-turn
- **Similarity/duplicate checker** — embedding search against existing
  ontology, run per-turn
- **TTL generator** — structured-data-to-Turtle serializer
- **Glossary drafting service** — LLM call, grounded in the approved
  ontology change
- **Rule elicitation flow** — targeted follow-up questions, structured
  output
- **Validator** — SHACL (or equivalent) consistency checker
- **Git integration** — commit, diff, PR-style summary
- **Sign-off workflow** — routing + approval tracking
- **Publish/load job** — pushes to triplestore, refreshes any cached
  schema used by agents

## Data model (what needs to persist)

- `sessions` — domain/industry, start time, participant
- `candidate_concepts` — extracted entities/relationships/attributes,
  source turn (conversation traceability), upper-ontology tag,
  duplicate/conflict status, accept/reject/merge decision
- `change_sets` — grouped approved candidates, linked to a TTL diff
- `glossary_drafts` — term, definition, linked ontology property,
  confirmation status
- `rule_drafts` — condition/logic, linked ontology property, confirmation
  status
- `ontology_versions` — git commit history, changelog
- `signoffs` — who approved what, when

## Suggested approach for the build agent

- The conversational orchestrator's system prompt should explicitly state:
  extract and surface candidates *every turn*, never wait until the end —
  the value of this tool over a form is that the user sees mapping and
  conflict feedback immediately, so mistakes get caught while context is
  fresh
- Extraction, upper-ontology mapping, and glossary/rule drafting should
  all use **structured output** (JSON schema) — never free-form text
  parsed loosely afterward
- Duplicate/conflict checking and SHACL validation should stay
  deterministic/rule-based, not pure LLM judgment — these are the safety
  checks and need to be auditable
- Every generated artifact (candidate concept, glossary draft, TTL
  snippet, rule) must carry a `source` field pointing back to the
  conversation turn that produced it — this feeds a production agent
  downstream, so traceability isn't optional
- The batch review gate (step 3) and sign-off (step 9) are hard gates
  regardless of how fluid the conversation feels — conversational UX
  should never imply the change is live before it's actually approved

## Open questions to resolve during build

- Which triplestore and SHACL validation library to standardize on
- How much domain-profile content to pre-load per industry (a light
  vocabulary hint vs. importing an actual standard like FIBO/OMOP as a
  reference layer)
- How duplicate-detection thresholds get tuned (false positives = the
  agent interrupting too often; false negatives = actual duplicates
  slipping through)
- Whether business rules get stored as data (YAML/JSON, queryable by
  Query Builder) or compiled directly into SHACL/SPARQL
- How much of the running candidate list to keep visible in the UI during
  the conversation vs. only surfacing at checkpoints