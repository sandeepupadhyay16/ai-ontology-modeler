'use client';

import React, { useEffect, useState } from 'react';
import { Trash2, Save, Loader, Plus, X } from 'lucide-react';

/**
 * V3 Stage V5 — the Edit tab. Edit the currently-selected LIVE element (concept or
 * relationship). Edits are live-only (decision Q3): they write to Concept/Relationship, never
 * back to the candidate. Delete here removes the live element directly (distinct from
 * un-checking in Staging).
 */

interface EditTabProps {
  selected: { kind: 'concept' | 'relationship'; id: string } | null;
  concept: any | null; // full live concept (with attributes) when kind==='concept'
  relationship: any | null; // full live relationship when kind==='relationship'
  onSaved: () => void;
  onDeleted: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-translucent)',
  background: 'var(--bg-input)', fontSize: 13, fontFamily: 'var(--font-family)', color: 'var(--color-text-main)',
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: 0.3 };
const CONCEPT_TYPES = ['Entity', 'Agent', 'Process', 'Event', 'Metric'];

export default function EditTab({ selected, concept, relationship, onSaved, onDeleted }: EditTabProps) {
  const [form, setForm] = useState<any>({});
  const [attrs, setAttrs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (selected?.kind === 'concept' && concept) {
      setForm({ label: concept.label, description: concept.description || '', conceptType: concept.conceptType, businessJustification: concept.businessJustification || '' });
      setAttrs((concept.attributes || []).map((a: any) => ({ name: a.name, datatype: a.datatype, description: a.description || '' })));
    } else if (selected?.kind === 'relationship' && relationship) {
      setForm({ name: relationship.name, description: relationship.description || '', cardinality: relationship.cardinality, businessJustification: relationship.businessJustification || '' });
      setAttrs([]);
    }
  }, [selected, concept, relationship]);

  if (!selected) {
    return (
      <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--color-text-muted)' }}>
        Select a node or relationship on the canvas to edit it.
      </div>
    );
  }

  async function save() {
    setBusy(true);
    try {
      if (selected!.kind === 'concept') {
        await fetch(`/api/concepts/${selected!.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ label: form.label, description: form.description, conceptType: form.conceptType, businessJustification: form.businessJustification, attributes: attrs.filter((a) => a.name?.trim()) }),
        });
      } else {
        await fetch(`/api/relationships/${selected!.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: form.name, description: form.description, cardinality: form.cardinality, businessJustification: form.businessJustification }),
        });
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm('Delete this element from the graph? This cannot be undone.')) return;
    setBusy(true);
    try {
      const url = selected!.kind === 'concept' ? `/api/concepts/${selected!.id}` : `/api/relationships/${selected!.id}`;
      await fetch(url, { method: 'DELETE' });
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', height: '100%' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
        Editing {selected.kind}
      </div>

      {selected.kind === 'concept' ? (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Label</label>
            <input style={inputStyle} value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={form.conceptType || 'Entity'} onChange={(e) => setForm({ ...form, conceptType: e.target.value })}>
              {CONCEPT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Business justification</label>
            <textarea style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} placeholder="Why it exists / what it means for the business" value={form.businessJustification || ''} onChange={(e) => setForm({ ...form, businessJustification: e.target.value })} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Attributes</label>
            {attrs.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input style={{ ...inputStyle, flex: 2 }} placeholder="name" value={a.name} onChange={(e) => { const n = [...attrs]; n[i] = { ...a, name: e.target.value }; setAttrs(n); }} />
                <select style={{ ...inputStyle, flex: 1 }} value={a.datatype} onChange={(e) => { const n = [...attrs]; n[i] = { ...a, datatype: e.target.value }; setAttrs(n); }}>
                  {['string', 'integer', 'float', 'boolean'].map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button onClick={() => setAttrs(attrs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={15} /></button>
              </div>
            ))}
            <button onClick={() => setAttrs([...attrs, { name: '', datatype: 'string', description: '' }])}
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px dashed var(--border-translucent)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
              <Plus size={13} /> Add attribute
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Name</label>
            <input style={inputStyle} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Cardinality</label>
            <select style={inputStyle} value={form.cardinality || 'one-to-many'} onChange={(e) => setForm({ ...form, cardinality: e.target.value })}>
              {['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Business justification</label>
            <textarea style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} placeholder="Why it exists / what it means for the business" value={form.businessJustification || ''} onChange={(e) => setForm({ ...form, businessJustification: e.target.value })} />
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={save} disabled={busy}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
          {busy ? <Loader size={14} className="spin" /> : <Save size={14} />} Save
        </button>
        <button onClick={remove} disabled={busy}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--color-error)', background: '#fff', color: 'var(--color-error)', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </div>
  );
}
