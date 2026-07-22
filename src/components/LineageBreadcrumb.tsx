'use client';

import React, { useState } from 'react';
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
}

export default function LineageBreadcrumb({ lineage, qualityReport, onSelectNode, compact = false }: LineageBreadcrumbProps) {
  const [showIssuesPopover, setShowIssuesPopover] = useState(false);

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
          onClick={() => setShowIssuesPopover(!showIssuesPopover)}
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
            onClick={() => setShowIssuesPopover(!showIssuesPopover)}
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

        {/* Popover detailed issues list */}
        {showIssuesPopover && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: '12px',
              marginTop: '6px',
              width: '320px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '14px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15)',
              zIndex: 100,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
              <div style={{ fontSize: '12px', fontWeight: '800', color: '#0f172a' }}>Quality Scorecard Details</div>
              <button
                onClick={() => setShowIssuesPopover(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ fontSize: '11px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div><strong>Health Score:</strong> {healthScore}%</div>
              <div><strong>CQ Coverage:</strong> {cqCoverage}%</div>
              <div><strong>Orphan Concepts:</strong> {orphanCount}</div>
              {issues.length > 0 && (
                <div style={{ marginTop: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                  <strong style={{ color: '#b91c1c' }}>Active Quality Issues:</strong>
                  <ul style={{ paddingLeft: '16px', marginTop: '4px', margin: 0 }}>
                    {issues.map((iss, i) => (
                      <li key={i} style={{ fontSize: '10px', color: '#b91c1c', marginBottom: '3px' }}>
                        {iss.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
