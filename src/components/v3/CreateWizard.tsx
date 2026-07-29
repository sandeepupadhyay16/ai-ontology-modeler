'use client';

import React, { useEffect, useState } from 'react';
import { Loader, Sparkles, Link2, Trash2 } from 'lucide-react';
import HomeLearn from '@/components/v3/HomeLearn';

/**
 * V3 Stage V3 — the create wizard (docs/V3_FLOW.md §1). Pick Industry × Domain, optionally link
 * an existing ontology, and bootstrap. On success the parent drops into the workspace with the
 * seed sitting unchecked in Staging.
 */

interface Profile {
  key: string;
  label: string;
  industryMatches: string[];
  starterEntities: string[];
}
interface OntologyOption {
  id: string;
  name: string;
  industry?: string | null;
  businessFunction?: string | null;
}

interface RecentSession {
  id: string;
  ontologyId: string;
  ontology: { id: string; name: string; industry?: string | null; businessFunction?: string | null } | null;
}

interface CreateWizardProps {
  onCreated: (bootstrap: any) => void;
  onOpen: (ontologyId: string, sessionId: string, name: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border-translucent)',
  background: 'var(--bg-input)',
  fontSize: 14,
  fontFamily: 'var(--font-family)',
  color: 'var(--color-text-main)',
};
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: 0.4 };

export default function CreateWizard({ onCreated, onOpen }: CreateWizardProps) {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [domain, setDomain] = useState('');
  const [linkedOntologyId, setLinkedOntologyId] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ontologies, setOntologies] = useState<OntologyOption[]>([]);
  const [recent, setRecent] = useState<RecentSession[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'start' | 'learn'>('start');

  useEffect(() => {
    fetch('/api/domain-profiles').then((r) => r.json()).then((d) => setProfiles(d.profiles || [])).catch(() => {});
    fetch('/api/ontologies').then((r) => r.json()).then((d) => setOntologies(d.ontologies || [])).catch(() => {});
    fetch('/api/sessions').then((r) => r.json()).then((d) => setRecent((d.sessions || []).slice(0, 6))).catch(() => {});
  }, []);

  const industrySuggestions = Array.from(new Set(profiles.map((p) => p.industryMatches[0]).filter(Boolean)));

  async function deleteOntology(ontologyId: string, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete “${name}”? This permanently removes the ontology, its graph, and its modeling session.`)) return;
    const res = await fetch(`/api/ontologies/${ontologyId}`, { method: 'DELETE' });
    if (res.ok) {
      setRecent((r) => r.filter((x) => x.ontologyId !== ontologyId));
      setOntologies((o) => o.filter((x) => x.id !== ontologyId));
    } else {
      alert('Failed to delete the ontology.');
    }
  }

  async function submit() {
    setError(null);
    if (!name.trim() || !industry.trim() || !domain.trim()) {
      setError('Name, industry, and domain are all required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/ontologies/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, industry, domain, linkedOntologyId: linkedOntologyId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create ontology');
        setSubmitting(false);
        return;
      }
      onCreated(data);
    } catch (e: any) {
      setError(e.message || 'Failed to create ontology');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', background: 'var(--bg-main)' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: 'var(--bg-card)', border: '1px solid var(--border-translucent)', borderRadius: 12, padding: 4 }}>
        {(['start', 'learn'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '7px 18px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-family)',
              background: tab === t ? 'var(--color-primary)' : 'transparent', color: tab === t ? '#fff' : 'var(--color-text-muted)' }}>
            {t === 'start' ? 'Get started' : 'Learn'}
          </button>
        ))}
      </div>
      {tab === 'learn' && <HomeLearn />}
      {tab === 'start' && (
      <div style={{ width: '100%', maxWidth: 520, background: 'var(--bg-card)', borderRadius: 18, border: '1px solid var(--border-translucent)', padding: 32, boxShadow: '0 8px 30px rgba(15,23,42,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={20} color="var(--color-primary)" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)' }}>New Ontology</h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 24 }}>
          Pick an industry and domain. We&apos;ll seed a standards-aligned starter map you can build on by talking to the assistant.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 Brand Launch Model" />
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Industry</label>
            <input style={inputStyle} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Pharma" list="v3-industries" />
            <datalist id="v3-industries">
              {industrySuggestions.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Domain</label>
            <input style={inputStyle} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. Marketing" list="v3-domains" />
            <datalist id="v3-domains">
              {['Marketing', 'Risk Management', 'Commercial', 'Compliance', 'Operations'].map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}><Link2 size={12} style={{ verticalAlign: -1, marginRight: 4 }} />Link an existing ontology (optional)</label>
          <select style={inputStyle} value={linkedOntologyId} onChange={(e) => setLinkedOntologyId(e.target.value)}>
            <option value="">None — start fresh from the industry template</option>
            {ontologies.map((o) => (
              <option key={o.id} value={o.id}>{o.name}{o.industry ? ` (${o.industry})` : ''}</option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
            Linking imports that ontology&apos;s classes as your seed and marks this a domain extension of it.
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--color-error)', padding: '10px 12px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <button onClick={submit} disabled={submitting}
          style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: submitting ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? <><Loader size={16} className="spin" /> Creating…</> : <>Create &amp; open</>}
        </button>

        {recent.length > 0 && (
          <div style={{ marginTop: 24, borderTop: '1px solid var(--border-translucent)', paddingTop: 16 }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>Open recent</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recent.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                  <div onClick={() => s.ontology && onOpen(s.ontologyId, s.id, s.ontology.name)}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border-translucent)', background: 'var(--bg-input)', cursor: 'pointer' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ontology?.name || 'Untitled'}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0, marginLeft: 8, whiteSpace: 'nowrap' }}>
                      {[s.ontology?.industry, s.ontology?.businessFunction].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <button onClick={(e) => deleteOntology(s.ontologyId, s.ontology?.name || 'this ontology', e)} title="Delete ontology"
                    style={{ flexShrink: 0, padding: '0 10px', borderRadius: 9, border: '1px solid var(--border-translucent)', background: 'var(--bg-input)', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
