'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Loader, Sparkles, Home, Layers, Pencil, BookOpen, Download } from 'lucide-react';
import CreateWizard from '@/components/v3/CreateWizard';
import GraphCanvas, { type GraphCanvasHandle } from '@/components/v3/GraphCanvas';
import StagingTab, { type StagingCandidate } from '@/components/v3/StagingTab';
import EditTab from '@/components/v3/EditTab';
import AddElement from '@/components/v3/AddElement';
import ConceptGuide from '@/components/v3/ConceptGuide';

const TAG_ROOT_MARKER = '__layer1_tag_root__';
const notTagRoot = (c: any) => (c.typeFields as any)?.marker !== TAG_ROOT_MARKER;
const menuItemStyle: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 13, background: 'none', border: 'none', borderRadius: 7, cursor: 'pointer', color: 'var(--color-text-main)', fontFamily: 'var(--font-family)' };

interface ChatMsg { role: 'user' | 'assistant'; content: string; }
type Selected = { kind: 'concept' | 'relationship'; id: string } | null;

export default function V3Page() {
  const [ontologyId, setOntologyId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ontologyName, setOntologyName] = useState('');
  const [ontologyIndustry, setOntologyIndustry] = useState('');

  const [candidates, setCandidates] = useState<StagingCandidate[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  // Imported (read-only) base graph, populated when this ontology extends another (owl:imports).
  const [importedConcepts, setImportedConcepts] = useState<any[]>([]);
  const [importedRelationships, setImportedRelationships] = useState<any[]>([]);

  const [bottomTab, setBottomTab] = useState<'guide' | 'staging' | 'edit'>('guide');
  const [selected, setSelected] = useState<Selected>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<GraphCanvasHandle>(null);
  const [exportOpen, setExportOpen] = useState(false);

  // Staging is a proposal inbox: only chat-extracted candidates still awaiting the gate (PENDING).
  // Seed classes never appear here — they go straight to the canvas at create time.
  const pendingCandidates = useMemo(() => candidates.filter((c) => c.decision === 'PENDING' && !c.promotedConceptId && !c.promotedRelationshipId), [candidates]);
  const liveConcepts = useMemo(() => concepts.filter(notTagRoot), [concepts]);
  const importedLive = useMemo(() => importedConcepts.filter(notTagRoot), [importedConcepts]);
  // Labels a relationship candidate may reference: own live concepts + imported base concepts.
  const referenceableLabels = useMemo(
    () => new Set([...liveConcepts.map((c) => c.label), ...importedLive.map((c) => c.label)]),
    [liveConcepts, importedLive]
  );

  // Draft overlay: pending chat proposals rendered on the canvas as unconfirmed (amber, dashed).
  const draftConcepts = useMemo(() => pendingCandidates.filter((c) => ((c.payload as any)?.kind ?? 'concept') !== 'relationship'), [pendingCandidates]);
  const draftEdges = useMemo(() => {
    const labelToId = new Map<string, string>();
    liveConcepts.forEach((c) => labelToId.set(c.label, c.id));
    importedLive.forEach((c) => labelToId.set(c.label, c.id));
    draftConcepts.forEach((c) => labelToId.set(c.label, c.id));
    return pendingCandidates
      .filter((c) => ((c.payload as any)?.kind ?? 'concept') === 'relationship')
      .map((c) => {
        const s = labelToId.get((c.payload as any)?.source);
        const t = labelToId.get((c.payload as any)?.target);
        return s && t ? { id: c.id, name: c.label, sourceId: s, targetId: t, draft: true } : null;
      })
      .filter(Boolean) as { id: string; name: string; sourceId: string; targetId: string; draft: boolean }[];
  }, [pendingCandidates, draftConcepts, liveConcepts, importedLive]);

  const loadGraph = useCallback(async (oid: string) => {
    const res = await fetch(`/api/ontologies/${oid}`);
    if (!res.ok) return;
    const data = await res.json();
    setConcepts(data.concepts || []);
    setRelationships(data.relationships || []);
    setOntologyName(data.name || '');
    setOntologyIndustry(data.industry || '');
    if (data.extendsOntologyId) {
      const pres = await fetch(`/api/ontologies/${data.extendsOntologyId}`);
      if (pres.ok) {
        const pdata = await pres.json();
        setImportedConcepts(pdata.concepts || []);
        setImportedRelationships(pdata.relationships || []);
      }
    } else {
      setImportedConcepts([]);
      setImportedRelationships([]);
    }
  }, []);

  const loadCandidates = useCallback(async (sid: string) => {
    const res = await fetch(`/api/sessions/${sid}/candidates`);
    if (!res.ok) return;
    const data = await res.json();
    setCandidates(data.candidates || []);
  }, []);

  const refreshAll = useCallback(async () => {
    if (ontologyId) await loadGraph(ontologyId);
    if (sessionId) await loadCandidates(sessionId);
  }, [ontologyId, sessionId, loadGraph, loadCandidates]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const openExisting = useCallback(async (oid: string, sid: string, name: string) => {
    setOntologyId(oid);
    setSessionId(sid);
    setOntologyName(name);
    setSelected(null);
    setBottomTab('staging');
    setMessages([{ role: 'assistant', content: `Reopened${name ? ` “${name}”` : ''}. Your model and any pending proposals are loaded.` }]);
    await Promise.all([loadGraph(oid), loadCandidates(sid)]);
    window.history.replaceState(null, '', `/v3?ontology=${oid}&session=${sid}`);
  }, [loadGraph, loadCandidates]);

  // Restore the workspace from the URL on load (survives a browser refresh).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = params.get('ontology');
    const sid = params.get('session');
    if (oid && sid) openExisting(oid, sid, '');
  }, [openExisting]);

  async function onCreated(bootstrap: any) {
    const oid = bootstrap.ontology.id;
    const sid = bootstrap.session.id;
    setOntologyId(oid);
    setSessionId(sid);
    setOntologyName(bootstrap.ontology.name);
    setOntologyIndustry(bootstrap.ontology.industry || '');
    setCandidates([]);
    setSelected(null);
    setBottomTab('guide');
    const meta = bootstrap.seedMeta;
    setMessages([{
      role: 'assistant',
      content: meta.origin === 'linked'
        ? `Extending “${meta.label ?? 'the linked ontology'}” — its ${meta.importedConceptCount} imported class${meta.importedConceptCount === 1 ? '' : 'es'} are shown dimmed on the canvas. Add new classes by talking to me; they can reference the imported ones.`
        : `Created your ${meta.label ?? 'starter'} map — ${meta.classCount} classes and ${meta.relationshipCount} relationships are on the canvas. Edit or delete any, or tell me what else to model. New suggestions land in Staging for you to review.`,
    }]);
    await loadGraph(oid);
    window.history.replaceState(null, '', `/v3?ontology=${oid}&session=${sid}`);
  }

  async function confirmAllDrafts() {
    if (!sessionId) return;
    await fetch(`/api/sessions/${sessionId}/promote-pending`, { method: 'POST' });
    await refreshAll();
  }
  async function dismissAllDrafts() {
    if (!sessionId) return;
    if (!confirm('Dismiss all unconfirmed drafts? They won’t be added to the graph.')) return;
    await fetch(`/api/sessions/${sessionId}/reject-pending`, { method: 'POST' });
    await refreshAll();
  }
  async function confirmDraft(candidateId: string) {
    const res = await fetch(`/api/candidates/${candidateId}/promote`, { method: 'POST' });
    const d = await res.json();
    if (!d.ok) alert(d.error || 'Could not confirm this element yet.');
    await refreshAll();
  }

  function downloadSemantic(format: string) {
    if (!ontologyId) return;
    const a = document.createElement('a');
    a.href = `/api/ontologies/${ontologyId}/export?format=${format}`;
    document.body.appendChild(a); a.click(); a.remove();
    setExportOpen(false);
  }
  function downloadImage(f: 'svg' | 'png') { graphRef.current?.downloadImage(f); setExportOpen(false); }

  function goNew() {
    setOntologyId(null); setSessionId(null); setOntologyName(''); setOntologyIndustry('');
    setConcepts([]); setRelationships([]); setImportedConcepts([]); setImportedRelationships([]);
    setCandidates([]); setMessages([]); setSelected(null); setBottomTab('guide');
    window.history.replaceState(null, '', '/v3');
  }

  async function send() {
    if (!input.trim() || !sessionId || sending) return;
    const content = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', content }]);
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/turns`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${data.error || 'Extraction failed.'}` }]);
      } else {
        const n = (data.newCandidates || []).length;
        const base = (data.reply && data.reply.trim())
          ? data.reply.trim()
          : (n > 0 ? `Proposed ${n} new element${n === 1 ? '' : 's'} — review them in Staging.` : `Nothing new to extract from that. Keep going.`);
        const suffix = n > 0 ? `\n\n↳ ${n} draft${n === 1 ? '' : 's'} added to the canvas — confirm to keep.` : '';
        setMessages((m) => [...m, { role: 'assistant', content: base + suffix }]);
        await loadCandidates(sessionId);
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠ ${e.message || 'Request failed.'}` }]);
    } finally {
      setSending(false);
    }
  }

  function setBusy(id: string, on: boolean) {
    setBusyIds((prev) => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n; });
  }

  async function onToggle(candidate: StagingCandidate, nextChecked: boolean) {
    setBusy(candidate.id, true);
    try {
      if (nextChecked) {
        const res = await fetch(`/api/candidates/${candidate.id}/promote`, { method: 'POST' });
        const data = await res.json();
        if (!data.ok) { alert(data.error || 'Could not check in this element.'); }
      } else {
        let res = await fetch(`/api/candidates/${candidate.id}/demote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        let data = await res.json();
        if (data.ok && data.warning) {
          if (!confirm(data.warning.reason)) { setBusy(candidate.id, false); return; }
          res = await fetch(`/api/candidates/${candidate.id}/demote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ force: true }) });
          data = await res.json();
        }
        if (!data.ok) alert(data.error || 'Could not remove this element.');
        if (selected && (selected.id === candidate.promotedConceptId || selected.id === candidate.promotedRelationshipId)) setSelected(null);
      }
      await refreshAll();
    } finally {
      setBusy(candidate.id, false);
    }
  }

  function onSelect(sel: { kind: 'concept' | 'relationship'; id: string }) {
    setSelected(sel);
    setBottomTab('edit');
  }

  const selectedConcept = selected?.kind === 'concept' ? liveConcepts.find((c) => c.id === selected.id) || null : null;
  const selectedRelationship = selected?.kind === 'relationship' ? relationships.find((r) => r.id === selected.id) || null : null;

  const canvasConcepts = useMemo(() => [
    ...liveConcepts.map((c) => ({ id: c.id, label: c.label, conceptType: c.conceptType, imported: false, justification: c.businessJustification })),
    ...importedLive.map((c) => ({ id: c.id, label: c.label, conceptType: c.conceptType, imported: true, justification: c.businessJustification })),
    ...draftConcepts.map((c) => ({ id: c.id, label: c.label, conceptType: c.candidateType, draft: true, justification: (c.payload as any)?.businessJustification })),
  ], [liveConcepts, importedLive, draftConcepts]);
  const canvasRelationships = useMemo(() => [
    ...relationships.map((r) => ({ id: r.id, name: r.name, sourceId: r.sourceId, targetId: r.targetId, justification: r.businessJustification })),
    ...importedRelationships.map((r) => ({ id: r.id, name: r.name, sourceId: r.sourceId, targetId: r.targetId, justification: r.businessJustification })),
    ...draftEdges,
  ], [relationships, importedRelationships, draftEdges]);

  if (!ontologyId || !sessionId) {
    return <CreateWizard onCreated={onCreated} onOpen={(oid, sid, name) => openExisting(oid, sid, name)} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-main)' }}>
      {/* LEFT SIDEBAR */}
      <div style={{ width: 380, minWidth: 380, borderRight: '1px solid var(--border-translucent)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-translucent)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} color="var(--color-primary)" />
          <span style={{ fontSize: 13, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ontologyName || 'Ontology'}</span>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setExportOpen((o) => !o)} title="Download the ontology"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, background: 'none', border: '1px solid var(--border-translucent)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              <Download size={13} /> Export
            </button>
            {exportOpen && (
              <>
                <div onClick={() => setExportOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                <div style={{ position: 'absolute', top: '112%', right: 0, zIndex: 31, background: 'var(--bg-card)', border: '1px solid var(--border-translucent)', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.14)', padding: 6, minWidth: 190 }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', padding: '2px 10px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Image</div>
                  <button onClick={() => downloadImage('png')} style={menuItemStyle}>PNG image</button>
                  <button onClick={() => downloadImage('svg')} style={menuItemStyle}>SVG image</button>
                  <div style={{ height: 1, background: 'var(--border-translucent)', margin: '4px 6px' }} />
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', padding: '2px 10px', textTransform: 'uppercase', letterSpacing: 0.4 }}>Semantic (RDF)</div>
                  <button onClick={() => downloadSemantic('turtle')} style={menuItemStyle}>Turtle (.ttl)</button>
                  <button onClick={() => downloadSemantic('owl')} style={menuItemStyle}>RDF / OWL (.owl)</button>
                  <button onClick={() => downloadSemantic('jsonld')} style={menuItemStyle}>JSON-LD</button>
                </div>
              </>
            )}
          </div>
          <button onClick={goNew} title="Back to home (your work is saved)"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, background: 'none', border: '1px solid var(--border-translucent)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            <Home size={13} /> Home
          </button>
        </div>

        {/* TOP HALF: chat */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border-translucent)' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '8px 11px', borderRadius: 12, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'var(--color-primary)' : 'var(--bg-main)', color: m.role === 'user' ? '#fff' : 'var(--color-text-main)', border: m.role === 'user' ? 'none' : '1px solid var(--border-translucent)' }}>
                {m.content}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: 10, display: 'flex', gap: 8 }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Describe what to model…" disabled={sending}
              style={{ flex: 1, padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border-translucent)', background: 'var(--bg-input)', fontSize: 13, fontFamily: 'var(--font-family)' }} />
            <button onClick={send} disabled={sending || !input.trim()}
              style={{ width: 38, borderRadius: 10, border: 'none', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sending ? 'default' : 'pointer', opacity: sending || !input.trim() ? 0.6 : 1 }}>
              {sending ? <Loader size={16} className="spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>

        {/* BOTTOM HALF: tabs */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-translucent)' }}>
            {([['guide', 'Guide', BookOpen], ['staging', 'Staging', Layers], ['edit', 'Edit', Pencil]] as const).map(([key, label, Icon]) => (
              <button key={key} onClick={() => setBottomTab(key)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '10px 6px', fontSize: 12.5, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer',
                  color: bottomTab === key ? 'var(--color-primary)' : 'var(--color-text-muted)', borderBottom: bottomTab === key ? '2px solid var(--color-primary)' : '2px solid transparent' }}>
                <Icon size={14} /> {label}
                {key === 'staging' && pendingCandidates.length > 0 && <span style={{ fontSize: 10, background: 'var(--color-primary-glow)', color: 'var(--color-primary)', borderRadius: 8, padding: '1px 6px' }}>{pendingCandidates.length}</span>}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            {bottomTab === 'guide' && <ConceptGuide industry={ontologyIndustry} />}
            {bottomTab === 'staging' && (
              <StagingTab candidates={pendingCandidates} liveConceptLabels={referenceableLabels} busyIds={busyIds} onToggle={onToggle} />
            )}
            {bottomTab === 'edit' && (selected ? (
              <EditTab selected={selected} concept={selectedConcept} relationship={selectedRelationship}
                onSaved={refreshAll} onDeleted={() => { setSelected(null); refreshAll(); }} />
            ) : (
              <AddElement ontologyId={ontologyId} concepts={liveConcepts.map((c) => ({ id: c.id, label: c.label }))} onCreated={refreshAll} />
            ))}
          </div>
        </div>
      </div>

      {/* CENTER CANVAS */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        {pendingCandidates.length > 0 && (
          <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 6, display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px 7px 14px', background: 'var(--bg-card)', border: '1px solid #f59e0b', borderRadius: 10, boxShadow: '0 4px 16px rgba(15,23,42,0.12)' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#b45309' }}>{pendingCandidates.length} draft{pendingCandidates.length === 1 ? '' : 's'} from the conversation</span>
            <button onClick={confirmAllDrafts} style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 7, border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer' }}>Confirm all</button>
            <button onClick={dismissAllDrafts} style={{ fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border-translucent)', background: 'var(--bg-input)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Dismiss</button>
          </div>
        )}
        <GraphCanvas ref={graphRef} concepts={canvasConcepts} relationships={canvasRelationships} selected={selected} onSelect={onSelect} onConfirmDraft={confirmDraft} />
      </div>
    </div>
  );
}
