export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  name: string;
}

export interface Cycle {
  id: string;
  name: string;
  edgeIds: string[];
}

export function detectCausalCycles(edges: Edge[]): Cycle[] {
  const adj = new Map<string, { targetId: string; edgeId: string }[]>();
  
  // Build adjacency list
  edges.forEach((e) => {
    if (!e.sourceId || !e.targetId) return;
    if (!adj.has(e.sourceId)) {
      adj.set(e.sourceId, []);
    }
    adj.get(e.sourceId)!.push({ targetId: e.targetId, edgeId: e.id });
  });

  const cycles: Cycle[] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const currentPath: { nodeId: string; edgeId: string }[] = [];

  function dfs(nodeId: string) {
    visited.add(nodeId);
    recStack.add(nodeId);

    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const nextNode = neighbor.targetId;
      const edgeId = neighbor.edgeId;

      if (!visited.has(nextNode)) {
        currentPath.push({ nodeId, edgeId });
        dfs(nextNode);
        currentPath.pop();
      } else if (recStack.has(nextNode)) {
        // Cycle detected! Extract path starting from nextNode
        const cycleEdges: string[] = [edgeId];
        for (let i = currentPath.length - 1; i >= 0; i--) {
          cycleEdges.push(currentPath[i].edgeId);
          if (currentPath[i].nodeId === nextNode) {
            break;
          }
        }
        
        cycles.push({
          id: `cycle-${cycles.length + 1}`,
          name: `Feedback Loop ${cycles.length + 1}`,
          edgeIds: cycleEdges.reverse(),
        });
      }
    }

    recStack.delete(nodeId);
  }

  // Run DFS from each unvisited node
  edges.forEach((e) => {
    if (e.sourceId && !visited.has(e.sourceId)) {
      dfs(e.sourceId);
    }
  });

  return cycles;
}
