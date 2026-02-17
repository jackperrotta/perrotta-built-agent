import { type GraphValidationResult, type RoomGraph } from '../models/graph.js';

export function validateRoomGraph(graph: RoomGraph): GraphValidationResult {
    const issues: GraphValidationResult['issues'] = [];
    const nodeIds = new Set(graph.nodes.map((n) => n.id));

    if (graph.nodes.length === 0) {
        issues.push({ severity: 'error', message: 'Program produced zero room nodes.' });
    }

    for (const edge of graph.edges) {
        if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
            issues.push({
                severity: 'error',
                message: `Edge ${edge.id} references a missing room node.`
            });
        }

        if (edge.fromNodeId === edge.toNodeId) {
            issues.push({
                severity: 'warning',
                message: `Edge ${edge.id} is a self-reference and will be ignored by mapping.`
            });
        }
    }

    const forbidden = graph.edges.filter((e) => e.strength === 'forbidden');
    const required = graph.edges.filter((e) => e.strength === 'required');
    for (const req of required) {
        if (forbidden.some((f) => isSamePair(req.fromNodeId, req.toNodeId, f.fromNodeId, f.toNodeId))) {
            issues.push({
                severity: 'error',
                message: `Required and forbidden relationships conflict for ${req.fromNodeId} and ${req.toNodeId}.`
            });
        }
    }

    return { valid: !issues.some((i) => i.severity === 'error'), issues };
}

function isSamePair(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
    return (aFrom === bFrom && aTo === bTo) || (aFrom === bTo && aTo === bFrom);
}
