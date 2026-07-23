'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Loader, Sparkles, Wand2, HelpCircle, CheckCircle, Undo2, Trash2, Wrench } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  ontologyId: string;
  concepts: any[];
  relationships: any[];
  cqs: any[];
  driverTrees: any[];
  perspectives: any[];
  causalCycles: any[];
  onGenerationComplete: () => Promise<void>;
  onGenerationStart?: () => (() => Promise<void>) | void;
  onAutoFix?: () => void;
  isFixing?: boolean;
}

export default function ChatPanel({ 
  ontologyId, 
  concepts, 
  relationships, 
  cqs, 
  driverTrees, 
  perspectives = [],
  causalCycles = [],
  onGenerationComplete,
  onGenerationStart,
  onAutoFix,
  isFixing = false,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [undoStack, setUndoStack] = useState<any[]>([]);

  // Guided Modeler Phase State
  const [activePhase, setActivePhase] = useState<number>(1);

  // Dynamic Suggestions & Probing State
  const [dynamicSuggestions, setDynamicSuggestions] = useState<any>(null);
  const [activeProbingQuestions, setActiveProbingQuestions] = useState<string[] | null>(null);
  const [probingAnswers, setProbingAnswers] = useState<Record<string, string>>({});
  const [originalPrompt, setOriginalPrompt] = useState('');

  // AI Conversational Mode: INTERACTIVE (Guided Interview Flow) vs DIRECT (Direct Execution)
  const [guidanceMode, setGuidanceMode] = useState<'DIRECT' | 'INTERACTIVE'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('tse_guidance_mode') as 'DIRECT' | 'INTERACTIVE') || 'INTERACTIVE';
    }
    return 'INTERACTIVE';
  });

  useEffect(() => {
    localStorage.setItem('tse_guidance_mode', guidanceMode);
  }, [guidanceMode]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const presetsByPhase: Record<number, string[]> = {
    1: [
      'Map out the core entities and process sequence workflow.',
      'Add a new Process step for cell quality control validation.',
      'Add a regulatory Auditor persona to oversee the clinical trial.'
    ],
    2: [
      'Suggest operational metrics and KPIs measured by this process.',
      'Identify key analytical metrics for cold-chain shipping performance.',
      'Add an OutofPocketCost metric and link it to the Patient entity.'
    ],
    3: [
      'Draft 3 core competency questions this ontology must be able to answer.',
      'Add a CQ: "What is the average batch failure rate during manufacturing?"'
    ],
    4: [
      'Generate causal correlation links (Driver Trees) connecting our metrics.',
      'Build a driver tree detailing how shipping delays affect cell viability.'
    ],
    5: [
      'Link registered business solutions and IT systems to our processes.',
      'Assign dual Business and IT owners to the CAR-T logistics solution.'
    ],
    6: ['Ground physical database tables/columns to our metrics.'],
    7: ['Export domain context pack blueprint.']
  };

  const setDefaultWelcomeMessage = () => {
    const welcome = `Welcome to the **Conversational Ontology Builder**!

Current Mode: **${guidanceMode === 'INTERACTIVE' ? '🎓 Guided Interview Flow' : '⚡ Direct Execution Mode'}**.

How can I help construct your domain graph today? You can choose a preset suggestion below, enter a command, or click **⚡ Enhance Prompt** to optimize your instructions before sending.`;

    setMessages([{ role: 'assistant', content: welcome }]);
  };

  useEffect(() => {
    const savedChat = localStorage.getItem(`tse_chat_history_${ontologyId}`);
    if (savedChat) {
      try {
        const parsed = JSON.parse(savedChat);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
    setDefaultWelcomeMessage();
  }, [ontologyId, guidanceMode]);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`tse_chat_history_${ontologyId}`, JSON.stringify(messages));
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, ontologyId]);

  const activeSuggestions = useMemo(() => {
    if (dynamicSuggestions?.nextSteps && dynamicSuggestions.nextSteps.length > 0) {
      return dynamicSuggestions.nextSteps;
    }
    return presetsByPhase[activePhase] || presetsByPhase[1];
  }, [dynamicSuggestions, activePhase]);

  // Smart Prompt Enhancer Handler
  const handleEnhancePrompt = () => {
    if (!input.trim() || loading) return;
    const raw = input.trim();
    const enhanced = `Build a domain-exhaustive semantic model for "${raw}". ` +
      `Identify core Personas, Entities with typed attributes (e.g. status, timestamp), ` +
      `Operational Processes, Events, Data Systems, and Key Metrics. ` +
      `Weave directional relationships (executes, produces, governedBy, monitors, calculates) connecting all concepts cleanly without orphan nodes, ` +
      `and formulate 3-5 mapped competency questions.`;
    setInput(enhanced);
  };

  const handleSend = async (userPromptText?: string, answersObject?: Record<string, string>) => {
    const textToSend = userPromptText || input.trim();
    if (!textToSend && !answersObject) return;

    let finalPrompt = textToSend;
    if (answersObject) {
      const formattedAnswers = Object.entries(answersObject)
        .map(([q, a]) => `Q: ${q}\nA: ${a}`)
        .join('\n');
      finalPrompt = `User clarified the following details for prompt "${originalPrompt}":\n${formattedAnswers}\n\nPlease update the ontology graph based on these details.`;
    }

    const newMessages: Message[] = [...messages, { role: 'user', content: answersObject ? 'Submitted domain clarifications.' : textToSend }];
    setMessages(newMessages);
    if (!answersObject) setInput('');
    setLoading(true);

    const finishStepper = onGenerationStart ? onGenerationStart() : null;

    try {
      const res = await fetch(`/api/ontologies/${ontologyId}/ai-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          guidanceMode,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update ontology graph');
      }

      const data = await res.json();
      setUndoStack((prev) => [...prev, { concepts, relationships, cqs }]);

      if (data.isVague && data.probingQuestions && data.probingQuestions.length > 0 && guidanceMode === 'INTERACTIVE') {
        setActiveProbingQuestions(data.probingQuestions);
        setOriginalPrompt(textToSend);
      } else {
        setActiveProbingQuestions(null);
        setProbingAnswers({});
        setOriginalPrompt('');
      }

      let botReply = '';
      if (typeof data.summary === 'string') {
        botReply = data.summary;
      } else if (typeof data.summary === 'object' && data.summary !== null) {
        const s = data.summary;
        botReply = `✨ **Ontology Model Updated!**\n\n- **Concepts Created**: ${s.conceptsCreated || 0}\n- **Relationships Created**: ${s.relationshipsCreated || 0}\n- **Competency Questions**: ${s.cqsCreated || 0}\n- **Persona Perspectives**: ${s.perspectivesCreated || 0}\n- **Causal Cycles**: ${s.causalCyclesCreated || 0}`;
      } else {
        botReply = 'Ontology graph successfully updated.';
      }

      if (data.createdConcepts?.length > 0) {
        botReply += `\n\n**Added Concepts (${data.createdConcepts.length})**: ${data.createdConcepts.map((c: any) => c.label).join(', ')}`;
      }

      setMessages([...newMessages, { role: 'assistant', content: botReply }]);
      await onGenerationComplete();
    } catch (e: any) {
      setMessages([...newMessages, { role: 'assistant', content: `⚠️ Error: ${e.message}` }]);
    } finally {
      setLoading(false);
      if (typeof finishStepper === 'function') {
        await finishStepper();
      }
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#ffffff', borderTop: '1px solid #e2e8f0' }}>
      {/* Header Bar: Operational Mode Selector */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles style={{ width: '16px', height: '16px', color: '#2563eb' }} />
          <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>AI Conversational Modeler</h3>
        </div>

        {/* Integrated Controls: Mode Switch & 1-Click Remediation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* 1-Click Remediation Action Button */}
          {onAutoFix && (
            <button
              type="button"
              onClick={onAutoFix}
              disabled={isFixing || loading}
              style={{
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: '800',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: isFixing ? '#94a3b8' : '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
                transition: 'all 0.15s ease',
              }}
              title="Run 1-Click Agentic Remediation to auto-connect orphan nodes and fix CQ coverage"
            >
              <Wrench style={{ width: '13px', height: '13px' }} />
              <span>{isFixing ? 'Fixing Ontology...' : '🛠️ Auto-Fix Remediation'}</span>
            </button>
          )}

          {/* Operational Mode Toggle Switch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ffffff', border: '1px solid #cbd5e1', padding: '3px', borderRadius: '8px' }}>
            <button
              type="button"
              onClick={() => setGuidanceMode('INTERACTIVE')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: guidanceMode === 'INTERACTIVE' ? '#eff6ff' : 'transparent',
                color: guidanceMode === 'INTERACTIVE' ? '#2563eb' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <HelpCircle style={{ width: '12px', height: '12px' }} />
              <span>Guided Interview Mode</span>
            </button>

            <button
              type="button"
              onClick={() => setGuidanceMode('DIRECT')}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: '700',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: guidanceMode === 'DIRECT' ? '#eff6ff' : 'transparent',
                color: guidanceMode === 'DIRECT' ? '#2563eb' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Wand2 style={{ width: '12px', height: '12px' }} />
              <span>Direct Execution</span>
            </button>
          </div>
        </div>
      </div>

      {/* Preset Suggestions Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderBottom: '1px solid #e2e8f0', overflowX: 'auto', background: '#ffffff', flexShrink: 0 }}>
        <span style={{ fontSize: '11px', fontWeight: '800', color: '#2563eb', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Sparkles style={{ width: '12px', height: '12px' }} /> Presets:
        </span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {activeSuggestions.map((preset: string, idx: number) => (
            <button
              key={idx}
              onClick={() => handleSend(preset)}
              disabled={loading}
              style={{
                fontSize: '11px',
                fontWeight: '600',
                padding: '4px 10px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '16px',
                color: '#334155',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Scroll Area - Expanded Vertical Space */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc' }}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              maxWidth: '92%',
              padding: '12px 16px',
              borderRadius: '12px',
              fontSize: '12px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              background: msg.role === 'user' ? '#2563eb' : '#ffffff',
              color: msg.role === 'user' ? '#ffffff' : '#0f172a',
              border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
              boxShadow: msg.role === 'user' ? '0 2px 6px rgba(37,99,235,0.2)' : '0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            {typeof msg.content === 'string'
              ? msg.content
              : (typeof msg.content === 'object' && msg.content ? JSON.stringify(msg.content, null, 2) : String(msg.content))}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 4px rgba(37,99,235,0.08)' }}>
            <Loader style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite' }} />
            <span>AI Modeler is executing schema transformation...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Probing Q&A Form overlay (if Guided Interview mode triggers clarification questions) */}
      {activeProbingQuestions && activeProbingQuestions.length > 0 && (
        <div style={{ padding: '12px 16px', background: '#fef3c7', borderTop: '1px solid #fde68a', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', fontWeight: '800', color: '#b45309' }}>🎓 Guided Interview Probing Questions:</span>
          {activeProbingQuestions.map((q, idx) => (
            <div key={idx}>
              <label style={{ fontSize: '10px', fontWeight: '700', color: '#78350f', display: 'block', marginBottom: '2px' }}>{q}</label>
              <input
                type="text"
                className="form-input"
                style={{ fontSize: '11px', padding: '4px 8px' }}
                placeholder="Type clarification response..."
                value={probingAnswers[q] || ''}
                onChange={(e) => setProbingAnswers(prev => ({ ...prev, [q]: e.target.value }))}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button onClick={() => handleSend('', probingAnswers)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '11px' }}>
              Submit Clarifications
            </button>
            <button onClick={() => setActiveProbingQuestions(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Multi-line Ready Prompt Input Bar */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleSend(input.trim()); }}
        style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}
      >
        <textarea
          className="form-input"
          placeholder={guidanceMode === 'INTERACTIVE' ? 'Ask question or input topic for Guided Interview...' : 'Enter prompt instructions for Direct Execution...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(input.trim());
            }
          }}
          disabled={loading}
          rows={2}
          style={{ fontSize: '12px', width: '100%', borderRadius: '8px', padding: '8px 12px', resize: 'vertical', minHeight: '52px', maxHeight: '140px', lineHeight: '1.4' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Smart Prompt Enhancer Button */}
          <button
            type="button"
            onClick={handleEnhancePrompt}
            disabled={loading || !input.trim()}
            className="btn-secondary"
            title="Optimize & Expand Prompt via AI"
            style={{ padding: '6px 12px', fontSize: '11px', fontWeight: '700', color: '#7c3aed', background: '#f3e8ff', borderColor: '#d8b4fe', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Sparkles style={{ width: '13px', height: '13px' }} />
            <span>⚡ Enhance Prompt</span>
          </button>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !input.trim()}
            style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
          >
            <Send style={{ width: '13px', height: '13px' }} /> Send
          </button>
        </div>
      </form>
    </div>
  );
}
