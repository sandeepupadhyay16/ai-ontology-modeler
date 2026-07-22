'use client';

import React from 'react';
import { ShieldCheck, AlertCircle, Wrench, FileQuestion, Sparkles } from 'lucide-react';
import { OntologyQualityReport } from '@/lib/qualityEvaluator';

interface QualityScoreCardProps {
  report?: OntologyQualityReport | null;
  onAutoFix?: () => void;
  isFixing?: boolean;
}

export default function QualityScoreCard({ report, onAutoFix, isFixing }: QualityScoreCardProps) {
  if (!report) {
    return (
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '12px 16px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
          fontSize: '12px',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <ShieldCheck style={{ width: '18px', height: '18px', color: '#2563eb' }} />
        <span>Semantic Quality Health: Run Agentic Pipeline to analyze score.</span>
      </div>
    );
  }

  const { healthScore, cqCoveragePercent, orphanConceptCount, issues = [] } = report;

  let scoreBg = '#f0fdf4';
  let scoreBorder = '#bbf7d0';
  let scoreColor = '#15803d';

  if (healthScore < 75) {
    scoreBg = '#fef2f2';
    scoreBorder = '#fca5a5';
    scoreColor = '#b91c1c';
  } else if (healthScore < 90) {
    scoreBg = '#fffbeb';
    scoreBorder = '#fde68a';
    scoreColor = '#b45309';
  }

  const hasFixableIssues = issues.some((i) => i.autoFixable) || orphanConceptCount > 0;

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '16px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck style={{ width: '18px', height: '18px', color: '#2563eb' }} />
          <h3 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#0f172a' }}>
            Ontology Quality Score Card
          </h3>
        </div>
        <div
          style={{
            padding: '4px 10px',
            borderRadius: '20px',
            background: scoreBg,
            border: `1px solid ${scoreBorder}`,
            color: scoreColor,
            fontWeight: '800',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>{healthScore}%</span>
          <span style={{ fontSize: '10px', fontWeight: '600', opacity: 0.85 }}>Health</span>
        </div>
      </div>

      {/* Metric Breakdown Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: '700' }}>
            <FileQuestion style={{ width: '12px', height: '12px', color: '#0284c7' }} />
            CQ Coverage
          </div>
          <div style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>{cqCoveragePercent}%</div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: '700' }}>
            <AlertCircle style={{ width: '12px', height: '12px', color: '#d97706' }} />
            Orphans
          </div>
          <div style={{ fontSize: '16px', fontWeight: '800', color: orphanConceptCount > 0 ? '#d97706' : '#16a34a' }}>
            {orphanConceptCount}
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontWeight: '700' }}>
            <Sparkles style={{ width: '12px', height: '12px', color: '#7c3aed' }} />
            Issues
          </div>
          <div style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>{issues.length}</div>
        </div>
      </div>

      {/* Issues List */}
      {issues.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {issues.map((issue, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: '8px 10px',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#334155',
              }}
            >
              <AlertCircle
                style={{
                  width: '14px',
                  height: '14px',
                  flexShrink: 0,
                  marginTop: '1px',
                  color: issue.severity === 'HIGH' ? '#dc2626' : issue.severity === 'MEDIUM' ? '#d97706' : '#2563eb',
                }}
              />
              <span style={{ flex: 1, lineHeight: '1.4' }}>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Auto-Fix Remediation Button */}
      {hasFixableIssues && onAutoFix && (
        <button
          onClick={onAutoFix}
          disabled={isFixing}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#ffffff',
            fontWeight: '800',
            fontSize: '12px',
            padding: '10px 16px',
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Wrench style={{ width: '14px', height: '14px' }} />
          {isFixing ? 'Applying 1-Click Remediation...' : 'Auto-Fix Remediation (1-Click)'}
        </button>
      )}
    </div>
  );
}
