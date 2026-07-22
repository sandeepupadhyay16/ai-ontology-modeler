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
        borderRadius: '12px',
        padding: '12px 16px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        marginBottom: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles style={{ width: '16px', height: '16px', color: '#2563eb' }} />
          <h3 style={{ fontSize: '12px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f172a' }}>
            5-Stage Agentic Quality Pipeline
          </h3>
        </div>
        {isExecuting && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontWeight: '700',
              color: '#2563eb',
              background: '#eff6ff',
              padding: '4px 10px',
              borderRadius: '20px',
              border: '1px solid #bfdbfe',
            }}
          >
            <Loader2 style={{ width: '13px', height: '13px', animation: 'spin 1s linear infinite' }} />
            Executing Agents...
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
        {currentStages.map((s) => {
          const isDone = s.status === 'COMPLETED';
          const isRunning = s.status === 'RUNNING' || (isExecuting && s.stage === activeStage);
          const isFailed = s.status === 'FAILED';

          let bg = '#f8fafc';
          let border = '#e2e8f0';
          let textColor = '#475569';

          if (isDone) {
            bg = '#f0fdf4';
            border = '#86efac';
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
            <div
              key={s.stage}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 6px',
                borderRadius: '8px',
                border: isRunning ? `2px solid ${border}` : `1px solid ${border}`,
                background: bg,
                textAlign: 'center',
                transition: 'all 0.2s ease',
                boxShadow: isRunning
                  ? '0 0 14px rgba(37,99,235,0.4), 0 2px 4px rgba(37,99,235,0.1)'
                  : isDone
                  ? '0 1px 2px rgba(22,163,74,0.08)'
                  : 'none',
                transform: isRunning ? 'scale(1.03)' : 'scale(1)',
              }}
            >
              <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isDone ? (
                  <CheckCircle2 style={{ width: '16px', height: '16px', color: '#16a34a' }} />
                ) : isRunning ? (
                  <Loader2 style={{ width: '16px', height: '16px', color: '#2563eb', animation: 'spin 1s linear infinite' }} />
                ) : isFailed ? (
                  <AlertTriangle style={{ width: '16px', height: '16px', color: '#dc2626' }} />
                ) : (
                  <div
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      border: '1px solid #cbd5e1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: '700',
                      color: '#94a3b8',
                    }}
                  >
                    {s.stage}
                  </div>
                )}
              </div>
              <span style={{ fontSize: '11px', fontWeight: '700', color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {s.name}
              </span>
              <span style={{ fontSize: '9px', fontWeight: '600', color: '#94a3b8', marginTop: '2px' }}>
                {s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : isDone ? 'Done' : isRunning ? 'Active' : 'Pending'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
