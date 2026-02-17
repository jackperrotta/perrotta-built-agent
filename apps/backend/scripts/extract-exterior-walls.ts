import { readFile } from 'node:fs/promises';
import { extractEnvelopeFromWallSegments, type WallSegment2D } from '../../../packages/layout/src/engine/scan/envelopeExtractor.ts';

type RoomPlanWall = {
    identifier?: string;
    dimensions?: number[];
    transform?: number[];
};

type RoomPlanLike = {
    walls?: RoomPlanWall[];
};

type ExteriorWallResult = {
    id: string;
    lengthM: number;
    lengthFt: number;
};

type BoundarySelectionResult = {
    selectedIndices: Set<number>;
    stats: {
        hullSeedCount: number;
        expandedCount: number;
        snapToleranceFt: number;
        hullSeedToleranceFt: number;
    };
};

type OutermostSelectionResult = {
    selectedIndices: Set<number>;
    stats: {
        segmentCount: number;
        selectedCount: number;
        binCount: number;
        radialSlackFt: number;
    };
};

const FEET_PER_METER = 3.28084;

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const input = getArgValue(args, '--input') ?? args[0];
    const toleranceFtArg = getArgValue(args, '--tolerance-ft');
    const asJson = args.includes('--json');

    if (!input) {
        console.error('Usage: tsx apps/backend/scripts/extract-exterior-walls.ts --input <url-or-file> [--tolerance-ft 0.6] [--json]');
        process.exit(1);
    }

    const toleranceFt = Number.isFinite(Number(toleranceFtArg)) ? Number(toleranceFtArg) : 0.6;
    const raw = await loadInput(input);
    const parsed = JSON.parse(raw) as RoomPlanLike;
    const walls = Array.isArray(parsed.walls) ? parsed.walls : [];

    if (walls.length === 0) {
        throw new Error('No walls found in input JSON.');
    }

    const wallSegmentsMeters = walls
        .map(toWallSegmentMeters)
        .filter((segment): segment is WallSegment2D => segment !== null);

    if (wallSegmentsMeters.length < 3) {
        throw new Error(`Expected at least 3 usable wall segments, got ${wallSegmentsMeters.length}.`);
    }

    const wallSegmentsFt: WallSegment2D[] = wallSegmentsMeters.map((segment) => ({
        sourceId: segment.sourceId,
        start: { x: metersToFeet(segment.start.x), y: metersToFeet(segment.start.y) },
        end: { x: metersToFeet(segment.end.x), y: metersToFeet(segment.end.y) }
    }));

    const fallbackEnvelope = buildBoundingBoxPolygon(wallSegmentsFt);
    const extracted = extractEnvelopeFromWallSegments(wallSegmentsFt, fallbackEnvelope);
    const envelope = extracted.polygon;

    const exterior: ExteriorWallResult[] = [];
    for (let i = 0; i < wallSegmentsFt.length; i++) {
        const segmentFt = wallSegmentsFt[i];
        const midpoint = {
            x: (segmentFt.start.x + segmentFt.end.x) / 2,
            y: (segmentFt.start.y + segmentFt.end.y) / 2
        };
        const d = distancePointToPolygonEdges(midpoint, envelope);
        if (d <= toleranceFt) {
            const original = wallSegmentsMeters[i];
            const lengthM = segmentLength(original.start, original.end);
            exterior.push({
                id: segmentFt.sourceId,
                lengthM,
                lengthFt: metersToFeet(lengthM)
            });
        }
    }

    let selectionMethod:
        | 'envelope-polygon'
        | 'convex-hull-fallback'
        | 'convex-hull-chain-expansion'
        | 'outermost-radial-fallback' = 'envelope-polygon';
    let boundarySelectionStats: BoundarySelectionResult['stats'] | undefined;
    let outermostSelectionStats: OutermostSelectionResult['stats'] | undefined;
    if (exterior.length === 0) {
        const hull = convexHull(wallSegmentsFt.flatMap((s) => [s.start, s.end]));
        const hullToleranceFt = Math.max(1.0, toleranceFt * 1.5);
        for (let i = 0; i < wallSegmentsFt.length; i++) {
            const segmentFt = wallSegmentsFt[i];
            const midpoint = {
                x: (segmentFt.start.x + segmentFt.end.x) / 2,
                y: (segmentFt.start.y + segmentFt.end.y) / 2
            };
            const d = distancePointToPolygonEdges(midpoint, hull);
            if (d <= hullToleranceFt) {
                const original = wallSegmentsMeters[i];
                const lengthM = segmentLength(original.start, original.end);
                exterior.push({
                    id: segmentFt.sourceId,
                    lengthM,
                    lengthFt: metersToFeet(lengthM)
                });
            }
        }
        selectionMethod = 'convex-hull-fallback';
    }

    const shouldRunBoundaryExpansion =
        extracted.method === 'fallback' && exterior.length < Math.ceil(wallSegmentsFt.length * 0.6);
    if (shouldRunBoundaryExpansion) {
        const expanded = selectExteriorByBoundaryChain(wallSegmentsFt, toleranceFt);
        const existingIds = new Set(exterior.map((wall) => wall.id));
        for (const index of expanded.selectedIndices) {
            const original = wallSegmentsMeters[index];
            const id = wallSegmentsFt[index].sourceId;
            if (existingIds.has(id)) {
                continue;
            }
            const lengthM = segmentLength(original.start, original.end);
            exterior.push({
                id,
                lengthM,
                lengthFt: metersToFeet(lengthM)
            });
            existingIds.add(id);
        }
        if (expanded.selectedIndices.size > 0) {
            selectionMethod = 'convex-hull-chain-expansion';
            boundarySelectionStats = expanded.stats;
        }
    }

    const shouldRunOutermostSelection =
        extracted.method === 'fallback' && exterior.length < Math.ceil(wallSegmentsFt.length * 0.75);
    if (shouldRunOutermostSelection) {
        const outermost = selectExteriorByOutermostRadial(wallSegmentsFt, toleranceFt);
        const existingIds = new Set(exterior.map((wall) => wall.id));
        for (const index of outermost.selectedIndices) {
            const original = wallSegmentsMeters[index];
            const id = wallSegmentsFt[index].sourceId;
            if (existingIds.has(id)) {
                continue;
            }
            const lengthM = segmentLength(original.start, original.end);
            exterior.push({
                id,
                lengthM,
                lengthFt: metersToFeet(lengthM)
            });
            existingIds.add(id);
        }
        if (outermost.selectedIndices.size > 0) {
            selectionMethod = 'outermost-radial-fallback';
            outermostSelectionStats = outermost.stats;
        }
    }

    exterior.sort((a, b) => b.lengthFt - a.lengthFt);

    if (asJson) {
        const payload = {
            source: input,
            envelopeMethod: extracted.method,
            selectionMethod,
            extractionStats: extracted.stats,
            boundarySelectionStats,
            outermostSelectionStats,
            toleranceFt,
            exteriorWallCount: exterior.length,
            exteriorWalls: exterior.map((w) => ({
                id: w.id,
                lengthM: round(w.lengthM, 4),
                lengthFt: round(w.lengthFt, 2)
            }))
        };
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    console.log(`Source: ${input}`);
    console.log(`Envelope extraction method: ${extracted.method}`);
    console.log(`Exterior selection method: ${selectionMethod}`);
    if (boundarySelectionStats) {
        console.log(`Boundary selection stats: ${JSON.stringify(boundarySelectionStats)}`);
    }
    if (outermostSelectionStats) {
        console.log(`Outermost radial stats: ${JSON.stringify(outermostSelectionStats)}`);
    }
    console.log(`Exterior wall count: ${exterior.length}`);
    console.log('');
    for (const wall of exterior) {
        console.log(`${wall.id}: ${round(wall.lengthFt, 2)} ft (${round(wall.lengthM, 3)} m)`);
    }
}

async function loadInput(input: string): Promise<string> {
    if (/^https?:\/\//i.test(input)) {
        const response = await fetch(input);
        if (!response.ok) {
            throw new Error(`Failed to fetch input URL (${response.status} ${response.statusText}).`);
        }
        return response.text();
    }
    return readFile(input, 'utf8');
}

function toWallSegmentMeters(wall: RoomPlanWall, index: number): WallSegment2D | null {
    const dims = Array.isArray(wall.dimensions) ? wall.dimensions : [];
    const transform = Array.isArray(wall.transform) ? wall.transform : [];

    const width = Number(dims[0] ?? 0);
    if (!Number.isFinite(width) || width <= 0) {
        return null;
    }
    if (transform.length < 15) {
        return null;
    }

    const halfLen = width / 2;
    const tx = Number(transform[12] ?? 0);
    const tz = Number(transform[14] ?? 0);
    const rawRx = Number(transform[0] ?? 1);
    const rawRz = Number(transform[2] ?? 0);
    const dirLen = Math.hypot(rawRx, rawRz) || 1;
    const rx = rawRx / dirLen;
    const rz = rawRz / dirLen;

    return {
        sourceId: wall.identifier ?? `wall-${index + 1}`,
        start: { x: tx - halfLen * rx, y: tz - halfLen * rz },
        end: { x: tx + halfLen * rx, y: tz + halfLen * rz }
    };
}

function buildBoundingBoxPolygon(segmentsFt: WallSegment2D[]): Array<{ x: number; y: number }> {
    const points = segmentsFt.flatMap((s) => [s.start, s.end]);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
    ];
}

function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
    if (points.length <= 1) {
        return points;
    }
    const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const unique: Array<{ x: number; y: number }> = [];
    for (const point of sorted) {
        const prev = unique[unique.length - 1];
        if (!prev || prev.x !== point.x || prev.y !== point.y) {
            unique.push(point);
        }
    }
    if (unique.length <= 2) {
        return unique;
    }

    const lower: Array<{ x: number; y: number }> = [];
    for (const point of unique) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    }

    const upper: Array<{ x: number; y: number }> = [];
    for (let i = unique.length - 1; i >= 0; i--) {
        const point = unique[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    }

    lower.pop();
    upper.pop();
    return [...lower, ...upper];
}

function selectExteriorByBoundaryChain(
    segmentsFt: WallSegment2D[],
    baseToleranceFt: number
): BoundarySelectionResult {
    const hull = convexHull(segmentsFt.flatMap((segment) => [segment.start, segment.end]));
    if (hull.length < 3) {
        return {
            selectedIndices: new Set<number>(),
            stats: {
                hullSeedCount: 0,
                expandedCount: 0,
                snapToleranceFt: Math.max(0.9, baseToleranceFt * 1.5),
                hullSeedToleranceFt: Math.max(1.0, baseToleranceFt * 1.75)
            }
        };
    }

    const hullSeedToleranceFt = Math.max(1.0, baseToleranceFt * 1.75);
    const seedIndices = new Set<number>();
    for (let i = 0; i < segmentsFt.length; i++) {
        const segment = segmentsFt[i];
        const midpoint = {
            x: (segment.start.x + segment.end.x) / 2,
            y: (segment.start.y + segment.end.y) / 2
        };
        const d = distancePointToPolygonEdges(midpoint, hull);
        if (d <= hullSeedToleranceFt) {
            seedIndices.add(i);
        }
    }

    const snapToleranceFt = Math.max(0.9, baseToleranceFt * 1.5);
    const graph = buildSegmentEndpointGraph(segmentsFt, snapToleranceFt);
    if (graph.segmentNodeIds.length === 0 || seedIndices.size === 0) {
        return {
            selectedIndices: seedIndices,
            stats: {
                hullSeedCount: seedIndices.size,
                expandedCount: seedIndices.size,
                snapToleranceFt,
                hullSeedToleranceFt
            }
        };
    }

    const selected = new Set<number>(seedIndices);
    const queue = [...seedIndices];
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) {
            continue;
        }
        const nodes = graph.segmentNodeIds[current];
        if (!nodes) {
            continue;
        }
        for (const nodeId of nodes) {
            const degree = graph.nodeDegree.get(nodeId) ?? 0;
            const isCorridorNode = degree <= 2;
            const adjacent = graph.nodeToSegmentIds.get(nodeId);
            if (!adjacent) {
                continue;
            }
            for (const nextIndex of adjacent) {
                if (selected.has(nextIndex)) {
                    continue;
                }
                // Expand along low-branching perimeter chains; always keep original hull seeds.
                if (isCorridorNode || seedIndices.has(nextIndex)) {
                    selected.add(nextIndex);
                    queue.push(nextIndex);
                }
            }
        }
    }

    return {
        selectedIndices: selected,
        stats: {
            hullSeedCount: seedIndices.size,
            expandedCount: selected.size,
            snapToleranceFt,
            hullSeedToleranceFt
        }
    };
}

function buildSegmentEndpointGraph(
    segmentsFt: WallSegment2D[],
    snapToleranceFt: number
): {
    segmentNodeIds: Array<[number, number]>;
    nodeToSegmentIds: Map<number, Set<number>>;
    nodeDegree: Map<number, number>;
} {
    const clusterToNodeId = new Map<string, number>();
    const segmentNodeIds: Array<[number, number]> = [];
    const nodeToSegmentIds = new Map<number, Set<number>>();
    const nodeNeighbors = new Map<number, Set<number>>();

    const getNodeId = (point: { x: number; y: number }): number => {
        const sx = Math.round(point.x / snapToleranceFt);
        const sy = Math.round(point.y / snapToleranceFt);
        const key = `${sx}:${sy}`;
        const existing = clusterToNodeId.get(key);
        if (existing !== undefined) {
            return existing;
        }
        const next = clusterToNodeId.size;
        clusterToNodeId.set(key, next);
        return next;
    };

    for (let i = 0; i < segmentsFt.length; i++) {
        const segment = segmentsFt[i];
        const a = getNodeId(segment.start);
        const b = getNodeId(segment.end);
        segmentNodeIds.push([a, b]);

        const aSegments = nodeToSegmentIds.get(a) ?? new Set<number>();
        aSegments.add(i);
        nodeToSegmentIds.set(a, aSegments);

        const bSegments = nodeToSegmentIds.get(b) ?? new Set<number>();
        bSegments.add(i);
        nodeToSegmentIds.set(b, bSegments);

        if (a !== b) {
            const aNeighbors = nodeNeighbors.get(a) ?? new Set<number>();
            aNeighbors.add(b);
            nodeNeighbors.set(a, aNeighbors);

            const bNeighbors = nodeNeighbors.get(b) ?? new Set<number>();
            bNeighbors.add(a);
            nodeNeighbors.set(b, bNeighbors);
        }
    }

    const nodeDegree = new Map<number, number>();
    for (const [nodeId, neighbors] of nodeNeighbors) {
        nodeDegree.set(nodeId, neighbors.size);
    }
    for (const nodeId of nodeToSegmentIds.keys()) {
        if (!nodeDegree.has(nodeId)) {
            nodeDegree.set(nodeId, 0);
        }
    }

    return {
        segmentNodeIds,
        nodeToSegmentIds,
        nodeDegree
    };
}

function selectExteriorByOutermostRadial(
    segmentsFt: WallSegment2D[],
    baseToleranceFt: number
): OutermostSelectionResult {
    if (segmentsFt.length === 0) {
        return {
            selectedIndices: new Set<number>(),
            stats: {
                segmentCount: 0,
                selectedCount: 0,
                binCount: 0,
                radialSlackFt: Math.max(0.8, baseToleranceFt * 1.25)
            }
        };
    }

    const points = segmentsFt.flatMap((segment) => [segment.start, segment.end]);
    const centroid = {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length
    };
    const binCount = Math.max(24, Math.min(72, segmentsFt.length * 2));
    const radialSlackFt = Math.max(0.8, baseToleranceFt * 1.25);
    const binToMaxRadius = new Map<number, number>();
    const measurements: Array<{ index: number; bin: number; radius: number }> = [];

    for (let i = 0; i < segmentsFt.length; i++) {
        const segment = segmentsFt[i];
        const midpoint = {
            x: (segment.start.x + segment.end.x) / 2,
            y: (segment.start.y + segment.end.y) / 2
        };
        const dx = midpoint.x - centroid.x;
        const dy = midpoint.y - centroid.y;
        const radius = Math.hypot(dx, dy);
        let angle = Math.atan2(dy, dx);
        if (angle < 0) {
            angle += 2 * Math.PI;
        }
        const bin = Math.floor((angle / (2 * Math.PI)) * binCount) % binCount;
        measurements.push({ index: i, bin, radius });
        const maxRadius = binToMaxRadius.get(bin);
        if (maxRadius === undefined || radius > maxRadius) {
            binToMaxRadius.set(bin, radius);
        }
    }

    const selected = new Set<number>();
    for (const measurement of measurements) {
        const ownMax = binToMaxRadius.get(measurement.bin) ?? -Infinity;
        const prevMax = binToMaxRadius.get((measurement.bin - 1 + binCount) % binCount) ?? -Infinity;
        const nextMax = binToMaxRadius.get((measurement.bin + 1) % binCount) ?? -Infinity;
        const neighborhoodMax = Math.max(ownMax, prevMax, nextMax);
        if (measurement.radius >= neighborhoodMax - radialSlackFt) {
            selected.add(measurement.index);
        }
    }

    return {
        selectedIndices: selected,
        stats: {
            segmentCount: segmentsFt.length,
            selectedCount: selected.size,
            binCount,
            radialSlackFt
        }
    };
}

function cross(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function distancePointToPolygonEdges(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): number {
    if (polygon.length < 2) {
        return Number.POSITIVE_INFINITY;
    }
    let min = Number.POSITIVE_INFINITY;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const d = distancePointToSegment(point, a, b);
        if (d < min) {
            min = d;
        }
    }
    return min;
}

function distancePointToSegment(
    p: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number }
): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const ab2 = abx * abx + aby * aby;
    if (ab2 === 0) {
        return Math.hypot(apx, apy);
    }
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    const qx = a.x + t * abx;
    const qy = a.y + t * aby;
    return Math.hypot(p.x - qx, p.y - qy);
}

function segmentLength(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function metersToFeet(value: number): number {
    return value * FEET_PER_METER;
}

function getArgValue(args: string[], name: string): string | undefined {
    const i = args.indexOf(name);
    if (i < 0) {
        return undefined;
    }
    return args[i + 1];
}

function round(value: number, places: number): number {
    const scale = Math.pow(10, places);
    return Math.round(value * scale) / scale;
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
});
