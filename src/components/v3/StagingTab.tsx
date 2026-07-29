'use client';

import React from 'react';
import { Check, Loader } from 'lucide-react';

/**
 * V3 Stage V4 — the Staging tab. Every staged candidate (seed OR chat-extracted) with a green
 * checkbox: checked === live in the graph. Checking calls promote, un-checking calls demote
 * (docs/V3_FLOW.md §4). A relationship's checkbox is disabled until both endpoint concepts are
 * live (decision Q4).
 */

export interface StagingCandidate {
  id: string;
  label: string;
  candidateType: string;
  decision: string;
  promotedConceptId: string | null;
  promotedRelationshipId: string | null;
  upperOntologyTag: string | null;
  payload: any;
}

interface StagingTabProps {
  candidates: StagingCandidate[];
  liveConceptLabels: Set<string>;
  busyIds: Set<string>;
  onToggle: (candidate: StagingCandidate, nextChecked: boolean) => void;
}

function isChecked(c: StagingCandidate): boolean {
  return !!c.promotedConceptId || !!c.promotedRelationshipId;
}

export default function StagingTab({ candidates, liveConceptLabels, busyIds, onToggle }: StagingTabProps) {
  const concepts = candidates.filter((c) => (c.payload?.kind ?? 'concept') !== 'relationship');
  const relationships = candidates.filter((c) => (c.payload?.kind ?? 'concept') === 'relationship');

  function Row({ c, blockedReason }: { c: StagingCandidate; blockedReason?: string | null }) {
    const checked = isChecked(c);
    const busy = busyIds.has(c.id);
    const disabled = busy || (!checked && !!blockedReason);
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 8, background: checked ? 'rgba(16,185,129,0.06)' : 'transparent' }}>
        <button
          onClick={() => !disabled && onToggle(c, !checked)}
          disabled={disabled}
          title={blockedReason || (checked ? 'Remove from graph' : 'Add to graph')}
          style={{
            marginTop: 2, width: 20, height: 20, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${checked ? 'var(--color-success)' : 'var(--border-translucent)'}`,
            background: checked ? 'var(--color-success)' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled && !checked ? 0.5 : 1,
          }}
        >
          {busy ? <Loader size={12} className="spin" color={checked ? '#fff' : 'var(--color-text-muted)'} /> : checked ? <Check size={13} color="#fff" /> : null}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)' }}>{c.label}</span>
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', border: '1px solid var(--border-translucent)', borderRadius: 5, padding: '1px 5px' }}>{c.candidateType}</span>
            {c.payload?.seed && <span style={{ fontSize: 10, color: 'var(--color-primary)' }}>seed</span>}
          </div>
          {c.payload?.description && (
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.payload.description}</div>
          )}
          {blockedReason && !checked && (
            <div style={{ fontSize: 10.5, color: 'var(--color-warn)', marginTop: 2 }}>{blockedReason}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 6px', overflowY: 'auto', height: '100%' }}>
      {candidates.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>
          No staged elements yet. Talk to the assistant to propose some.
        </div>
      )}
      {concepts.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 10px' }}>Classes</div>
          {concepts.map((c) => <Row key={c.id} c={c} />)}
        </>
      )}
      {relationships.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 10px 6px' }}>Relationships</div>
          {relationships.map((c) => {
            const src = c.payload?.source;
            const tgt = c.payload?.target;
            const srcLive = liveConceptLabels.has(src);
            const tgtLive = liveConceptLabels.has(tgt);
            const blocked = !srcLive || !tgtLive ? `Check in ${!srcLive ? src : tgt} first` : null;
            return <Row key={c.id} c={c} blockedReason={blocked} />;
          })}
        </>
      )}
    </div>
  );
}
