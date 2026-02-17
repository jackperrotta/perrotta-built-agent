import { type Point } from '@construction/geometry';
import { calculatePolygonArea } from '@construction/geometry';
import { type LayoutCandidate } from '../models/candidate.js';
import { type GenerationContext } from '../models/constraints.js';
import { seededRandom } from '../utils/random.js';

export function mapGraphToEnvelope(context: GenerationContext, attemptIndex: number): LayoutCandidate {
    const rng = seededRandom(attemptIndex + 1);
    const { widthFt, heightFt, toleranceFt } = context.normalizedScan.envelope;
    const MIN_ROOM_DIM_FT = 4;

    const rooms: LayoutCandidate['rooms'] = [];
    const { rows, rowHeights } = buildAdaptiveRows(
        context.graph.nodes,
        context.normalizedScan.envelope.polygon,
        widthFt,
        heightFt,
        MIN_ROOM_DIM_FT
    );

    let cursorY = 0;
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
        const rowNodes = rows[rowIdx];
        const rowHeight = rowHeights[rowIdx];
        const rowSpan = getUsableHorizontalSpanForBand(
            context.normalizedScan.envelope.polygon,
            cursorY,
            cursorY + rowHeight
        ) ?? { minX: 0, maxX: widthFt };
        const usableWidth = Math.max(MIN_ROOM_DIM_FT, rowSpan.maxX - rowSpan.minX);
        const colWeights = rowNodes.map((node) => weightedDemand(node.minAreaSqFt, rng));
        const colMinimums = rowNodes.map((node) => Math.max(MIN_ROOM_DIM_FT, node.minWidthFt));
        const colWidths = normalizeWeightsToSpan(colWeights, usableWidth, colMinimums);

        const rowCenterX = (rowSpan.minX + rowSpan.maxX) / 2;
        const topSpan = horizontalSpanAtY(
            context.normalizedScan.envelope.polygon,
            cursorY + Math.max(0.001, rowHeight * 0.05),
            rowCenterX
        ) ?? rowSpan;
        const bottomSpan = horizontalSpanAtY(
            context.normalizedScan.envelope.polygon,
            cursorY + Math.max(0.001, rowHeight * 0.95),
            rowCenterX
        ) ?? rowSpan;
        const topWidth = Math.max(0.001, topSpan.maxX - topSpan.minX);
        const bottomWidth = Math.max(0.001, bottomSpan.maxX - bottomSpan.minX);
        const totalColWidth = Math.max(0.001, colWidths.reduce((acc, value) => acc + value, 0));
        let cumulativeFraction = 0;
        for (let colIdx = 0; colIdx < rowNodes.length; colIdx++) {
            const node = rowNodes[colIdx];
            const width = colWidths[colIdx];
            const height = rowHeight;
            const startFraction = cumulativeFraction;
            const endFraction = Math.min(1, cumulativeFraction + width / totalColWidth);
            cumulativeFraction = endFraction;

            const polygon = bandFittedQuad(cursorY, cursorY + rowHeight, topSpan, bottomSpan, startFraction, endFraction);
            const topEdgeWidth = Math.abs(polygon[1].x - polygon[0].x);
            const bottomEdgeWidth = Math.abs(polygon[2].x - polygon[3].x);
            rooms.push({
                id: node.id,
                roomType: node.roomType,
                polygon,
                areaSqFt: calculatePolygonArea(polygon),
                widthFt: Math.min(topEdgeWidth, bottomEdgeWidth),
                heightFt: height
            });
        }
        cursorY += rowHeight;
    }

    return {
        id: `candidate-${attemptIndex + 1}`,
        rooms,
        score: zeroScore(),
        diagnostics: {
            attemptId: `attempt-${attemptIndex + 1}`,
            derivedData: [
                'Envelope width/height derived from scan wall extents',
                `Envelope tolerance derived from policy ratio (${context.intent.policy.envelopeToleranceRatio})`
            ],
            inventedData: [
                'Room rectangles partitioned from weighted area demand',
                'Rows and columns normalized to tile 100% of envelope area'
            ],
            assumptions: context.intent.assumptions.map((a) => `${a.key}: ${a.reason}`),
            hardFailures: [],
            softPenalties: []
        }
    };
}

function rectangle(x: number, y: number, width: number, height: number): Point[] {
    return [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height }
    ];
}

function weightedDemand(minAreaSqFt: number, rng: () => number): number {
    const noise = 0.9 + rng() * 0.2;
    return Math.max(1, minAreaSqFt * noise);
}

function normalizeWeightsToSpan(weights: number[], span: number, minimums: number[] = []): number[] {
    const safeWeights = weights.map((w) => Math.max(1, w));
    const safeMinimums = safeWeights.map((_, idx) => Math.max(0, minimums[idx] ?? 0));
    const minimumTotal = safeMinimums.reduce((acc, n) => acc + n, 0);

    // If minimum requests exceed span, scale the minimums proportionally.
    if (minimumTotal >= span && minimumTotal > 0) {
        return safeMinimums.map((n) => (n / minimumTotal) * span);
    }

    const remainingSpan = Math.max(0, span - minimumTotal);
    const total = safeWeights.reduce((acc, w) => acc + w, 0);
    if (total <= 0) {
        const equal = remainingSpan / Math.max(1, safeWeights.length);
        const withMinimums = safeWeights.map((_, idx) => safeMinimums[idx] + equal);
        const correction = span - withMinimums.reduce((acc, w) => acc + w, 0);
        if (withMinimums.length > 0) {
            withMinimums[withMinimums.length - 1] += correction;
        }
        return withMinimums;
    }

    const scaled = safeWeights.map((w, idx) => safeMinimums[idx] + (w / total) * remainingSpan);
    const correction = span - scaled.reduce((acc, w) => acc + w, 0);
    if (scaled.length > 0) {
        scaled[scaled.length - 1] += correction;
    }
    return scaled;
}

function buildAdaptiveRows<T extends { minWidthFt: number; minAreaSqFt: number }>(
    nodes: T[],
    envelopePolygon: Point[],
    widthFt: number,
    heightFt: number,
    minRoomDimFt: number
): { rows: T[][]; rowHeights: number[] } {
    const maxRowsByHeight = Math.max(1, Math.floor(heightFt / minRoomDimFt));
    const orderedNodes = [...nodes].sort(
        (a, b) => Math.max(minRoomDimFt, b.minWidthFt) - Math.max(minRoomDimFt, a.minWidthFt)
    );

    for (let rowCount = maxRowsByHeight; rowCount >= 1; rowCount--) {
        const rowHeights = new Array(rowCount).fill(heightFt / rowCount);
        const capacities = rowHeights.map((rowHeight, idx) => {
            const y0 = idx * rowHeight;
            const y1 = y0 + rowHeight;
            const span = getUsableHorizontalSpanForBand(envelopePolygon, y0, y1) ?? { minX: 0, maxX: widthFt };
            return Math.max(minRoomDimFt, span.maxX - span.minX);
        });
        const remaining = [...capacities];
        const rows: T[][] = new Array(rowCount).fill(null).map(() => []);

        let failed = false;
        for (const node of orderedNodes) {
            const need = Math.max(minRoomDimFt, node.minWidthFt);
            let bestRow = -1;
            let bestSlack = Number.POSITIVE_INFINITY;
            for (let rowIdx = 0; rowIdx < rowCount; rowIdx++) {
                const slack = remaining[rowIdx] - need;
                if (slack >= 0 && slack < bestSlack) {
                    bestSlack = slack;
                    bestRow = rowIdx;
                }
            }
            if (bestRow < 0) {
                failed = true;
                break;
            }
            rows[bestRow].push(node);
            remaining[bestRow] -= need;
        }

        if (!failed && rows.every((row) => row.length > 0)) {
            return { rows, rowHeights };
        }
    }

    // Fallback: single-row assignment.
    return {
        rows: [nodes],
        rowHeights: [heightFt]
    };
}

function zeroScore(): LayoutCandidate['score'] {
    return {
        totalScore: 0,
        categories: {
            codeCompliance: { score: 0, reasoning: [] },
            efficiency: { score: 0, reasoning: [] },
            structuralRisk: { score: 0, reasoning: [] },
            marketability: { score: 0, reasoning: [] },
            constructionCost: { score: 0, reasoning: [] }
        }
    };
}

function getUsableHorizontalSpanForBand(
    polygon: Point[],
    yMin: number,
    yMax: number
): { minX: number; maxX: number } | null {
    const bandHeight = Math.max(0.001, yMax - yMin);
    const samples = [
        yMin + bandHeight * 0.1,
        yMin + bandHeight * 0.5,
        yMin + bandHeight * 0.9
    ];
    const spans = samples
        .map((sampleY) => horizontalSpanAtY(polygon, sampleY))
        .filter((span): span is { minX: number; maxX: number } => span !== null);
    if (spans.length === 0) {
        return null;
    }

    // Middle ground: avoid centerline-only optimism and full-intersection pessimism.
    const minXs = spans.map((span) => span.minX).sort((a, b) => a - b);
    const maxXs = spans.map((span) => span.maxX).sort((a, b) => a - b);
    const median = (values: number[]) => values[Math.floor(values.length / 2)];
    return {
        minX: median(minXs),
        maxX: median(maxXs)
    };
}

function horizontalSpanAtY(polygon: Point[], y: number, preferredCenterX?: number): { minX: number; maxX: number } | null {
    const segments = horizontalSegmentsAtY(polygon, y);
    if (segments.length === 0) {
        return null;
    }

    if (typeof preferredCenterX === 'number' && Number.isFinite(preferredCenterX)) {
        let best = segments[0];
        let bestDistance = segmentDistanceToX(best, preferredCenterX);
        for (let i = 1; i < segments.length; i++) {
            const distance = segmentDistanceToX(segments[i], preferredCenterX);
            if (distance < bestDistance) {
                best = segments[i];
                bestDistance = distance;
            }
        }
        return best;
    }

    return segments.reduce((best, current) =>
        (current.maxX - current.minX > best.maxX - best.minX ? current : best)
    );
}

function horizontalSegmentsAtY(polygon: Point[], y: number): Array<{ minX: number; maxX: number }> {
    const intersections: number[] = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];

        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        if (y < minY || y > maxY || a.y === b.y) {
            continue;
        }

        const t = (y - a.y) / (b.y - a.y);
        if (t < 0 || t > 1) {
            continue;
        }
        intersections.push(a.x + t * (b.x - a.x));
    }

    if (intersections.length < 2) {
        return [];
    }

    intersections.sort((lhs, rhs) => lhs - rhs);
    const segments: Array<{ minX: number; maxX: number }> = [];
    for (let i = 0; i + 1 < intersections.length; i += 2) {
        const minX = intersections[i];
        const maxX = intersections[i + 1];
        if (maxX > minX) {
            segments.push({ minX, maxX });
        }
    }
    return segments;
}

function segmentDistanceToX(segment: { minX: number; maxX: number }, x: number): number {
    if (x < segment.minX) {
        return segment.minX - x;
    }
    if (x > segment.maxX) {
        return x - segment.maxX;
    };
    return 0;
}

function bandFittedQuad(
    yTop: number,
    yBottom: number,
    topSpan: { minX: number; maxX: number },
    bottomSpan: { minX: number; maxX: number },
    startFraction: number,
    endFraction: number
): Point[] {
    const topWidth = Math.max(0.001, topSpan.maxX - topSpan.minX);
    const bottomWidth = Math.max(0.001, bottomSpan.maxX - bottomSpan.minX);
    const topX0 = topSpan.minX + topWidth * startFraction;
    const topX1 = topSpan.minX + topWidth * endFraction;
    const bottomX0 = bottomSpan.minX + bottomWidth * startFraction;
    const bottomX1 = bottomSpan.minX + bottomWidth * endFraction;

    return [
        { x: topX0, y: yTop },
        { x: topX1, y: yTop },
        { x: bottomX1, y: yBottom },
        { x: bottomX0, y: yBottom }
    ];
}
