'use client';

import React, { useCallback, useEffect, useState } from 'react';

/**
 * Stages 9-12 governance strip: drives the latest change set of a session through
 * Validate -> Version -> Sign-off -> Publish. Each action is enabled only when the change
 * set's status permits it, so the pipeline order (and its two hard gates) is enforced in the UI
 * as well as the backend. Purely a control surface over the /api/changesets/[id]/* routes.
 */
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  DRAFT: { bg: '#f1f5f9', fg: '#475569' },
  APPROVED: { bg: '#e0f2fe', fg: '#0369a1' },
  VALIDATED: { bg: '#dcfce7', fg: '#15803d' },
  SIGNED_OFF: { bg: '#ede9fe', fg: '#6d28d9' },
  PUBLISHED: { bg: '#dcfce7', fg: '#166534' },
};

function btn(color: string, disabled: boolean): React.CSSProperties {
  return {
    fontSize: '11px', fontWeight: 700, padding: '5px 10px', borderRadius: '6px', border: 'none',
    cursor: disabled ? 'default' : 'pointer', background: disabled ? '#cbd5e1' : color, color: '#fff',
  };
}

export default function GovernancePanel({ sessionId, refreshSignal }: { sessionId: string; refreshSignal: number }) {
  const [cs, setCs] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [issues, setIssues] = useState<any[]>([]);
  const [approver, setApprover] = useState('');
  const [approverRole, setApproverRole] = useState('Domain SME');

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const res = await fetch(`/api/sessions/${sessionId}/changesets`);
    if (!res.ok) return;
    const data = await res.json();
    setCs((data.changeSets || [])[0] || null); // latest
  }, [sessionId]);

  useEffect(() => { refresh(); }, [refresh, refreshSignal]);

  const act = async (label: string, url: string, body?: any) => {
    if (!cs || busy) return;
    setBusy(true); setMsg(''); setIssues([]);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) { setMsg(`⚠️ ${label} failed: ${data.error || 'error'}`); return; }
      if (label === 'Validate' && data.conforms === false) {
        setIssues(data.issues || []);
        setMsg(`❌ Validation found ${data.issues?.length || 0} issue(s) — resolve before sign-off.`);
      } else if (label === 'Validate') {
        setMsg('✅ Validation passed.');
      } else if (label === 'Version') {
        setMsg(`✅ Versioned — commit ${String(data.gitCommitSha).slice(0, 8)} (${data.files?.length || 0} files).`);
      } else if (label === 'Sign-off') {
        setMsg(data.status === 'SIGNED_OFF' ? '✅ Signed off.' : '↩️ Sent back (rejected).');
      } else if (label === 'Publish') {
        setMsg(`🚀 Published to "${data.target}" (${data.files?.length || 0} artifacts).`);
      }
      await refresh();
    } catch (e: any) {
      setMsg(`⚠️ ${label} failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!cs) return null;
  const status: string = cs.status;
  const color = STATUS_COLOR[status] || STATUS_COLOR.DRAFT;

  return (
    <div style={{ borderTop: '1px solid #e2e8f0', background: '#ffffff', flexShrink: 0, padding: '8px 14px 10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a' }}>Change Set Governance</span>
        <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: color.bg, color: color.fg }}>{status}</span>
        {cs.version?.gitCommitSha && <span style={{ fontSize: '10px', color: '#64748b' }}>commit {String(cs.version.gitCommitSha).slice(0, 8)}</span>}
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" style={btn('#2563eb', busy || !['APPROVED', 'VALIDATED'].includes(status))} disabled={busy || !['APPROVED', 'VALIDATED'].includes(status)} onClick={() => act('Validate', `/api/changesets/${cs.id}/validate`)}>1. Validate</button>
        <button type="button" style={btn('#0f766e', busy || status !== 'VALIDATED')} disabled={busy || status !== 'VALIDATED'} onClick={() => act('Version', `/api/changesets/${cs.id}/version`)}>2. Version</button>
        <input value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="approver name" style={{ fontSize: '11px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', width: '110px' }} />
        <input value={approverRole} onChange={(e) => setApproverRole(e.target.value)} placeholder="role" style={{ fontSize: '11px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '6px', width: '90px' }} />
        <button type="button" style={btn('#6d28d9', busy || status !== 'VALIDATED' || !approver.trim())} disabled={busy || status !== 'VALIDATED' || !approver.trim()} onClick={() => act('Sign-off', `/api/changesets/${cs.id}/signoff`, { approver, approverRole, decision: 'APPROVED' })}>3. Sign off</button>
        <button type="button" style={btn('#16a34a', busy || status !== 'SIGNED_OFF')} disabled={busy || status !== 'SIGNED_OFF'} onClick={() => act('Publish', `/api/changesets/${cs.id}/publish`)}>4. Publish</button>
      </div>

      {msg && <div style={{ fontSize: '11px', color: '#334155' }}>{msg}</div>}
      {issues.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {issues.map((i, idx) => (
            <div key={idx} style={{ fontSize: '11px', color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', whiteSpace: 'pre-wrap' }}>
              <strong>{i.code}:</strong> {i.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
