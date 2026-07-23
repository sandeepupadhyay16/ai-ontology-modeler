import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Factory, Sparkles, Layers, Lightbulb, ShieldCheck, ChevronRight, AlertCircle, FileQuestion, HelpCircle } from 'lucide-react';
import { OntologyQualityReport } from '@/lib/qualityEvaluator';

export interface LineageData {
  organization?: { id?: string; name: string; industry?: string };
  businessFunction?: { id?: string; name: string };
  aiMission?: string;
  businessProcess?: { id?: string; name: string };
  solution?: { id?: string; name: string };
  ontology?: { id?: string; name: string; healthScore?: number };
}

interface LineageBreadcrumbProps {
  lineage: LineageData;
  qualityReport?: OntologyQualityReport | null;
  onSelectNode?: (type: 'ORG' | 'FUNC' | 'MISSION' | 'PROCESS' | 'SOLUTION' | 'ONTOLOGY', data: any) => void;
  compact?: boolean;
  onQualityModalChange?: (isOpen: boolean) => void;
}

export default function LineageBreadcrumb({ lineage, qualityReport, onSelectNode, compact = false, onQualityModalChange }: LineageBreadcrumbProps) {
  const [showIssuesPopover, setShowIssuesPopover] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleModal = (val: boolean) => {
    setShowIssuesPopover(val);
    if (onQualityModalChange) onQualityModalChange(val);
  };

  const {
    organization,
    businessFunction,
    aiMission,
    businessProcess,
    solution,
    ontology,
  } = lineage;

  const healthScore = qualityReport ? qualityReport.healthScore : (ontology?.healthScore ?? 100);
  const cqCoverage = qualityReport ? qualityReport.cqCoveragePercent : 0;
  const orphanCount = qualityReport ? qualityReport.orphanConceptCount : 0;
  const issues = qualityReport?.issues || [];

  let healthBg = '#f0fdf4';
  let healthBorder = '#bbf7d0';
  let healthColor = '#15803d';

  if (healthScore < 75) {
    healthBg = '#fef2f2';
    healthBorder = '#fca5a5';
    healthColor = '#b91c1c';
  } else if (healthScore < 90) {
    healthBg = '#fffbeb';
    healthBorder = '#fde68a';
    healthColor = '#b45309';
  }

  const items = [
    {
      type: 'ORG' as const,
      label: organization?.name || 'Organization',
      subtext: organization?.industry || 'Enterprise',
      icon: Building2,
      active: !!organization?.name,
      bg: '#e0f2fe',
      border: '#bae6fd',
      color: '#0369a1',
      data: organization,
    },
    {
      type: 'FUNC' as const,
      label: businessFunction?.name || 'Business Function',
      icon: Factory,
      active: !!businessFunction?.name,
      bg: '#f3e8ff',
      border: '#e9d5ff',
      color: '#6d28d9',
      data: businessFunction,
    },
    {
      type: 'MISSION' as const,
      label: aiMission || 'AI Mission / Objective',
      icon: Sparkles,
      active: !!aiMission,
      bg: '#fef3c7',
      border: '#fde68a',
      color: '#b45309',
      data: aiMission,
    },
    {
      type: 'PROCESS' as const,
      label: businessProcess?.name || 'Business Process',
      icon: Layers,
      active: !!businessProcess?.name,
      bg: '#d1fae5',
      border: '#a7f3d0',
      color: '#047857',
      data: businessProcess,
    },
    {
      type: 'SOLUTION' as const,
      label: solution?.name || 'Business Solution',
      icon: Lightbulb,
      active: !!solution?.name,
      bg: '#dbeafe',
      border: '#bfdbfe',
      color: '#1d4ed8',
      data: solution,
    },
    {
      type: 'ONTOLOGY' as const,
      label: ontology?.name || 'Domain Ontology',
      subtext: `${healthScore}% Health`,
      icon: ShieldCheck,
      active: !!ontology?.name,
      bg: '#cffafe',
      border: '#a5f3fc',
      color: '#0e7490',
      data: ontology,
    },
  ];

  return (
    <div
      style={{
        width: '100%',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: compact ? '6px 12px' : '10px 16px',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        gap: '8px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        position: 'relative',
      }}
    >
      {/* Lineage Node Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#64748b',
            whiteSpace: 'nowrap',
            marginRight: '4px',
            flexShrink: 0,
          }}
        >
          <span>🔗 Lineage:</span>
        </div>

        {items.map((item, idx) => {
          const Icon = item.icon;
          return (
            <React.Fragment key={item.type}>
              <div
                onClick={() => item.active && onSelectNode && onSelectNode(item.type, item.data)}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '6px',
                  padding: compact ? '4px 8px' : '6px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${item.active ? item.border : '#e2e8f0'}`,
                  background: item.active ? item.bg : '#f8fafc',
                  color: item.active ? item.color : '#94a3b8',
                  cursor: item.active ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon style={{ width: '13px', height: '13px', flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                  <span style={{ fontSize: compact ? '11px' : '12px', fontWeight: '700', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                  {item.subtext && (
                    <span style={{ fontSize: '9px', opacity: 0.85, fontWeight: '700' }}>
                      {item.subtext}
                    </span>
                  )}
                </div>
              </div>

              {idx < items.length - 1 && (
                <ChevronRight
                  style={{
                    width: '13px',
                    height: '13px',
                    color: '#cbd5e1',
                    flexShrink: 0,
                    margin: '0 1px',
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Integrated Merged Quality Scorecard Summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, borderLeft: '1px solid #e2e8f0', paddingLeft: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', color: '#64748b', whiteSpace: 'nowrap' }}>
          Quality Scorecard:
        </div>

        {/* Health Score Pill */}
        <div
          onClick={() => toggleModal(!showIssuesPopover)}
          style={{
            padding: '3px 10px',
            borderRadius: '16px',
            background: healthBg,
            border: `1px solid ${healthBorder}`,
            color: healthColor,
            fontWeight: '800',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
          title="Click to view quality metrics breakdown"
        >
          <ShieldCheck size={13} />
          <span>{healthScore}% Health</span>
        </div>

        {/* CQ Coverage Pill */}
        <div
          style={{
            padding: '3px 9px',
            borderRadius: '16px',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            color: '#334155',
            fontWeight: '700',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <FileQuestion size={12} style={{ color: '#0284c7' }} />
          <span>{cqCoverage}% CQ</span>
        </div>

        {/* Orphans Count Pill */}
        <div
          style={{
            padding: '3px 9px',
            borderRadius: '16px',
            background: orphanCount > 0 ? '#fffbeb' : '#f1f5f9',
            border: `1px solid ${orphanCount > 0 ? '#fde68a' : '#cbd5e1'}`,
            color: orphanCount > 0 ? '#b45309' : '#334155',
            fontWeight: '700',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>{orphanCount} Orphans</span>
        </div>

        {/* Issues Pill */}
        {issues.length > 0 && (
          <div
            onClick={() => toggleModal(!showIssuesPopover)}
            style={{
              padding: '3px 9px',
              borderRadius: '16px',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              color: '#b91c1c',
              fontWeight: '700',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
            }}
          >
            <AlertCircle size={12} />
            <span>{issues.length} Issues</span>
          </div>
        )}

        {/* Floating Modal Detailed Quality Scorecard Window */}
        {showIssuesPopover && mounted && createPortal(
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 999999,
            }}
            onClick={() => toggleModal(false)}
          >
            <div
              style={{
                width: '540px',
                maxWidth: '92vw',
                maxHeight: '85vh',
                background: '#ffffff',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                border: '1px solid #cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
                zIndex: 1000000,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '16px 20px',
                  background: '#ffffff',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShieldCheck size={20} style={{ color: '#2563eb' }} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>
                    Quality Scorecard Details
                  </h3>
                </div>
                <button
                  onClick={() => toggleModal(false)}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#475569',
                    fontWeight: '800',
                    fontSize: '14px',
                    transition: 'background 0.15s ease',
                  }}
                  title="Close Quality Scorecard"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', background: '#ffffff' }}>
                {/* Metrics Grid Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div style={{ background: healthBg, border: `1px solid ${healthBorder}`, padding: '14px 10px', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: healthColor }}>Health Score</div>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: healthColor, marginTop: '4px' }}>{healthScore}%</div>
                  </div>
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '14px 10px', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0369a1' }}>CQ Coverage</div>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: '#0369a1', marginTop: '4px' }}>{cqCoverage}%</div>
                  </div>
                  <div style={{ background: orphanCount > 0 ? '#fffbeb' : '#f8fafc', border: `1px solid ${orphanCount > 0 ? '#fde68a' : '#e2e8f0'}`, padding: '14px 10px', borderRadius: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: orphanCount > 0 ? '#b45309' : '#475569' }}>Orphan Nodes</div>
                    <div style={{ fontSize: '24px', fontWeight: '900', color: orphanCount > 0 ? '#b45309' : '#334155', marginTop: '4px' }}>{orphanCount}</div>
                  </div>
                </div>

                {/* Active Issues Section */}
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={15} style={{ color: issues.length > 0 ? '#dc2626' : '#16a34a' }} />
                    Active Quality Findings ({issues.length})
                  </h4>
                  {issues.length === 0 ? (
                    <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', color: '#166534', fontSize: '12px', fontWeight: '700', textAlign: 'center' }}>
                      🎉 Outstanding! Zero quality issues detected in this ontology model.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {issues.map((iss, i) => (
                        <div key={i} style={{ padding: '12px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '10px', fontWeight: '800', background: '#dc2626', color: '#ffffff', padding: '3px 8px', borderRadius: '4px' }}>
                              {iss.severity} SEVERITY
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: '800', color: '#991b1b' }}>{iss.code}</span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#991b1b', fontWeight: '600', lineHeight: '1.4' }}>
                            {iss.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '14px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowIssuesPopover(false)}
                  style={{
                    padding: '8px 20px',
                    fontSize: '12px',
                    fontWeight: '800',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(37,99,235,0.25)',
                  }}
                >
                  Close Window
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}
