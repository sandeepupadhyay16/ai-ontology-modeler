'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Plus, Minus, Maximize2 } from 'lucide-react';

export interface GraphCanvasHandle { downloadImage: (format: 'svg' | 'png') => void; }

/**
 * V3 center canvas — interactive graph of the LIVE ontology.
 * - Dependency-free force-directed layout (repulsion + edge springs + centering) so nodes spread
 *   out instead of sitting on a rigid circle.
 * - Pan (drag background), zoom (wheel + buttons), and drag individual nodes to reposition.
 * - Directional arrowheads on edges; type-color legend.
 * - Imported (linked-base) concepts stay read-only (dashed, dimmed, not selectable).
 * Clicking a node/relationship (without dragging) selects it for the Edit tab.
 */

interface GraphConcept { id: string; label: string; conceptType: string; imported?: boolean; draft?: boolean; justification?: string | null; }
interface GraphRelationship { id: string; name: string; sourceId: string; targetId: string; draft?: boolean; justification?: string | null; }

interface GraphCanvasProps {
  concepts: GraphConcept[];
  relationships: GraphRelationship[];
  selected: { kind: 'concept' | 'relationship'; id: string } | null;
  onSelect: (sel: { kind: 'concept' | 'relationship'; id: string }) => void;
  /** Confirm a single draft (unconfirmed chat proposal) node — promotes that candidate. */
  onConfirmDraft?: (candidateId: string) => void;
}

const DRAFT_COLOR = '#f59e0b';

const TYPE_COLORS: Record<string, string> = {
  Entity: '#3b82f6', Agent: '#8b5cf6', Process: '#f59e0b', Event: '#ef4444', Metric: '#10b981',
  Persona: '#8b5cf6', Quality: '#10b981', Relation: '#64748b',
};
const LEGEND = ['Entity', 'Agent', 'Process', 'Event', 'Metric'];

const NODE_W = 132, NODE_H = 46, HW = NODE_W / 2, HH = NODE_H / 2;

type Pt = { x: number; y: number };

// Deterministic force-directed layout — runs a fixed number of cooling iterations. O(n²·iters),
// fine for the tens-of-nodes graphs V3 produces.
function computeLayout(concepts: GraphConcept[], edges: GraphRelationship[]): Record<string, Pt> {
  const n = concepts.length;
  const pos: Record<string, Pt> = {};
  const R = Math.max(160, 46 * Math.sqrt(n));
  concepts.forEach((c, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    pos[c.id] = n === 1 ? { x: 0, y: 0 } : { x: Math.cos(a) * R, y: Math.sin(a) * R };
  });
  if (n < 2) return pos;

  const ideal = 210, kRep = 62000, iters = 420;
  for (let it = 0; it < iters; it++) {
    const disp: Record<string, Pt> = {};
    for (const c of concepts) disp[c.id] = { x: 0, y: 0 };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = concepts[i].id, b = concepts[j].id;
        let dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
        let d2 = dx * dx + dy * dy || 0.01; const d = Math.sqrt(d2);
        const f = kRep / d2, ux = dx / d, uy = dy / d;
        disp[a].x += ux * f; disp[a].y += uy * f; disp[b].x -= ux * f; disp[b].y -= uy * f;
      }
    }
    for (const e of edges) {
      if (!pos[e.sourceId] || !pos[e.targetId] || e.sourceId === e.targetId) continue;
      let dx = pos[e.sourceId].x - pos[e.targetId].x, dy = pos[e.sourceId].y - pos[e.targetId].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01, f = (d - ideal) * 0.05, ux = dx / d, uy = dy / d;
      disp[e.sourceId].x -= ux * f; disp[e.sourceId].y -= uy * f;
      disp[e.targetId].x += ux * f; disp[e.targetId].y += uy * f;
    }
    const cool = 1 - it / iters;
    for (const c of concepts) {
      disp[c.id].x -= pos[c.id].x * 0.012; disp[c.id].y -= pos[c.id].y * 0.012;
      const dd = Math.hypot(disp[c.id].x, disp[c.id].y) || 0.01;
      const s = Math.min(dd, 34 * cool + 2) / dd;
      pos[c.id].x += disp[c.id].x * s; pos[c.id].y += disp[c.id].y * s;
    }
  }
  return pos;
}

// Point on a node's rectangle border, in the direction of `toward` — so arrows land on the edge.
function border(center: Pt, toward: Pt): Pt {
  const dx = toward.x - center.x, dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const sx = dx !== 0 ? HW / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? HH / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: center.x + dx * s, y: center.y + dy * s };
}

const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas({ concepts, relationships, selected, onSelect, onConfirmDraft }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const sig = useMemo(
    () => concepts.map((c) => c.id).join(',') + '|' + relationships.map((r) => r.sourceId + '>' + r.targetId).join(','),
    [concepts, relationships]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => computeLayout(concepts, relationships), [sig]);
  const [positions, setPositions] = useState<Record<string, Pt>>(layout);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 0.85 });
  const kRef = useRef(transform.k);
  useEffect(() => { kRef.current = transform.k; }, [transform.k]);

  // Interaction state kept in a ref so listeners always see the latest without re-binding.
  const drag = useRef<{ mode: 'none' | 'pan' | 'node'; id?: string; sx: number; sy: number; moved: boolean }>({ mode: 'none', sx: 0, sy: 0, moved: false });

  const fit = useCallback(() => {
    const el = containerRef.current; if (!el) return;
    setTransform({ x: el.clientWidth / 2, y: el.clientHeight / 2, k: 0.85 });
  }, []);

  // Reset positions + recenter when the graph changes.
  useEffect(() => { setPositions(layout); }, [layout]);
  useEffect(() => { fit(); }, [sig, fit]);

  // Native wheel listener so we can preventDefault (zoom toward cursor).
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setTransform((t) => {
        const k = Math.min(2.5, Math.max(0.25, t.k * (1 - e.deltaY * 0.0015)));
        const gx = (mx - t.x) / t.k, gy = (my - t.y) / t.k;
        return { k, x: mx - gx * k, y: my - gy * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  function onMouseDownBg(e: React.MouseEvent) {
    drag.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, moved: false };
  }
  function onMouseDownNode(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    drag.current = { mode: 'node', id, sx: e.clientX, sy: e.clientY, moved: false };
  }
  function onMouseMove(e: React.MouseEvent) {
    const d = drag.current; if (d.mode === 'none') return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    d.sx = e.clientX; d.sy = e.clientY;
    if (d.mode === 'pan') {
      setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
    } else if (d.mode === 'node' && d.id) {
      const k = kRef.current;
      setPositions((p) => ({ ...p, [d.id!]: { x: p[d.id!].x + dx / k, y: p[d.id!].y + dy / k } }));
    }
  }
  function endDrag() { drag.current.mode = 'none'; }

  // ---- image export (SVG / PNG) ----
  const downloadFile = (name: string, url: string) => {
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  // Build a standalone SVG of the WHOLE graph, fit to its content bounds (independent of the
  // current pan/zoom), with CSS-variable colors resolved to literals so it renders on its own.
  const buildSVGString = (): string | null => {
    const src = svgRef.current; if (!src) return null;
    const pts = concepts.map((c) => positions[c.id]).filter(Boolean) as Pt[];
    if (!pts.length) return null;
    const pad = 46;
    const minX = Math.min(...pts.map((p) => p.x)) - HW - pad;
    const minY = Math.min(...pts.map((p) => p.y)) - HH - pad;
    const w = Math.round(Math.max(...pts.map((p) => p.x)) + HW + pad - minX);
    const h = Math.round(Math.max(...pts.map((p) => p.y)) + HH + pad - minY);
    const clone = src.cloneNode(true) as SVGSVGElement;
    const content = clone.querySelector('#v3-content') as SVGGElement | null;
    if (content) content.setAttribute('transform', `translate(${-minX},${-minY})`);
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h)); clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0'); bg.setAttribute('width', String(w)); bg.setAttribute('height', String(h)); bg.setAttribute('fill', '#ffffff');
    if (content && content.parentNode) content.parentNode.insertBefore(bg, content);
    let str = new XMLSerializer().serializeToString(clone);
    str = str.replaceAll('var(--color-primary)', '#3b82f6').replaceAll('var(--color-text-main)', '#0f172a').replaceAll('var(--color-text-muted)', '#64748b');
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + str;
  };
  useImperativeHandle(ref, () => ({
    downloadImage(format) {
      const svgStr = buildSVGString(); if (!svgStr) return;
      if (format === 'svg') {
        downloadFile('ontology-graph.svg', URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml' })));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => { if (b) downloadFile('ontology-graph.png', URL.createObjectURL(b)); }, 'image/png');
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
    },
  }));

  if (concepts.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', flexDirection: 'column', gap: 10, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Nothing on the canvas yet</div>
        <div style={{ fontSize: 13, maxWidth: 360 }}>Pick an industry to seed a starter map, check items in from Staging, or talk to the assistant.</div>
      </div>
    );
  }

  return (
    <div ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg-main)', cursor: drag.current.mode === 'pan' ? 'grabbing' : 'default' }}
      onMouseDown={onMouseDownBg} onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
      <svg ref={svgRef} width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <marker id="v3arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
          <marker id="v3arrowSel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
          </marker>
        </defs>
        <g id="v3-content" transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {/* edges */}
          {relationships.map((r) => {
            const s = positions[r.sourceId], t = positions[r.targetId];
            if (!s || !t) return null;
            const a = border(s, t), b = border(t, s);
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            const isSel = selected?.kind === 'relationship' && selected.id === r.id;
            const draft = !!r.draft;
            const lineColor = draft ? DRAFT_COLOR : isSel ? 'var(--color-primary)' : '#cbd5e1';
            return (
              <g key={r.id} style={{ cursor: draft ? 'default' : 'pointer' }} onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); if (!draft && !drag.current.moved) onSelect({ kind: 'relationship', id: r.id }); }}>
                <title>{draft ? `${r.name} (draft — confirm to keep)` : r.justification ? `${r.name} — ${r.justification}` : r.name}</title>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={lineColor} strokeWidth={isSel ? 2.5 : 1.5}
                  strokeDasharray={draft ? '5 4' : undefined} markerEnd={`url(#${isSel ? 'v3arrowSel' : 'v3arrow'})`} />
                <rect x={mx - r.name.length * 3.4 - 8} y={my - 11} width={r.name.length * 6.8 + 16} height={22} rx={11}
                  fill={isSel ? 'var(--color-primary)' : draft ? '#fffbeb' : '#ffffff'} stroke={draft ? DRAFT_COLOR : isSel ? 'var(--color-primary)' : '#e2e8f0'} strokeDasharray={draft ? '3 2' : undefined} />
                <text x={mx} y={my + 4} textAnchor="middle" fontSize={11} fill={isSel ? '#fff' : draft ? '#b45309' : 'var(--color-text-muted)'} style={{ pointerEvents: 'none' }}>{r.name}</text>
              </g>
            );
          })}
          {/* nodes */}
          {concepts.map((c) => {
            const p = positions[c.id]; if (!p) return null;
            const color = TYPE_COLORS[c.conceptType] || 'var(--color-primary)';
            const isSel = selected?.kind === 'concept' && selected.id === c.id;
            const imported = !!c.imported;
            const draft = !!c.draft;
            const sub = draft ? 'draft — click ✓' : imported ? 'imported' : c.conceptType;
            return (
              <g key={c.id} style={{ cursor: draft ? 'pointer' : imported ? 'grab' : 'pointer' }}
                onMouseDown={(e) => onMouseDownNode(e, c.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (drag.current.moved) return;
                  if (draft) onConfirmDraft?.(c.id);
                  else if (!imported) onSelect({ kind: 'concept', id: c.id });
                }}>
                <title>{draft ? `${c.label} (draft) — click to confirm` : c.justification ? `${c.label} — ${c.justification}` : c.label}</title>
                <rect x={p.x - HW} y={p.y - HH} width={NODE_W} height={NODE_H} rx={10}
                  fill={draft ? '#fffbeb' : imported ? '#f8fafc' : '#fff'} stroke={draft ? DRAFT_COLOR : isSel ? color : imported ? '#cbd5e1' : '#e2e8f0'} strokeWidth={isSel ? 3 : draft ? 2 : 1.5}
                  strokeDasharray={draft ? '5 4' : imported ? '4 3' : undefined} style={{ filter: 'drop-shadow(0 1px 3px rgba(15,23,42,0.08))', opacity: imported ? 0.7 : 1 }} />
                <rect x={p.x - HW} y={p.y - HH} width={5} height={NODE_H} rx={2.5} fill={draft ? DRAFT_COLOR : color} style={{ opacity: imported ? 0.7 : 1 }} />
                <text x={p.x} y={p.y - 3} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-text-main)" style={{ pointerEvents: 'none' }}>
                  {c.label.length > 16 ? c.label.slice(0, 15) + '…' : c.label}
                </text>
                <text x={p.x} y={p.y + 11} textAnchor="middle" fontSize={10} fill={draft ? '#b45309' : 'var(--color-text-muted)'} style={{ pointerEvents: 'none' }}>
                  {sub}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* zoom controls */}
      <div style={{ position: 'absolute', bottom: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[[Plus, () => setTransform((t) => ({ ...t, k: Math.min(2.5, t.k * 1.2) })), 'Zoom in'],
          [Minus, () => setTransform((t) => ({ ...t, k: Math.max(0.25, t.k / 1.2) })), 'Zoom out'],
          [Maximize2, fit, 'Reset view']].map(([Icon, fn, title]: any, i) => (
          <button key={i} onClick={fn} title={title}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-translucent)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
            <Icon size={15} />
          </button>
        ))}
      </div>

      {/* legend */}
      <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', flexWrap: 'wrap', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border-translucent)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
        {LEGEND.map((t) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLORS[t] }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default GraphCanvas;
