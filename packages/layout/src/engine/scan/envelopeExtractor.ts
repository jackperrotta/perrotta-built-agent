import { type Point } from '@construction/geometry';

export interface WallSegment2D {
    start: Point;
    end: Point;
    sourceId: string;
}

export interface EnvelopeExtractionResult {
    polygon: Point[];
    method: 'graph-loop' | 'fallback';
    stats: Record<string, unknown>;
}

export function extractEnvelopeFromWallSegments(
    segments: WallSegment2D[],
    fallbackPolygon: Point[]
): EnvelopeExtractionResult {
    const usable = segments.filter((segment) => segmentLength(segment.start, segment.end) > 0.25);
    if (usable.length < 3) {
        return {
            polygon: fallbackPolygon,
            method: 'fallback',
            stats: { reason: 'insufficient-usable-segments', usableSegmentCount: usable.length }
        };
    }

    const snapToleranceFt = 0.45;
    const { nodes, edges } = snapSegmentsToGraph(usable, snapToleranceFt);
    if (edges.length < 3) {
        return {
            polygon: fallbackPolygon,
            method: 'fallback',
            stats: { reason: 'insufficient-graph-edges', snappedNodeCount: nodes.length, edgeCount: edges.length }
        };
    }

    const faces = traceFaces(nodes, edges);
    const validFaces = faces
        .map((face) => simplifyPolygon(face))
        .filter((face) => face.length >= 3)
        .map((face) => ({ polygon: face, signedArea: signedPolygonArea(face) }))
        .filter((face) => Math.abs(face.signedArea) >= 40);

    if (validFaces.length === 0) {
        return {
            polygon: fallbackPolygon,
            method: 'fallback',
            stats: { reason: 'no-valid-faces', snappedNodeCount: nodes.length, edgeCount: edges.length }
        };
    }

    const outer = validFaces.reduce((best, current) =>
        Math.abs(current.signedArea) > Math.abs(best.signedArea) ? current : best
    );
    const polygon = outer.signedArea > 0 ? outer.polygon : [...outer.polygon].reverse();

    return {
        polygon,
        method: 'graph-loop',
        stats: {
            snappedNodeCount: nodes.length,
            edgeCount: edges.length,
            tracedFaceCount: faces.length,
            validFaceCount: validFaces.length,
            outerAreaSqFt: Math.abs(outer.signedArea)
        }
    };
}

interface GraphEdge {
    id: string;
    aNodeId: string;
    bNodeId: string;
}

interface DirectedEdge {
    from: string;
    to: string;
    angle: number;
}

function snapSegmentsToGraph(
    segments: WallSegment2D[],
    snapToleranceFt: number
): { nodes: Array<{ id: string; point: Point }>; edges: GraphEdge[] } {
    const clusterMap = new Map<string, { sumX: number; sumY: number; count: number; id: string }>();
    const clusterKey = (point: Point): string => {
        const sx = Math.round(point.x / snapToleranceFt);
        const sy = Math.round(point.y / snapToleranceFt);
        return `${sx}:${sy}`;
    };
    const ensureNode = (point: Point): string => {
        const key = clusterKey(point);
        const existing = clusterMap.get(key);
        if (existing) {
            existing.sumX += point.x;
            existing.sumY += point.y;
            existing.count += 1;
            return existing.id;
        }
        const id = `n${clusterMap.size + 1}`;
        clusterMap.set(key, { sumX: point.x, sumY: point.y, count: 1, id });
        return id;
    };

    const edgeKeySet = new Set<string>();
    const edges: GraphEdge[] = [];
    for (const segment of segments) {
        const aNodeId = ensureNode(segment.start);
        const bNodeId = ensureNode(segment.end);
        if (aNodeId === bNodeId) {
            continue;
        }
        const edgeKey = aNodeId < bNodeId ? `${aNodeId}|${bNodeId}` : `${bNodeId}|${aNodeId}`;
        if (edgeKeySet.has(edgeKey)) {
            continue;
        }
        edgeKeySet.add(edgeKey);
        edges.push({
            id: `e${edges.length + 1}`,
            aNodeId,
            bNodeId
        });
    }

    const nodes = Array.from(clusterMap.values()).map((cluster) => ({
        id: cluster.id,
        point: {
            x: cluster.sumX / cluster.count,
            y: cluster.sumY / cluster.count
        }
    }));
    return { nodes, edges };
}

function traceFaces(
    nodes: Array<{ id: string; point: Point }>,
    edges: GraphEdge[]
): Point[][] {
    const nodeById = new Map(nodes.map((node) => [node.id, node.point]));
    const outgoing = new Map<string, DirectedEdge[]>();

    for (const edge of edges) {
        const a = nodeById.get(edge.aNodeId);
        const b = nodeById.get(edge.bNodeId);
        if (!a || !b) {
            continue;
        }
        const ab: DirectedEdge = {
            from: edge.aNodeId,
            to: edge.bNodeId,
            angle: Math.atan2(b.y - a.y, b.x - a.x)
        };
        const ba: DirectedEdge = {
            from: edge.bNodeId,
            to: edge.aNodeId,
            angle: Math.atan2(a.y - b.y, a.x - b.x)
        };
        pushOutgoing(outgoing, ab);
        pushOutgoing(outgoing, ba);
    }

    for (const list of outgoing.values()) {
        list.sort((lhs, rhs) => lhs.angle - rhs.angle);
    }

    const visited = new Set<string>();
    const faces: Point[][] = [];

    for (const [fromNode, directedList] of outgoing) {
        for (const directed of directedList) {
            const key = `${fromNode}->${directed.to}`;
            if (visited.has(key)) {
                continue;
            }

            const cycle: Point[] = [];
            let currentFrom = directed.from;
            let currentTo = directed.to;
            let step = 0;
            const maxSteps = Math.max(16, edges.length * 4);
            while (step < maxSteps) {
                step += 1;
                visited.add(`${currentFrom}->${currentTo}`);
                const currentPoint = nodeById.get(currentFrom);
                if (currentPoint) {
                    cycle.push(currentPoint);
                }

                const nextList = outgoing.get(currentTo);
                if (!nextList || nextList.length === 0) {
                    break;
                }
                const reverseIndex = nextList.findIndex((edge) => edge.to === currentFrom);
                if (reverseIndex < 0) {
                    break;
                }
                const nextIndex = (reverseIndex - 1 + nextList.length) % nextList.length;
                const nextEdge = nextList[nextIndex];
                currentFrom = nextEdge.from;
                currentTo = nextEdge.to;

                if (currentFrom === directed.from && currentTo === directed.to) {
                    if (cycle.length >= 3) {
                        faces.push(cycle);
                    }
                    break;
                }
            }
        }
    }

    return faces;
}

function pushOutgoing(map: Map<string, DirectedEdge[]>, edge: DirectedEdge): void {
    const list = map.get(edge.from);
    if (list) {
        list.push(edge);
        return;
    }
    map.set(edge.from, [edge]);
}

function simplifyPolygon(points: Point[]): Point[] {
    if (points.length <= 3) {
        return points;
    }

    const deduped: Point[] = [];
    for (const point of points) {
        const prev = deduped[deduped.length - 1];
        if (!prev || Math.hypot(prev.x - point.x, prev.y - point.y) > 0.05) {
            deduped.push(point);
        }
    }
    if (deduped.length > 1) {
        const first = deduped[0];
        const last = deduped[deduped.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) <= 0.05) {
            deduped.pop();
        }
    }

    const simplified: Point[] = [];
    for (let i = 0; i < deduped.length; i++) {
        const prev = deduped[(i - 1 + deduped.length) % deduped.length];
        const current = deduped[i];
        const next = deduped[(i + 1) % deduped.length];
        const cross = Math.abs(
            (current.x - prev.x) * (next.y - current.y) - (current.y - prev.y) * (next.x - current.x)
        );
        if (cross > 0.01) {
            simplified.push(current);
        }
    }
    return simplified.length >= 3 ? simplified : deduped;
}

function signedPolygonArea(points: Point[]): number {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        sum += a.x * b.y - b.x * a.y;
    }
    return sum * 0.5;
}

function segmentLength(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
