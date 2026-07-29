'use client';

import React, { useState } from 'react';
import { Plus, Loader, X, ArrowLeft } from 'lucide-react';

/**
 * V3 manual authoring (Edit tab, empty state) — add a node or a relationship by hand, so the tool
 * isn't chat-only. Writes live via POST /api/ontologies/[id]/concepts | /relationships.
 */

interface AddElementProps {
  ontologyId: string;
  concepts: { id: string; label: string }[]; // live concepts for relationship endpoint pickers
  onCreated: () => void | Promise<void>;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-translucent)',
  background: 'var(--bg-input)', fontSize: 13, fontFamily: 'var(--font-family)', color: 'var(--color-text-main)',
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.3 };
const addBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '10px', borderRadius: 9, border: '1px dashed var(--border-translucent)', background: 'var(--bg-input)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-main)', cursor: 'pointer' };
const CONCEPT_TYPES = ['Entity', 'Agent', 'Process', 'Event', 'Metric'];

export default function AddElement({ ontologyId, concepts, onCreated }: AddElementProps) {
  const [mode, setMode] = useState<null | 'concept' | 'relationship'>(null);
  const [form, setForm] = useState<any>({});
  const [attrs, setAttrs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  function reset() { setMode(null); setForm({}); setAttrs([]); }

  async function submit() {
    setBusy(true);
    try {
      let res: Response;
      if (mode === 'concept') {
        if (!form.label?.trim()) { alert('Label is required.'); setBusy(false); return; }
        res = await fetch(`/api/ontologies/${ontologyId}/concepts`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ label: form.label, conceptType: form.conceptType || 'Entity', description: form.description, businessJustification: form.businessJustification, attributes: attrs.filter((a) => a.name?.trim()) }),
        });
      } else {
        if (!form.name?.trim() || !form.sourceId || !form.targetId) { alert('Name, source, and target are required.'); setBusy(false); return; }
        res = await fetch(`/api/ontologies/${ontologyId}/relationships`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: form.name, sourceId: form.sourceId, targetId: form.targetId, cardinality: form.cardinality || 'one-to-many', description: form.description, businessJustification: form.businessJustification }),
        });
      }
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Failed to create.'); setBusy(false); return; }
      reset();
      await onCreated();
    } finally { setBusy(false); }
  }

  if (mode === null) {
    return (
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Click a node or relationship on the canvas to edit it — or add one manually:
        </div>
        <button onClick={() => { setForm({ conceptType: 'Entity' }); setAttrs([]); setMode('concept'); }} style={addBtn}><Plus size={14} /> Add node</button>
        <button onClick={() => { setForm({ cardinality: 'one-to-many' }); setMode('relationship'); }} disabled={concepts.length < 2}
          title={concepts.length < 2 ? 'Add at least two nodes first' : ''}
          style={{ ...addBtn, marginTop: 8, opacity: concepts.length < 2 ? 0.5 : 1, cursor: concepts.length < 2 ? 'not-allowed' : 'pointer' }}>
          <Plus size={14} /> Add relationship
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', height: '100%' }}>
      <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 10, padding: 0 }}>
        <ArrowLeft size={13} /> Back
      </button>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>New {mode}</div>

      {mode === 'concept' ? (
        <>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Label</label>
            <input style={inputStyle} value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} autoFocus /></div>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Type</label>
            <select style={inputStyle} value={form.conceptType || 'Entity'} onChange={(e) => setForm({ ...form, conceptType: e.target.value })}>
              {CONCEPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Business justification</label>
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} placeholder="Why it exists / what it means for the business" value={form.businessJustification || ''} onChange={(e) => setForm({ ...form, businessJustification: e.target.value })} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Attributes</label>
            {attrs.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input style={{ ...inputStyle, flex: 2 }} placeholder="name" value={a.name} onChange={(e) => { const n = [...attrs]; n[i] = { ...a, name: e.target.value }; setAttrs(n); }} />
                <select style={{ ...inputStyle, flex: 1 }} value={a.datatype} onChange={(e) => { const n = [...attrs]; n[i] = { ...a, datatype: e.target.value }; setAttrs(n); }}>
                  {['string', 'integer', 'float', 'boolean'].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button onClick={() => setAttrs(attrs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={15} /></button>
              </div>
            ))}
            <button onClick={() => setAttrs([...attrs, { name: '', datatype: 'string' }])} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px dashed var(--border-translucent)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
              <Plus size={13} /> Add attribute
            </button></div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Name</label>
            <input style={inputStyle} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. produces" autoFocus /></div>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Source</label>
            <select style={inputStyle} value={form.sourceId || ''} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}>
              <option value="">Select…</option>
              {concepts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></div>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Target</label>
            <select style={inputStyle} value={form.targetId || ''} onChange={(e) => setForm({ ...form, targetId: e.target.value })}>
              <option value="">Select…</option>
              {concepts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select></div>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Cardinality</label>
            <select style={inputStyle} value={form.cardinality || 'one-to-many'} onChange={(e) => setForm({ ...form, cardinality: e.target.value })}>
              {['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div style={{ marginBottom: 10 }}><label style={labelStyle}>Business justification</label>
            <textarea style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} value={form.businessJustification || ''} onChange={(e) => setForm({ ...form, businessJustification: e.target.value })} /></div>
        </>
      )}

      <button onClick={submit} disabled={busy}
        style={{ width: '100%', marginTop: 6, padding: '10px', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: busy ? 0.7 : 1 }}>
        {busy ? <Loader size={14} className="spin" /> : <Plus size={14} />} Create {mode}
      </button>
    </div>
  );
}
