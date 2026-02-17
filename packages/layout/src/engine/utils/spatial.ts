import { type Point } from '@construction/geometry';

export interface Box2D {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export function getBox(points: Point[]): Box2D {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys)
    };
}

export function boxesOverlap(a: Box2D, b: Box2D): boolean {
    return !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxY <= b.minY || a.minY >= b.maxY);
}

export function boxOverlapArea(a: Box2D, b: Box2D): number {
    const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const overlapY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
    if (overlapX <= 0 || overlapY <= 0) {
        return 0;
    }
    return overlapX * overlapY;
}

export function polygonOverlapArea(subject: Point[], clip: Point[]): number {
    if (subject.length < 3 || clip.length < 3) {
        return 0;
    }

    let output = [...subject];
    const clipIsClockwise = signedPolygonArea(clip) < 0;

    for (let i = 0; i < clip.length; i++) {
        const edgeStart = clip[i];
        const edgeEnd = clip[(i + 1) % clip.length];
        const input = output;
        output = [];
        if (input.length === 0) {
            break;
        }

        let previous = input[input.length - 1];
        for (const current of input) {
            const currentInside = isInsideHalfPlane(current, edgeStart, edgeEnd, clipIsClockwise);
            const previousInside = isInsideHalfPlane(previous, edgeStart, edgeEnd, clipIsClockwise);

            if (currentInside) {
                if (!previousInside) {
                    const intersection = lineSegmentIntersection(previous, current, edgeStart, edgeEnd);
                    if (intersection) {
                        output.push(intersection);
                    }
                }
                output.push(current);
            } else if (previousInside) {
                const intersection = lineSegmentIntersection(previous, current, edgeStart, edgeEnd);
                if (intersection) {
                    output.push(intersection);
                }
            }
            previous = current;
        }
    }

    if (output.length < 3) {
        return 0;
    }
    return Math.abs(signedPolygonArea(output));
}

export function polygonContainedInBox(points: Point[], box: Box2D, tolerance = 0): boolean {
    return points.every((p) =>
        p.x >= box.minX - tolerance &&
        p.x <= box.maxX + tolerance &&
        p.y >= box.minY - tolerance &&
        p.y <= box.maxY + tolerance
    );
}

export function polygonContainedInPolygon(points: Point[], envelope: Point[], tolerance = 0): boolean {
    return points.every((point) => pointInsideOrNearPolygon(point, envelope, tolerance));
}

export function isNear(a: Box2D, b: Box2D, threshold: number): boolean {
    const horizontalGap = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
    const verticalGap = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
    return horizontalGap <= threshold && verticalGap <= threshold;
}

function pointInsideOrNearPolygon(point: Point, polygon: Point[], tolerance: number): boolean {
    if (pointInPolygon(point, polygon)) {
        return true;
    }
    if (tolerance <= 0) {
        return false;
    }

    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (distancePointToSegment(point, a, b) <= tolerance) {
            return true;
        }
    }
    return false;
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x;
        const yi = polygon[i].y;
        const xj = polygon[j].x;
        const yj = polygon[j].y;

        const intersects = ((yi > point.y) !== (yj > point.y))
            && (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi);
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}

function distancePointToSegment(point: Point, a: Point, b: Point): number {
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const apX = point.x - a.x;
    const apY = point.y - a.y;
    const denom = abX * abX + abY * abY;
    if (denom <= 0) {
        return Math.hypot(point.x - a.x, point.y - a.y);
    }
    const t = Math.max(0, Math.min(1, (apX * abX + apY * abY) / denom));
    const closestX = a.x + t * abX;
    const closestY = a.y + t * abY;
    return Math.hypot(point.x - closestX, point.y - closestY);
}

function signedPolygonArea(polygon: Point[]): number {
    let sum = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        sum += a.x * b.y - b.x * a.y;
    }
    return sum * 0.5;
}

function isInsideHalfPlane(point: Point, edgeStart: Point, edgeEnd: Point, clipIsClockwise: boolean): boolean {
    const cross =
        (edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y) -
        (edgeEnd.y - edgeStart.y) * (point.x - edgeStart.x);
    return clipIsClockwise ? cross <= 1e-9 : cross >= -1e-9;
}

function lineSegmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
    const aDx = a2.x - a1.x;
    const aDy = a2.y - a1.y;
    const bDx = b2.x - b1.x;
    const bDy = b2.y - b1.y;

    const denom = aDx * bDy - aDy * bDx;
    if (Math.abs(denom) < 1e-9) {
        return null;
    }

    const cX = b1.x - a1.x;
    const cY = b1.y - a1.y;
    const t = (cX * bDy - cY * bDx) / denom;
    return {
        x: a1.x + t * aDx,
        y: a1.y + t * aDy
    };
}
