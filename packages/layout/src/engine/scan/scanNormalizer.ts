import { type Point } from '@construction/geometry';
import { type RoomPlanJson } from '../../roomPlanTypes.js';
import { type NormalizedScan } from '../models/constraints.js';
import { extractEnvelopeFromWallSegments, type WallSegment2D } from './envelopeExtractor.js';

export function normalizeScanGeometry(scan: RoomPlanJson, toleranceRatio: number): NormalizedScan {
    const wallSegmentsMeters = scan.walls.map(extractWallSegment2D);
    const points = wallSegmentsMeters.flatMap((segment) => [segment.start, segment.end]);
    const notes: string[] = [];

    if (points.length < 2) {
        notes.push('Insufficient wall data; using default 40x30ft envelope.');
        logScanNormalization({
            wallCount: scan.walls.length,
            windowCount: scan.windows.length,
            doorCount: scan.doors.length,
            openingCount: scan.openings.length,
            usedFallbackEnvelope: true,
            envelopeFt: {
                widthFt: 40,
                heightFt: 30,
                toleranceFt: 4
            }
        });
        return {
            source: scan,
            envelope: {
                polygon: rect(0, 0, 40, 30),
                toleranceFt: 4,
                widthFt: 40,
                heightFt: 30,
                confidence: 0.2
            },
            notes
        };
    }

    const axisAlignedBounds = getBounds(points);
    const principalAngleRad = estimatePrincipalAxisAngle(points);
    const rotatedPoints = points.map((p) => rotatePoint(p, -principalAngleRad));
    const orientedBounds = getBounds(rotatedPoints);
    const orientedPointsFt = rotatedPoints.map((point) => ({ x: metersToFeet(point.x), y: metersToFeet(point.y) }));
    const orientedBoundsFt = getBounds(orientedPointsFt);
    const widthFt = Math.max(8, orientedBoundsFt.maxX - orientedBoundsFt.minX);
    const heightFt = Math.max(8, orientedBoundsFt.maxY - orientedBoundsFt.minY);
    const toleranceFt = Math.max(1.5, Math.min(8, Math.max(widthFt, heightFt) * toleranceRatio));
    const maxWallLengthFt = Math.max(
        0,
        ...scan.walls.map((wall) => {
            const dimX = wall.dimensions[0] ?? 0;
            const dimZ = wall.dimensions[2] ?? 0;
            return metersToFeet(Math.max(0, dimX, dimZ));
        })
    );

    const confidenceValues = scan.walls
        .map((w) => w.confidence)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const confidence = confidenceValues.length > 0
        ? confidenceValues.reduce((acc, n) => acc + n, 0) / confidenceValues.length
        : 0.5;

    const orientedSegmentsFt: WallSegment2D[] = wallSegmentsMeters.map((segment) => {
        const rotatedStart = rotatePoint(segment.start, -principalAngleRad);
        const rotatedEnd = rotatePoint(segment.end, -principalAngleRad);
        return {
            sourceId: segment.sourceId,
            start: { x: metersToFeet(rotatedStart.x), y: metersToFeet(rotatedStart.y) },
            end: { x: metersToFeet(rotatedEnd.x), y: metersToFeet(rotatedEnd.y) }
        };
    });

    const fallbackEnvelope = buildSteppedEnvelopePolygon(orientedPointsFt);
    const extractedEnvelope = extractEnvelopeFromWallSegments(orientedSegmentsFt, fallbackEnvelope);
    const envelopePolygon = shiftPolygonToOrigin(extractedEnvelope.polygon);
    const envelopeBounds = getBounds(envelopePolygon);

    notes.push('Envelope derived from wall extents with tolerance band.');
    notes.push(
        extractedEnvelope.method === 'graph-loop'
            ? 'Envelope polygon derived from snapped wall graph outer loop.'
            : 'Envelope polygon derived from fallback stepped profile (graph extraction failed).'
    );
    if (confidenceValues.length === 0) {
        notes.push('Wall confidence missing; defaulted to 0.5.');
    }

    logScanNormalization({
        wallCount: scan.walls.length,
        windowCount: scan.windows.length,
        doorCount: scan.doors.length,
        openingCount: scan.openings.length,
        usedFallbackEnvelope: false,
        rawWallExtentMeters: {
            axisAligned: {
                minX: axisAlignedBounds.minX,
                minY: axisAlignedBounds.minY,
                maxX: axisAlignedBounds.maxX,
                maxY: axisAlignedBounds.maxY,
                widthMeters: axisAlignedBounds.maxX - axisAlignedBounds.minX,
                heightMeters: axisAlignedBounds.maxY - axisAlignedBounds.minY
            },
            orientedToPrincipalAxis: {
                principalAngleDegrees: radiansToDegrees(principalAngleRad),
                minX: orientedBounds.minX,
                minY: orientedBounds.minY,
                maxX: orientedBounds.maxX,
                maxY: orientedBounds.maxY,
                widthMeters: orientedBounds.maxX - orientedBounds.minX,
                heightMeters: orientedBounds.maxY - orientedBounds.minY
            }
        },
        envelopeFt: {
            widthFt: Math.max(8, envelopeBounds.maxX - envelopeBounds.minX),
            heightFt: Math.max(8, envelopeBounds.maxY - envelopeBounds.minY),
            toleranceFt
        },
        envelopeExtraction: extractedEnvelope.stats,
        scanWallStats: {
            wallCount: scan.walls.length,
            maxWallLengthFt
        },
        confidence
    });

    return {
        source: scan,
        envelope: {
            polygon: envelopePolygon,
            toleranceFt,
            widthFt: Math.max(8, envelopeBounds.maxX - envelopeBounds.minX),
            heightFt: Math.max(8, envelopeBounds.maxY - envelopeBounds.minY),
            confidence
        },
        notes
    };
}

function extractWallSegment2D(wall: { id?: string; dimensions: number[]; transform: number[] }): WallSegment2D {
    const width = wall.dimensions[0] ?? 0;
    const halfLen = width / 2;
    const mat = wall.transform;
    const tx = mat[12] ?? 0;
    const tz = mat[14] ?? 0;
    const rawRx = mat[0] ?? 1;
    const rawRz = mat[2] ?? 0;
    const directionLength = Math.hypot(rawRx, rawRz) || 1;
    const rx = rawRx / directionLength;
    const rz = rawRz / directionLength;

    return {
        sourceId: wall.id ?? 'unknown-wall',
        start: { x: tx - halfLen * rx, y: tz - halfLen * rz },
        end: { x: tx + halfLen * rx, y: tz + halfLen * rz }
    };
}

function metersToFeet(value: number): number {
    return value * 3.28084;
}

function rect(x: number, y: number, width: number, height: number): Point[] {
    return [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height }
    ];
}

function logScanNormalization(payload: Record<string, unknown>): void {
    console.log(`[LayoutDebugEngine] ${JSON.stringify({ event: 'scan-normalized', ...payload })}`);
}

function getBounds(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys)
    };
}

function estimatePrincipalAxisAngle(points: Point[]): number {
    if (points.length < 2) {
        return 0;
    }
    const meanX = points.reduce((acc, p) => acc + p.x, 0) / points.length;
    const meanY = points.reduce((acc, p) => acc + p.y, 0) / points.length;

    let covXX = 0;
    let covYY = 0;
    let covXY = 0;
    for (const point of points) {
        const dx = point.x - meanX;
        const dy = point.y - meanY;
        covXX += dx * dx;
        covYY += dy * dy;
        covXY += dx * dy;
    }

    if (covXX === 0 && covYY === 0 && covXY === 0) {
        return 0;
    }

    return 0.5 * Math.atan2(2 * covXY, covXX - covYY);
}

function rotatePoint(point: Point, angleRad: number): Point {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
        x: point.x * cos - point.y * sin,
        y: point.x * sin + point.y * cos
    };
}

function radiansToDegrees(value: number): number {
    return (value * 180) / Math.PI;
}

function buildSteppedEnvelopePolygon(pointsFt: Point[]): Point[] {
    if (pointsFt.length < 3) {
        return rect(0, 0, 40, 30);
    }

    const bounds = getBounds(pointsFt);
    const totalHeight = Math.max(1, bounds.maxY - bounds.minY);
    const bandCount = clampInt(Math.round(totalHeight / 2), 8, 36);
    const bandHeight = totalHeight / bandCount;
    const searchRadius = bandHeight * 1.25;

    const leftSamples: number[] = [];
    const rightSamples: number[] = [];
    const yEdges: number[] = [];

    let fallbackLeft = bounds.minX;
    let fallbackRight = bounds.maxX;

    for (let i = 0; i <= bandCount; i++) {
        const y = bounds.minY + i * bandHeight;
        yEdges.push(y);

        const nearby = pointsFt.filter((p) => Math.abs(p.y - y) <= searchRadius);
        if (nearby.length >= 2) {
            const xValues = nearby.map((p) => p.x).sort((a, b) => a - b);
            fallbackLeft = quantile(xValues, 0.15);
            fallbackRight = quantile(xValues, 0.85);
        }

        leftSamples.push(fallbackLeft);
        rightSamples.push(fallbackRight);
    }

    // Smooth jagged spikes from sparse scan points and cap sudden jumps.
    smoothInPlace(leftSamples, 1);
    smoothInPlace(rightSamples, 1);
    const maxBandStep = bandHeight * 1.5;
    clampBandToBandDelta(leftSamples, maxBandStep);
    clampBandToBandDelta(rightSamples, maxBandStep);

    const minInteriorWidthFt = 4;
    for (let i = 0; i < leftSamples.length; i++) {
        if (rightSamples[i] - leftSamples[i] < minInteriorWidthFt) {
            const center = (leftSamples[i] + rightSamples[i]) / 2;
            leftSamples[i] = center - minInteriorWidthFt / 2;
            rightSamples[i] = center + minInteriorWidthFt / 2;
        }
    }

    const minLeft = Math.min(...leftSamples);
    const normalizedY = yEdges.map((y) => y - bounds.minY);
    const normalizedLeft = leftSamples.map((x) => x - minLeft);
    const normalizedRight = rightSamples.map((x) => x - minLeft);

    const leftPath: Point[] = normalizedY.map((y, idx) => ({ x: normalizedLeft[idx], y }));
    const rightPath: Point[] = normalizedY.map((y, idx) => ({ x: normalizedRight[idx], y }));

    const polygon: Point[] = [];
    polygon.push(...leftPath);
    polygon.push(...rightPath.reverse());

    const polyBounds = getBounds(polygon);
    const polyWidth = polyBounds.maxX - polyBounds.minX;
    const polyHeight = polyBounds.maxY - polyBounds.minY;
    if (!Number.isFinite(polyWidth) || !Number.isFinite(polyHeight) || polyWidth < 6 || polyHeight < 6) {
        return rect(0, 0, Math.max(8, bounds.maxX - bounds.minX), Math.max(8, bounds.maxY - bounds.minY));
    }

    return polygon;
}

function smoothInPlace(values: number[], passes: number): void {
    for (let pass = 0; pass < passes; pass++) {
        for (let i = 1; i < values.length - 1; i++) {
            values[i] = (values[i - 1] + values[i] + values[i + 1]) / 3;
        }
    }
}

function clampInt(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
}

function quantile(sortedValues: number[], q: number): number {
    if (sortedValues.length === 0) {
        return 0;
    }
    const clampedQ = Math.max(0, Math.min(1, q));
    const index = (sortedValues.length - 1) * clampedQ;
    const lo = Math.floor(index);
    const hi = Math.ceil(index);
    if (lo === hi) {
        return sortedValues[lo];
    }
    const t = index - lo;
    return sortedValues[lo] * (1 - t) + sortedValues[hi] * t;
}

function clampBandToBandDelta(values: number[], maxDelta: number): void {
    for (let i = 1; i < values.length; i++) {
        const delta = values[i] - values[i - 1];
        if (Math.abs(delta) > maxDelta) {
            values[i] = values[i - 1] + Math.sign(delta) * maxDelta;
        }
    }
}

function shiftPolygonToOrigin(points: Point[]): Point[] {
    if (points.length === 0) {
        return points;
    }
    const bounds = getBounds(points);
    return points.map((point) => ({
        x: point.x - bounds.minX,
        y: point.y - bounds.minY
    }));
}
