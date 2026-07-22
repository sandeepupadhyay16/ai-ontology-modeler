'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Folder,
  Layers,
  Database,
  Plus,
  ArrowLeft,
  Settings,
  HelpCircle,
  TrendingUp,
  Upload,
  Bot,
  Info,
  Trash2,
  CheckCircle,
  FileText,
  Search,
  Building2,
  Factory,
  Sparkles,
  ShieldCheck,
  Tag,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import ThreeCanvas from '@/components/ThreeCanvas';
import ModelerPanel from '@/components/ModelerPanel';
import ChatPanel from '@/components/ChatPanel';
import AgentStepper, { DEFAULT_STAGES, AgentStage } from '@/components/AgentStepper';
import QualityScoreCard from '@/components/QualityScoreCard';
import { OntologyQualityReport, evaluateOntologyQuality } from '@/lib/qualityEvaluator';
import LineageBreadcrumb, { LineageData } from '@/components/LineageBreadcrumb';

export default function Home() {
  // Navigation States
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [selectedOntology, setSelectedOntology] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Modeler Workspace Data States
  const [concepts, setConcepts] = useState<any[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [cqs, setCqs] = useState<any[]>([]);
  const [driverTrees, setDriverTrees] = useState<any[]>([]);
  const [perspectives, setPerspectives] = useState<any[]>([]);
  const [causalCycles, setCausalCycles] = useState<any[]>([]);
  
  // Memoize driverEdges to prevent parent re-renders from recreating array reference
  const memoizedDriverEdges = useMemo(() => {
    return driverTrees.flatMap(t => t.edges || []);
  }, [driverTrees]);
  
  // Selection States inside Modeler
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [elementType, setElementType] = useState<'concept' | 'relationship' | 'ontology' | 'cq' | 'driverTree' | null>(null);

  // Dialog & Creator States
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newOntoName, setNewOntoName] = useState('');
  const [newOntoDesc, setNewOntoDesc] = useState('');
  const [newOntoNs, setNewOntoNs] = useState('');
  const [ontoAlignmentType, setOntoAlignmentType] = useState<'FUNCTION' | 'PROCESS' | 'OBJECTIVE'>('FUNCTION');
  const [ontoObjectiveText, setOntoObjectiveText] = useState('');
  const [suggestedObjectives, setSuggestedObjectives] = useState<string[]>([]);
  const [generatingObjectives, setGeneratingObjectives] = useState(false);
  const [selectedMergeOntoIds, setSelectedMergeOntoIds] = useState<string[]>([]);
  const [mergedOntoName, setMergedOntoName] = useState('');
  const [mergingOntologies, setMergingOntologies] = useState(false);
  const [draftObjectives, setDraftObjectives] = useState<any[]>([]);
  const [mappingBlueprint, setMappingBlueprint] = useState(false);
  const [mappingStatusText, setMappingStatusText] = useState('Initializing mapping transaction...');
  const [newCqText, setNewCqText] = useState('');

  // Import Upload State
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resizable Panel Width States
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(380);

  // Collapsible sections
  const [isOrgCollapsed, setIsOrgCollapsed] = useState(false);
  const [isFuncCollapsed, setIsFuncCollapsed] = useState(false);
  const [isProcessCollapsed, setIsProcessCollapsed] = useState(false);
  const [isSolutionCollapsed, setIsSolutionCollapsed] = useState(false);
  const [isOntologyCollapsed, setIsOntologyCollapsed] = useState(false);
  const [isObjectiveCollapsed, setIsObjectiveCollapsed] = useState(false);

  // Ontologies states
  const [ontologies, setOntologies] = useState<any[]>([]);
  const [loadingOntologies, setLoadingOntologies] = useState(false);

  // Filter states for ontologies list
  const [filterProcessId, setFilterProcessId] = useState('');
  const [filterSubProcessId, setFilterSubProcessId] = useState('');
  const [filterObjective, setFilterObjective] = useState('');
  const [filterSolutionId, setFilterSolutionId] = useState('');

  // Selected objective for selection-based highlighting
  const [selectedObjectiveName, setSelectedObjectiveName] = useState<string | null>(null);

  // Track if the active ontology workspace was entered directly from the home screen
  const [openedFromHome, setOpenedFromHome] = useState(false);

  // Enterprise Hierarchy States
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [selectedFunctionState, setSelectedFunctionState] = useState<any>(null);
  const [processes, setProcesses] = useState<any[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<any>(null);

  // Compute unique objectives list from both actual ontologies and recommended draft objectives
  const uniqueObjectives = useMemo(() => {
    const objMap = new Map<string, { name: string; description: string; level: string; count: number }>();
    
    // 1. Add objectives suggested in the active blueprint recommendation
    draftObjectives.forEach(o => {
      if (o && o.name && !objMap.has(o.name)) {
        objMap.set(o.name, { name: o.name, description: o.description || '', level: o.level || 'FUNCTION', count: 0 });
      }
    });

    // 2. Add objectives from saved ontologies under this business function or organization
    ontologies.forEach(onto => {
      if (onto && onto.objective) {
        const existing = objMap.get(onto.objective);
        if (existing) {
          existing.count += 1;
        } else {
          objMap.set(onto.objective, {
            name: onto.objective,
            description: onto.description || '',
            level: onto.businessFunction === 'Cross-Functional' || onto.businessFunctionId === null ? 'ORGANIZATION' : 'FUNCTION',
            count: 1
          });
        }
      }
    });

    return Array.from(objMap.values());
  }, [ontologies, draftObjectives]);

  // New item creators for Org/Func/Process
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgIndustry, setNewOrgIndustry] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');

  const [newFuncName, setNewFuncName] = useState('');
  const [newFuncCat, setNewFuncCat] = useState('CORE');
  const [newFuncDesc, setNewFuncDesc] = useState('');

  const [newProcName, setNewProcName] = useState('');
  const [newProcDesc, setNewProcDesc] = useState('');
  const [newProcParentId, setNewProcParentId] = useState('');

  // LLM Settings States
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [llmConfigs, setLlmConfigs] = useState<any[]>([]);
  const [newLlmName, setNewLlmName] = useState('');
  const [newLlmProvider, setNewLlmProvider] = useState('LM_STUDIO');
  const [newLlmApiKey, setNewLlmApiKey] = useState('');
  const [newLlmBaseUrl, setNewLlmBaseUrl] = useState('');
  const [newLlmModelName, setNewLlmModelName] = useState('');
  const [editingLlmConfigId, setEditingLlmConfigId] = useState<string | null>(null);

  // Quick Start Ontology States
  const [allOntologies, setAllOntologies] = useState<any[]>([]);
  const [loadingAllOntologies, setLoadingAllOntologies] = useState(false);
  const [showQuickStartModal, setShowQuickStartModal] = useState(false);
  const [quickOntoName, setQuickOntoName] = useState('');
  const [quickOntoDesc, setQuickOntoDesc] = useState('');

  // Dashboard AI Assistance States
  const [aiGeneratingDashboard, setAiGeneratingDashboard] = useState(false);
  const [dashboardStatusText, setDashboardStatusText] = useState('Analyzing function scope...');
  const [aiDashboardPrompt, setAiDashboardPrompt] = useState('');
  const [draftProcesses, setDraftProcesses] = useState<any[]>([]);
  const [draftProjects, setDraftProjects] = useState<any[]>([]);

  // Homepage Dual-View & Tag Filter States
  const [homeTab, setHomeTab] = useState<'INDUSTRY' | 'ORGANIZATION'>('INDUSTRY');
  const [selectedMissionTag, setSelectedMissionTag] = useState<string>('');
  const [selectedFunctionTag, setSelectedFunctionTag] = useState<string>('');
  const [selectedProcessTag, setSelectedProcessTag] = useState<string>('');
  const [homepageSearchQuery, setHomepageSearchQuery] = useState<string>('');

  // Active Connective Lineage Chain
  const activeLineage: LineageData = useMemo(() => {
    if (selectedOntology) {
      return {
        organization: selectedOntology.organization || (selectedOntology.organizationId ? { id: selectedOntology.organizationId, name: 'Enterprise' } : undefined),
        businessFunction: selectedOntology.businessFunctionRel || (selectedOntology.businessFunction ? { name: selectedOntology.businessFunction } : undefined),
        aiMission: selectedOntology.aiMissions?.[0] || selectedOntology.objective || undefined,
        businessProcess: selectedOntology.businessProcess || undefined,
        solution: selectedOntology.project || undefined,
        ontology: { id: selectedOntology.id, name: selectedOntology.name, healthScore: evaluateOntologyQuality(selectedOntology).healthScore },
      };
    }
    return {
      organization: selectedOrg ? { id: selectedOrg.id, name: selectedOrg.name, industry: selectedOrg.industry } : (selectedMissionTag ? { name: 'Enterprise' } : undefined),
      businessFunction: selectedFunctionState ? { id: selectedFunctionState.id, name: selectedFunctionState.name } : (selectedFunctionTag ? { name: selectedFunctionTag } : undefined),
      aiMission: selectedMissionTag || undefined,
      businessProcess: selectedProcessTag ? { name: selectedProcessTag } : undefined,
      solution: selectedProject ? { id: selectedProject.id, name: selectedProject.name } : (homepageSearchQuery ? { name: homepageSearchQuery } : undefined),
    };
  }, [selectedOntology, selectedOrg, selectedFunctionState, selectedProject, selectedMissionTag, selectedFunctionTag, selectedProcessTag, homepageSearchQuery]);

  // 5-Stage Agentic Quality Pipeline States
  const [pipelineStages, setPipelineStages] = useState<AgentStage[]>(DEFAULT_STAGES);
  const [ontologyQualityReport, setOntologyQualityReport] = useState<OntologyQualityReport | null>(null);
  const [isExecutingPipeline, setIsExecutingPipeline] = useState<boolean>(false);

  // Real-time 5-stage progress animation runner
  const handleStartStageStepper = () => {
    setIsExecutingPipeline(true);
    setPipelineStages([
      { stage: 1, name: '1. Intent Parser', status: 'RUNNING' },
      { stage: 2, name: '2. Domain SME', status: 'PENDING' },
      { stage: 3, name: '3. Process Modeler', status: 'PENDING' },
      { stage: 4, name: '4. Quality Validator', status: 'PENDING' },
      { stage: 5, name: '5. UI Renderer', status: 'PENDING' },
    ]);

    const t1 = setTimeout(() => {
      setPipelineStages([
        { stage: 1, name: '1. Intent Parser', status: 'COMPLETED', durationMs: 1200 },
        { stage: 2, name: '2. Domain SME', status: 'RUNNING' },
        { stage: 3, name: '3. Process Modeler', status: 'PENDING' },
        { stage: 4, name: '4. Quality Validator', status: 'PENDING' },
        { stage: 5, name: '5. UI Renderer', status: 'PENDING' },
      ]);
    }, 1200);

    const t2 = setTimeout(() => {
      setPipelineStages([
        { stage: 1, name: '1. Intent Parser', status: 'COMPLETED', durationMs: 1200 },
        { stage: 2, name: '2. Domain SME', status: 'COMPLETED', durationMs: 2400 },
        { stage: 3, name: '3. Process Modeler', status: 'RUNNING' },
        { stage: 4, name: '4. Quality Validator', status: 'PENDING' },
        { stage: 5, name: '5. UI Renderer', status: 'PENDING' },
      ]);
    }, 3600);

    const t3 = setTimeout(() => {
      setPipelineStages([
        { stage: 1, name: '1. Intent Parser', status: 'COMPLETED', durationMs: 1200 },
        { stage: 2, name: '2. Domain SME', status: 'COMPLETED', durationMs: 2400 },
        { stage: 3, name: '3. Process Modeler', status: 'COMPLETED', durationMs: 4500 },
        { stage: 4, name: '4. Quality Validator', status: 'RUNNING' },
        { stage: 5, name: '5. UI Renderer', status: 'PENDING' },
      ]);
    }, 8100);

    return async () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);

      setPipelineStages([
        { stage: 1, name: '1. Intent Parser', status: 'COMPLETED', durationMs: 1200 },
        { stage: 2, name: '2. Domain SME', status: 'COMPLETED', durationMs: 2400 },
        { stage: 3, name: '3. Process Modeler', status: 'COMPLETED', durationMs: 4500 },
        { stage: 4, name: '4. Quality Validator', status: 'COMPLETED', durationMs: 1500 },
        { stage: 5, name: '5. UI Renderer', status: 'RUNNING' },
      ]);

      await new Promise(r => setTimeout(r, 350));

      setPipelineStages([
        { stage: 1, name: '1. Intent Parser', status: 'COMPLETED', durationMs: 1200 },
        { stage: 2, name: '2. Domain SME', status: 'COMPLETED', durationMs: 2400 },
        { stage: 3, name: '3. Process Modeler', status: 'COMPLETED', durationMs: 4500 },
        { stage: 4, name: '4. Quality Validator', status: 'COMPLETED', durationMs: 1500 },
        { stage: 5, name: '5. UI Renderer', status: 'COMPLETED', durationMs: 350 },
      ]);
      setIsExecutingPipeline(false);
    };
  };

  // Trigger 5-Stage Agent Pipeline
  const handleRunAgentPipeline = async (userPrompt?: string, isAutoFix = false) => {
    if (!selectedOntology) return;
    const finishStepper = handleStartStageStepper();
    try {
      const res = await fetch(`/api/ontologies/${selectedOntology.id}/agent-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userPrompt || 'Refine concepts, relationships, and competencies.',
          autoFix: isAutoFix,
          currentState: {
            concepts,
            relationships,
            competencyQuestions: cqs,
            driverTrees,
            perspectives,
            causalCycles,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.qualityReport) {
          setOntologyQualityReport(data.qualityReport);
        }
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err) {
      console.error('Failed to run agent quality pipeline:', err);
    } finally {
      await finishStepper();
    }
  };

  const startResizeLeft = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startWidth = leftWidth;
    const startX = mouseDownEvent.clientX;
    
    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const newWidth = startWidth + (mouseMoveEvent.clientX - startX);
      if (newWidth >= 220 && newWidth <= 450) {
        setLeftWidth(newWidth);
      }
    };
    
    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
    
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const startResizeRight = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startWidth = rightWidth;
    const startX = mouseDownEvent.clientX;
    
    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const newWidth = startWidth - (mouseMoveEvent.clientX - startX);
      if (newWidth >= 280 && newWidth <= 550) {
        setRightWidth(newWidth);
      }
    };
    
    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
    
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const [bottomHeight, setBottomHeight] = useState(300);

  const startResizeBottom = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startHeight = bottomHeight;
    const startY = mouseDownEvent.clientY;
    
    const doDrag = (mouseMoveEvent: MouseEvent) => {
      const newHeight = startHeight - (mouseMoveEvent.clientY - startY);
      if (newHeight >= 180 && newHeight <= 600) {
        setBottomHeight(newHeight);
      }
    };
    
    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
    
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  // Error/Message state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);



  // Fetch Organizations List
  const fetchOrganizations = async () => {
    try {
      const res = await fetch('/api/organizations');
      const data = await res.json();
      if (res.ok) {
        setOrganizations(data.organizations || []);
        // Auto-select first org if available
        if (data.organizations?.length > 0 && !selectedOrg) {
          setSelectedOrg(data.organizations[0]);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error fetching organizations');
    }
  };

  // Fetch Projects List (optionally filtered by business function)
  const fetchProjects = async (funcId?: string) => {
    try {
      setLoadingProjects(true);
      const url = funcId ? `/api/projects?businessFunctionId=${funcId}` : '/api/projects';
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setProjects(data.projects || []);
      } else {
        setErrorMessage(data.error || 'Failed to load projects');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error fetching projects');
    } finally {
      setLoadingProjects(false);
    }
  };

  // Fetch all standalone / quick start ontologies
  const fetchAllOntologies = async () => {
    try {
      setLoadingAllOntologies(true);
      const res = await fetch('/api/ontologies');
      const data = await res.json();
      if (res.ok) {
        setAllOntologies(data.ontologies || []);
      }
    } catch (err) {
      console.error('Failed to load all ontologies:', err);
    } finally {
      setLoadingAllOntologies(false);
    }
  };

  const handleCreateQuickOntology = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickOntoName.trim()) return;

    try {
      const res = await fetch('/api/ontologies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quickOntoName.trim(),
          description: quickOntoDesc.trim() || 'Quick Start Ontology',
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setQuickOntoName('');
        setQuickOntoDesc('');
        setShowQuickStartModal(false);
        await fetchAllOntologies();
        setOpenedFromHome(true);
        handleSelectOntology(data);
      } else {
        setErrorMessage(data.error || 'Failed to create Quick Start ontology');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error creating Quick Start ontology');
    }
  };

  // Fetch Ontologies List (filtered by business function)
  const fetchOntologies = async (funcId: string) => {
    try {
      setLoadingOntologies(true);
      const res = await fetch(`/api/business-functions/${funcId}/ontologies`);
      const data = await res.json();
      if (res.ok) {
        setOntologies(data.ontologies || []);
      } else {
        setErrorMessage(data.error || 'Failed to load ontologies');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error fetching ontologies');
    } finally {
      setLoadingOntologies(false);
    }
  };

  // Fetch Processes List (filtered by business function)
  const fetchProcesses = async (funcId: string) => {
    try {
      const res = await fetch(`/api/processes?businessFunctionId=${funcId}`);
      const data = await res.json();
      if (res.ok) {
        setProcesses(data.processes || []);
      }
    } catch (err: any) {
      console.error('Error fetching processes:', err);
    }
  };

  const fetchLlmConfigs = async () => {
    try {
      const res = await fetch('/api/llm-configs');
      const data = await res.json();
      if (res.ok) {
        setLlmConfigs(data.configs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchOrganizations();
    fetchProjects();
    fetchLlmConfigs();
    fetchAllOntologies();
  }, []);

  useEffect(() => {
    if (!aiGeneratingDashboard) return;
    const statuses = [
      'Analyzing business model & industry cues...',
      'Formulating strategic business objectives...',
      'Structuring process hierarchy & taxonomies...',
      'Constructing candidate business solutions...',
      'Synthesizing blueprint recommendations...'
    ];
    let index = 0;
    setDashboardStatusText(statuses[0]);
    const timer = setInterval(() => {
      index = (index + 1) % statuses.length;
      setDashboardStatusText(statuses[index]);
    }, 2500);
    return () => clearInterval(timer);
  }, [aiGeneratingDashboard]);

  // Update projects and processes when function is selected
  const handleSelectFunction = async (func: any) => {
    setSelectedFunctionState(func);
    setSelectedProcess(null);
    setFilterProcessId('');
    setFilterSubProcessId('');
    setFilterObjective('');
    setFilterSolutionId('');
    setSelectedObjectiveName(null);
    if (func) {
      await fetchProjects(func.id);
      await fetchProcesses(func.id);
      await fetchOntologies(func.id);
    } else {
      setProjects([]);
      setProcesses([]);
      setOntologies([]);
    }
  };

  // Fetch full details of the active ontology
  const loadOntologyData = async (ontoId: string) => {
    try {
      const res = await fetch(`/api/ontologies/${ontoId}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedOntology(data);
        setConcepts(data.concepts || []);
        setRelationships(data.relationships || []);
        setCqs(data.competencyQuestions || []);
        setDriverTrees(data.driverTrees || []);
        setPerspectives(data.perspectives || []);
        setCausalCycles(data.causalCycles || []);
        // Compute quality report
        const report = evaluateOntologyQuality(data);
        setOntologyQualityReport(report);
        // Reset selections
        setSelectedElement(null);
        setElementType('ontology');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading ontology details');
    }
  };

  const handleSelectOntology = async (onto: any) => {
    try {
      if (onto.projectId) {
        const res = await fetch(`/api/projects/${onto.projectId}`);
        const data = await res.json();
        if (res.ok) {
          setSelectedProject(data);
        } else {
          setSelectedProject({ id: onto.projectId, name: onto.businessFunction || 'Business Solution', description: onto.description });
        }
      } else {
        setSelectedProject({ id: 'cross-functional', name: 'Cross-Functional Solution', description: 'Enterprise-wide cross-functional ontology context.' });
      }
      await loadOntologyData(onto.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error loading ontology');
    }
  };

  // Select project and refresh its detail (to pull ontologies list)
  const handleSelectProject = async (proj: any) => {
    try {
      const res = await fetch(`/api/projects/${proj.id}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedProject(data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error fetching project details');
    }
  };

  // Create Organization
  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newOrgName, industry: newOrgIndustry, description: newOrgDesc }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewOrgName('');
        setNewOrgIndustry('');
        setNewOrgDesc('');
        await fetchOrganizations();
      } else {
        setErrorMessage(data.error);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Create Business Function
  const handleCreateFunction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFuncName.trim() || !selectedOrg) return;
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/functions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFuncName, category: newFuncCat, description: newFuncDesc }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewFuncName('');
        setNewFuncDesc('');
        // Refresh organization to pull new functions
        const updatedOrgRes = await fetch(`/api/organizations/${selectedOrg.id}`);
        const updatedOrg = await updatedOrgRes.json();
        if (updatedOrgRes.ok) {
          setSelectedOrg(updatedOrg);
          setOrganizations(organizations.map(o => o.id === selectedOrg.id ? updatedOrg : o));
        }

        // Auto-select the newly created business function
        setSelectedFunctionState(data);
        setSelectedProcess(null);
        setProjects([]);
        setProcesses([]);
        setOntologies([]);
        setFilterProcessId('');
        setFilterSubProcessId('');
        setFilterObjective('');
        setFilterSolutionId('');
        setSelectedObjectiveName(null);

        // Automatically trigger AI blueprint recommendation for the new function
        setAiGeneratingDashboard(true);
        try {
          const resAi = await fetch('/api/ai-dashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orgId: selectedOrg.id,
              functionId: data.id,
              userPrompt: ''
            })
          });
          const dataAi = await resAi.json();
          if (resAi.ok) {
            setDraftProcesses(dataAi.processes?.map((p: any) => ({ ...p, selected: true, children: p.children?.map((c: any) => ({ ...c, selected: true })) })) || []);
            setDraftProjects(dataAi.projects?.map((p: any) => ({ ...p, selected: true })) || []);
            setDraftObjectives(dataAi.objectives?.map((o: any) => ({ ...o, selected: true })) || []);
          }
        } catch (errAi: any) {
          console.error('Auto AI blueprint recommendations failed:', errAi);
        } finally {
          setAiGeneratingDashboard(false);
        }
      } else {
        setErrorMessage(data.error);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Create Business Process
  const handleCreateProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProcName.trim() || !selectedFunctionState) return;
    try {
      const res = await fetch('/api/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProcName,
          description: newProcDesc,
          parentId: newProcParentId || undefined,
          businessFunctionId: selectedFunctionState.id
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewProcName('');
        setNewProcDesc('');
        setNewProcParentId('');
        await fetchProcesses(selectedFunctionState.id);
      } else {
        setErrorMessage(data.error);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjName,
          description: newProjDesc,
          businessFunctionId: selectedFunctionState?.id || null
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewProjName('');
        setNewProjDesc('');
        await fetchProjects(selectedFunctionState?.id);
      } else {
        setErrorMessage(data.error);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Dashboard AI generation helpers
  const generateDashboardSuggestions = async () => {
    if (!selectedOrg || !selectedFunctionState) return;
    setAiGeneratingDashboard(true);
    try {
      const res = await fetch('/api/ai-dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: selectedOrg.id,
          functionId: selectedFunctionState.id,
          userPrompt: aiDashboardPrompt
        })
      });
      const data = await res.json();
      if (res.ok) {
        setDraftProcesses(
          (data.processes || []).map((p: any) => ({
            ...p,
            selected: true,
            children: (p.children || []).map((c: any) => ({ ...c, selected: true }))
          }))
        );
        setDraftProjects(
          (data.projects || []).map((p: any) => ({ ...p, selected: true }))
        );
        setDraftObjectives(
          (data.objectives || []).map((o: any) => ({ ...o, selected: true }))
        );
      } else {
        alert(`Failed to generate: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Error generating recommendations: ${e.message}`);
    } finally {
      setAiGeneratingDashboard(false);
    }
  };

  const saveDashboardSuggestions = async () => {
    if (!selectedFunctionState || mappingBlueprint) return;
    setMappingBlueprint(true);
    setMappingStatusText('1/5: Provisioning business processes...');
    try {
      const newProcessNameToIdMap: Record<string, string> = {};

      // 1. Create selected processes
      for (const p of draftProcesses) {
        if (!p.selected) continue;
        
        // Create parent process
        const resP = await fetch('/api/processes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: p.name,
            description: p.description,
            businessFunctionId: selectedFunctionState.id
          })
        });
        const parentProc = await resP.json();
        
        // Create selected children
        if (resP.ok && parentProc.id) {
          newProcessNameToIdMap[p.name.toLowerCase()] = parentProc.id;
          for (const c of p.children || []) {
            if (!c.selected) continue;
            const resC = await fetch('/api/processes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: c.name,
                description: c.description,
                businessFunctionId: selectedFunctionState.id,
                parentId: parentProc.id
              })
            });
            const childProc = await resC.json();
            if (resC.ok && childProc.id) {
              newProcessNameToIdMap[c.name.toLowerCase()] = childProc.id;
            }
          }
        }
      }

      // 2. Create selected projects (solutions)
      setMappingStatusText('2/5: Provisioning candidate business solutions...');
      const createdProjects = [];
      for (const pr of draftProjects) {
        if (!pr.selected) continue;
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: pr.name,
            description: pr.description,
            businessFunctionId: selectedFunctionState.id
          })
        });
        const newProj = await res.json();
        if (res.ok) {
          createdProjects.push(newProj);
        }
      }

      // 3. Create selected objectives as pre-linked ontologies under the Business Function
      setMappingStatusText('3/5: Registering strategic objectives...');
      const generationPromises: Promise<any>[] = [];
      let index = 1;
      const selectedObjectives = draftObjectives.filter(o => o.selected);
      for (const obj of selectedObjectives) {
        setMappingStatusText(`4/5: Pre-generating and seeding AI ontologies (${index}/${selectedObjectives.length})...`);
        const alignedProcessId = obj.processName ? newProcessNameToIdMap[obj.processName.toLowerCase()] : null;
        const safeSlug = obj.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
        
        // Link to first created solution/project if any exist
        const linkedProjectId = createdProjects[0]?.id || null;

        const resOnto = await fetch(`/api/business-functions/${selectedFunctionState.id}/ontologies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${obj.name} Ontology`,
            description: obj.description || `Pre-generated ontology for objective: ${obj.name}`,
            namespaceUri: `urn:tse:${selectedFunctionState.id}:obj-${safeSlug}-${Date.now()}`,
            businessProcessId: alignedProcessId,
            objective: obj.name,
            projectId: linkedProjectId,
            isCrossFunctional: obj.level === 'ORGANIZATION',
            industry: selectedOrg.industry || '',
            businessFunction: selectedFunctionState.name
          })
        });
        const newOnto = await resOnto.json();
        if (resOnto.ok && newOnto.id) {
          // Trigger automatic initial ontology modeling pass
          const p = fetch(`/api/ontologies/${newOnto.id}/ai-generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `Initialize a standard domain ontology with concepts, attributes, relationships, competency questions, and driver trees. Target Objective/Mission: "${obj.name}". Aligned process context: "${obj.processName || 'Cross-process'}".`,
              activePhase: 1
            })
          }).catch(err => console.error("Background auto-ontology generation failed:", err));
          generationPromises.push(p);
        }
        index++;
      }

      if (generationPromises.length > 0) {
        setMappingStatusText('5/5: Finalizing enterprise mapping and wiring layout...');
        // Wait for all AI modeling passes to finish so the graphs are pre-populated!
        await Promise.all(generationPromises);
      }

      // Reset drafts and refresh lists
      setDraftProcesses([]);
      setDraftProjects([]);
      setDraftObjectives([]);
      setAiDashboardPrompt('');
      await fetchProcesses(selectedFunctionState.id);
      await fetchProjects(selectedFunctionState.id);
      await fetchOntologies(selectedFunctionState.id);
    } catch (e: any) {
      alert(`Error saving curated recommendations: ${e.message}`);
    } finally {
      setMappingBlueprint(false);
    }
  };

  // Enterprise Tree CRUD helpers
  const handleRenameOrg = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/organizations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        await fetchOrganizations();
        const updated = await res.json();
        setSelectedOrg(updated);
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (e: any) {
      alert(`Error renaming organization: ${e.message}`);
    }
  };

  const handleDeleteOrg = async (id: string) => {
    if (!confirm('Are you sure you want to delete this organization? All underlying functions, processes, and projects will be permanently deleted.')) return;
    try {
      const res = await fetch(`/api/organizations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedOrg(null);
        handleSelectFunction(null);
        await fetchOrganizations();
      } else {
        const errData = await res.json();
        alert(`Failed to delete organization: ${errData.error || 'Server error'}`);
      }
    } catch (e: any) {
      alert(`Error deleting organization: ${e.message}`);
    }
  };

  const handleRenameFunction = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/business-functions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        if (selectedOrg) {
          const resOrg = await fetch(`/api/organizations/${selectedOrg.id}`);
          const dataOrg = await resOrg.json();
          if (resOrg.ok) {
            setSelectedOrg(dataOrg);
            const updated = dataOrg.businessFunctions?.find((f: any) => f.id === id);
            if (updated) setSelectedFunctionState(updated);
          }
        }
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (e: any) {
      alert(`Error renaming function: ${e.message}`);
    }
  };

  const handleDeleteFunction = async (id: string) => {
    if (!confirm('Are you sure you want to delete this business function? All underlying processes and projects will be permanently deleted.')) return;
    try {
      const res = await fetch(`/api/business-functions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        handleSelectFunction(null);
        if (selectedOrg) {
          const resOrg = await fetch(`/api/organizations/${selectedOrg.id}`);
          const dataOrg = await resOrg.json();
          if (resOrg.ok) {
            setSelectedOrg(dataOrg);
          }
        }
      } else {
        const errData = await res.json();
        alert(`Failed to delete business function: ${errData.error || 'Server error'}`);
      }
    } catch (e: any) {
      alert(`Error deleting function: ${e.message}`);
    }
  };

  const handleUpdateProcess = async (id: string, name: string, description: string) => {
    try {
      const res = await fetch(`/api/processes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (res.ok && selectedFunctionState) {
        await fetchProcesses(selectedFunctionState.id);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update process');
      }
    } catch (e: any) {
      alert(`Error updating process: ${e.message}`);
    }
  };

  const handleAddProcessPrompt = async () => {
    if (!selectedFunctionState) return;
    const name = prompt(selectedProcess ? `Enter sub-process name for "${selectedProcess.name}":` : "Enter top-level process name:");
    if (!name) return;
    const desc = prompt("Enter process description (optional):");
    
    try {
      const res = await fetch('/api/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: desc?.trim() || '',
          businessFunctionId: selectedFunctionState.id,
          parentId: selectedProcess?.id || null
        }),
      });
      if (res.ok) {
        await fetchProcesses(selectedFunctionState.id);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create process');
      }
    } catch (err: any) {
      alert(err.message || 'Error creating process');
    }
  };

  const handleAddProjectPrompt = async () => {
    if (!selectedFunctionState) return;
    const name = prompt("Enter Business Solution name:");
    if (!name) return;
    const desc = prompt("Enter Business Solution description (optional):");
    
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: desc?.trim() || '',
          businessFunctionId: selectedFunctionState.id
        }),
      });
      if (res.ok) {
        await fetchProjects(selectedFunctionState.id);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create solution');
      }
    } catch (err: any) {
      alert(err.message || 'Error creating solution');
    }
  };

  const handleUpdateProject = async (id: string, name: string, description: string) => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (res.ok && selectedFunctionState) {
        await fetchProjects(selectedFunctionState.id);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update solution');
      }
    } catch (e: any) {
      alert(`Error updating solution: ${e.message}`);
    }
  };

  const handleAddObjectivePrompt = async () => {
    if (!selectedFunctionState) return;
    const name = prompt("Enter Business Objective Name:");
    if (!name) return;
    const desc = prompt("Enter Objective Description (optional):");
    const isCrossFunc = confirm("Is this a Cross-Functional (Organization-level) objective? Click OK for Organization-level, Cancel for Function-level.");
    
    try {
      const res = await fetch(`/api/business-functions/${selectedFunctionState.id}/ontologies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${name.trim()} Ontology`,
          description: desc?.trim() || `Pre-generated ontology for objective: ${name.trim()}`,
          namespaceUri: `urn:tse:${selectedFunctionState.id}:obj-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
          objective: name.trim(),
          isCrossFunctional: isCrossFunc,
          industry: selectedOrg.industry || '',
          businessFunction: selectedFunctionState.name
        })
      });
      if (res.ok) {
        await fetchOntologies(selectedFunctionState.id);
        await fetchAllOntologies();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to create objective');
      }
    } catch (err: any) {
      alert(err.message || 'Error creating objective');
    }
  };

  const handleUpdateObjective = async (oldName: string, newName: string, newDesc: string) => {
    if (!selectedFunctionState) return;
    try {
      const matchingOntologies = ontologies.filter(o => o.objective === oldName);
      if (matchingOntologies.length === 0) return;
      
      const promises = matchingOntologies.map(o => 
        fetch(`/api/ontologies/${o.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            objective: newName.trim(),
            description: newDesc.trim()
          })
        })
      );
      
      await Promise.all(promises);
      await fetchOntologies(selectedFunctionState.id);
      await fetchAllOntologies();
    } catch (e: any) {
      alert(`Error updating objective: ${e.message}`);
    }
  };

  const handleDeleteObjective = async (objectiveName: string) => {
    if (!selectedFunctionState) return;
    if (!confirm(`Are you sure you want to delete the objective "${objectiveName}"? This will clear this objective on all associated ontologies.`)) return;
    try {
      const matchingOntologies = ontologies.filter(o => o.objective === objectiveName);
      const promises = matchingOntologies.map(o => 
        fetch(`/api/ontologies/${o.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            objective: null
          })
        })
      );
      
      await Promise.all(promises);
      await fetchOntologies(selectedFunctionState.id);
      await fetchAllOntologies();
    } catch (e: any) {
      alert(`Error deleting objective: ${e.message}`);
    }
  };

  const handleDeleteProcess = async (id: string) => {
    if (!confirm('Are you sure you want to delete this business process step? All child processes will be unlinked or deleted.')) return;
    try {
      const res = await fetch(`/api/processes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedFunctionState) {
          await fetchProcesses(selectedFunctionState.id);
        }
      } else {
        const errData = await res.json();
        alert(`Failed to delete process: ${errData.error || 'Server error'}`);
      }
    } catch (e: any) {
      alert(`Error deleting process: ${e.message}`);
    }
  };

  // Create Ontology
  // Create Ontology
  const handleCreateOntology = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOntoName.trim() || !selectedFunctionState) return;

    let finalProcessId = null;
    let finalObjective = null;

    if (ontoAlignmentType === 'PROCESS') {
      finalProcessId = selectedProcess?.id || null;
    } else if (ontoAlignmentType === 'OBJECTIVE') {
      finalProcessId = selectedProcess?.id || null;
      finalObjective = ontoObjectiveText.trim() || null;
    } else if (ontoAlignmentType === 'FUNCTION') {
      finalProcessId = null;
      finalObjective = "Cross-process Function Ontology";
    }

    try {
      const res = await fetch(`/api/business-functions/${selectedFunctionState.id}/ontologies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newOntoName,
          description: newOntoDesc,
          namespaceUri: newOntoNs,
          businessProcessId: finalProcessId,
          objective: finalObjective,
          projectId: selectedProject?.id || null,
          isCrossFunctional: selectedProject?.id === 'cross-functional',
          industry: selectedOrg?.industry || '',
          businessFunction: selectedFunctionState.name
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewOntoName('');
        setNewOntoDesc('');
        setNewOntoNs('');
        setOntoObjectiveText('');
        setSuggestedObjectives([]);
        // Reload list
        await fetchOntologies(selectedFunctionState.id);
        if (selectedProject && selectedProject.id !== 'cross-functional') {
          await handleSelectProject(selectedProject);
        }
      } else {
        setErrorMessage(data.error);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Generate AI Business Objectives / Missions
  const handleGenerateAIObjectives = async () => {
    setGeneratingObjectives(true);
    try {
      const res = await fetch('/api/suggest-objectives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry: selectedOrg?.industry || 'General',
          businessFunction: selectedFunctionState?.name || 'Operations',
          processName: selectedProcess?.name || null
        })
      });
      const data = await res.json();
      if (res.ok && data.objectives) {
        setSuggestedObjectives(data.objectives);
      }
    } catch (err) {
      console.error('Error generating AI objectives:', err);
    } finally {
      setGeneratingObjectives(false);
    }
  };

  // Merge selected ontologies
  const handleMergeOntologies = async () => {
    if (selectedMergeOntoIds.length < 2) return;
    setMergingOntologies(true);
    try {
      let endpoint = '';
      if (selectedProject) {
        endpoint = `/api/projects/${selectedProject.id}/merge-ontologies`;
      } else if (selectedFunctionState) {
        endpoint = `/api/business-functions/${selectedFunctionState.id}/merge-ontologies`;
      } else if (selectedOrg) {
        endpoint = `/api/organizations/${selectedOrg.id}/merge-ontologies`;
      } else {
        return;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ontologyIds: selectedMergeOntoIds,
          mergedName: mergedOntoName
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMergedOntoName('');
        setSelectedMergeOntoIds([]);
        // Reload appropriate scope
        if (selectedProject) {
          await handleSelectProject(selectedProject);
        }
        if (selectedFunctionState) {
          await fetchOntologies(selectedFunctionState.id);
        }
        if (selectedOrg) {
          await fetchAllOntologies();
        }
      } else {
        setErrorMessage(data.error || 'Failed to merge ontologies');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred during merging');
    } finally {
      setMergingOntologies(false);
    }
  };

  // Add Competency Question
  const handleAddCQ = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCqText.trim() || !selectedOntology) return;

    try {
      const res = await fetch(`/api/ontologies/${selectedOntology.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cq',
          data: { question: newCqText },
        }),
      });
      if (res.ok) {
        setNewCqText('');
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleAddCQDirect = async (question: string) => {
    if (!question.trim() || !selectedOntology) return;
    try {
      const res = await fetch(`/api/ontologies/${selectedOntology.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cq',
          data: { question },
        }),
      });
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Toggle CQ status between Draft and Ratified
  const handleToggleCQ = async (cq: any) => {
    try {
      const nextStatus = cq.status === 'Ratified' ? 'Draft' : 'Ratified';
      const res = await fetch(`/api/cqs/${cq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Delete CQ
  const handleDeleteCQ = async (cqId: string) => {
    try {
      const res = await fetch(`/api/cqs/${cqId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Ontology Update
  const handleUpdateOntology = async (updatedData: any) => {
    if (!selectedOntology) return;
    try {
      const res = await fetch(`/api/ontologies/${selectedOntology.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Concept Handlers
  const handleAddConcept = async (label: string, conceptType: string) => {
    if (!selectedOntology) return;
    try {
      const res = await fetch(`/api/ontologies/${selectedOntology.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'concept',
          data: { label, conceptType },
        }),
      });
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleUpdateConcept = async (id: string, updatedData: any) => {
    try {
      const res = await fetch(`/api/concepts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleDeleteConcept = async (id: string) => {
    try {
      const res = await fetch(`/api/concepts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Relationship Handlers
  const handleAddRelationship = async (name: string, sourceId: string, targetId: string) => {
    if (!selectedOntology) return;
    try {
      const res = await fetch(`/api/ontologies/${selectedOntology.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'relationship',
          data: { name, sourceId, targetId },
        }),
      });
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleUpdateRelationship = async (id: string, updatedData: any) => {
    try {
      const res = await fetch(`/api/relationships/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  const handleDeleteRelationship = async (id: string) => {
    try {
      const res = await fetch(`/api/relationships/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // File Import uploader
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedOntology) return;

    setImporting(true);
    setErrorMessage(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/ontologies/${selectedOntology.id}/import`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        await loadOntologyData(selectedOntology.id);
      } else {
        setErrorMessage(data.error || 'Import failed');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error uploading file');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Delete ontology and go back
  const handleDeleteOntology = async (ontoId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation(); // Prevent opening the modeler
    if (!confirm('Are you sure you want to delete this ontology? This action cannot be undone.')) return;
    try {
      const res = await fetch(`/api/ontologies/${ontoId}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedOntology(null);
        await fetchAllOntologies();
        if (selectedProject && selectedProject.id !== 'cross-functional') {
          await handleSelectProject(selectedProject);
        }
        if (selectedFunctionState) {
          await fetchOntologies(selectedFunctionState.id);
        }
      } else {
        const data = await res.json();
        setErrorMessage(data.error || 'Failed to delete ontology');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error deleting ontology');
    }
  };

  // Delete project and go back
  const handleDeleteProject = async (projId: string) => {
    if (!confirm('Are you sure you want to delete this business solution? This will delete all its aligned ontologies.')) return;
    try {
      const res = await fetch(`/api/projects/${projId}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedProject(null);
        if (selectedFunctionState) {
          await fetchProjects(selectedFunctionState.id);
          await fetchOntologies(selectedFunctionState.id);
        } else {
          await fetchProjects();
        }
      } else {
        const errData = await res.json();
        alert(`Failed to delete project: ${errData.error || 'Server error'}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      
      {/* Banner / Error Toast */}
      {errorMessage && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          background: 'rgba(239, 68, 68, 0.95)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '14px',
          backdropFilter: 'blur(8px)',
        }}>
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}      {/* VIEW 1: Enterprise Semantic Modeler Homepage (Page 1: Simplified Ontology Library) */}
      {!selectedOntology && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', width: '100%', background: '#f8fafc', color: '#0f172a' }}>
          {/* Top Bar Header */}
          <div style={{ padding: '14px 32px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(37,99,235,0.2)' }}>
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 style={{ fontSize: '17px', fontWeight: '800', color: '#0f172a' }}>
                  SemanticModeller
                </h1>
                <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.04em' }}>Enterprise Knowledge Graph Studio</span>
              </div>
            </div>

            {/* Header Search Bar & Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '600px', margin: '0 24px' }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <Search className="w-4 h-4 text-slate-400" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search ontologies by name, description, organization, or industry..."
                  value={homepageSearchQuery}
                  onChange={(e) => setHomepageSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: '36px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={() => {
                  fetchLlmConfigs();
                  setShowSettingsModal(true);
                }}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '7px 12px' }}
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                <span>LLM Profile</span>
              </button>

              <button
                onClick={() => setShowQuickStartModal(true)}
                className="btn-primary"
                style={{ fontSize: '11px', padding: '8px 14px', fontWeight: '700' }}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ New Ontology</span>
              </button>
            </div>
          </div>

          {/* Main Workspace Body */}
          <div style={{ padding: '24px 32px', maxWidth: '1440px', width: '100%', margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Library Count & Filter Summary Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#475569' }}>
                Ontology Library ({allOntologies.filter(o => {
                  if (!homepageSearchQuery.trim()) return true;
                  const q = homepageSearchQuery.toLowerCase();
                  return (o.name || '').toLowerCase().includes(q) ||
                    (o.description || '').toLowerCase().includes(q) ||
                    (o.industry || '').toLowerCase().includes(q) ||
                    (o.organization?.name || '').toLowerCase().includes(q);
                }).length} Onboarded)
              </div>
              {homepageSearchQuery && (
                <button
                  onClick={() => setHomepageSearchQuery('')}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '11px', cursor: 'pointer', fontWeight: '700' }}
                >
                  Clear Search
                </button>
              )}
            </div>

            {/* Merge Action Banner */}
            {selectedMergeOntoIds.length >= 2 && (
              <div style={{ padding: '12px 18px', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#1d4ed8' }}>🔗 Merge {selectedMergeOntoIds.length} Selected Ontologies</div>
                  <div style={{ fontSize: '11px', color: '#475569' }}>Combine concepts, relationships, and competencies into a unified target ontology.</div>
                </div>
                <button
                  onClick={handleMergeOntologies}
                  disabled={mergingOntologies}
                  className="btn-primary"
                  style={{ padding: '6px 14px', fontSize: '11px', fontWeight: '800', whiteSpace: 'nowrap' }}
                >
                  {mergingOntologies ? 'Merging...' : 'Execute Merge'}
                </button>
              </div>
            )}

            {/* Compact Ontologies Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {allOntologies
                .filter(o => {
                  if (!homepageSearchQuery.trim()) return true;
                  const q = homepageSearchQuery.toLowerCase();
                  return (o.name || '').toLowerCase().includes(q) ||
                    (o.description || '').toLowerCase().includes(q) ||
                    (o.industry || '').toLowerCase().includes(q) ||
                    (o.organization?.name || '').toLowerCase().includes(q);
                })
                .map(onto => {
                  const isChecked = selectedMergeOntoIds.includes(onto.id);
                  const qReport = evaluateOntologyQuality(onto);

                  return (
                    <div
                      key={onto.id}
                      style={{
                        background: isChecked ? '#eff6ff' : '#ffffff',
                        border: isChecked ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        borderRadius: '10px',
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div>
                        {/* Top Card Row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedMergeOntoIds([...selectedMergeOntoIds, onto.id]);
                                } else {
                                  setSelectedMergeOntoIds(selectedMergeOntoIds.filter(id => id !== onto.id));
                                }
                              }}
                              style={{ cursor: 'pointer', accentColor: '#2563eb' }}
                            />
                            <div style={{ padding: '2px 7px', borderRadius: '12px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', fontSize: '10px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>{qReport.healthScore}%</span>
                            </div>
                          </div>

                          <span style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', padding: '2px 6px', borderRadius: '4px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                            {onto.organization?.name || onto.industry || 'ENTERPRISE'}
                          </span>
                        </div>

                        {/* Title */}
                        <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a', marginBottom: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.3' }}>
                          {onto.name}
                        </h3>
                        <p style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.35', marginBottom: '10px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {onto.description || 'Enterprise domain semantic model.'}
                        </p>

                        {/* Compact Metrics Row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 10px', borderRadius: '6px', fontSize: '10px', color: '#475569', fontWeight: '700' }}>
                          <span><strong>{onto.concepts?.length || onto._count?.concepts || 0}</strong> Concepts</span>
                          <span>•</span>
                          <span><strong>{onto.relationships?.length || onto._count?.relationships || 0}</strong> Relations</span>
                          <span>•</span>
                          <span><strong>{onto.competencyQuestions?.length || onto._count?.competencyQuestions || 0}</strong> CQs</span>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                        <button
                          onClick={() => handleSelectOntology(onto)}
                          className="btn-primary"
                          style={{ flex: 1, padding: '6px 10px', fontSize: '11px', fontWeight: '700', borderRadius: '6px' }}
                        >
                          View Model
                        </button>
                        <button
                          onClick={(e) => handleDeleteOntology(onto.id, e)}
                          className="btn-danger"
                          style={{ padding: '6px', borderRadius: '6px' }}
                          title="Delete Ontology"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Studio Modeler Workspace */}
      {selectedOntology && (
        <div className="app-container" style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
          
          {/* MIDDLE COLUMN: Navigation Header, Lineage, Canvas & AI Modeler */}
          <div className="middle-panel" style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, flexShrink: 1, width: 0, height: '100%', overflow: 'hidden', position: 'relative' }}>
            
            {/* Top Studio Action & Lineage Bar */}
            <div style={{ padding: '8px 16px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '14px', zIndex: 11 }}>
              {/* Back to Homepage Button */}
              <button
                onClick={() => {
                  setSelectedOntology(null);
                  setSelectedProject(null);
                  if (selectedFunctionState) {
                    fetchOntologies(selectedFunctionState.id);
                  }
                }}
                className="btn-secondary"
                style={{ padding: '6px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700' }}
                title="Back to Homepage Ontology Library"
              >
                <ArrowLeft size={16} />
                <span>Homepage</span>
              </button>

              {/* Ontology Switcher Dropdown */}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: '180px' }}>
                <span style={{ fontSize: '9px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                  Active Domain Ontology
                </span>
                <select
                  value={selectedOntology.id}
                  onChange={(e) => loadOntologyData(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#0f172a',
                    fontSize: '13px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    outline: 'none',
                    padding: 0,
                  }}
                >
                  {allOntologies.map((o: any) => (
                    <option key={o.id} value={o.id} style={{ background: '#ffffff', color: '#0f172a' }}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Merged Studio Lineage & Quality Scorecard Bar */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <LineageBreadcrumb lineage={activeLineage} qualityReport={ontologyQualityReport} compact />
              </div>
            </div>

            {/* Top 5-Stage Agent Execution Stepper */}
            <div style={{ padding: '8px 16px 0 16px', background: '#ffffff', zIndex: 10 }}>
              <AgentStepper stages={pipelineStages} isExecuting={isExecutingPipeline} />
            </div>

            {/* MIDDLE CANVAS: React Three Fiber Canvas */}
            <div className="middle-canvas" style={{ flexGrow: 1, flexShrink: 1, height: 0, position: 'relative' }}>
              {concepts.length === 0 ? (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', zIndex: 5 }}>
                  <Bot size={48} style={{ color: 'var(--color-primary)', marginBottom: '16px', animation: 'pulse 2s infinite' }} />
                  <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Ontology is empty</h3>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', maxWidth: '350px', margin: '0 auto' }}>
                    Use the bottom AI panel or the right inspector tabs to manually build the ontology!
                  </p>
                </div>
              ) : (
                <ThreeCanvas
                  concepts={concepts}
                  relationships={relationships}
                  driverEdges={memoizedDriverEdges}
                  selectedId={selectedElement?.id}
                  selectedType={elementType}
                  cqs={cqs}
                  driverTrees={driverTrees}
                  perspectives={perspectives}
                  causalCycles={causalCycles}
                  onSelectConcept={(concept) => {
                    setSelectedElement(concept);
                    setElementType(concept ? 'concept' : 'ontology');
                  }}
                  onSelectRelationship={(rel) => {
                    setSelectedElement(rel);
                    setElementType('relationship');
                  }}
                  onRefresh={() => loadOntologyData(selectedOntology.id)}
                  onAddConcept={handleAddConcept}
                  onUpdateConcept={handleUpdateConcept}
                  onDeleteConcept={handleDeleteConcept}
                  onAddRelationship={handleAddRelationship}
                  onUpdateRelationship={handleUpdateRelationship}
                  onDeleteRelationship={handleDeleteRelationship}
                />
              )}
            </div>

            {/* Bottom Resizer divider handle */}
            <div
              onMouseDown={startResizeBottom}
              style={{
                height: '4px',
                cursor: 'row-resize',
                background: 'rgba(255,255,255,0.03)',
                borderTop: '1px solid var(--border-translucent)',
                borderBottom: '1px solid var(--border-translucent)',
                zIndex: 10,
                transition: 'background-color 0.15s',
                alignSelf: 'stretch',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            />

            {/* BOTTOM PANEL: AI Ontology Modeler */}
            <div className="bottom-ai-panel" style={{ height: `${bottomHeight}px`, flexShrink: 0, flexGrow: 0, background: '#f8fafc', borderTop: '1px solid var(--border-translucent)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ChatPanel
                ontologyId={selectedOntology.id}
                concepts={concepts}
                relationships={relationships}
                cqs={cqs}
                driverTrees={driverTrees}
                perspectives={perspectives}
                causalCycles={causalCycles}
                onGenerationComplete={() => loadOntologyData(selectedOntology.id)}
                onGenerationStart={handleStartStageStepper}
                onAutoFix={() => handleRunAgentPipeline(undefined, true)}
                isFixing={isExecutingPipeline}
              />
            </div>
          </div>

          {/* Right Panel Resizer divider handle */}
          <div
            onMouseDown={startResizeRight}
            style={{
              width: '4px',
              cursor: 'col-resize',
              background: 'rgba(255,255,255,0.03)',
              borderLeft: '1px solid var(--border-translucent)',
              borderRight: '1px solid var(--border-translucent)',
              zIndex: 10,
              transition: 'background-color 0.15s',
              alignSelf: 'stretch',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
          />

          {/* RIGHT PANEL: Modeler Inspector & Management Tabs */}
          <div className="right-panel" style={{ width: `${rightWidth}px`, flexShrink: 0, flexGrow: 0 }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ModelerPanel
                selectedElement={selectedElement}
                elementType={elementType}
                ontology={selectedOntology}
                onUpdateOntology={handleUpdateOntology}
                onUpdateConcept={handleUpdateConcept}
                onDeleteConcept={handleDeleteConcept}
                onUpdateRelationship={handleUpdateRelationship}
                onDeleteRelationship={handleDeleteRelationship}
                onAddConcept={handleAddConcept}
                onAddRelationship={handleAddRelationship}
                conceptsList={concepts}
                relationshipsList={relationships}
                driverTrees={driverTrees}
                cqsList={cqs}
                perspectives={perspectives}
                causalCycles={causalCycles}
                onSelectConcept={(concept) => {
                  setSelectedElement(concept);
                  setElementType('concept');
                }}
                onClose={() => {
                  setSelectedElement(null);
                  setElementType('ontology');
                }}
                onAddCQ={handleAddCQDirect}
                onDeleteCQ={handleDeleteCQ}
                onToggleCQ={handleToggleCQ}
                handleFileImport={handleFileImport}
                importing={importing}
                fileInputRef={fileInputRef}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quick Start Ontology Creation Modal */}
      {showQuickStartModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100,
          padding: '20px',
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '500px', padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-primary)' }}>✨ Quick Start Standalone Ontology</h2>
              <button
                onClick={() => {
                  setQuickOntoName('');
                  setQuickOntoDesc('');
                  setShowQuickStartModal(false);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateQuickOntology} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-main)', marginBottom: '6px', display: 'block' }}>
                  Ontology Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SalesPerformanceTracker"
                  className="form-input"
                  value={quickOntoName}
                  onChange={(e) => setQuickOntoName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-main)', marginBottom: '6px', display: 'block' }}>
                  Description (Optional)
                </label>
                <textarea
                  placeholder="What is this ontology modeling?"
                  className="form-input"
                  rows={3}
                  value={quickOntoDesc}
                  onChange={(e) => setQuickOntoDesc(e.target.value)}
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setQuickOntoName('');
                    setQuickOntoDesc('');
                    setShowQuickStartModal(false);
                  }}
                  className="btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!quickOntoName.trim()}
                  className="btn-primary"
                  style={{ flex: 1 }}
                >
                  🚀 Start Modeling
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LLM Providers Configuration Modal */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100,
          padding: '20px',
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '600px', padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-primary)' }}>⚙️ LLM Provider Settings</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '16px' }}
              >
                ✕
              </button>
            </div>

            {/* Configured Profiles List */}
            <div>
              <h4 style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Active Config Profiles</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {llmConfigs.map(config => (
                  <div key={config.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-translucent)', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{config.name}</span>
                        {config.isActive && (
                          <span style={{ fontSize: '9px', background: 'rgba(16,185,129,0.15)', color: '#34d399', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(16,185,129,0.3)' }}>
                            Active
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Provider: {config.provider} | Model: {config.modelName}
                      </div>
                    </div>
                     <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                       {!config.isActive && (
                         <button
                           onClick={async () => {
                             await fetch(`/api/llm-configs/${config.id}`, {
                               method: 'PATCH',
                               headers: { 'Content-Type': 'application/json' },
                               body: JSON.stringify({ isActive: true }),
                             });
                             await fetchLlmConfigs();
                           }}
                           className="btn-secondary"
                           style={{ padding: '4px 10px', fontSize: '11px' }}
                         >
                           Activate
                         </button>
                       )}
                       <button
                         onClick={() => {
                           setEditingLlmConfigId(config.id);
                           setNewLlmName(config.name);
                           setNewLlmProvider(config.provider);
                           setNewLlmModelName(config.modelName);
                           setNewLlmBaseUrl(config.baseUrl || '');
                           setNewLlmApiKey(config.apiKey || '');
                         }}
                         className="btn-secondary"
                         style={{ padding: '4px 10px', fontSize: '11px' }}
                       >
                         ✏️ Edit
                       </button>
                       <button
                         onClick={async () => {
                           if (editingLlmConfigId === config.id) {
                             setEditingLlmConfigId(null);
                             setNewLlmName('');
                             setNewLlmApiKey('');
                             setNewLlmBaseUrl('');
                             setNewLlmModelName('');
                           }
                           await fetch(`/api/llm-configs/${config.id}`, { method: 'DELETE' });
                           await fetchLlmConfigs();
                         }}
                         style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: '4px' }}
                       >
                         <Trash2 size={14} />
                       </button>
                     </div>
                  </div>
                ))}
                {llmConfigs.length === 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                    No LLM configurations defined. Fallback to standard LM Studio (localhost:1234).
                  </div>
                )}
              </div>
            </div>

            {/* Add New Configuration Form */}
            <div style={{ borderTop: '1px solid var(--border-translucent)', paddingTop: '15px' }}>
              <h4 style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                {editingLlmConfigId ? '✏️ Edit Config Profile' : 'Add Config Profile'}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Profile Name <span style={{ color: 'var(--color-error)' }}>*</span></label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. OpenAI GPT-4o"
                      value={newLlmName}
                      onChange={(e) => setNewLlmName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Provider</label>
                    <select
                      className="form-input"
                      value={newLlmProvider}
                      onChange={(e) => {
                        setNewLlmProvider(e.target.value);
                        if (e.target.value === 'OPENAI') {
                          setNewLlmModelName('gpt-4o');
                          setNewLlmBaseUrl('');
                        } else if (e.target.value === 'ANTHROPIC') {
                          setNewLlmModelName('claude-3-5-sonnet-20240620');
                          setNewLlmBaseUrl('');
                        } else if (e.target.value === 'GOOGLE') {
                          setNewLlmModelName('gemini-3.5-flash');
                          setNewLlmBaseUrl('');
                        } else {
                          setNewLlmModelName('lmstudio-community');
                          setNewLlmBaseUrl('http://localhost:1234/v1');
                        }
                      }}
                    >
                      <option value="LM_STUDIO">LM Studio / Local Ollama</option>
                      <option value="OPENAI">OpenAI (Cloud)</option>
                      <option value="ANTHROPIC">Anthropic (Cloud)</option>
                      <option value="GOOGLE">Google Gemini (Cloud)</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Model ID / Name <span style={{ color: 'var(--color-error)' }}>*</span></label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. gpt-4o"
                      value={newLlmModelName}
                      onChange={(e) => setNewLlmModelName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Base URL (Optional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. http://localhost:1234/v1"
                      value={newLlmBaseUrl}
                      onChange={(e) => setNewLlmBaseUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>API Key / Secret Token</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="sk-..."
                    value={newLlmApiKey}
                    onChange={(e) => setNewLlmApiKey(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={async () => {
                      if (!newLlmName.trim() || !newLlmModelName.trim()) return;
                      
                      if (editingLlmConfigId) {
                        await fetch(`/api/llm-configs/${editingLlmConfigId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: newLlmName,
                            provider: newLlmProvider,
                            modelName: newLlmModelName,
                            baseUrl: newLlmBaseUrl,
                            apiKey: newLlmApiKey,
                          }),
                        });
                        setEditingLlmConfigId(null);
                      } else {
                        await fetch('/api/llm-configs', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            name: newLlmName,
                            provider: newLlmProvider,
                            modelName: newLlmModelName,
                            baseUrl: newLlmBaseUrl,
                            apiKey: newLlmApiKey,
                            isActive: llmConfigs.length === 0,
                          }),
                        });
                      }
                      
                      setNewLlmName('');
                      setNewLlmApiKey('');
                      setNewLlmBaseUrl('');
                      setNewLlmModelName('');
                      await fetchLlmConfigs();
                    }}
                    disabled={!newLlmName.trim() || !newLlmModelName.trim()}
                    className="btn-primary"
                    style={{ flex: 1, marginTop: '10px' }}
                  >
                    {editingLlmConfigId ? 'Save Changes' : 'Create & Register Profile'}
                  </button>
                  {editingLlmConfigId && (
                    <button
                      onClick={() => {
                        setEditingLlmConfigId(null);
                        setNewLlmName('');
                        setNewLlmApiKey('');
                        setNewLlmBaseUrl('');
                        setNewLlmModelName('');
                      }}
                      className="btn-secondary"
                      style={{ marginTop: '10px' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
