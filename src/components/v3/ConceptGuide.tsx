'use client';

import React from 'react';

/**
 * V3 bottom-sidebar "Guide" tab — explains the concept-type model IN CONTEXT of the selected
 * industry (pharma/Kite for now, with a generic fallback). Every node on the canvas is a class;
 * each class is filed under one of these five categories, which map 1:1 to the upper ontology.
 */

interface ConceptGuideProps {
  industry: string;
}

const TYPE_COLORS: Record<string, string> = {
  Entity: '#3b82f6',
  Agent: '#8b5cf6',
  Process: '#f59e0b',
  Event: '#ef4444',
  Metric: '#10b981',
};

interface TypeRow { type: string; blurb: string; examples: string[]; }

const PHARMA: TypeRow[] = [
  { type: 'Entity', blurb: 'A thing or record.', examples: ['Drug', 'Batch', 'ClinicalTrial'] },
  { type: 'Agent', blurb: 'An actor — a person, org, or site.', examples: ['Patient', 'Prescriber', 'Regulator'] },
  { type: 'Process', blurb: 'A workflow that unfolds over time.', examples: ['Manufacturing', 'QCRelease', 'Distribution'] },
  { type: 'Event', blurb: 'A timed occurrence.', examples: ['DoseAdministration', 'AdverseEvent'] },
  { type: 'Metric', blurb: 'A measurable property.', examples: ['AdherenceRate', 'CoverageRate'] },
];

const GENERIC: TypeRow[] = [
  { type: 'Entity', blurb: 'A thing or record.', examples: ['Order', 'Product', 'Document'] },
  { type: 'Agent', blurb: 'An actor — a person, org, or system.', examples: ['Customer', 'Supplier', 'Regulator'] },
  { type: 'Process', blurb: 'A workflow that unfolds over time.', examples: ['Onboarding', 'Fulfillment'] },
  { type: 'Event', blurb: 'A timed occurrence.', examples: ['OrderPlaced', 'ShipmentReceived'] },
  { type: 'Metric', blurb: 'A measurable property.', examples: ['CycleTime', 'ConversionRate'] },
];

export default function ConceptGuide({ industry }: ConceptGuideProps) {
  const isPharma = /pharma|therapy|cell|gene|bio|life scienc|kite|car-?t/i.test(industry || '');
  const rows = isPharma ? PHARMA : GENERIC;

  return (
    <div style={{ padding: '12px 14px', overflowY: 'auto', height: '100%' }}>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 14 }}>
        Every node is a <strong style={{ color: 'var(--color-text-main)' }}>class</strong> — a category of things in your
        domain (not a single record). Each class is filed under one of these five types
        {isPharma ? ', shown here with pharma examples' : ''}:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => (
          <div key={r.type} style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border-translucent)', background: 'var(--bg-input)' }}>
            <div style={{ width: 6, borderRadius: 3, background: TYPE_COLORS[r.type], flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: TYPE_COLORS[r.type] }}>{r.type}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{r.blurb}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-main)', marginTop: 3 }}>
                {r.examples.join(' · ')}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5, borderTop: '1px solid var(--border-translucent)', paddingTop: 12 }}>
        Classes are joined by <strong style={{ color: 'var(--color-text-main)' }}>relationships</strong> (the labelled
        edges, e.g. <em>undergoes</em>, <em>triggers</em>) and described by <strong style={{ color: 'var(--color-text-main)' }}>attributes</strong> (literal
        fields like <em>batchId</em>). Under the hood: classes → OWL classes, relationships → object properties, attributes → datatype properties.
      </div>
    </div>
  );
}
