'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Sparkles, Plus, Trash2, X } from 'lucide-react';
const ThreeLine = 'line' as any;

interface Node3D {
  id: string;
  label: string;
  conceptType: string;
  x: number;
  y: number;
  z: number;
  grouping?: string;
  parentId?: string;
  isGrounded?: boolean;
  isStart?: boolean;
  isEnd?: boolean;
  isOrphan?: boolean;
}

interface Relationship {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
}

interface DriverEdge {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
}

interface ThreeCanvasProps {
  concepts: any[];
  relationships: Relationship[];
  driverEdges: DriverEdge[];
  onSelectConcept: (concept: any) => void;
  onSelectRelationship: (rel: any) => void;
  selectedId?: string | null;
  selectedType?: 'concept' | 'relationship' | 'ontology' | 'cq' | 'driverTree' | null;
  cqs?: any[];
  driverTrees?: any[];
  perspectives?: any[];
  causalCycles?: any[];
  isModalOpen?: boolean;
  onRefresh: () => void;
  onAddConcept?: (label: string, type: string) => Promise<any>;
  onUpdateConcept?: (id: string, updatedData: any) => Promise<void>;
  onDeleteConcept?: (id: string) => Promise<void>;
  onAddRelationship?: (name: string, sourceId: string, targetId: string) => Promise<any>;
  onUpdateRelationship?: (id: string, updatedData: any) => Promise<void>;
  onDeleteRelationship?: (id: string) => Promise<void>;
}

function getDeterministicPosition(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const x = ((hash & 0xFF) / 255 - 0.5) * 24;
  const y = (((hash >> 8) & 0xFF) / 255 - 0.5) * 24;
  const z = (((hash >> 16) & 0xFF) / 255 - 0.5) * 24;
  return { x, y, z };
}

// 3D/2D Force-Directed Layout Generator with Linear Process Swimlane Alignment
function run3DLayout(nodes: any[], links: Relationship[], driverLinks: DriverEdge[], force2D: boolean = false): Node3D[] {
  const k = 10.0; // Ideal spring length for compact, readable concept spacing
  const iterations = 100;
  
  // 1. Identify Process concepts and sequence flows
  const processNodes = nodes.filter(n => n.conceptType?.toLowerCase() === 'process');
  const processNodeIds = new Set(processNodes.map(p => p.id));
  
  // A relationship is a process sequence edge if it links two processes
  const sequenceLinks = links.filter(l => processNodeIds.has(l.sourceId) && processNodeIds.has(l.targetId));
  
  // Calculate in-degree count to find sequence entrypoints
  const inDegrees = new Map<string, number>();
  processNodes.forEach(p => inDegrees.set(p.id, 0));
  sequenceLinks.forEach(l => {
    inDegrees.set(l.targetId, (inDegrees.get(l.targetId) || 0) + 1);
  });
  
  // Trace linear sequence of process steps
  const processSequence: string[] = [];
  let remaining = [...processNodes];
  
  // Get start nodes (in-degree 0)
  let queue = remaining.filter(p => inDegrees.get(p.id) === 0);
  
  while (queue.length > 0) {
    queue.sort((a, b) => a.label.localeCompare(b.label));
    const current = queue.shift()!;
    processSequence.push(current.id);
    remaining = remaining.filter(p => p.id !== current.id);
    
    const outgoingTargets = sequenceLinks.filter(l => l.sourceId === current.id).map(l => l.targetId);
    outgoingTargets.forEach(tgtId => {
      inDegrees.set(tgtId, inDegrees.get(tgtId)! - 1);
    });
    
    const newFree = remaining.filter(p => inDegrees.get(p.id) === 0 && !queue.some(q => q.id === p.id));
    queue.push(...newFree);
  }
  
  // Append any cyclic or disconnected process nodes
  remaining.forEach(p => {
    if (!processSequence.includes(p.id)) {
      processSequence.push(p.id);
    }
  });

  // 2. Initialize node positions (flat Z if force2D is active)
  const layoutNodes: Node3D[] = nodes.map((n) => {
    const pos = getDeterministicPosition(n.id);
    return {
      id: n.id,
      label: n.label,
      conceptType: n.conceptType || 'Entity',
      x: pos.x,
      y: pos.y,
      z: force2D ? 0 : pos.z,
      grouping: n.typeFields?.grouping || undefined,
      parentId: n.typeFields?.parentId || undefined,
      isGrounded: n.mappings && n.mappings.length > 0,
    };
  });
  
  const nodeMap = new Map<string, Node3D>(layoutNodes.map(n => [n.id, n]));
  
  // Compute Hierarchical Layers (BFS Columns) for Left-to-Right 2D Mind Map Rendering
  const targetCoords = new Map<string, { x: number; y: number }>();
  if (force2D) {
    const visited = new Set<string>();
    const bfsQueue: { id: string; depth: number }[] = [];
    const layers = new Map<string, number>();

    // Start with process sequence entrypoint if available
    if (processSequence.length > 0 && nodes.some(n => n.id === processSequence[0])) {
      const startId = processSequence[0];
      bfsQueue.push({ id: startId, depth: 0 });
      visited.add(startId);
      
      while (bfsQueue.length > 0) {
        const { id, depth } = bfsQueue.shift()!;
        layers.set(id, depth);

        links.forEach(l => {
          if (l.sourceId === id && !visited.has(l.targetId)) {
            visited.add(l.targetId);
            bfsQueue.push({ id: l.targetId, depth: depth + 1 });
          } else if (l.targetId === id && !visited.has(l.sourceId)) {
            visited.add(l.sourceId);
            bfsQueue.push({ id: l.sourceId, depth: depth + 1 });
          }
        });
      }
    }

    // Run BFS on remaining unvisited nodes for multi-component support
    nodes.forEach(n => {
      if (!visited.has(n.id)) {
        bfsQueue.push({ id: n.id, depth: 0 });
        visited.add(n.id);
        
        while (bfsQueue.length > 0) {
          const { id, depth } = bfsQueue.shift()!;
          layers.set(id, depth);

          links.forEach(l => {
            if (l.sourceId === id && !visited.has(l.targetId)) {
              visited.add(l.targetId);
              bfsQueue.push({ id: l.targetId, depth: depth + 1 });
            } else if (l.targetId === id && !visited.has(l.sourceId)) {
              visited.add(l.sourceId);
              bfsQueue.push({ id: l.sourceId, depth: depth + 1 });
            }
          });
        }
      }
    });

    // Default depth for remaining unvisited nodes
    nodes.forEach(n => {
      if (!layers.has(n.id)) {
        layers.set(n.id, 0);
      }
    });

    // Group node IDs by depth layers
    const layerGroups = new Map<number, string[]>();
    layers.forEach((depth, id) => {
      if (!layerGroups.has(depth)) layerGroups.set(depth, []);
      layerGroups.get(depth)!.push(id);
    });

    // Center lay-out columns horizontally, and space vertically centered
    const sortedDepths = Array.from(layerGroups.keys()).sort((a, b) => a - b);
    const maxDepth = sortedDepths.length > 0 ? sortedDepths[sortedDepths.length - 1] : 0;

    sortedDepths.forEach(depth => {
      const ids = layerGroups.get(depth)!;
      ids.sort((a, b) => {
        const na = nodes.find(n => n.id === a);
        const nb = nodes.find(n => n.id === b);
        const score = (t: string) => {
          if (t === 'process') return 0;
          if (t === 'entity') return 1;
          if (t === 'persona') return 2;
          return 3;
        };
        return score(na?.conceptType?.toLowerCase() || '') - score(nb?.conceptType?.toLowerCase() || '');
      });

      const count = ids.length;
      ids.forEach((id, idx) => {
        const tx = (depth - maxDepth / 2) * 14.0; // Compact horizontal columns
        const ty = (idx - (count - 1) / 2) * 6.5; // Compact vertical rows
        targetCoords.set(id, { x: tx, y: ty });
      });
    });
  }

  // 3. Physical spring layout iterations
  for (let step = 0; step < iterations; step++) {
    // Repulsion
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const n1 = layoutNodes[i];
        const n2 = layoutNodes[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dz = force2D ? 0 : (n2.z - n1.z);
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.1;
        
        const force = 8.0 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = force2D ? 0 : ((dz / dist) * force);
        
        n1.x -= fx;
        n1.y -= fy;
        n1.z -= fz;
        n2.x += fx;
        n2.y += fy;
        n2.z += fz;
      }
    }
    
    // Attraction
    const allLinks = [
      ...links.map(l => ({ sourceId: l.sourceId, targetId: l.targetId })),
      ...driverLinks.map(d => ({ sourceId: d.sourceId, targetId: d.targetId }))
    ];

    for (const link of allLinks) {
      const source = nodeMap.get(link.sourceId);
      const target = nodeMap.get(link.targetId);
      if (source && target) {
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dz = force2D ? 0 : (target.z - source.z);
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.1;
        
        const force = 0.12 * (dist - k);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        const fz = force2D ? 0 : ((dz / dist) * force);
        
        source.x += fx;
        source.y += fy;
        source.z += fz;
        target.x -= fx;
        target.y -= fy;
      }
    }

    // Custom attraction towards parent process step for hierarchical clustering
    for (const n of layoutNodes) {
      if (n.parentId) {
        const parent = nodeMap.get(n.parentId);
        if (parent) {
          const dx = parent.x - n.x;
          const dy = parent.y - n.y;
          const dz = force2D ? 0 : (parent.z - n.z);
          const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 0.1;
          
          const force = 0.08 * dist;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          const fz = force2D ? 0 : ((dz / dist) * force);
          
          n.x += fx;
          n.y += fy;
          n.z += fz;
        }
      }
    }
    
    // 4. Calculate Group Centers of Mass for clustering (Only in 3D Mode)
    const groups = new Map<string, Node3D[]>();
    const groupCenters = new Map<string, { x: number; y: number; z: number }>();
    if (!force2D) {
      layoutNodes.forEach(n => {
        if (n.grouping) {
          if (!groups.has(n.grouping)) groups.set(n.grouping, []);
          groups.get(n.grouping)!.push(n);
        }
      });

      groups.forEach((groupNodes, groupName) => {
        let gx = 0, gy = 0, gz = 0;
        groupNodes.forEach(gn => {
          gx += gn.x;
          gy += gn.y;
          gz += gn.z;
        });
        groupCenters.set(groupName, {
          x: gx / groupNodes.length,
          y: gy / groupNodes.length,
          z: gz / groupNodes.length,
        });
      });
    }

    // 5. Apply layout mode target positioning forces
    for (const n of layoutNodes) {
      if (force2D && targetCoords.has(n.id)) {
        const target = targetCoords.get(n.id)!;
        n.x += (target.x - n.x) * 0.45;
        n.y += (target.y - n.y) * 0.45;
        n.z = 0;
      } else if (processSequence.includes(n.id)) {
        const seqIdx = processSequence.indexOf(n.id);
        const targetX = (seqIdx - (processSequence.length - 1) / 2) * 10.5; // Increased process spacing
        
        n.x += (targetX - n.x) * 0.35;
        if (force2D) {
          n.y += (0 - n.y) * 0.35;
          n.z = 0;
        } else {
          // Allow processes to expand in Y and Z dimensions in 3D mode for pure 3D layout
          n.y += (0 - n.y) * 0.05;
          n.z += (0 - n.z) * 0.05;
        }
      } else {
        if (n.grouping && groupCenters.has(n.grouping)) {
          const center = groupCenters.get(n.grouping)!;
          n.x += (center.x - n.x) * 0.15;
          n.y += (center.y - n.y) * 0.15;
          n.z += (center.z - n.z) * 0.15;
        }
        
        // Gentle gravity centering force instead of aggressive collapse
        n.x += (0 - n.x) * 0.02;
        n.y += (0 - n.y) * 0.02;
        n.z += (0 - n.z) * 0.02;
      }
    }
  }
  
  const connectedIds = new Set<string>();
  links.forEach(l => { connectedIds.add(l.sourceId); connectedIds.add(l.targetId); });
  driverLinks.forEach(d => { connectedIds.add(d.sourceId); connectedIds.add(d.targetId); });

  return layoutNodes.map(n => ({
    ...n,
    isStart: n.conceptType?.toLowerCase() === 'process' && processSequence[0] === n.id,
    isEnd: n.conceptType?.toLowerCase() === 'process' && processSequence[processSequence.length - 1] === n.id,
    isOrphan: !connectedIds.has(n.id),
  }));
}

function getNodeColor(type: string, label: string, isSelected: boolean): string {
  if (isSelected) return '#ec4899';
  if (label?.startsWith('[JOB]')) return '#6366f1'; // Indigo
  if (label?.startsWith('[OUTCOME]')) return '#f59e0b'; // Amber/Gold
  switch (type?.toLowerCase()) {
    case 'metric':
      return '#f59e0b';
    case 'process':
      return '#10b981';
    case 'persona':
      return '#a855f7';
    default:
      return '#3b82f6';
  }
}

interface NodeComponentProps {
  node: Node3D;
  isSelected: boolean;
  isDimmed: boolean;
  onClick: () => void;
  onDragPositionChange?: (id: string, newPos: { x: number; y: number; z: number }) => void;
  viewMode?: '2d' | '3d';
  isModalOpen?: boolean;
}

function NodeItem({ node, isSelected, isDimmed, onClick, onDragPositionChange, viewMode, isModalOpen }: NodeComponentProps) {
  const [hovered, setHover] = useState(false);
  const color = getNodeColor(node.conceptType, node.label, isSelected);
  const isDraggingRef = useRef(false);
  const dragStartMouse = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: node.x, y: node.y, z: node.z });
  const { camera } = useThree();

  const isJob = node.label.startsWith('[JOB]');
  const isOutcome = node.label.startsWith('[OUTCOME]');
  const cleanLabel = node.label.replace(/^\[JOB\]\s*/, '').replace(/^\[OUTCOME\]\s*/, '');

  return (
    <group position={[node.x, node.y, node.z]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          if (!isDraggingRef.current) {
            onClick();
          }
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          isDraggingRef.current = false;
          dragStartMouse.current = { x: e.clientX, y: e.clientY };
          dragStartPos.current = { x: node.x, y: node.y, z: node.z };
          try {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          } catch (err) {}
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) {
            const dx = e.clientX - dragStartMouse.current.x;
            const dy = e.clientY - dragStartMouse.current.y;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
              isDraggingRef.current = true;
              e.stopPropagation();
              const dist = camera.position.distanceTo(new THREE.Vector3(node.x, node.y, node.z)) || 20;
              const scale = (dist / 650);
              const newX = dragStartPos.current.x + dx * scale;
              const newY = dragStartPos.current.y - dy * scale;
              if (onDragPositionChange) {
                onDragPositionChange(node.id, { x: newX, y: newY, z: viewMode === '2d' ? 0 : node.z });
              }
            }
          }
        }}
        onPointerUp={(e) => {
          if (isDraggingRef.current) {
            e.stopPropagation();
            try {
              (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
            } catch (err) {}
          }
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        <sphereGeometry args={[hovered || isSelected ? 0.38 : 0.28, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered || isSelected ? 0.5 : 0.15}
          roughness={0.1}
          metalness={0.1}
          transparent
          opacity={isDimmed ? 0.18 : 1.0}
        />
      </mesh>
      
      {!isModalOpen && (
        <Html distanceFactor={26} position={[0, 0.55, 0]} center zIndexRange={[50, 0]}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              border: isSelected
                ? '1px solid #ec4899'
                : node.isGrounded
                ? '1px solid #10b981'
                : node.isOrphan
                ? '1px dashed #ef4444'
                : '1px solid var(--border-translucent)',
              padding: '4px 8px',
              borderRadius: '6px',
              color: 'var(--color-text-main)',
              fontSize: '11px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              userSelect: 'none',
              boxShadow: isSelected
                ? '0 0 10px rgba(236,72,153,0.15)'
                : '0 2px 6px rgba(0,0,0,0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: isDimmed ? 0.22 : 1.0,
              transition: 'opacity 0.25s',
            }}
          >
            {node.isGrounded && (
              <span style={{ fontSize: '9px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                Grounded
              </span>
            )}
            {node.isOrphan && (
              <span style={{ fontSize: '9px', background: '#ef4444', color: '#fff', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                ⚠️ Unconnected
              </span>
            )}
            {isJob && (
              <span style={{ fontSize: '9px', background: '#6366f1', color: '#fff', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                Job
              </span>
            )}
            {isOutcome && (
              <span style={{ fontSize: '9px', background: '#f59e0b', color: '#fff', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                Outcome
              </span>
            )}
            {node.isStart && !isJob && (
              <span style={{ fontSize: '9px', background: '#10b981', color: '#fff', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                Start
              </span>
            )}
            {node.isEnd && !isJob && (
              <span style={{ fontSize: '9px', background: '#ec4899', color: '#fff', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                End
              </span>
            )}
            {node.grouping && (
              <span style={{ fontSize: '8px', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: 'var(--color-primary)', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.3px' }}>
                {node.grouping}
              </span>
            )}
            <span>{cleanLabel}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

// Edge (Link) Component
interface EdgeComponentProps {
  source: Node3D;
  target: Node3D;
  label: string;
  isSelected: boolean;
  isDimmed: boolean;
  onClick: () => void;
  isDriver?: boolean;
  customColor?: string;
  isModalOpen?: boolean;
}

function EdgeItem({ source, target, label, isSelected, isDimmed, onClick, isDriver, customColor, isModalOpen }: EdgeComponentProps) {
  const [hovered, setHover] = useState(false);
  const lineRef = useRef<any>(null);
  const particleRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (particleRef.current) {
      const offset = (source.x * 100 + source.y * 50 + source.z * 25) % 1.0;
      const t = ((clock.getElapsedTime() * 0.32) + Math.abs(offset)) % 1.0;
      particleRef.current.position.x = source.x + (target.x - source.x) * t;
      particleRef.current.position.y = source.y + (target.y - source.y) * t;
      particleRef.current.position.z = source.z + (target.z - source.z) * t;
    }
  });

  const points = useMemo(() => [
    new THREE.Vector3(source.x, source.y, source.z),
    new THREE.Vector3(target.x, target.y, target.z),
  ], [source.x, source.y, source.z, target.x, target.y, target.z]);

  const midPoint = useMemo(() => {
    return [
      (source.x + target.x) / 2,
      (source.y + target.y) / 2,
      (source.z + target.z) / 2,
    ];
  }, [source.x, source.y, source.z, target.x, target.y, target.z]);

  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.geometry.setFromPoints(points);
      lineRef.current.geometry.attributes.position.needsUpdate = true;
      if (isDriver) {
        lineRef.current.computeLineDistances();
      }
    }
  }, [points, isDriver]);

  const lineColor = customColor
    ? customColor
    : isSelected
    ? '#ec4899'
    : hovered
    ? '#7c3aed'
    : isDriver
    ? '#fbbf24'
    : 'rgba(15, 23, 42, 0.15)';

  const lineThickness = isSelected || hovered || customColor ? 2.5 : isDriver ? 1.5 : 1;
  const lineOpacity = isDimmed ? 0.08 : 0.8;

  return (
    <group>
      <ThreeLine ref={lineRef}>
        <bufferGeometry attach="geometry" />
        {isDriver ? (
          <lineDashedMaterial
            attach="material"
            color={lineColor}
            dashSize={0.4}
            gapSize={0.25}
            transparent
            opacity={lineOpacity}
          />
        ) : (
          <lineBasicMaterial
            attach="material"
            color={lineColor}
            linewidth={lineThickness}
            transparent
            opacity={lineOpacity}
          />
        )}
      </ThreeLine>

      <mesh ref={particleRef}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshBasicMaterial
          color={lineColor}
          transparent
          opacity={isDimmed ? 0.05 : 0.85}
        />
      </mesh>

      <mesh
        position={[midPoint[0], midPoint[1], midPoint[2]]}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        <boxGeometry args={[0.3, 0.3, points[0].distanceTo(points[1])]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      {!isModalOpen && (
        <Html distanceFactor={26} position={[midPoint[0], midPoint[1] + 0.3, midPoint[2]]} center zIndexRange={[50, 0]}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid var(--border-translucent)',
              padding: '4px 8px',
              borderRadius: '6px',
              color: isSelected ? '#ec4899' : isDriver ? '#fbbf24' : customColor ? customColor : 'var(--color-text-main)',
              fontSize: '11px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
              pointerEvents: 'none',
              opacity: isDimmed ? 0.12 : 1.0,
              transition: 'opacity 0.25s',
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

function CameraController({ 
  viewMode, 
  layoutNodes, 
  controlsRef,
  triggerFitViewCount,
  triggerZoomInCount,
  triggerZoomOutCount,
  triggerResetCenterCount,
}: { 
  viewMode: '2d' | '3d'; 
  layoutNodes: Node3D[]; 
  controlsRef: React.RefObject<any>;
  triggerFitViewCount: number;
  triggerZoomInCount: number;
  triggerZoomOutCount: number;
  triggerResetCenterCount: number;
}) {
  const { camera } = useThree();

  const fitView = () => {
    if (!layoutNodes || layoutNodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    layoutNodes.forEach(n => {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
      if (n.z < minZ) minZ = n.z;
      if (n.z > maxZ) maxZ = n.z;
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const width = maxX - minX || 10;
    const height = maxY - minY || 10;
    const depth = maxZ - minZ || 10;

    const maxDim = Math.max(width, height, depth);
    const fov = (camera as any).fov || 40;
    const fovRad = (fov * Math.PI) / 360;
    
    let distance = (maxDim / 2) / Math.tan(fovRad);
    const paddingMultiplier = viewMode === '2d' ? 1.35 : 1.25;
    distance = Math.max(distance * paddingMultiplier, 18);

    if (viewMode === '2d') {
      camera.position.set(centerX, centerY, distance);
    } else {
      camera.position.set(
        centerX + distance * 0.35, 
        centerY + distance * 0.25, 
        centerZ + distance * 0.85
      );
    }
    camera.lookAt(centerX, centerY, centerZ);

    if (controlsRef.current) {
      controlsRef.current.target.set(centerX, centerY, centerZ);
      controlsRef.current.update();
    }
  };

  useEffect(() => {
    fitView();
  }, [viewMode, layoutNodes.length]);

  useEffect(() => {
    if (triggerFitViewCount > 0) fitView();
  }, [triggerFitViewCount]);

  useEffect(() => {
    if (triggerZoomInCount > 0 && controlsRef.current && camera) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      camera.position.addScaledVector(dir, 5.0);
      controlsRef.current.update();
    }
  }, [triggerZoomInCount]);

  useEffect(() => {
    if (triggerZoomOutCount > 0 && controlsRef.current && camera) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      camera.position.addScaledVector(dir, -5.0);
      controlsRef.current.update();
    }
  }, [triggerZoomOutCount]);

  useEffect(() => {
    if (triggerResetCenterCount > 0 && controlsRef.current && camera) {
      controlsRef.current.target.set(0, 0, 0);
      if (viewMode === '2d') {
        camera.position.set(0, 0, 24);
      } else {
        camera.position.set(0, 0, 32);
      }
      controlsRef.current.update();
    }
  }, [triggerResetCenterCount]);

  return null;
}

export default function ThreeCanvas({
  concepts,
  relationships,
  driverEdges,
  onSelectConcept,
  onSelectRelationship,
  selectedId,
  selectedType,
  cqs = [],
  driverTrees = [],
  perspectives = [],
  causalCycles = [],
  isModalOpen = false,
  onRefresh,
  onAddConcept,
  onUpdateConcept,
  onDeleteConcept,
  onAddRelationship,
  onUpdateRelationship,
  onDeleteRelationship,
}: ThreeCanvasProps) {
  const [activeProcessFilter, setActiveProcessFilter] = useState<string | null>(null);
  const [activePerspectiveFilter, setActivePerspectiveFilter] = useState<string | null>(null);
  const [activeCausalCycleHighlight, setActiveCausalCycleHighlight] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d');
  const [spacingScale, setSpacingScale] = useState<number>(0.8);
  const [triggerFitViewCount, setTriggerFitViewCount] = useState(0);
  const [triggerZoomInCount, setTriggerZoomInCount] = useState(0);
  const [triggerZoomOutCount, setTriggerZoomOutCount] = useState(0);
  const [triggerResetCenterCount, setTriggerResetCenterCount] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draggedPositions, setDraggedPositions] = useState<Map<string, { x: number; y: number; z: number }>>(new Map());
  const controlsRef = useRef<any>(null);

  const handleDragPositionChange = (id: string, newPos: { x: number; y: number; z: number }) => {
    setDraggedPositions(prev => {
      const next = new Map(prev);
      next.set(id, newPos);
      return next;
    });
  };
  const [showAddConceptModal, setShowAddConceptModal] = useState(false);
  const [newConceptName, setNewConceptName] = useState('');
  const [newConceptType, setNewConceptType] = useState('Entity');
  const [showAddRelationshipModal, setShowAddRelationshipModal] = useState(false);
  const [newRelName, setNewRelName] = useState('');
  const [newRelSrc, setNewRelSrc] = useState('');
  const [newRelTgt, setNewRelTgt] = useState('');

  const processNodes = useMemo(() => {
    return concepts.filter(c => c.conceptType?.toLowerCase() === 'process');
  }, [concepts]);

  // Filter logic: isolate layout to active sub-process, active persona perspective, and exclude Metrics
  const { filteredConcepts, filteredRelationships, filteredDriverEdges } = useMemo(() => {
    let eligibleConcepts = concepts.filter(c => c.conceptType?.toLowerCase() !== 'metric' || c.label.startsWith('[OUTCOME]'));
    
    // Apply Persona Perspective filter
    if (activePerspectiveFilter && perspectives) {
      const activePers = perspectives.find(p => p.id === activePerspectiveFilter);
      if (activePers) {
        const allowedIds = new Set((activePers.concepts || []).map((c: any) => c.id));
        if (activePers.personaId) allowedIds.add(activePers.personaId);
        eligibleConcepts = eligibleConcepts.filter(c => allowedIds.has(c.id));
      }
    }

    let eligibleRelationships = relationships.filter(r => {
      const src = concepts.find(c => c.id === r.sourceId);
      const tgt = concepts.find(c => c.id === r.targetId);
      const isSrcMetric = src?.conceptType?.toLowerCase() === 'metric' && !src?.label.startsWith('[OUTCOME]');
      const isTgtMetric = tgt?.conceptType?.toLowerCase() === 'metric' && !tgt?.label.startsWith('[OUTCOME]');
      return !isSrcMetric && !isTgtMetric;
    });

    if (activePerspectiveFilter && perspectives) {
      const allowedIds = new Set(eligibleConcepts.map(c => c.id));
      eligibleRelationships = eligibleRelationships.filter(r => allowedIds.has(r.sourceId) && allowedIds.has(r.targetId));
    }

    if (!activeProcessFilter) {
      return { filteredConcepts: eligibleConcepts, filteredRelationships: eligibleRelationships, filteredDriverEdges: [] as DriverEdge[] };
    }

    const focusedIds = new Set<string>([activeProcessFilter]);
    eligibleRelationships.forEach(r => {
      if (r.sourceId === activeProcessFilter) {
        focusedIds.add(r.targetId);
      } else if (r.targetId === activeProcessFilter) {
        focusedIds.add(r.sourceId);
      }
    });

    const filteredC = eligibleConcepts.filter(c => focusedIds.has(c.id));
    const filteredR = eligibleRelationships.filter(r => focusedIds.has(r.sourceId) && focusedIds.has(r.targetId));

    return { filteredConcepts: filteredC, filteredRelationships: filteredR, filteredDriverEdges: [] as DriverEdge[] };
  }, [activeProcessFilter, activePerspectiveFilter, concepts, relationships, perspectives]);

  const layoutNodes = useMemo(() => {
    if (filteredConcepts.length === 0) return [];
    const base = run3DLayout(filteredConcepts, filteredRelationships, filteredDriverEdges, viewMode === '2d');
    return base.map(node => {
      const customPos = draggedPositions.get(node.id);
      if (customPos) {
        return { ...node, x: customPos.x, y: customPos.y, z: customPos.z };
      }
      return {
        ...node,
        x: node.x * spacingScale,
        y: node.y * spacingScale,
        z: node.z * spacingScale,
      };
    });
  }, [filteredConcepts, filteredRelationships, filteredDriverEdges, viewMode, spacingScale, draggedPositions]);

  const nodeMap = useMemo(() => {
    return new Map<string, Node3D>(layoutNodes.map(n => [n.id, n]));
  }, [layoutNodes]);

  // Translate hidden metric-to-metric driver edges into visual closed loop connections between measured concepts
  const cycleHighlightPaths = useMemo(() => {
    if (!activeCausalCycleHighlight || !causalCycles || !concepts || !relationships) return [];
    const cycle = causalCycles.find(c => c.id === activeCausalCycleHighlight);
    if (!cycle) return [];
    
    const paths: { sourceId: string; targetId: string; name: string; cycleType: string }[] = [];
    const edges = cycle.edges || [];
    
    const getMeasuredConceptId = (metricId: string): string | null => {
      const rel = relationships.find(r => 
        (r.sourceId === metricId || r.targetId === metricId) && 
        (concepts.find(c => c.id === (r.sourceId === metricId ? r.targetId : r.sourceId))?.conceptType?.toLowerCase() !== 'metric')
      );
      return rel ? (rel.sourceId === metricId ? rel.targetId : rel.sourceId) : null;
    };

    edges.forEach((edge: any) => {
      const srcCId = getMeasuredConceptId(edge.sourceId);
      const tgtCId = getMeasuredConceptId(edge.targetId);
      if (srcCId && tgtCId && srcCId !== tgtCId) {
        paths.push({
          sourceId: srcCId,
          targetId: tgtCId,
          name: edge.name || 'Drives',
          cycleType: cycle.cycleType,
        });
      }
    });
    return paths;
  }, [activeCausalCycleHighlight, causalCycles, concepts, relationships]);

  // Compute Focus + Context Neighborhood & Causal Loop Focus
  const neighborhood = useMemo(() => {
    if (activeCausalCycleHighlight && causalCycles) {
      const nodeIds = new Set<string>();
      const edgeIds = new Set<string>();
      cycleHighlightPaths.forEach(p => {
        nodeIds.add(p.sourceId);
        nodeIds.add(p.targetId);
      });
      return { nodeIds, edgeIds };
    }

    if (!selectedId || !selectedType) return null;
    
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    
    if (selectedType === 'concept') {
      const isNodeSelected = filteredConcepts.some(c => c.id === selectedId);
      if (!isNodeSelected) return null;
      
      nodeIds.add(selectedId);
      filteredRelationships.forEach(rel => {
        if (rel.sourceId === selectedId) {
          nodeIds.add(rel.targetId);
          edgeIds.add(rel.id);
        } else if (rel.targetId === selectedId) {
          nodeIds.add(rel.sourceId);
          edgeIds.add(rel.id);
        }
      });
      return { nodeIds, edgeIds };
    }
    
    if (selectedType === 'cq' && cqs) {
      const cq = cqs.find(q => q.id === selectedId);
      if (cq) {
        const qText = cq.question.toLowerCase();
        
        filteredConcepts.forEach(c => {
          if (qText.includes(c.label.toLowerCase())) {
            nodeIds.add(c.id);
          }
        });
        
        concepts.forEach(c => {
          if (c.conceptType?.toLowerCase() === 'metric' && qText.includes(c.label.toLowerCase())) {
            relationships.forEach(rel => {
              if (rel.sourceId === c.id && nodeMap.has(rel.targetId)) {
                nodeIds.add(rel.targetId);
              } else if (rel.targetId === c.id && nodeMap.has(rel.sourceId)) {
                nodeIds.add(rel.sourceId);
              }
            });
          }
        });
        
        filteredRelationships.forEach(rel => {
          if (nodeIds.has(rel.sourceId) || nodeIds.has(rel.targetId)) {
            nodeIds.add(rel.sourceId);
            nodeIds.add(rel.targetId);
            edgeIds.add(rel.id);
          }
        });
      }
      return { nodeIds, edgeIds };
    }
    
    if (selectedType === 'driverTree' && driverTrees) {
      const tree = driverTrees.find(t => t.id === selectedId);
      if (tree) {
        const treeMetrics = new Set<string>();
        (tree.edges || []).forEach((e: any) => {
          const srcLabel = e.sourceId ? (concepts.find(c => c.id === e.sourceId)?.label || e.sourceId) : e.source;
          const tgtLabel = e.targetId ? (concepts.find(c => c.id === e.targetId)?.label || e.targetId) : e.target;
          if (srcLabel) treeMetrics.add(srcLabel);
          if (tgtLabel) treeMetrics.add(tgtLabel);
        });
        
        concepts.forEach(c => {
          if (c.conceptType?.toLowerCase() === 'metric' && (treeMetrics.has(c.id) || treeMetrics.has(c.label))) {
            relationships.forEach(rel => {
              if (rel.sourceId === c.id && nodeMap.has(rel.targetId)) {
                nodeIds.add(rel.targetId);
              } else if (rel.targetId === c.id && nodeMap.has(rel.sourceId)) {
                nodeIds.add(rel.sourceId);
              }
            });
          }
        });
        
        filteredRelationships.forEach(rel => {
          if (nodeIds.has(rel.sourceId) && nodeIds.has(rel.targetId)) {
            edgeIds.add(rel.id);
          }
        });
      }
      return { nodeIds, edgeIds };
    }
    
    return null;
  }, [selectedId, selectedType, filteredConcepts, filteredRelationships, concepts, relationships, cqs, driverTrees, nodeMap, activeCausalCycleHighlight, causalCycles, cycleHighlightPaths]);

  return (
    <div style={{ width: '100%', height: '100%', outline: 'none', position: 'relative' }}>
      
      {/* Floating Canvas Toolbar (Top Left - Unobscured by QualityScoreCard) */}
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        padding: '6px 10px',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        zIndex: 40,
        boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
      }}>
        {/* Modeler Quick GUI Controls */}
        <button
          onClick={() => {
            setNewConceptName('');
            setNewConceptType('Entity');
            setShowAddConceptModal(true);
          }}
          className="btn-primary"
          style={{
            padding: '5px 12px',
            fontSize: '11px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            borderRadius: '6px',
          }}
        >
          <Plus size={12} /> Concept
        </button>

        <button
          onClick={() => {
            setNewRelName('');
            setNewRelSrc(concepts[0]?.id || '');
            setNewRelTgt(concepts[1]?.id || '');
            setShowAddRelationshipModal(true);
          }}
          className="btn-secondary"
          style={{
            padding: '5px 12px',
            fontSize: '11px',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            borderRadius: '6px',
          }}
        >
          <Plus size={12} /> Link
        </button>

        <div style={{ width: '1px', height: '20px', background: '#e2e8f0' }} />

        {/* 2D / 3D Mode Toggle Switch */}
        <div style={{ display: 'flex', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '3px', gap: '2px' }}>
          <button
            type="button"
            onClick={() => setViewMode('2d')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '800',
              background: viewMode === '2d' ? '#2563eb' : 'transparent',
              color: viewMode === '2d' ? '#ffffff' : '#64748b',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease',
              boxShadow: viewMode === '2d' ? '0 1px 3px rgba(37,99,235,0.3)' : 'none',
            }}
          >
            <span>📐 2D</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('3d')}
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: '800',
              background: viewMode === '3d' ? '#2563eb' : 'transparent',
              color: viewMode === '3d' ? '#ffffff' : '#64748b',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.15s ease',
              boxShadow: viewMode === '3d' ? '0 1px 3px rgba(37,99,235,0.3)' : 'none',
            }}
          >
            <span>🌐 3D</span>
          </button>
        </div>

        <div style={{ width: '1px', height: '20px', background: '#cbd5e1' }} />

        {/* Pan / Zoom & Bounding Box Fit Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '2px 4px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <button
            type="button"
            onClick={() => setTriggerFitViewCount(c => c + 1)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: '700',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              color: '#2563eb',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              boxShadow: '0 1px 2px rgba(37,99,235,0.1)',
            }}
            title="Fit all nodes cleanly into view"
          >
            <span>🎯 Fit View</span>
          </button>

          <button
            type="button"
            onClick={() => setTriggerZoomInCount(c => c + 1)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: '800',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              color: '#334155',
              cursor: 'pointer',
            }}
            title="Zoom In (+)"
          >
            ➕
          </button>

          <button
            type="button"
            onClick={() => setTriggerZoomOutCount(c => c + 1)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: '800',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              color: '#334155',
              cursor: 'pointer',
            }}
            title="Zoom Out (-)"
          >
            ➖
          </button>

          <button
            type="button"
            onClick={() => setTriggerResetCenterCount(c => c + 1)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: '700',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              color: '#334155',
              cursor: 'pointer',
            }}
            title="Recenter camera target to (0,0,0)"
          >
            📍 Center
          </button>
        </div>

        <div style={{ width: '1px', height: '20px', background: '#cbd5e1' }} />

        {/* Spacing Control Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '3px 8px', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569', whiteSpace: 'nowrap' }}>↔️ Spacing: {spacingScale.toFixed(1)}x</span>
          <input
            type="range"
            min="0.3"
            max="3.0"
            step="0.1"
            value={spacingScale}
            onChange={(e) => setSpacingScale(parseFloat(e.target.value))}
            style={{ width: '75px', cursor: 'pointer', accentColor: '#2563eb' }}
            title="Adjust layout node spacing scale"
          />
        </div>

        {/* Auto-Space & Reset Custom Positions */}
        <button
          type="button"
          onClick={() => {
            setSpacingScale(0.8);
            setDraggedPositions(new Map());
            setTriggerFitViewCount(c => c + 1);
          }}
          style={{
            padding: '4px 9px',
            fontSize: '11px',
            fontWeight: '700',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            color: '#475569',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}
          title="Reset manual drag positions and restore compact force layout"
        >
          <span>🔄 Reset Spacing</span>
        </button>

        {causalCycles.length > 0 && (
          <>
            <div style={{ width: '1px', height: '18px', background: 'var(--border-translucent)' }} />
            <select
              style={{
                background: 'var(--bg-input)',
                color: 'var(--color-text-main)',
                fontSize: '11px',
                border: '1px solid var(--border-translucent)',
                borderRadius: '6px',
                padding: '4px 8px',
                cursor: 'pointer',
                outline: 'none',
              }}
              value={activeCausalCycleHighlight || ''}
              onChange={(e) => setActiveCausalCycleHighlight(e.target.value || null)}
            >
              <option value="" style={{ background: 'var(--bg-card)', color: 'var(--color-text-main)' }}>No Cycle Highlight</option>
              {causalCycles.map(c => (
                <option key={c.id} value={c.id} style={{ background: 'var(--bg-card)', color: 'var(--color-text-main)' }}>🌀 Cycle: {c.name}</option>
              ))}
            </select>
          </>
        )}

        <div style={{ width: '1px', height: '18px', background: 'var(--border-translucent)' }} />

        <button
          onClick={onRefresh}
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.15s, background-color 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
          onMouseLeave={(e) => e.currentTarget.style.color = '#9ca3af'}
          title="Refresh Ontology"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
          </svg>
        </button>
      </div>

      {/* Floating Causal Loops Legend (Bottom Left) */}
      {causalCycles.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '50px',
          left: '16px',
          background: 'rgba(9,13,22,0.85)',
          border: '1px solid var(--border-translucent)',
          padding: '10px 12px',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          zIndex: 5,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          maxWidth: '220px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <Sparkles size={11} /> Causal Loops
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {causalCycles.map((c: any) => {
              const isSelected = activeCausalCycleHighlight === c.id;
              const isReinforcing = c.cycleType === 'REINFORCING';
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCausalCycleHighlight(isSelected ? null : c.id)}
                  style={{
                    background: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
                    border: isSelected ? `1px solid ${isReinforcing ? '#10b981' : '#ef4444'}` : '1px solid transparent',
                    padding: '4px 6px',
                    borderRadius: '4px',
                    textAlign: 'left',
                    color: isSelected ? (isReinforcing ? '#34d399' : '#f87171') : '#9ca3af',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={() => !activeCausalCycleHighlight && setActiveCausalCycleHighlight(c.id)}
                  onMouseLeave={() => !activeCausalCycleHighlight && setActiveCausalCycleHighlight(null)}
                >
                  <span>🔄 {c.name}</span>
                  <span style={{ fontSize: '7px', background: isReinforcing ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: isReinforcing ? '#34d399' : '#f87171', padding: '1px 3px', borderRadius: '2px', fontWeight: 'bold' }}>
                    {c.cycleType.substring(0, 4)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Canvas 
        camera={{ position: [0, 0, 32], fov: 40 }}
        onPointerMissed={() => onSelectConcept(null)}
      >
        <ambientLight intensity={1.2} />
        <pointLight position={[10, 10, 10]} intensity={1.5} />
        <directionalLight position={[-10, -10, -10]} intensity={0.5} />
        <CameraController 
          viewMode={viewMode} 
          layoutNodes={layoutNodes} 
          controlsRef={controlsRef} 
          triggerFitViewCount={triggerFitViewCount}
          triggerZoomInCount={triggerZoomInCount}
          triggerZoomOutCount={triggerZoomOutCount}
          triggerResetCenterCount={triggerResetCenterCount}
        />
        
        {/* Render Standard Relationships */}
        {filteredRelationships.map((rel) => {
          const src = nodeMap.get(rel.sourceId);
          const tgt = nodeMap.get(rel.targetId);
          if (!src || !tgt) return null;
          
          const isDimmed = neighborhood ? !neighborhood.edgeIds.has(rel.id) : false;
          return (
            <EdgeItem
              key={rel.id}
              source={src}
              target={tgt}
              label={rel.name}
              isSelected={selectedId === rel.id}
              isDimmed={isDimmed}
              isModalOpen={isModalOpen}
              onClick={() => onSelectRelationship(rel)}
            />
          );
        })}

        {/* Render Causal Loops Glowing Connection Lines */}
        {activeCausalCycleHighlight && cycleHighlightPaths.map((path, idx) => {
          const src = nodeMap.get(path.sourceId);
          const tgt = nodeMap.get(path.targetId);
          if (!src || !tgt) return null;
          const isReinforcing = path.cycleType === 'REINFORCING';
          
          return (
            <EdgeItem
              key={`cycle-highlight-${idx}`}
              source={src}
              target={tgt}
              label={path.name}
              isDriver
              isSelected={true}
              isDimmed={false}
              isModalOpen={isModalOpen}
              onClick={() => {}}
              customColor={isReinforcing ? '#10b981' : '#ef4444'}
            />
          );
        })}

        {/* Render Nodes */}
        {layoutNodes.map((node) => {
          const original = filteredConcepts.find(c => c.id === node.id);
          const isDimmed = neighborhood ? !neighborhood.nodeIds.has(node.id) : false;
          return (
            <NodeItem
              key={node.id}
              node={node}
              isSelected={selectedId === node.id}
              isDimmed={isDimmed}
              onClick={() => onSelectConcept(original)}
              onDragPositionChange={handleDragPositionChange}
              viewMode={viewMode}
              isModalOpen={isModalOpen}
            />
          );
        })}

        <OrbitControls 
          ref={controlsRef}
          enableDamping 
          dampingFactor={0.05} 
          minDistance={3} 
          maxDistance={60} 
          enableRotate={viewMode === '3d'}
          mouseButtons={viewMode === '2d' ? {
            LEFT: THREE.MOUSE.PAN,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE
          } : {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
          }}
        />
      </Canvas>

      {/* Dropdown filters (Bottom Bar) */}
      <div className="canvas-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '15px' }}>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'flex', gap: '15px' }}>
          <span>🔵 Entity</span>
          <span>🟢 Process</span>
          <span>🟣 Persona</span>
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* Persona Perspectives Filter */}
          {perspectives.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 'bold' }}>Perspective View:</span>
              <select
                value={activePerspectiveFilter || ''}
                onChange={(e) => setActivePerspectiveFilter(e.target.value || null)}
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-translucent)',
                  color: 'var(--color-text-main)',
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="" style={{ background: 'var(--bg-card)', color: 'var(--color-text-main)' }}>All Concepts (Default)</option>
                {perspectives.map(p => (
                  <option key={p.id} value={p.id} style={{ background: 'var(--bg-card)', color: 'var(--color-text-main)' }}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sub-Process View Filter */}
          {processNodes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 'bold' }}>Sub-Process View:</span>
              <select
                value={activeProcessFilter || ''}
                onChange={(e) => setActiveProcessFilter(e.target.value || null)}
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-translucent)',
                  color: 'var(--color-text-main)',
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="" style={{ background: 'var(--bg-card)', color: 'var(--color-text-main)' }}>All Process Steps</option>
                {processNodes.map(p => (
                  <option key={p.id} value={p.id} style={{ background: 'var(--bg-card)', color: 'var(--color-text-main)' }}>{p.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Create Concept Quick Modal */}
        {showAddConceptModal && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(5, 7, 12, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
          }}>
            <div className="glass-card animate-hover" style={{ width: '100%', maxWidth: '400px', padding: '24px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button
                onClick={() => setShowAddConceptModal(false)}
                style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-primary)' }}>Add Concept to Canvas</h3>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Concept Label</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. PatientRecord, Delays"
                  value={newConceptName}
                  onChange={(e) => setNewConceptName(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Concept Type</label>
                <select
                  className="form-input"
                  value={newConceptType}
                  onChange={(e) => setNewConceptType(e.target.value)}
                >
                  <option value="Entity">Entity (Standard Class)</option>
                  <option value="Process">Process (Activity/Workflow)</option>
                  <option value="Persona">Persona (Role/Actor)</option>
                  <option value="Metric">Metric (KPI/Measurement)</option>
                </select>
              </div>
              <button
                disabled={!newConceptName.trim()}
                onClick={async () => {
                  if (onAddConcept) {
                    await onAddConcept(newConceptName.trim(), newConceptType);
                    setShowAddConceptModal(false);
                  }
                }}
                className="btn-primary"
                style={{ width: '100%', padding: '10px' }}
              >
                Add Concept
              </button>
            </div>
          </div>
        )}

        {/* Create Link Quick Modal */}
        {showAddRelationshipModal && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(5, 7, 12, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
          }}>
            <div className="glass-card animate-hover" style={{ width: '100%', maxWidth: '400px', padding: '24px', position: 'relative', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <button
                onClick={() => setShowAddRelationshipModal(false)}
                style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-primary)' }}>Add Link between Concepts</h3>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Relationship Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. belongsTo, triggers"
                  value={newRelName}
                  onChange={(e) => setNewRelName(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Source Concept</label>
                <select
                  className="form-input"
                  value={newRelSrc}
                  onChange={(e) => setNewRelSrc(e.target.value)}
                >
                  <option value="">Select source...</option>
                  {concepts.map(c => (
                    <option key={c.id} value={c.id}>{c.label} ({c.conceptType})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px', display: 'block' }}>Target Concept</label>
                <select
                  className="form-input"
                  value={newRelTgt}
                  onChange={(e) => setNewRelTgt(e.target.value)}
                >
                  <option value="">Select target...</option>
                  {concepts.map(c => (
                    <option key={c.id} value={c.id}>{c.label} ({c.conceptType})</option>
                  ))}
                </select>
              </div>
              <button
                disabled={!newRelName.trim() || !newRelSrc || !newRelTgt}
                onClick={async () => {
                  if (onAddRelationship) {
                    await onAddRelationship(newRelName.trim(), newRelSrc, newRelTgt);
                    setShowAddRelationshipModal(false);
                  }
                }}
                className="btn-primary"
                style={{ width: '100%', padding: '10px' }}
              >
                Add Link
              </button>
            </div>
          </div>
        )}

        {/* Selected Concept Deletion Overlay */}
        {selectedId && selectedType === 'concept' && (() => {
          const selectedConcept = concepts.find(c => c.id === selectedId);
          if (!selectedConcept) return null;
          const isConfirming = confirmDeleteId === selectedConcept.id;
          return (
            <div style={{
              position: 'absolute',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#ffffff',
              border: isConfirming ? '1px solid #fca5a5' : '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '10px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              zIndex: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a' }}>
                Selected Concept: <span style={{ color: '#2563eb' }}>{selectedConcept.label}</span> ({selectedConcept.conceptType})
              </span>

              {isConfirming ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626' }}>
                    Confirm Delete?
                  </span>
                  <button
                    onClick={async () => {
                      if (onDeleteConcept) {
                        await onDeleteConcept(selectedConcept.id);
                        onSelectConcept(null);
                        setConfirmDeleteId(null);
                      }
                    }}
                    style={{
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(220,38,38,0.25)',
                    }}
                  >
                    Yes, Delete
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    style={{
                      background: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(selectedConcept.id)}
                  className="btn-danger"
                  style={{ padding: '5px 12px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Delete
                </button>
              )}
            </div>
          );
        })()}

        {/* Selected Relationship Deletion Overlay */}
        {selectedId && selectedType === 'relationship' && (() => {
          const selectedRel = relationships.find(r => r.id === selectedId);
          if (!selectedRel) return null;
          const isConfirming = confirmDeleteId === selectedRel.id;
          return (
            <div style={{
              position: 'absolute',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#ffffff',
              border: isConfirming ? '1px solid #fca5a5' : '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '10px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              zIndex: 10,
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0f172a' }}>
                Selected Relationship: <span style={{ color: '#2563eb' }}>{selectedRel.name}</span>
              </span>

              {isConfirming ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '800', color: '#dc2626' }}>
                    Confirm Delete?
                  </span>
                  <button
                    onClick={async () => {
                      if (onDeleteRelationship) {
                        await onDeleteRelationship(selectedRel.id);
                        onSelectRelationship(null);
                        setConfirmDeleteId(null);
                      }
                    }}
                    style={{
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '800',
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(220,38,38,0.25)',
                    }}
                  >
                    Yes, Delete
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    style={{
                      background: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(selectedRel.id)}
                  className="btn-danger"
                  style={{ padding: '5px 12px', fontSize: '11px', cursor: 'pointer' }}
                >
                  Delete
                </button>
              )}
            </div>
          );
        })()}

      </div>
    </div>
  );
}
