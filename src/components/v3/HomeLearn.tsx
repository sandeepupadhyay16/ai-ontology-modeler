'use client';

import React from 'react';
import { Sparkles, Network, Target, ScrollText, BookOpen } from 'lucide-react';

/**
 * Homepage "Learn" tab — explains the tool's purpose and the core vocabulary (ontology, concept
 * types, missions, business rules, key terms) for someone opening it for the first time.
 */

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border-translucent)', borderRadius: 14, padding: '18px 20px', marginBottom: 14 };
const h: React.CSSProperties = { fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 };
const p: React.CSSProperties = { fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6 };
const strong = (t: string) => <strong style={{ color: 'var(--color-text-main)' }}>{t}</strong>;

const TERMS: [string, string][] = [
  ['Class', 'A category of things in your domain (a node). e.g. PatientBatch, Payer.'],
  ['Relationship', 'A labelled link between two classes (an edge). e.g. produces, triggers.'],
  ['Attribute', 'A literal property of a class. e.g. batchId, grade.'],
  ['Concept type', 'The category a class falls under: Entity, Agent, Process, Event, or Metric.'],
  ['Mission', 'The purpose an ontology is built for — it focuses what you model.'],
  ['Business rule', 'A policy or constraint that governs the domain (e.g. “QC release before reinfusion”).'],
  ['Extension / import', 'A function-specific ontology that imports a shared core and adds to it.'],
  ['Staging', 'The review inbox where the assistant’s proposals wait for your yes.'],
];

export default function HomeLearn() {
  return (
    <div style={{ width: '100%', maxWidth: 640 }}>
      <div style={card}>
        <div style={h}><Sparkles size={17} color="var(--color-primary)" /> What this tool does</div>
        <p style={p}>
          It helps you build a shared, business-readable <strong style={{ color: 'var(--color-text-main)' }}>model of how your
          domain works</strong> — an <em>ontology</em>. You describe your world by talking to an assistant or editing directly,
          and it becomes a living map your whole organization can reuse.
        </p>
      </div>

      <div style={card}>
        <div style={h}><Network size={16} color="#3b82f6" /> What&apos;s an ontology?</div>
        <p style={p}>
          A network of {strong('classes')} (categories of things), joined by {strong('relationships')} (how they connect) and
          described by {strong('attributes')} (their properties). Every class is filed under one of five {strong('concept types')} —
          <span style={{ color: 'var(--color-text-main)' }}> Entity, Agent, Process, Event, Metric</span> — which keeps the model
          consistent and machine-readable (it exports to standard RDF/OWL).
        </p>
      </div>

      <div style={card}>
        <div style={h}><Target size={16} color="#f59e0b" /> Missions</div>
        <p style={p}>
          Each ontology is built for a {strong('mission')} — the goal it serves (e.g. “shorten vein-to-vein turnaround while
          keeping chain-of-identity compliance”). The mission focuses what&apos;s worth modeling. In a shared org model, each
          function (Commercial, Manufacturing, Safety…) can carry its own mission over the same core.
        </p>
      </div>

      <div style={card}>
        <div style={h}><ScrollText size={16} color="#ef4444" /> Business rules</div>
        <p style={p}>
          The policies and constraints that govern your domain — “a batch must pass QC release before reinfusion”, “flag any
          batch over 21 days”. The assistant {strong('proposes rules')} from your conversation; you confirm the ones that belong,
          and each rule points at the classes and relationships it governs.
        </p>
      </div>

      <div style={card}>
        <div style={h}><BookOpen size={16} color="#8b5cf6" /> Key terms</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {TERMS.map(([term, def]) => (
            <div key={term} style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700, color: 'var(--color-text-main)' }}>{term}</span>
              <span style={{ color: 'var(--color-text-muted)' }}> — {def}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
