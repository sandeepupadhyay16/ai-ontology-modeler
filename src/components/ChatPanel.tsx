'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Loader, Sparkles, Wrench } from 'lucide-react';
import GovernancePanel from './GovernancePanel';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  ontologyId: string;
  concepts: any[];
  relationships: any[];
  cqs: any[];
  driverTrees: any[];
  perspectives: any[];
  causalCycles: any[];
  onGenerationComplete: () => Promise<void>;
  onGenerationStart?: () => (() => Promise<void>) | void;
  onAutoFix?: () => void;
  isFixing?: boolean;
}

// Deterministic, pattern-matched only — never an LLM call. Parses "merge X into Y" from
// raw chat input so a merge command routes through the SAME candidate PATCH the review
// list's Merge button uses; it never writes to the live graph directly (idea.md's review
// gate applies to conversational merge exactly as it does to the button).
const MERGE_COMMAND_RE = /^merge\s+(.+?)\s+into\s+(.+?)[.!]?$/i;

function describeCandidate(c: any): string {
  const tagPart = c.upperOntologyTag ? ` [${c.upperOntologyTag}]` : ' [⚠ untagged]';
  let dupPart = '';
  if (c.dupStatus === 'POSSIBLE_DUP') {
    const pct = typeof c.similarityScore === 'number' ? ` (${Math.round(c.similarityScore * 100)}%)` : '';
    dupPart = ` — possible duplicate of "${c.dupTargetConcept?.label || c.dupTargetConceptId}"${pct}`;
  } else if (c.dupStatus === 'CONFLICT') {
    dupPart = ` — ⚠ CONFLICT with "${c.dupTargetConcept?.label || c.dupTargetConceptId}" (type mismatch)`;
  }
  return `- **${c.label}** (${c.candidateType})${tagPart}${dupPart}`;
}

const DUP_BADGE_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  POSSIBLE_DUP: { bg: '#fef3c7', fg: '#92400e', label: 'Possible duplicate' },
  CONFLICT: { bg: '#fee2e2', fg: '#991b1b', label: 'Conflict' },
  UNIQUE: { bg: '#f0fdf4', fg: '#166534', label: 'Unique' },
  UNCHECKED: { bg: '#f1f5f9', fg: '#475569', label: 'Unchecked' },
};

const DECISION_BADGE_STYLE: Record<string, { bg: string; fg: string }> = {
  PENDING: { bg: '#f1f5f9', fg: '#475569' },
  ACCEPTED: { bg: '#dcfce7', fg: '#166534' },
  REJECTED: { bg: '#fee2e2', fg: '#991b1b' },
  MERGED: { bg: '#dbeafe', fg: '#1e40af' },
};

function CandidateCard({
  candidate,
  onDecide,
  onPromoteToCore,
}: {
  candidate: any;
  onDecide: (decision: string, mergeTargetConceptId?: string) => void;
  onPromoteToCore: () => void;
}) {
  const dupBadge = DUP_BADGE_STYLE[candidate.dupStatus] || DUP_BADGE_STYLE.UNCHECKED;
  const decisionBadge = DECISION_BADGE_STYLE[candidate.decision] || DECISION_BADGE_STYLE.PENDING;

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>{candidate.label}</span>
        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: decisionBadge.bg, color: decisionBadge.fg }}>
          {candidate.decision}
        </span>
      </div>
      <div style={{ fontSize: '10px', color: '#64748b' }}>
        {candidate.candidateType} · tag: {candidate.upperOntologyTag || '⚠ untagged'} · scope: {candidate.scope}
      </div>
      {candidate.dupStatus !== 'UNCHECKED' && candidate.dupStatus !== 'UNIQUE' && (
        <div style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: dupBadge.bg, color: dupBadge.fg, alignSelf: 'flex-start' }}>
          {dupBadge.label}: {candidate.dupTargetConcept?.label || candidate.dupTargetConceptId}
          {typeof candidate.similarityScore === 'number' ? ` (${Math.round(candidate.similarityScore * 100)}%)` : ''}
        </div>
      )}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
        <button type="button" onClick={() => onDecide('ACCEPTED')} disabled={candidate.decision === 'ACCEPTED'} style={miniBtnStyle('#2563eb')}>
          Accept
        </button>
        <button type="button" onClick={() => onDecide('REJECTED')} disabled={candidate.decision === 'REJECTED'} style={miniBtnStyle('#64748b')}>
          Reject
        </button>
        {candidate.dupTargetConceptId && (
          <button
            type="button"
            onClick={() => onDecide('MERGED', candidate.dupTargetConceptId)}
            disabled={candidate.decision === 'MERGED'}
            style={miniBtnStyle('#7c3aed')}
          >
            Merge into &quot;{candidate.dupTargetConcept?.label || 'match'}&quot;
          </button>
        )}
        {candidate.scope !== 'core' && (
          <button type="button" onClick={onPromoteToCore} style={miniBtnStyle('#0f766e')}>
            Promote to core
          </button>
        )}
      </div>
    </div>
  );
}

function GlossaryDraftCard({
  draft,
  onConfirm,
  onReject,
}: {
  draft: any;
  onConfirm: (definition: string) => void;
  onReject: () => void;
}) {
  const [text, setText] = useState(draft.definition);
  const termLabel = draft.linkedConcept?.label || draft.linkedRelationship?.name || draft.term;
  const kind = draft.linkedConcept ? 'Class' : 'Property';
  const badge =
    draft.confirmationStatus === 'CONFIRMED'
      ? DECISION_BADGE_STYLE.ACCEPTED
      : draft.confirmationStatus === 'REJECTED'
      ? DECISION_BADGE_STYLE.REJECTED
      : DECISION_BADGE_STYLE.PENDING;
  const isPending = draft.confirmationStatus === 'PENDING';

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
          {termLabel} <span style={{ fontWeight: 400, color: '#64748b' }}>({kind})</span>
        </span>
        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: badge.bg, color: badge.fg }}>
          {draft.confirmationStatus}
        </span>
      </div>
      <div style={{ fontSize: '11px', color: '#334155', fontStyle: 'italic' }}>
        Does this capture what you meant by &quot;{termLabel}&quot;?
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!isPending}
        rows={2}
        style={{ fontSize: '11px', width: '100%', borderRadius: '6px', padding: '6px 8px', resize: 'vertical', border: '1px solid #cbd5e1' }}
      />
      {isPending && (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button type="button" onClick={() => onConfirm(text)} style={miniBtnStyle('#2563eb')}>
            Confirm
          </button>
          <button type="button" onClick={onReject} style={miniBtnStyle('#64748b')}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function miniBtnStyle(color: string): React.CSSProperties {
  return {
    fontSize: '10px',
    fontWeight: '700',
    padding: '3px 8px',
    borderRadius: '6px',
    border: `1px solid ${color}`,
    background: '#ffffff',
    color,
    cursor: 'pointer',
  };
}

// Stage 8 business-rule confirmation (idea.md §6): condition -> derived value, tagged to the
// property it reads from. When thresholds were vague, clarifyingQuestion is surfaced and the
// ontologist pins them by editing the When/Then before confirming.
function RuleDraftCard({
  draft,
  onConfirm,
  onReject,
}: {
  draft: any;
  onConfirm: (condition: any, derivedValue: any) => void;
  onReject: () => void;
}) {
  const [condExpr, setCondExpr] = useState(draft.condition?.expression || '');
  const [valExpr, setValExpr] = useState(draft.derivedValue?.expression || '');
  const propLabel = draft.linkedAttribute?.name || draft.linkedRelationship?.name || '(unlinked)';
  const propKind = draft.linkedAttribute ? 'Attribute' : draft.linkedRelationship ? 'Relationship' : '';
  const badge =
    draft.confirmationStatus === 'CONFIRMED'
      ? DECISION_BADGE_STYLE.ACCEPTED
      : draft.confirmationStatus === 'REJECTED'
      ? DECISION_BADGE_STYLE.REJECTED
      : DECISION_BADGE_STYLE.PENDING;
  const isPending = draft.confirmationStatus === 'PENDING';

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
          {draft.condition?.description || 'Business rule'}{' '}
          <span style={{ fontWeight: 400, color: '#64748b' }}>(reads {propKind} &quot;{propLabel}&quot;)</span>
        </span>
        <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '4px', background: badge.bg, color: badge.fg }}>
          {draft.confirmationStatus}
        </span>
      </div>
      {draft.clarifyingQuestion && (
        <div style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px', padding: '4px 8px' }}>
          ❓ {draft.clarifyingQuestion}
        </div>
      )}
      <label style={{ fontSize: '10px', fontWeight: '700', color: '#64748b' }}>When</label>
      <input
        value={condExpr}
        onChange={(e) => setCondExpr(e.target.value)}
        disabled={!isPending}
        placeholder="condition, e.g. formularyTier in {Tier1, Tier2}"
        style={{ fontSize: '11px', width: '100%', borderRadius: '6px', padding: '5px 8px', border: '1px solid #cbd5e1' }}
      />
      <label style={{ fontSize: '10px', fontWeight: '700', color: '#64748b' }}>Then</label>
      <input
        value={valExpr}
        onChange={(e) => setValExpr(e.target.value)}
        disabled={!isPending}
        placeholder="derived value, e.g. accessPriority = High"
        style={{ fontSize: '11px', width: '100%', borderRadius: '6px', padding: '5px 8px', border: '1px solid #cbd5e1' }}
      />
      {isPending && (
        <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
          <button
            type="button"
            onClick={() =>
              onConfirm(
                { ...(draft.condition || {}), expression: condExpr },
                { ...(draft.derivedValue || {}), expression: valExpr }
              )
            }
            style={miniBtnStyle('#2563eb')}
          >
            Confirm
          </button>
          <button type="button" onClick={onReject} style={miniBtnStyle('#64748b')}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChatPanel({
  ontologyId,
  concepts,
  relationships,
  cqs,
  driverTrees,
  perspectives = [],
  causalCycles = [],
  onGenerationComplete,
  onGenerationStart,
  onAutoFix,
  isFixing = false,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Stage 5 review pipeline: every send extracts CandidateConcept rows into this
  // session's review queue. Nothing here writes to the live graph — only Promote does.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [promoting, setPromoting] = useState(false);

  // Stage 7 conversational glossary confirmation (idea.md §5): drafted right after a
  // promotion, never auto-confirmed — the ontologist confirms/edits/rejects each one here.
  const [glossaryDrafts, setGlossaryDrafts] = useState<any[]>([]);
  // Stage 8 conversational rule confirmation (idea.md §6): elicited right after a promotion.
  const [ruleDrafts, setRuleDrafts] = useState<any[]>([]);
  // Stages 9-12: bump to make GovernancePanel refetch the latest change set after a promotion.
  const [governanceRefresh, setGovernanceRefresh] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const presets = [
    'Map out the core entities and process sequence workflow.',
    'Add a new Process step for cell quality control validation.',
    'Add a regulatory Auditor persona to oversee the clinical trial.',
    'Suggest operational metrics and KPIs measured by this process.',
  ];

  const setDefaultWelcomeMessage = () => {
    setMessages([{
      role: 'assistant',
      content: `Welcome to the **Conversational Ontology Builder**!\n\nDescribe what you want modeled — I'll extract candidate concepts and relationships into the review queue below. Nothing reaches the live graph until you Accept/Merge and click **Promote**.`,
    }]);
  };

  useEffect(() => {
    const savedChat = localStorage.getItem(`tse_chat_history_${ontologyId}`);
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
    setDefaultWelcomeMessage();
  }, [ontologyId]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`tse_chat_history_${ontologyId}`, JSON.stringify(messages));
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, ontologyId]);

  const refreshCandidates = async (sid: string) => {
    const res = await fetch(`/api/sessions/${sid}/candidates`);
    if (!res.ok) return;
    const data = await res.json();
    // Promoted candidates (changeSetId set) are audit trail, not review-queue items.
    setCandidates((data.candidates || []).filter((c: any) => !c.changeSetId));
  };

  const refreshGlossaryDrafts = async (sid: string) => {
    const res = await fetch(`/api/sessions/${sid}/glossary-drafts`);
    if (!res.ok) return;
    const data = await res.json();
    setGlossaryDrafts(data.drafts || []);
  };

  const refreshRuleDrafts = async (sid: string) => {
    const res = await fetch(`/api/sessions/${sid}/rule-drafts`);
    if (!res.ok) return;
    const data = await res.json();
    setRuleDrafts(data.drafts || []);
  };

  // Reuse a modeling session per ontology (persisted across reloads), or create one.
  useEffect(() => {
    let cancelled = false;
    async function bootstrapSession() {
      if (!ontologyId) return;
      const storageKey = `tse_session_${ontologyId}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const res = await fetch(`/api/sessions/${stored}`);
        if (res.ok) {
          if (!cancelled) {
            setSessionId(stored);
            await refreshCandidates(stored);
            await refreshGlossaryDrafts(stored);
            await refreshRuleDrafts(stored);
          }
          return;
        }
        localStorage.removeItem(storageKey);
      }
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ontologyId, participant: 'ontologist' }),
      });
      const data = await res.json();
      if (res.ok && !cancelled) {
        localStorage.setItem(storageKey, data.session.id);
        setSessionId(data.session.id);
        setCandidates([]);
        setGlossaryDrafts([]);
        setRuleDrafts([]);
      }
    }
    bootstrapSession();
    return () => { cancelled = true; };
  }, [ontologyId]);

  const handleEnhancePrompt = () => {
    if (!input.trim() || loading) return;
    const raw = input.trim();
    const enhanced = `Build a domain-exhaustive semantic model for "${raw}". ` +
      `Identify core Personas, Entities with typed attributes (e.g. status, timestamp), ` +
      `Operational Processes, Events, Data Systems, and Key Metrics. ` +
      `Weave directional relationships (executes, produces, governedBy, monitors, calculates) connecting all concepts cleanly without orphan nodes.`;
    setInput(enhanced);
  };

  async function handleMergeCommand(sourceLabel: string, targetLabel: string, sid: string): Promise<string> {
    const candidate = candidates.find(
      (c) => c.decision === 'PENDING' && c.label.toLowerCase() === sourceLabel.toLowerCase()
    );
    if (!candidate) {
      return `⚠️ No pending candidate named "${sourceLabel}" found in the review queue.`;
    }
    if (!candidate.dupTargetConceptId) {
      return `⚠️ "${candidate.label}" has no deterministically-matched duplicate to merge into — merge only routes to what the embedding-based dup check already found. Use Accept instead, or review it in the candidate list below.`;
    }
    const matchedLabel: string = candidate.dupTargetConcept?.label || '';
    if (matchedLabel.toLowerCase() !== targetLabel.toLowerCase()) {
      return `⚠️ "${candidate.label}"'s suggested match is "${matchedLabel}", not "${targetLabel}" — merge only routes to that deterministic match. Use the review queue's Merge button to confirm merging into "${matchedLabel}".`;
    }
    const res = await fetch(`/api/sessions/${sid}/candidates/${candidate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'MERGED', mergeTargetConceptId: candidate.dupTargetConceptId }),
    });
    const data = await res.json();
    if (!res.ok) return `⚠️ ${data.error || 'Merge failed'}`;
    await refreshCandidates(sid);
    return `✅ Marked "${candidate.label}" to merge into "${matchedLabel}". Nothing is written to the live graph yet — click **Promote Reviewed Candidates** below when ready.`;
  }

  const handleSend = async (userPromptText?: string) => {
    const textToSend = (userPromptText ?? input).trim();
    if (!textToSend || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    const finishStepper = onGenerationStart ? onGenerationStart() : null;

    try {
      if (!sessionId) throw new Error('Modeling session is still starting up — try again in a moment.');

      const mergeMatch = MERGE_COMMAND_RE.exec(textToSend);
      if (mergeMatch) {
        const reply = await handleMergeCommand(mergeMatch[1].trim(), mergeMatch[2].trim(), sessionId);
        setMessages([...newMessages, { role: 'assistant', content: reply }]);
        return;
      }

      const res = await fetch(`/api/sessions/${sessionId}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: textToSend }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to extract candidates');

      const newCandidates = data.newCandidates || [];
      let botReply: string;
      if (newCandidates.length === 0) {
        botReply = 'No new candidate concepts or relationships found in that — nothing added to the review queue.';
      } else {
        botReply = `Extracted **${newCandidates.length}** candidate(s) for review:\n\n${newCandidates.map(describeCandidate).join('\n')}\n\nReview them below, then click **Promote Reviewed Candidates** to publish accepted ones to the live graph.`;
      }
      setMessages([...newMessages, { role: 'assistant', content: botReply }]);
      await refreshCandidates(sessionId);
    } catch (e: any) {
      setMessages([...newMessages, { role: 'assistant', content: `⚠️ Error: ${e.message}` }]);
    } finally {
      setLoading(false);
      if (typeof finishStepper === 'function') {
        await finishStepper();
      }
    }
  };

  const decideCandidate = async (candidateId: string, decision: string, mergeTargetConceptId?: string) => {
    if (!sessionId) return;
    const res = await fetch(`/api/sessions/${sessionId}/candidates/${candidateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, ...(mergeTargetConceptId ? { mergeTargetConceptId } : {}) }),
    });
    if (res.ok) await refreshCandidates(sessionId);
  };

  const promoteToCore = async (candidateId: string) => {
    if (!sessionId) return;
    const res = await fetch(`/api/sessions/${sessionId}/candidates/${candidateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'core' }),
    });
    if (res.ok) await refreshCandidates(sessionId);
  };

  const reviewedCount = useMemo(
    () => candidates.filter((c) => c.decision === 'ACCEPTED' || c.decision === 'MERGED').length,
    [candidates]
  );

  const decideGlossaryDraft = async (draftId: string, confirmationStatus: 'CONFIRMED' | 'REJECTED', definition: string) => {
    if (!sessionId) return;
    const res = await fetch(`/api/glossary/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmationStatus, definition }),
    });
    if (res.ok) await refreshGlossaryDrafts(sessionId);
  };

  const pendingGlossaryDrafts = useMemo(
    () => glossaryDrafts.filter((d) => d.confirmationStatus === 'PENDING'),
    [glossaryDrafts]
  );

  const decideRuleDraft = async (
    draftId: string,
    confirmationStatus: 'CONFIRMED' | 'REJECTED',
    condition?: any,
    derivedValue?: any
  ) => {
    if (!sessionId) return;
    const body: any = { confirmationStatus };
    if (condition !== undefined) body.condition = condition;
    if (derivedValue !== undefined) body.derivedValue = derivedValue;
    const res = await fetch(`/api/rules/${draftId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) await refreshRuleDrafts(sessionId);
  };

  const pendingRuleDrafts = useMemo(
    () => ruleDrafts.filter((d) => d.confirmationStatus === 'PENDING'),
    [ruleDrafts]
  );

  const promoteAll = async () => {
    if (!sessionId || promoting) return;
    setPromoting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/promote`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Promotion failed');

      if (data.changeSetId === null) {
        setMessages((prev) => [...prev, { role: 'assistant', content: 'Nothing to promote — accept or merge at least one candidate first.' }]);
      } else {
        const parts = [`✅ **Promoted**: ${data.promotedConceptIds.length} concept(s), ${data.promotedRelationshipIds.length} relationship(s), ${data.mergedConceptIds.length} merged.`];
        if (data.errors?.length > 0) {
          parts.push(`⚠️ ${data.errors.length} skipped:\n${data.errors.map((e: any) => `- ${e.label}: ${e.reason}`).join('\n')}`);
        }

        // Stage 7: draft glossary entries for whatever this changeset just created. A
        // drafting failure (e.g. LLM quota) must not undo the already-live promotion above —
        // report it in chat and let the ontologist retry via the same button later.
        try {
          const glossaryRes = await fetch(`/api/changesets/${data.changeSetId}/glossary`, { method: 'POST' });
          const glossaryData = await glossaryRes.json();
          if (glossaryRes.ok) {
            if (glossaryData.created?.length > 0) {
              parts.push(`📖 Drafted **${glossaryData.created.length}** glossary definition(s) — confirm them below.`);
            }
            if (glossaryData.skipped?.length > 0) {
              parts.push(`⚠️ Glossary drafting skipped ${glossaryData.skipped.length} term(s):\n${glossaryData.skipped.map((s: any) => `- ${s.term}: ${s.reason}`).join('\n')}`);
            }
          } else {
            parts.push(`⚠️ Glossary drafting failed: ${glossaryData.error || 'unknown error'}`);
          }
        } catch (glossaryErr: any) {
          parts.push(`⚠️ Glossary drafting failed: ${glossaryErr.message}`);
        }

        // Stage 8: elicit business rules for the derived logic this changeset implies. Same
        // non-fatal contract — a failure never undoes the live promotion; retry via re-promote.
        try {
          const rulesRes = await fetch(`/api/changesets/${data.changeSetId}/rules`, { method: 'POST' });
          const rulesData = await rulesRes.json();
          if (rulesRes.ok) {
            if (rulesData.created?.length > 0) {
              const needQ = rulesData.created.filter((r: any) => r.clarifyingQuestion).length;
              parts.push(`📐 Elicited **${rulesData.created.length}** business rule(s)${needQ ? ` — ${needQ} need thresholds specified` : ''}; confirm them below.`);
            }
          } else {
            parts.push(`⚠️ Rule elicitation failed: ${rulesData.error || 'unknown error'}`);
          }
        } catch (ruleErr: any) {
          parts.push(`⚠️ Rule elicitation failed: ${ruleErr.message}`);
        }

        setMessages((prev) => [...prev, { role: 'assistant', content: parts.join('\n\n') }]);
        await onGenerationComplete();
      }
      await refreshCandidates(sessionId);
      await refreshGlossaryDrafts(sessionId);
      await refreshRuleDrafts(sessionId);
      setGovernanceRefresh((n) => n + 1);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ Promotion error: ${e.message}` }]);
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
      {/* Header Bar */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles style={{ width: '16px', height: '16px', color: '#2563eb' }} />
          <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>AI Conversational Modeler</h3>
        </div>

        {onAutoFix && (
          <button
            type="button"
            onClick={onAutoFix}
            disabled={isFixing || loading}
            style={{
              padding: '4px 12px',
              fontSize: '11px',
              fontWeight: '800',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: isFixing ? '#94a3b8' : '#2563eb',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
            }}
            title="Run 1-Click Agentic Remediation to auto-connect orphan nodes and fix CQ coverage"
          >
            <Wrench style={{ width: '13px', height: '13px' }} />
            <span>{isFixing ? 'Fixing Ontology...' : '🛠️ Auto-Fix Remediation'}</span>
          </button>
        )}
      </div>

      {/* Preset Suggestions Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', background: '#ffffff', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', fontWeight: '800', color: '#2563eb', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Sparkles style={{ width: '12px', height: '12px' }} /> Presets:
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {presets.map((preset: string, idx: number) => (
            <button
              key={idx}
              onClick={() => handleSend(preset)}
              disabled={loading}
              style={{
                fontSize: '11px',
                fontWeight: '600',
                padding: '4px 10px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '16px',
                color: '#334155',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', minHeight: 0 }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              maxWidth: '92%',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '12px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              background: msg.role === 'user' ? '#2563eb' : '#ffffff',
              color: msg.role === 'user' ? '#ffffff' : '#0f172a',
              border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
              boxShadow: msg.role === 'user' ? '0 2px 6px rgba(37,99,235,0.2)' : '0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            {typeof msg.content === 'string'
              ? msg.content
              : (typeof msg.content === 'object' && msg.content ? JSON.stringify(msg.content, null, 2) : String(msg.content))}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 4px rgba(37,99,235,0.08)' }}>
            <Loader style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
            <span>Extracting candidates...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Candidate Review Queue */}
      <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, maxHeight: '260px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 14px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: '800', color: '#0f172a' }}>
            Review Queue ({candidates.length})
          </span>
          <button
            type="button"
            onClick={promoteAll}
            disabled={promoting || reviewedCount === 0}
            style={{
              fontSize: '11px',
              fontWeight: '800',
              padding: '5px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: reviewedCount === 0 ? 'default' : 'pointer',
              background: reviewedCount === 0 ? '#cbd5e1' : '#16a34a',
              color: '#ffffff',
            }}
          >
            {promoting ? 'Promoting...' : `Promote Reviewed Candidates (${reviewedCount})`}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {candidates.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#94a3b8', padding: '6px 0' }}>
              No candidates awaiting review — send a message above to extract some.
            </div>
          ) : (
            candidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                onDecide={(decision, mergeTargetConceptId) => decideCandidate(c.id, decision, mergeTargetConceptId)}
                onPromoteToCore={() => promoteToCore(c.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Glossary Confirmation Queue (Stage 7) */}
      {glossaryDrafts.length > 0 && (
        <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, maxHeight: '240px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 14px 4px' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#0f172a' }}>
              Glossary Confirmations ({pendingGlossaryDrafts.length} pending)
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {glossaryDrafts.map((d) => (
              <GlossaryDraftCard
                key={d.id}
                draft={d}
                onConfirm={(definition) => decideGlossaryDraft(d.id, 'CONFIRMED', definition)}
                onReject={() => decideGlossaryDraft(d.id, 'REJECTED', d.definition)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Business Rule Confirmation Queue (Stage 8) */}
      {ruleDrafts.length > 0 && (
        <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, maxHeight: '260px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 14px 4px' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#0f172a' }}>
              Business Rule Confirmations ({pendingRuleDrafts.length} pending)
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {ruleDrafts.map((d) => (
              <RuleDraftCard
                key={d.id}
                draft={d}
                onConfirm={(condition, derivedValue) => decideRuleDraft(d.id, 'CONFIRMED', condition, derivedValue)}
                onReject={() => decideRuleDraft(d.id, 'REJECTED')}
              />
            ))}
          </div>
        </div>
      )}

      {/* Change Set Governance: Validate -> Version -> Sign-off -> Publish (Stages 9-12) */}
      {sessionId && <GovernancePanel sessionId={sessionId} refreshSignal={governanceRefresh} />}

      {/* Input Bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(input.trim()); }}
        style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}
      >
        <textarea
          className="form-input"
          placeholder='Describe what to model, or type "merge X into Y"...'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(input.trim());
            }
          }}
          disabled={loading}
          rows={2}
          style={{ fontSize: '12px', width: '100%', borderRadius: '8px', padding: '8px 12px', resize: 'vertical', minHeight: '52px', maxHeight: '140px', lineHeight: '1.4' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleEnhancePrompt}
            disabled={loading || !input.trim()}
            className="btn-secondary"
            title="Optimize & Expand Prompt via AI"
            style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '700', color: '#7c3aed', background: '#f3e8ff', borderColor: '#d8b4fe', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Sparkles style={{ width: '13px', height: '13px' }} />
            <span>⚡ Enhance Prompt</span>
          </button>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !input.trim()}
            style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
          >
            <Send style={{ width: '13px', height: '13px' }} /> Send
          </button>
        </div>
      </form>
    </div>
  );
}
