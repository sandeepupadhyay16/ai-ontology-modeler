'use client';

import React from 'react';
import { CheckCircle2, Loader2, Sparkles, AlertTriangle } from 'lucide-react';

export interface AgentStage {
  stage: number;
  name: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  durationMs?: number;
}

interface AgentStepperProps {
  stages: AgentStage[];
  activeStage?: number;
  isExecuting?: boolean;
}

export const DEFAULT_STAGES: AgentStage[] = [
  { stage: 1, name: '1. Intent Parser', status: 'PENDING' },
  { stage: 2, name: '2. Domain SME', status: 'PENDING' },
  { stage: 3, name: '3. Process Modeler', status: 'PENDING' },
  { stage: 4, name: '4. Quality Validator', status: 'PENDING' },
  { stage: 5, name: '5. UI Renderer', status: 'PENDING' },
];

export default function AgentStepper({ stages, activeStage, isExecuting }: AgentStepperProps) {
  const currentStages = stages && stages.length > 0 ? stages : DEFAULT_STAGES;

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '4px 10px',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
        <Sparkles style={{ width: '13px', height: '13px', color: '#2563eb' }} />
        <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#334155', whiteSpace: 'nowrap' }}>
          Agent Pipeline:
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
        {currentStages.map((s, idx) => {
          const isDone = s.status === 'COMPLETED';
          const isRunning = s.status === 'RUNNING' || (isExecuting && s.stage === activeStage);
          const isFailed = s.status === 'FAILED';

          let bg = '#f8fafc';
          let border = '#e2e8f0';
          let textColor = '#64748b';

          if (isDone) {
            bg = '#f0fdf4';
            border = '#bbf7d0';
            textColor = '#15803d';
          } else if (isRunning) {
            bg = '#dbeafe';
            border = '#2563eb';
            textColor = '#1e40af';
          } else if (isFailed) {
            bg = '#fef2f2';
            border = '#fca5a5';
            textColor = '#b91c1c';
          }

          return (
            <React.Fragment key={s.stage}>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: isRunning ? `1.5px solid ${border}` : `1px solid ${border}`,
                  background: bg,
                  boxShadow: isRunning ? '0 0 8px rgba(37,99,235,0.3)' : 'none',
                  transition: 'all 0.15s ease',
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {isDone ? (
                    <CheckCircle2 style={{ width: '13px', height: '13px', color: '#16a34a' }} />
                  ) : isRunning ? (
                    <Loader2 style={{ width: '13px', height: '13px', color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                  ) : isFailed ? (
                    <AlertTriangle style={{ width: '13px', height: '13px', color: '#dc2626' }} />
                  ) : (
                    <span style={{ fontSize: '10px', fontWeight: '800', color: '#94a3b8' }}>{s.stage}</span>
                  )}
                </div>

                <span style={{ fontSize: '10px', fontWeight: '700', color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.name}
                </span>

                {(s.durationMs || isRunning) && (
                  <span style={{ fontSize: '9px', fontWeight: '600', color: isRunning ? '#2563eb' : '#94a3b8', marginLeft: 'auto', flexShrink: 0 }}>
                    {s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : isRunning ? 'active' : ''}
                  </span>
                )}
              </div>

              {idx < currentStages.length - 1 && (
                <div style={{ width: '8px', height: '1px', background: '#cbd5e1', flexShrink: 0 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {isExecuting && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            fontWeight: '700',
            color: '#2563eb',
            background: '#eff6ff',
            padding: '2px 8px',
            borderRadius: '12px',
            border: '1px solid #bfdbfe',
            flexShrink: 0,
          }}
        >
          <Loader2 style={{ width: '11px', height: '11px', animation: 'spin 1s linear infinite' }} />
          Running
        </span>
      )}
    </div>
  );
}
