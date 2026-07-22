'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { detectCausalCycles } from '@/lib/causalCycleDetector';

function simulateDriverTree(edges: any[], inputMetric: string, inputValue: number): Record<string, number> {
  const deltas: Record<string, number> = {};
  if (inputMetric) {
    deltas[inputMetric] = inputValue;
  }
  
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    edges.forEach(e => {
      const src = e.sourceId || e.source;
      const tgt = e.targetId || e.target;
      const weight = e.weight !== undefined ? e.weight : 1.0;
      const polarity = e.polarity !== undefined ? e.polarity : (e.name.toLowerCase().includes('positive') ? 1 : -1);
      
      if (deltas[src] !== undefined) {
        const val = deltas[src] * weight * polarity;
        if (Math.abs((deltas[tgt] || 0) - val) > 0.01) {
          deltas[tgt] = val;
          changed = true;
        }
      }
    });
    iterations++;
  }
  return deltas;
}

interface Attribute {
  name: string;
  datatype: string;
  description: string;
  required?: boolean;
}

interface ModelerPanelProps {
  selectedElement: any | null; // Selected Concept, Relationship, or null (ontology metadata)
  elementType: 'concept' | 'relationship' | 'ontology' | 'cq' | 'driverTree' | null;
  ontology: any;
  onUpdateOntology: (updatedData: any) => Promise<void>;
  onUpdateConcept: (id: string, updatedData: any) => Promise<void>;
  onDeleteConcept: (id: string) => Promise<void>;
  onUpdateRelationship: (id: string, updatedData: any) => Promise<void>;
  onDeleteRelationship: (id: string) => Promise<void>;
  onAddConcept: (label: string, type: string) => Promise<any>;
  onAddRelationship: (name: string, sourceId: string, targetId: string) => Promise<any>;
  conceptsList: any[]; // for relationship source/target selection
  relationshipsList: any[];
  driverTrees: any[];
  cqsList: any[];
  perspectives?: any[];
  causalCycles?: any[];
  onSelectConcept: (concept: any) => void;
  onClose: () => void;
  onAddCQ?: (question: string) => Promise<void>;
  onDeleteCQ?: (id: string) => Promise<void>;
  onToggleCQ?: (cq: any) => Promise<void>;
  handleFileImport?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importing?: boolean;
  fileInputRef?: any;
}

export default function ModelerPanel({
  selectedElement,
  elementType,
  ontology,
  onUpdateOntology,
  onUpdateConcept,
  onDeleteConcept,
  onUpdateRelationship,
  onDeleteRelationship,
  onAddConcept,
  onAddRelationship,
  conceptsList,
  relationshipsList = [],
  driverTrees = [],
  cqsList = [],
  perspectives = [],
  causalCycles = [],
  onSelectConcept,
  onClose,
  onAddCQ,
  onDeleteCQ,
  onToggleCQ,
  handleFileImport,
  importing = false,
  fileInputRef,
}: ModelerPanelProps) {
  // Local state for Ontology Metadata
  const [ontoName, setOntoName] = useState('');
  const [ontoDesc, setOntoDesc] = useState('');
  const [ontoNs, setOntoNs] = useState('');
  const [ontoVer, setOntoVer] = useState('');
  const [ontoIndustry, setOntoIndustry] = useState('');
  const [ontoFunction, setOntoFunction] = useState('');
  const [ontoObjective, setOntoObjective] = useState('');

  // Local state for CQs
  const [newCqText, setNewCqText] = useState('');

  // Resolve business process and sub-process names
  const businessProcessName = useMemo(() => {
    if (!ontology?.businessProcess) return '';
    if (ontology.businessProcess.parent) {
      return ontology.businessProcess.parent.name;
    }
    return ontology.businessProcess.name;
  }, [ontology]);

  const subProcessName = useMemo(() => {
    if (!ontology?.businessProcess) return '';
    if (ontology.businessProcess.parent) {
      return ontology.businessProcess.name;
    }
    return '';
  }, [ontology]);

  // Local state for Concept editing
  const [conceptLabel, setConceptLabel] = useState('');
  const [conceptType, setConceptType] = useState('Entity');
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrType, setNewAttrType] = useState('string');
  const [newAttrDesc, setNewAttrDesc] = useState('');

  // Local state for Process Modeler
  const [processOwner, setProcessOwner] = useState('');
  const [processInputs, setProcessInputs] = useState<string[]>([]);
  const [processOutputs, setProcessOutputs] = useState<string[]>([]);
  const [processNextStep, setProcessNextStep] = useState('');
  const [processParentId, setProcessParentId] = useState('');

  // Local state for Concept Grouping
  const [conceptGrouping, setConceptGrouping] = useState('');

  // Business Solutions Registry State
  const [solutions, setSolutions] = useState<any[]>([]);
  const fetchSolutions = async () => {
    try {
      const res = await fetch('/api/solutions');
      const data = await res.json();
      if (res.ok) {
        setSolutions(data.solutions || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Systems Registry State
  const [systems, setSystems] = useState<any[]>([]);
  const fetchSystems = async () => {
    try {
      const res = await fetch('/api/systems');
      const data = await res.json();
      if (res.ok) {
        setSystems(data.systems || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Data Grounding States
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [conceptMappings, setConceptMappings] = useState<any[]>([]);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState('');
  const [mappingColumn, setMappingColumn] = useState('');
  const [mappingTransform, setMappingTransform] = useState('');

  const fetchDataSources = async () => {
    try {
      const res = await fetch('/api/datasources');
      const data = await res.json();
      if (res.ok) {
        setDataSources(data.dataSources || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConceptMappings = async () => {
    if (elementType !== 'concept' || !selectedElement) return;
    try {
      const res = await fetch(`/api/concepts/${selectedElement.id}/mappings`);
      const data = await res.json();
      if (res.ok) {
        setConceptMappings(data.mappings || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Driver Tree Simulation States
  const [simulationInputMetric, setSimulationInputMetric] = useState('');
  const [simulationInputValue, setSimulationInputValue] = useState(0);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editingWeight, setEditingWeight] = useState(1.0);
  const [editingPolarity, setEditingPolarity] = useState(1);

  // Context Pack States
  const [generatingContextPack, setGeneratingContextPack] = useState(false);
  const [contextPackData, setContextPackData] = useState<any>(null);

  const handleGenerateContextPack = async () => {
    if (!ontology || !ontology.id) return;
    setGeneratingContextPack(true);
    try {
      const res = await fetch(`/api/ontologies/${ontology.id}/context-pack`);
      const data = await res.json();
      if (res.ok) {
        setContextPackData(data);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `${ontology.name}_context_pack.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingContextPack(false);
    }
  };

  useEffect(() => {
    fetchSolutions();
    fetchSystems();
    fetchDataSources();
    fetchConceptMappings();
  }, [selectedElement]);

  // Find orphan concepts (that have no connections)
  const orphans = useMemo(() => {
    if (elementType !== 'ontology' && selectedElement) return [];
    
    const connectedIds = new Set<string>();
    
    (relationshipsList || []).forEach((rel: any) => {
      connectedIds.add(rel.sourceId);
      connectedIds.add(rel.targetId);
    });
    
    (driverTrees || []).forEach((tree: any) => {
      (tree.edges || []).forEach((edge: any) => {
        connectedIds.add(edge.sourceId);
        connectedIds.add(edge.targetId);
      });
    });
    
    return conceptsList.filter(c => !connectedIds.has(c.id));
  }, [conceptsList, relationshipsList, driverTrees, elementType, selectedElement]);

  // Local state for associated metric creation
  const [newMetricName, setNewMetricName] = useState('');

  // Find metrics associated with the currently selected concept
  const conceptMetrics = useMemo(() => {
    if (elementType !== 'concept' || !selectedElement) return [];
    
    // Find all relationships where the target is this concept
    const relsToThisConcept = (relationshipsList || []).filter((r: any) => r.targetId === selectedElement.id);
    
    // Find the source concepts of these relationships that are of type 'Metric'
    return relsToThisConcept
      .map((r: any) => {
        const src = conceptsList.find((c: any) => c.id === r.sourceId);
        if (src && src.conceptType?.toLowerCase() === 'metric') {
          return {
            metricConcept: src,
            relationshipId: r.id,
          };
        }
        return null;
      })
      .filter((x: any) => x !== null);
  }, [selectedElement, elementType, relationshipsList, conceptsList]);

  // Local state for Relationship editing
  const [relName, setRelName] = useState('');
  const [relCard, setRelCard] = useState('one-to-many');

  // Local state for creating new items
  const [activeTab, setActiveTab] = useState<'inspect' | 'competencies' | 'driver-trees' | 'import' | 'create-concept' | 'create-rel'>('inspect');
  const [newConceptLabel, setNewConceptLabel] = useState('');
  const [newConceptType, setNewConceptType] = useState('Entity');
  const [newRelName, setNewRelName] = useState('');
  const [newRelSrc, setNewRelSrc] = useState('');
  const [newRelTgt, setNewRelTgt] = useState('');

  const [saving, setSaving] = useState(false);

  // Sync state with selectedElement
  useEffect(() => {
    if (elementType === 'ontology' || !selectedElement) {
      setOntoName(ontology?.name || '');
      setOntoDesc(ontology?.description || '');
      setOntoNs(ontology?.namespaceUri || '');
      setOntoVer(ontology?.version || '1.0.0');
      setOntoIndustry(ontology?.industry || '');
      setOntoFunction(ontology?.businessFunction || '');
      setOntoObjective(ontology?.objective || '');
      setActiveTab('inspect');
    } else if (elementType === 'concept') {
      setConceptLabel(selectedElement.label || '');
      setConceptType(selectedElement.conceptType || 'Entity');
      setAttributes(selectedElement.attributes || []);
      setNewAttrName('');
      setNewAttrDesc('');
      
      const fields = selectedElement.typeFields || {};
      setConceptGrouping(fields.grouping || '');
      setProcessOwner(fields.owner || '');
      setProcessInputs(fields.inputs || []);
      setProcessOutputs(fields.outputs || []);
      setProcessNextStep('');
      setProcessParentId(fields.parentId || '');

      setActiveTab('inspect');
    } else if (elementType === 'relationship') {
      setRelName(selectedElement.name || '');
      setRelCard(selectedElement.cardinality || 'one-to-many');
      setActiveTab('inspect');
    }
  }, [selectedElement, elementType, ontology]);

  const handleSaveOntology = async () => {
    setSaving(true);
    try {
      await onUpdateOntology({
        name: ontoName,
        description: ontoDesc,
        namespaceUri: ontoNs,
        version: ontoVer,
        industry: ontoIndustry,
        businessFunction: ontoFunction,
        objective: ontoObjective,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConcept = async () => {
    if (!selectedElement) return;
    setSaving(true);
    try {
      await onUpdateConcept(selectedElement.id, {
        label: conceptLabel,
        conceptType,
        attributes,
        typeFields: conceptType === 'Process' ? {
          owner: processOwner,
          inputs: processInputs,
          outputs: processOutputs,
          parentId: processParentId || undefined,
          grouping: conceptGrouping.trim() || undefined,
        } : {
          grouping: conceptGrouping.trim() || undefined,
        }
      });

      // Auto-create sequence flow link if selected
      if (conceptType === 'Process' && processNextStep) {
        await onAddRelationship('nextStep', selectedElement.id, processNextStep);
        setProcessNextStep('');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRelationship = async () => {
    if (!selectedElement) return;
    setSaving(true);
    try {
      await onUpdateRelationship(selectedElement.id, {
        name: relName,
        cardinality: relCard,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddAttribute = () => {
    if (!newAttrName.trim()) return;
    setAttributes([
      ...attributes,
      {
        name: newAttrName.trim(),
        datatype: newAttrType,
        description: newAttrDesc.trim(),
        required: false,
      },
    ]);
    setNewAttrName('');
    setNewAttrDesc('');
  };

  const handleRemoveAttribute = (index: number) => {
    setAttributes(attributes.filter((_, idx) => idx !== index));
  };

  const handleCreateConcept = async () => {
    if (!newConceptLabel.trim()) return;
    setSaving(true);
    try {
      await onAddConcept(newConceptLabel.trim(), newConceptType);
      setNewConceptLabel('');
      setActiveTab('inspect');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRelationship = async () => {
    if (!newRelName.trim() || !newRelSrc || !newRelTgt) return;
    setSaving(true);
    try {
      await onAddRelationship(newRelName.trim(), newRelSrc, newRelTgt);
      setNewRelName('');
      setNewRelSrc('');
      setNewRelTgt('');
      setActiveTab('inspect');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCQSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCqText.trim() || !onAddCQ) return;
    await onAddCQ(newCqText.trim());
    setNewCqText('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Multi-Tab Navigation Bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid #cbd5e1', background: '#f8fafc', padding: '6px', gap: '4px', flexShrink: 0 }}>
        {[
          { id: 'inspect', label: '🔍 Inspect' },
          { id: 'competencies', label: `❓ CQs (${cqsList.length})` },
          { id: 'driver-trees', label: `📈 Driver Trees (${driverTrees.length})` },
          { id: 'import', label: '📥 Import' },
          { id: 'create-concept', label: '+ Concept' },
          { id: 'create-rel', label: '+ Link' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              flex: '1 1 auto',
              padding: '6px 10px',
              borderRadius: '6px',
              background: activeTab === tab.id ? '#ffffff' : 'transparent',
              border: activeTab === tab.id ? '1px solid #cbd5e1' : '1px solid transparent',
              color: activeTab === tab.id ? '#2563eb' : '#64748b',
              fontWeight: '700',
              fontSize: '11px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel Content container */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Tab 1: Create Concept */}
        {activeTab === 'create-concept' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Add New Concept</h3>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Concept Label (e.g. Warehouse)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Label"
                value={newConceptLabel}
                onChange={(e) => setNewConceptLabel(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Concept Type</label>
              <select
                className="form-input"
                value={newConceptType}
                onChange={(e) => setNewConceptType(e.target.value)}
              >
                <option value="Entity">Entity (Standard Class)</option>
                <option value="Process">Process (Business Workflow)</option>
                <option value="Metric">Metric (Performance Indicator)</option>
                <option value="Persona">Persona (Actor / Role)</option>
              </select>
            </div>
            <button
              onClick={handleCreateConcept}
              disabled={saving || !newConceptLabel.trim()}
              className="btn-primary"
              style={{ marginTop: '10px' }}
            >
              Add Concept
            </button>
          </div>
        )}

        {/* Tab 2: Create Relationship */}
        {activeTab === 'create-rel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Add Relationship Edge</h3>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Relationship Name (e.g. storesProduct)</label>
              <input
                type="text"
                className="form-input"
                placeholder="Relationship Name"
                value={newRelName}
                onChange={(e) => setNewRelName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Source Concept</label>
              <select
                className="form-input"
                value={newRelSrc}
                onChange={(e) => setNewRelSrc(e.target.value)}
              >
                <option value="">Select source...</option>
                {conceptsList.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Target Concept</label>
              <select
                className="form-input"
                value={newRelTgt}
                onChange={(e) => setNewRelTgt(e.target.value)}
              >
                <option value="">Select target...</option>
                {conceptsList.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleCreateRelationship}
              disabled={saving || !newRelName.trim() || !newRelSrc || !newRelTgt}
              className="btn-primary"
              style={{ marginTop: '10px' }}
            >
              Add Relationship
            </button>
          </div>
        )}

        {/* Tab 3: Competency Questions */}
        {activeTab === 'competencies' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ❓ Competency Questions ({cqsList.length})
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
              Questions that this domain ontology must be capable of answering through semantic graph pathways.
            </p>

            <form onSubmit={handleAddCQSubmit} style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Ask CQ (e.g. 'Can we retrieve sales by warehouse?')..."
                style={{ padding: '6px 10px', fontSize: '11px' }}
                value={newCqText}
                onChange={(e) => setNewCqText(e.target.value)}
              />
              <button type="submit" disabled={!newCqText.trim()} className="btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                Add CQ
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
              {cqsList.map((cq) => (
                <div
                  key={cq.id}
                  style={{
                    padding: '10px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-translucent)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '8px' }}>
                    <div style={{ flex: 1, fontWeight: '600', color: cq.status === 'Ratified' ? 'var(--color-text-main)' : 'var(--color-text-muted)' }}>
                      {cq.question}
                    </div>
                    {onDeleteCQ && (
                      <button
                        onClick={() => onDeleteCQ(cq.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: '2px' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    {onToggleCQ && (
                      <span
                        onClick={() => onToggleCQ(cq)}
                        style={{
                          fontSize: '10px',
                          fontWeight: '700',
                          color: cq.status === 'Ratified' ? 'var(--color-success)' : 'var(--color-text-muted)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: cq.status === 'Ratified' ? 'rgba(16,185,129,0.1)' : 'transparent',
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        ✓ {cq.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {cqsList.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                  No competency questions added yet. Use the input above or AI Modeler to generate CQs.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Driver Trees */}
        {activeTab === 'driver-trees' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>📈 Causal Driver Trees ({driverTrees.length})</h3>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
              Causal KPI propagation models connecting input metrics to primary business outcomes.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {driverTrees.map((tree) => (
                <div
                  key={tree.id}
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-translucent)',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: '700', color: 'var(--color-text-main)' }}>{tree.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    {tree.edges?.length || 0} causal links defined
                  </div>
                </div>
              ))}
              {driverTrees.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                  No driver trees defined. Use AI Modeler to generate metric correlation pathways.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 5: Import External Schema */}
        {activeTab === 'import' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700' }}>📥 Import External Ontology</h3>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: 0 }}>
              Upload W3C standard Turtle (.ttl), OWL (.owl), or RDF (.rdf) schema files to import concepts and relationships.
            </p>
            {handleFileImport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="file"
                  accept=".ttl,.owl,.rdf"
                  ref={fileInputRef}
                  onChange={handleFileImport}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="btn-primary"
                  style={{ width: '100%', padding: '10px', fontSize: '13px', display: 'flex', justifyContent: 'center', gap: '8px' }}
                >
                  {importing ? 'Importing file...' : 'Upload OWL / TTL file'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 0: Inspect (Default Selection based) */}
        {activeTab === 'inspect' && (
          <>
            {/* Context A: Ontology Metadata */}
            {(elementType === 'ontology' || !selectedElement) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Ontology Inspector</h3>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Ontology Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ontoName}
                    onChange={(e) => setOntoName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Namespace URI</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ontoNs}
                    onChange={(e) => setOntoNs(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Version</label>
                  <input
                    type="text"
                    className="form-input"
                    value={ontoVer}
                    onChange={(e) => setOntoVer(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Description</label>
                  <textarea
                    rows={4}
                    className="form-input"
                    style={{ resize: 'none' }}
                    value={ontoDesc}
                    onChange={(e) => setOntoDesc(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Industry (e.g. Pharmaceuticals)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Pharmaceuticals"
                    value={ontoIndustry}
                    onChange={(e) => setOntoIndustry(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Business Function (e.g. Sales & Marketing)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Commercial / Sales & Marketing"
                    value={ontoFunction}
                    onChange={(e) => setOntoFunction(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Business Objective (e.g. Optimize revenue)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Optimize sales territory coverage and patient outcomes"
                    value={ontoObjective}
                    onChange={(e) => setOntoObjective(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Business Process (Inherited)</label>
                  <input
                    type="text"
                    className="form-input"
                    disabled
                    style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                    value={businessProcessName || 'None'}
                  />
                </div>
                {subProcessName && (
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Sub-process (Inherited)</label>
                    <input
                      type="text"
                      className="form-input"
                      disabled
                      style={{ opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                      value={subProcessName}
                    />
                  </div>
                )}
                <button
                  onClick={handleSaveOntology}
                  disabled={saving || !ontoName.trim() || !ontoNs.trim()}
                  className="btn-primary"
                  style={{ marginTop: '10px' }}
                >
                  <Save size={16} /> Save Settings
                </button>

                {/* Perspectives Section */}
                <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '15px', marginTop: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: 'var(--color-primary)' }}>
                    Persona Perspectives
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {perspectives.map((p: any) => (
                      <div key={p.id} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-translucent)', borderRadius: '6px' }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-main)' }}>👥 {p.name}</div>
                        {p.description && <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{p.description}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                          {(p.concepts || []).map((c: any) => (
                            <span key={c.id} style={{ fontSize: '10px', background: 'rgba(59,130,246,0.06)', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(59,130,246,0.2)' }}>
                              {c.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {perspectives.length === 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '4px 0' }}>No persona perspectives defined yet.</div>
                    )}
                  </div>
                </div>

                {/* Causal Cycles Section */}
                <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '15px', marginTop: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: 'var(--color-primary)' }}>
                    Causal Feedback Loops
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {causalCycles.map((c: any) => {
                      const isReinforcing = c.cycleType === 'REINFORCING';
                      return (
                        <div key={c.id} style={{ padding: '8px 12px', background: isReinforcing ? 'rgba(16,185,129,0.03)' : 'rgba(239,68,68,0.03)', border: `1px solid ${isReinforcing ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`, borderRadius: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: isReinforcing ? '#34d399' : '#f87171' }}>
                              🔄 {c.name}
                            </div>
                            <span style={{ fontSize: '8px', fontWeight: 'bold', background: isReinforcing ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: isReinforcing ? '#34d399' : '#f87171', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                              {c.cycleType}
                            </span>
                          </div>
                          {c.description && <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{c.description}</div>}
                        </div>
                      );
                    })}
                    {causalCycles.length === 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '4px 0' }}>No feedback loop cycles defined yet.</div>
                    )}
                  </div>
                </div>

                {/* Grounded Context Pack & Quality Scorecard Section */}
                <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '15px', marginTop: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: 'var(--color-primary)' }}>
                    Context Pack & QA Scorecard
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button
                      onClick={handleGenerateContextPack}
                      disabled={generatingContextPack}
                      className="btn-primary"
                      style={{
                        padding: '10px',
                        fontSize: '12px',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        width: '100%',
                      }}
                    >
                      {generatingContextPack ? 'Compiling Grounded Bundle...' : '📦 Compile & Download Context Pack'}
                    </button>

                    {contextPackData && (
                      <div style={{ padding: '12px', background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: '700' }}>CQ Coverage Score:</span>
                          <span style={{ fontSize: '14px', fontWeight: 'bold', color: contextPackData.coverageReport.score >= 80 ? '#34d399' : contextPackData.coverageReport.score >= 50 ? '#fbbf24' : '#f87171' }}>
                            {contextPackData.coverageReport.score}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${contextPackData.coverageReport.score}%`,
                            height: '100%',
                            background: contextPackData.coverageReport.score >= 80 ? '#10b981' : contextPackData.coverageReport.score >= 50 ? '#f59e0b' : '#ef4444',
                            transition: 'width 0.5s ease',
                          }} />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', textAlign: 'center', fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                          <div>
                            <div style={{ fontWeight: 'bold', color: '#10b981' }}>{contextPackData.coverageReport.fullyCovered}</div>
                            <div>Fully Grounded</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 'bold', color: '#f59e0b' }}>{contextPackData.coverageReport.partiallyCovered}</div>
                            <div>Partially</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 'bold', color: '#ef4444' }}>{contextPackData.coverageReport.uncovered}</div>
                            <div>Ungrounded</div>
                          </div>
                        </div>

                        {/* Coverage Breakdown */}
                        <div style={{ marginTop: '8px', borderTop: '1px dashed var(--border-translucent)', paddingTop: '8px' }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Competency Question Mappings</span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '150px', overflowY: 'auto', paddingRight: '2px' }}>
                            {contextPackData.coverageReport.questions.map((q: any) => (
                              <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', fontSize: '10px', background: 'rgba(0,0,0,0.2)', padding: '4px 6px', borderRadius: '4px' }}>
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }}>{q.question}</span>
                                <span style={{
                                  fontWeight: 'bold',
                                  color: q.coverage === 'FULL' ? '#34d399' : q.coverage === 'PARTIAL' ? '#fbbf24' : '#f87171'
                                }}>
                                  {q.coverage}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {orphans.length > 0 && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', padding: '14px', borderRadius: '8px', marginTop: '15px' }}>
                    <div style={{ color: '#f87171', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      ⚠️ Modeler Warnings (Orphans)
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                      The following concepts are not connected to any other elements in the ontology:
                    </p>
                    <ul style={{ margin: '8px 0 0 15px', padding: 0, fontSize: '11px', color: '#f87171', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {orphans.map(o => (
                        <li key={o.id} style={{ fontWeight: '500' }}>{o.label}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Context B: Selected Concept */}
            {elementType === 'concept' && selectedElement && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Concept Inspector</h3>
                  <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Label</label>
                  <input
                    type="text"
                    className="form-input"
                    value={conceptLabel}
                    onChange={(e) => setConceptLabel(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Type</label>
                  <select
                    className="form-input"
                    value={conceptType}
                    onChange={(e) => setConceptType(e.target.value)}
                  >
                    <option value="Entity">Entity</option>
                    <option value="Metric">Metric</option>
                    <option value="Process">Process</option>
                    <option value="Persona">Persona</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Grouping (e.g. Geography)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Geography"
                    value={conceptGrouping}
                    onChange={(e) => setConceptGrouping(e.target.value)}
                  />
                </div>

                {/* Business Process Modeler Fields */}
                {conceptType === 'Process' && (
                  <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-primary)' }}>Business Process Details</h4>
                    
                    {/* Process Owner */}
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Process Owner / Role</label>
                      <input
                        type="text"
                        className="form-input"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        placeholder="e.g. Manufacturing Team"
                        value={processOwner}
                        onChange={(e) => setProcessOwner(e.target.value)}
                      />
                    </div>

                    {/* Process Inputs */}
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Process Inputs (Entities / Samples)</label>
                      <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid var(--border-translucent)', borderRadius: '6px', padding: '6px', background: 'rgba(0,0,0,0.15)' }}>
                        {conceptsList.filter(c => c.id !== selectedElement.id).map(c => {
                          const isChecked = processInputs.includes(c.label);
                          return (
                            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '2px 0', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setProcessInputs(processInputs.filter(item => item !== c.label));
                                  } else {
                                    setProcessInputs([...processInputs, c.label]);
                                  }
                                }}
                              />
                              {c.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Process Outputs */}
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Process Outputs (Entities / Metrics)</label>
                      <div style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid var(--border-translucent)', borderRadius: '6px', padding: '6px', background: 'rgba(0,0,0,0.15)' }}>
                        {conceptsList.filter(c => c.id !== selectedElement.id).map(c => {
                          const isChecked = processOutputs.includes(c.label);
                          return (
                            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '2px 0', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setProcessOutputs(processOutputs.filter(item => item !== c.label));
                                  } else {
                                    setProcessOutputs([...processOutputs, c.label]);
                                  }
                                }}
                              />
                              {c.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Parent Process (Decomposition) */}
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Parent Process Step (Decomposes From)</label>
                      <select
                        className="form-input"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        value={processParentId}
                        onChange={(e) => setProcessParentId(e.target.value)}
                      >
                        <option value="">None (L0 Process Root)</option>
                        {conceptsList.filter(c => c.conceptType === 'Process' && c.id !== selectedElement.id).map(c => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Sequence Flow (Triggers next step) */}
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Successor Process Step (Sequence Flow)</label>
                      <select
                        className="form-input"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        value={processNextStep}
                        onChange={(e) => setProcessNextStep(e.target.value)}
                      >
                        <option value="">Link next workflow step...</option>
                        {conceptsList.filter(c => c.conceptType === 'Process' && c.id !== selectedElement.id).map(c => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                      {processNextStep && (
                        <div style={{ fontSize: '10px', color: 'var(--color-success)', marginTop: '4px' }}>
                          ℹ️ A "nextStep" relationship will be auto-created on save.
                        </div>
                      )}
                    </div>

                    {/* Linked Business Solutions & Capabilities */}
                    <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '12px', marginTop: '10px' }}>
                      <h5 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary)', marginBottom: '8px' }}>Grounded Solutions & Owners</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {solutions.filter(sol => sol.processLinks?.some((l: any) => l.processId === selectedElement.id)).map(sol => (
                          <div key={sol.id} style={{ padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-translucent)', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>💻 {sol.name}</span>
                              <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', padding: '2px 6px', borderRadius: '4px' }}>{sol.status}</span>
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                              👤 Biz: {sol.businessOwner?.name || 'Unassigned'} | IT: {sol.itOwner?.name || 'Unassigned'}
                            </div>
                          </div>
                        ))}
                        {solutions.filter(sol => sol.processLinks?.some((l: any) => l.processId === selectedElement.id)).length === 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No solutions linked to this step yet.</div>
                        )}
                      </div>
                      <div style={{ marginTop: '10px' }}>
                        <select
                          className="form-input"
                          style={{ padding: '6px 10px', fontSize: '11px' }}
                          value=""
                          onChange={async (e) => {
                            const solId = e.target.value;
                            if (!solId) return;
                            await fetch(`/api/solutions/${solId}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ linkProcessId: selectedElement.id }),
                            });
                            await fetchSolutions();
                          }}
                        >
                          <option value="">+ Link Business Solution...</option>
                          {solutions.filter(sol => !sol.processLinks?.some((l: any) => l.processId === selectedElement.id)).map(sol => (
                            <option key={sol.id} value={sol.id}>{sol.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Linked Operational & Analytical Systems */}
                    <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '12px', marginTop: '10px' }}>
                      <h5 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary)', marginBottom: '8px' }}>Supporting IT Systems</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {systems.filter(sys => sys.processLinks?.some((l: any) => l.processId === selectedElement.id)).map(sys => {
                          const link = sys.processLinks.find((l: any) => l.processId === selectedElement.id);
                          return (
                            <div key={sys.id} style={{ padding: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-translucent)', borderRadius: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>🖥️ {sys.name}</span>
                                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{sys.systemType}</span>
                              </div>
                              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                🛠️ Vendor: {sys.vendor || 'Unknown'} | Role: {link?.role || 'RUNS'}
                              </div>
                            </div>
                          );
                        })}
                        {systems.filter(sys => sys.processLinks?.some((l: any) => l.processId === selectedElement.id)).length === 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No supporting systems linked yet.</div>
                        )}
                      </div>
                      <div style={{ marginTop: '10px' }}>
                        <select
                          className="form-input"
                          style={{ padding: '6px 10px', fontSize: '11px' }}
                          value=""
                          onChange={async (e) => {
                            const sysId = e.target.value;
                            if (!sysId) return;
                            await fetch(`/api/systems/${sysId}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ linkProcessId: selectedElement.id, linkRole: 'RUNS' }),
                            });
                            await fetchSystems();
                          }}
                        >
                          <option value="">+ Link IT System...</option>
                          {systems.filter(sys => !sys.processLinks?.some((l: any) => l.processId === selectedElement.id)).map(sys => (
                            <option key={sys.id} value={sys.id}>{sys.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Attributes Section */}
                <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '15px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px' }}>Attributes</h4>
                  
                  {/* Attribute list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                    {attributes.map((attr, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 12px',
                          background: 'rgba(255,255,255,0.02)',
                          borderRadius: '6px',
                          border: '1px solid var(--border-translucent)',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '600' }}>{attr.name}</div>
                          <div style={{ fontSize: '10px', color: 'var(--color-primary)' }}>{attr.datatype}</div>
                        </div>
                        <button
                          onClick={() => handleRemoveAttribute(idx)}
                          style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {attributes.length === 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '10px' }}>No attributes added yet.</div>
                    )}
                  </div>

                  {/* Add Attribute inline form */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-translucent)', borderRadius: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Attr Name"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        value={newAttrName}
                        onChange={(e) => setNewAttrName(e.target.value)}
                      />
                      <select
                        className="form-input"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        value={newAttrType}
                        onChange={(e) => setNewAttrType(e.target.value)}
                      >
                        <option value="string">string</option>
                        <option value="integer">integer</option>
                        <option value="float">float</option>
                        <option value="boolean">boolean</option>
                      </select>
                    </div>
                    <button
                      onClick={handleAddAttribute}
                      disabled={!newAttrName.trim()}
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', width: '100%' }}
                    >
                      <Plus size={14} /> Add Attribute
                    </button>
                  </div>
                </div>

                {/* Associated Metrics Section (Only for Entities and Processes) */}
                {(conceptType === 'Entity' || conceptType === 'Process') && (
                  <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '15px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: 'var(--color-primary)' }}>
                      Associated Metrics
                    </h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                      {conceptMetrics.map((m: any) => (
                        <div
                          key={m.metricConcept.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            background: 'rgba(245,158,11,0.03)',
                            borderRadius: '6px',
                            border: '1px solid rgba(245,158,11,0.15)',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: '#fbbf24' }}>
                              📈 {m.metricConcept.label}
                            </div>
                            {m.metricConcept.description && (
                              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                {m.metricConcept.description}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => {
                                onSelectConcept(m.metricConcept);
                              }}
                              style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                onDeleteRelationship(m.relationshipId);
                              }}
                              style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {conceptMetrics.length === 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '10px', fontStyle: 'italic' }}>
                          No metrics measuring this {conceptType?.toLowerCase()} yet.
                        </div>
                      )}
                    </div>

                    {/* Add Associated Metric inline form */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'rgba(245,158,11,0.01)', border: '1px dashed rgba(245,158,11,0.2)', borderRadius: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="New Metric Label (e.g. CallSuccessRate)"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        value={newMetricName}
                        onChange={(e) => setNewMetricName(e.target.value)}
                      />
                      <button
                        onClick={async () => {
                          if (!newMetricName.trim()) return;
                          try {
                            setSaving(true);
                            const newM = await onAddConcept(newMetricName.trim(), 'Metric');
                            if (newM && newM.id) {
                              const rName = conceptType === 'Process' ? 'measuresProcess' : 'measuresEntity';
                              await onAddRelationship(rName, newM.id, selectedElement.id);
                              setNewMetricName('');
                            }
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setSaving(false);
                          }
                        }}
                        disabled={saving || !newMetricName.trim()}
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', width: '100%', borderColor: 'rgba(245,158,11,0.3)', color: '#fbbf24' }}
                      >
                        <Plus size={14} /> Add Measures Metric
                      </button>
                    </div>
                  </div>
                )}

                {/* Data Grounding & Lineage Section */}
                <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '15px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', marginBottom: '10px', color: 'var(--color-primary)' }}>
                    Data Grounding & Lineage
                  </h4>

                  {/* Grounded Mappings List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                    {conceptMappings.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          padding: '8px 12px',
                          background: 'rgba(59, 130, 246, 0.03)',
                          border: '1px solid rgba(59, 130, 246, 0.15)',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 'bold', color: '#1d4ed8' }}>
                            {m.dataSource?.platform}: {m.dataSource?.name}
                          </span>
                          <button
                            onClick={async () => {
                              await fetch(`/api/mappings/${m.id}`, { method: 'DELETE' });
                              await fetchConceptMappings();
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-main)', marginTop: '4px' }}>
                          Column: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '4px' }}>{m.columnOrField || 'All'}</code>
                        </div>
                        {m.transformation && (
                          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                            f(x): {m.transformation}
                          </div>
                        )}
                      </div>
                    ))}
                    {conceptMappings.length === 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '5px' }}>
                        No data grounding mapped yet.
                      </div>
                    )}
                  </div>

                  {/* Add Mapping inline form */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'rgba(59,130,246,0.01)', border: '1px dashed rgba(59,130,246,0.2)', borderRadius: '8px' }}>
                    <div>
                      <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Data Source</label>
                      <select
                        className="form-input"
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                        value={selectedDataSourceId}
                        onChange={(e) => setSelectedDataSourceId(e.target.value)}
                      >
                        <option value="">Select data source...</option>
                        {dataSources.map(ds => (
                          <option key={ds.id} value={ds.id}>{ds.name} ({ds.platform})</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Table / Column / Field</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. revenue_usd"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          value={mappingColumn}
                          onChange={(e) => setMappingColumn(e.target.value)}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Transformation Formula</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. SUM(x)"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          value={mappingTransform}
                          onChange={(e) => setMappingTransform(e.target.value)}
                        />
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        if (!selectedDataSourceId) return;
                        await fetch(`/api/concepts/${selectedElement.id}/mappings`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            dataSourceId: selectedDataSourceId,
                            columnOrField: mappingColumn,
                            transformation: mappingTransform,
                          }),
                        });
                        setMappingColumn('');
                        setMappingTransform('');
                        setSelectedDataSourceId('');
                        await fetchConceptMappings();
                      }}
                      disabled={!selectedDataSourceId}
                      className="btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', width: '100%', justifyContent: 'center', borderColor: 'rgba(59,130,246,0.3)', color: '#1d4ed8' }}
                    >
                      <Plus size={14} /> Add Data Grounding
                    </button>
                  </div>
                </div>

                {/* Save and Delete Actions */}
                <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '15px', display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button
                    onClick={handleSaveConcept}
                    disabled={saving || !conceptLabel.trim()}
                    className="btn-primary"
                    style={{ flex: 1 }}
                  >
                    <Save size={16} /> Save
                  </button>
                  <button
                    onClick={() => onDeleteConcept(selectedElement.id)}
                    disabled={saving}
                    className="btn-danger"
                    style={{ padding: '10px 16px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Context C: Selected Relationship */}
            {elementType === 'relationship' && selectedElement && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700' }}>Relationship Inspector</h3>
                  <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={relName}
                    onChange={(e) => setRelName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>Cardinality</label>
                  <select
                    className="form-input"
                    value={relCard}
                    onChange={(e) => setRelCard(e.target.value)}
                  >
                    <option value="one-to-many">one-to-many</option>
                    <option value="one-to-one">one-to-one</option>
                    <option value="many-to-many">many-to-many</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-translucent)', fontSize: '13px' }}>
                  <div><strong>Source:</strong> {selectedElement.source?.label}</div>
                  <div><strong>Target:</strong> {selectedElement.target?.label}</div>
                </div>

                {/* Save and Delete Actions */}
                <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '15px', display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button
                    onClick={handleSaveRelationship}
                    disabled={saving || !relName.trim()}
                    className="btn-primary"
                    style={{ flex: 1 }}
                  >
                    <Save size={16} /> Save
                  </button>
                  <button
                    onClick={() => onDeleteRelationship(selectedElement.id)}
                    disabled={saving}
                    className="btn-danger"
                    style={{ padding: '10px 16px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Context D: Selected Competency Question */}
            {elementType === 'cq' && selectedElement && (() => {
              const cq = selectedElement;
              const qText = cq.question.toLowerCase();
              
              // 1. Personas: concepts of type Persona mentioned in the question or linked
              const targetPersonas = conceptsList.filter(c => 
                c.conceptType?.toLowerCase() === 'persona' && 
                (qText.includes(c.label.toLowerCase()) || qText.includes(c.label.replace(/User|Persona/gi, '').toLowerCase()))
              );
              
              // 2. Metrics: concepts of type Metric mentioned in the question
              const targetMetrics = conceptsList.filter(c => 
                c.conceptType?.toLowerCase() === 'metric' && 
                (qText.includes(c.label.toLowerCase()) || qText.includes(c.label.replace(/Metric/gi, '').toLowerCase()))
              );
              
              // 3. Relevant ontology concepts (Entities or Processes) mentioned
              const relevantConcepts = conceptsList.filter(c => 
                c.conceptType?.toLowerCase() !== 'persona' && 
                c.conceptType?.toLowerCase() !== 'metric' && 
                qText.includes(c.label.toLowerCase())
              );

              // 4. Generate dynamic answer logic narrative
              const personasStr = targetPersonas.length > 0 
                ? targetPersonas.map(p => p.label).join(', ') 
                : 'Kite Pharma Operators';
              const metricsStr = targetMetrics.length > 0 
                ? targetMetrics.map(m => m.label).join(' and ') 
                : 'operational variables';
              const conceptsStr = relevantConcepts.length > 0
                ? `the relationship paths connecting ${relevantConcepts.map(c => c.label).join(', ')}`
                : 'the process workflow relationships';

              const derivedAnswerLogic = `To answer this question, ${personasStr} inspect ${conceptsStr} in the ontology. This question is quantified by monitoring the outcome metric(s): ${metricsStr}.`;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-primary)' }}>Competency Question</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                  </div>

                  <div style={{ padding: '12px', background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: '8px', fontSize: '13px', lineHeight: '1.4', fontWeight: '600' }}>
                    "{cq.question}"
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>Target Personas</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {targetPersonas.map(p => (
                        <span key={p.id} style={{ fontSize: '11px', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#c084fc', padding: '2px 8px', borderRadius: '4px', fontWeight: '500' }}>
                          👤 {p.label}
                        </span>
                      ))}
                      {targetPersonas.length === 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                          No explicit Persona found in the question text. Defaults to Kite Pharma Roles.
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>Relevant Metrics</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {targetMetrics.map(m => (
                        <span key={m.id} style={{ fontSize: '11px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', fontWeight: '500' }}>
                          📈 {m.label}
                        </span>
                      ))}
                      {targetMetrics.length === 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                          No explicit Metrics mentioned in the question.
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>Answerable Ontology Section</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {relevantConcepts.map(c => {
                        const icon = c.conceptType?.toLowerCase() === 'process' ? '🟢' : '🔵';
                        return (
                          <span key={c.id} style={{ fontSize: '11px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-translucent)', color: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontWeight: '500' }}>
                            {icon} {c.label}
                          </span>
                        );
                      })}
                      {relevantConcepts.length === 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                          No direct Entity or Process nodes matching question text.
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>How to Answer (Logic Flow)</label>
                    <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-translucent)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                      {derivedAnswerLogic}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>Verification Remediation Plan</label>
                    <div style={{ padding: '10px 12px', background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '8px', fontSize: '12px', color: '#fbbf24', lineHeight: '1.4' }}>
                      <strong>Remediation:</strong> {cq.remediation || 'No manual verification remediation steps specified. Toggle status to Ratified to verify.'}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Context E: Selected Driver Tree */}
            {elementType === 'driverTree' && selectedElement && (() => {
              const tree = selectedElement;
              const edges = tree.edges || [];
              
              const metricNamesSet = new Set<string>();
              edges.forEach((e: any) => {
                const srcLabel = e.sourceId ? (conceptsList.find(c => c.id === e.sourceId)?.label || e.sourceId) : e.source;
                const tgtLabel = e.targetId ? (conceptsList.find(c => c.id === e.targetId)?.label || e.targetId) : e.target;
                if (srcLabel) metricNamesSet.add(srcLabel);
                if (tgtLabel) metricNamesSet.add(tgtLabel);
              });
              
              const metrics = Array.from(metricNamesSet);

              // Find connected CQs
              const linkedCqs = (cqsList || []).filter((cq: any) => {
                const qText = cq.question.toLowerCase();
                return metrics.some(m => qText.includes(m.toLowerCase()));
              });

              // Identify leading (source-only) and lagging (target-only) metrics
              const sources = new Set(edges.map((e: any) => e.sourceId ? (conceptsList.find(c => c.id === e.sourceId)?.label || e.sourceId) : e.source));
              const targets = new Set(edges.map((e: any) => e.targetId ? (conceptsList.find(c => c.id === e.targetId)?.label || e.targetId) : e.target));
              
              const leadingIndicators = metrics.filter(m => sources.has(m) && !targets.has(m));
              const laggingOutcomes = metrics.filter(m => targets.has(m) && !sources.has(m));

              const leadingStr = leadingIndicators.length > 0 ? leadingIndicators.join(', ') : 'leading variables';
              const laggingStr = laggingOutcomes.length > 0 ? laggingOutcomes.join(', ') : 'outcome metrics';

              const dynamicHypothesis = `This causal tree outlines how performance in operational leading indicators (${leadingStr}) drives downstream business results (${laggingStr}). Adjusting these relationships enables the organization to answer key analytical queries.`;

              // Detect Feedback Loops (Causal Cycles)
              const detectedLoops = detectCausalCycles(edges);

              // Run Simulation
              const defaultInputMetric = leadingIndicators[0] || (metrics[0] || '');
              const activeInputMetric = simulationInputMetric || defaultInputMetric;
              const simulatedDeltas = simulateDriverTree(edges, activeInputMetric, simulationInputValue);

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--color-success)' }}>Driver Tree Inspector</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={18} /></button>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>Tree Name</label>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-main)' }}>
                      🌳 {tree.name}
                    </div>
                  </div>

                  {/* Feedback Loops Highlights */}
                  {detectedLoops.length > 0 && (
                    <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '11px', color: '#f87171' }}>
                      <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                        ⚠️ {detectedLoops.length} Causal Cycle(s) / Feedback Loops Detected:
                      </div>
                      <ul style={{ paddingLeft: '15px', margin: '0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {detectedLoops.map(loop => (
                          <li key={loop.id}>
                            <strong>{loop.name}:</strong> Cycle path active in simulation.
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>Hypothesis Narrative</label>
                    <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-translucent)', borderRadius: '8px', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                      {dynamicHypothesis}
                    </div>
                  </div>

                  {/* Interactive Simulation Dashboard */}
                  <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '12px' }}>
                    <h5 style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-success)', marginBottom: '8px' }}>Impact Simulation Sandpit</h5>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-translucent)', padding: '10px', borderRadius: '8px' }}>
                      <div>
                        <label style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Select Simulation Trigger</label>
                        <select
                          className="form-input"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          value={activeInputMetric}
                          onChange={(e) => {
                            setSimulationInputMetric(e.target.value);
                            setSimulationInputValue(0);
                          }}
                        >
                          {metrics.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                          <span>Trigger Input Delta</span>
                          <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>{simulationInputValue > 0 ? '+' : ''}{simulationInputValue}%</span>
                        </div>
                        <input
                          type="range"
                          min="-100"
                          max="100"
                          step="5"
                          value={simulationInputValue}
                          onChange={(e) => setSimulationInputValue(parseInt(e.target.value))}
                          style={{ width: '100%', accentColor: 'var(--color-success)' }}
                        />
                      </div>

                      {/* Simulated Deltas on Metrics */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                        {metrics.map(m => {
                          const delta = simulatedDeltas[m] || 0;
                          return (
                            <div key={m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.02)', borderRadius: '4px', fontSize: '11px' }}>
                              <span>{m}</span>
                              <span style={{
                                fontWeight: 'bold',
                                color: delta > 0 ? '#34d399' : delta < 0 ? '#f87171' : 'var(--color-text-muted)'
                              }}>
                                {delta > 0 ? `▲ +${delta.toFixed(1)}%` : delta < 0 ? `▼ ${delta.toFixed(1)}%` : '0.0%'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Causal Drivers Editor */}
                  <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '12px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>Causal Drivers (Edges)</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {edges.map((e: any) => {
                        const src = e.sourceId ? (conceptsList.find(c => c.id === e.sourceId)?.label || e.sourceId) : e.source;
                        const tgt = e.targetId ? (conceptsList.find(c => c.id === e.targetId)?.label || e.targetId) : e.target;
                        
                        const currentWeight = e.weight !== undefined ? e.weight : 1.0;
                        const currentPolarity = e.polarity !== undefined ? e.polarity : (e.name.toLowerCase().includes('positive') ? 1 : -1);

                        const isEditing = editingEdgeId === e.id;

                        return (
                          <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-translucent)', borderRadius: '6px', fontSize: '11px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', gap: '8px' }}>
                              <span style={{ color: '#fbbf24', fontWeight: '600', flex: 1 }}>{src}</span>
                              <span style={{ color: currentPolarity > 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 'bold', fontSize: '9px', textTransform: 'uppercase', background: currentPolarity > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                {currentPolarity > 0 ? `➕ Drives (w:${currentWeight.toFixed(1)})` : `➖ Inhibits (w:${currentWeight.toFixed(1)})`}
                              </span>
                              <span style={{ color: '#fbbf24', fontWeight: '600', flex: 1, textAlign: 'right' }}>{tgt}</span>
                            </div>

                            {/* Edit Fields inline toggler */}
                            {!isEditing ? (
                              <button
                                onClick={() => {
                                  setEditingEdgeId(e.id);
                                  setEditingWeight(currentWeight);
                                  setEditingPolarity(currentPolarity);
                                }}
                                style={{ fontSize: '9px', background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', textAlign: 'left', padding: '0' }}
                              >
                                ✏️ Adjust weight / polarity
                              </button>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px dashed var(--border-translucent)', paddingTop: '6px', marginTop: '2px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>Polarity:</span>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                      onClick={() => setEditingPolarity(1)}
                                      style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', background: editingPolarity > 0 ? 'var(--color-success)' : 'rgba(0,0,0,0.04)', color: editingPolarity > 0 ? '#fff' : 'var(--color-text-main)', border: 'none', cursor: 'pointer' }}
                                    >
                                      ➕ Drives
                                    </button>
                                    <button
                                      onClick={() => setEditingPolarity(-1)}
                                      style={{ padding: '2px 6px', fontSize: '10px', borderRadius: '4px', background: editingPolarity < 0 ? 'var(--color-error)' : 'rgba(0,0,0,0.04)', color: editingPolarity < 0 ? '#fff' : 'var(--color-text-main)', border: 'none', cursor: 'pointer' }}
                                    >
                                      ➖ Inhibits
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '2px' }}>
                                    <span>Edge Weight:</span>
                                    <span>{editingWeight.toFixed(2)}</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="0.0"
                                    max="1.0"
                                    step="0.05"
                                    value={editingWeight}
                                    onChange={(e) => setEditingWeight(parseFloat(e.target.value))}
                                    style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                  <button
                                    onClick={() => setEditingEdgeId(null)}
                                    className="btn-secondary"
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={async () => {
                                      await fetch(`/api/driver-edges/${e.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          weight: editingWeight,
                                          polarity: editingPolarity,
                                        }),
                                      });
                                      setEditingEdgeId(null);
                                      // Trigger parent refresh to reload updated ontology
                                      if (ontology && ontology.id) {
                                        window.location.reload();
                                      }
                                    }}
                                    className="btn-primary"
                                    style={{ padding: '2px 6px', fontSize: '10px' }}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.5px', marginBottom: '6px', display: 'block' }}>Addressed Competency Questions</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {linkedCqs.map((q: any) => (
                        <div key={q.id} style={{ fontSize: '11px', padding: '6px 8px', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)', color: 'var(--color-text-muted)', borderRadius: '6px', lineHeight: '1.3' }}>
                          ❓ {q.question}
                        </div>
                      ))}
                      {linkedCqs.length === 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                          No competency questions mention the metrics in this tree.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
