import { type ScanSession, type GeneratedLayoutStrategy, type GeneratedLayoutRoom, type GeneratedLayoutSummary } from '@construction/shared';
import { type RoomPlanJson, type RoomPlanObject } from './roomPlanTypes.js';

export interface GeneratedLayoutModel {
    version: number;
    createdAt: number;
    strategy: GeneratedLayoutStrategy;
    summary: GeneratedLayoutSummary;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    exteriorWalls: { start: { x: number; y: number }; end: { x: number; y: number } }[];
    origin: { x: number; y: number };
    rotationRad: number;
    rooms: GeneratedLayoutRoom[];
}

const DEFAULT_BOUNDS = { minX: -5, minY: -3, maxX: 5, maxY: 3 };
const SQM_TO_SQFT = 10.7639;

function extractLine(obj: RoomPlanObject) {
    const mat = obj.transform;
    const width = obj.dimensions[0];
    const tx = mat[12];
    const tz = mat[14];
    const rx = mat[0];
    const rz = mat[2];
    const halfLen = width / 2;
    const x1 = tx - halfLen * rx;
    const y1 = tz - halfLen * rz;
    const x2 = tx + halfLen * rx;
    const y2 = tz + halfLen * rz;
    return { x1, y1, x2, y2 };
}

function extractWallLines(data: RoomPlanJson | null) {
    if (!data) return [];
    return data.walls.map(wall => {
        const { x1, y1, x2, y2 } = extractLine(wall);
        return { start: { x: x1, y: y1 }, end: { x: x2, y: y2 } };
    });
}

function computeDominantRotation(lines: { start: { x: number; y: number }; end: { x: number; y: number } }[]) {
    let sumSin = 0;
    let sumCos = 0;

    lines.forEach(line => {
        const dx = line.end.x - line.start.x;
        const dy = line.end.y - line.start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;
        const angle = Math.atan2(dy, dx);
        sumSin += len * Math.sin(4 * angle);
        sumCos += len * Math.cos(4 * angle);
    });

    if (sumCos === 0 && sumSin === 0) return 0;
    return Math.atan2(sumSin, sumCos) / 4;
}

function extractBoundsFromWalls(walls: { start: { x: number; y: number }; end: { x: number; y: number } }[]) {
    if (walls.length === 0) return { ...DEFAULT_BOUNDS };

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    walls.forEach(wall => {
        minX = Math.min(minX, wall.start.x, wall.end.x);
        minY = Math.min(minY, wall.start.y, wall.end.y);
        maxX = Math.max(maxX, wall.start.x, wall.end.x);
        maxY = Math.max(maxY, wall.start.y, wall.end.y);
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return { ...DEFAULT_BOUNDS };
    }

    const padding = 0.3;
    return {
        minX: minX - padding,
        minY: minY - padding,
        maxX: maxX + padding,
        maxY: maxY + padding
    };
}

function rotatePoint(point: { x: number; y: number }, origin: { x: number; y: number }, angleRad: number) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    return {
        x: origin.x + dx * cos - dy * sin,
        y: origin.y + dx * sin + dy * cos
    };
}

function localToWorld(point: { x: number; y: number }, origin: { x: number; y: number }, angleRad: number) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
        x: origin.x + point.x * cos - point.y * sin,
        y: origin.y + point.x * sin + point.y * cos
    };
}

function getCentroid(points: { x: number; y: number }[]) {
    if (points.length === 0) return { x: 0, y: 0 };
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

function computeLayoutFrame(walls: { start: { x: number; y: number }; end: { x: number; y: number } }[]) {
    if (walls.length === 0) {
        return {
            bounds: { ...DEFAULT_BOUNDS },
            rotationRad: 0,
            origin: { x: 0, y: 0 },
            exteriorWalls: []
        };
    }

    const points = walls.flatMap(wall => [wall.start, wall.end]);
    const origin = getCentroid(points);
    const rotationRad = computeDominantRotation(walls);
    const cos = Math.cos(-rotationRad);
    const sin = Math.sin(-rotationRad);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const localWalls = walls.map(wall => {
        const startLocal = {
            x: (wall.start.x - origin.x) * cos - (wall.start.y - origin.y) * sin,
            y: (wall.start.x - origin.x) * sin + (wall.start.y - origin.y) * cos
        };
        const endLocal = {
            x: (wall.end.x - origin.x) * cos - (wall.end.y - origin.y) * sin,
            y: (wall.end.x - origin.x) * sin + (wall.end.y - origin.y) * cos
        };

        minX = Math.min(minX, startLocal.x, endLocal.x);
        minY = Math.min(minY, startLocal.y, endLocal.y);
        maxX = Math.max(maxX, startLocal.x, endLocal.x);
        maxY = Math.max(maxY, startLocal.y, endLocal.y);

        return { startLocal, endLocal };
    });

    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
        return {
            bounds: { ...DEFAULT_BOUNDS },
            rotationRad: 0,
            origin,
            exteriorWalls: []
        };
    }

    const bounds = { minX, minY, maxX, maxY };

    const snapTolerance = 0.2;
    const nodes: { x: number; y: number }[] = [];
    const edges: { a: number; b: number }[] = [];

    const getNodeIndex = (point: { x: number; y: number }) => {
        const existingIndex = nodes.findIndex(node => {
            const dx = node.x - point.x;
            const dy = node.y - point.y;
            return Math.hypot(dx, dy) <= snapTolerance;
        });
        if (existingIndex >= 0) {
            return existingIndex;
        }
        nodes.push({ x: point.x, y: point.y });
        return nodes.length - 1;
    };

    localWalls.forEach(wall => {
        const a = getNodeIndex(wall.startLocal);
        const b = getNodeIndex(wall.endLocal);
        if (a !== b) {
            edges.push({ a, b });
        }
    });

    const adjacency = nodes.map(() => [] as { edgeIndex: number; other: number }[]);
    edges.forEach((edge, idx) => {
        adjacency[edge.a].push({ edgeIndex: idx, other: edge.b });
        adjacency[edge.b].push({ edgeIndex: idx, other: edge.a });
    });

    const startNode = nodes.reduce((best, node, idx) => {
        if (!best) return { idx, node };
        if (node.x < best.node.x || (node.x === best.node.x && node.y < best.node.y)) {
            return { idx, node };
        }
        return best;
    }, null as null | { idx: number; node: { x: number; y: number } });

    const exteriorNodeIndices: number[] = [];
    if (startNode) {
        const startIdx = startNode.idx;
        let currentIdx = startIdx;
        let prevAngle = Math.PI; // Facing left
        let prevEdge = -1;
        const visitedEdges = new Set<number>();

        for (let step = 0; step < edges.length * 3; step += 1) {
            exteriorNodeIndices.push(currentIdx);
            const options = adjacency[currentIdx].filter(option => option.edgeIndex !== prevEdge || adjacency[currentIdx].length === 1);
            if (options.length === 0) break;

            let bestOption = options[0];
            let bestDelta = Infinity;

            options.forEach(option => {
                const nextNode = nodes[option.other];
                const currentNode = nodes[currentIdx];
                const angle = Math.atan2(nextNode.y - currentNode.y, nextNode.x - currentNode.x);
                const delta = (prevAngle - angle + Math.PI * 2) % (Math.PI * 2);
                if (delta < bestDelta) {
                    bestDelta = delta;
                    bestOption = option;
                }
            });

            prevEdge = bestOption.edgeIndex;
            prevAngle = Math.atan2(nodes[bestOption.other].y - nodes[currentIdx].y, nodes[bestOption.other].x - nodes[currentIdx].x);
            visitedEdges.add(prevEdge);
            currentIdx = bestOption.other;

            if (currentIdx === startIdx && exteriorNodeIndices.length > 2) {
                break;
            }
        }
    }

    const exteriorWallsLocal = exteriorNodeIndices.length > 2
        ? exteriorNodeIndices.map((nodeIdx, idx) => {
            const nextIdx = exteriorNodeIndices[(idx + 1) % exteriorNodeIndices.length];
            return {
                start: nodes[nodeIdx],
                end: nodes[nextIdx]
            };
        })
        : localWalls.map(wall => ({ start: wall.startLocal, end: wall.endLocal }));

    const exteriorWalls = exteriorWallsLocal.map(wall => ({
        start: localToWorld(wall.start, origin, rotationRad),
        end: localToWorld(wall.end, origin, rotationRad)
    }));

    return {
        bounds,
        rotationRad,
        origin,
        exteriorWalls
    };
}

function makeRoom(
    id: string,
    type: GeneratedLayoutRoom['type'],
    floor: GeneratedLayoutRoom['floor'],
    bounds: GeneratedLayoutRoom['bounds'],
    options: { isPrimary?: boolean } = {}
): GeneratedLayoutRoom {
    const areaSqM = Math.max(0, (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY));
    return {
        id,
        type,
        floor,
        bounds,
        areaSqFt: Math.round(areaSqM * SQM_TO_SQFT),
        isPrimary: options.isPrimary
    };
}

function getFloorCount(session: ScanSession): number {
    const hasSecondFloor = session.segments?.some(segment => segment.type === 'SecondFloor');
    return hasSecondFloor ? 2 : 1;
}

export function generateGeneratedLayoutModel(session: ScanSession, roomPlan: RoomPlanJson | null): GeneratedLayoutModel {
    const wallLines = extractWallLines(roomPlan);
    const frame = computeLayoutFrame(wallLines);
    const bounds = frame.bounds;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxY - bounds.minY;
    const floorCount = getFloorCount(session);

    const rooms: GeneratedLayoutRoom[] = [];

    const masterDepth = depth * 0.5;
    const masterBathWidth = width * 0.35;
    const masterBedroomWidth = width - masterBathWidth;

    if (floorCount >= 2) {
        rooms.push(
            makeRoom('bedroom-master', 'Bedroom', 'SecondFloor', {
                minX: bounds.minX,
                minY: bounds.maxY - masterDepth,
                maxX: bounds.minX + masterBedroomWidth,
                maxY: bounds.maxY
            }, { isPrimary: true })
        );
        rooms.push(
            makeRoom('bathroom-master', 'Bathroom', 'SecondFloor', {
                minX: bounds.minX + masterBedroomWidth,
                minY: bounds.maxY - masterDepth,
                maxX: bounds.maxX,
                maxY: bounds.maxY
            }, { isPrimary: true })
        );

        const frontDepth = depth - masterDepth;
        if (frontDepth > 2.4) {
            rooms.push(
                makeRoom('bedroom-2', 'Bedroom', 'SecondFloor', {
                    minX: bounds.minX,
                    minY: bounds.minY,
                    maxX: bounds.minX + width * 0.6,
                    maxY: bounds.minY + frontDepth
                })
            );
            rooms.push(
                makeRoom('bathroom-hall', 'Bathroom', 'SecondFloor', {
                    minX: bounds.minX + width * 0.6,
                    minY: bounds.minY,
                    maxX: bounds.maxX,
                    maxY: bounds.minY + frontDepth * 0.55
                })
            );
        }
    }

    rooms.push(
        makeRoom('living', 'Living', 'FirstFloor', {
            minX: bounds.minX,
            minY: bounds.minY,
            maxX: bounds.minX + width * 0.55,
            maxY: bounds.minY + depth * 0.55
        })
    );
    rooms.push(
        makeRoom('kitchen', 'Kitchen', 'FirstFloor', {
            minX: bounds.minX + width * 0.55,
            minY: bounds.minY,
            maxX: bounds.maxX,
            maxY: bounds.minY + depth * 0.55
        })
    );
    rooms.push(
        makeRoom('dining', 'Dining', 'FirstFloor', {
            minX: bounds.minX,
            minY: bounds.minY + depth * 0.55,
            maxX: bounds.maxX,
            maxY: bounds.maxY
        })
    );

    const bedrooms = rooms.filter(room => room.type === 'Bedroom').length;
    const bathrooms = rooms.filter(room => room.type === 'Bathroom').length;
    const totalAreaSqFt = Math.round(width * depth * SQM_TO_SQFT);

    const summary: GeneratedLayoutSummary = {
        bedrooms,
        bathrooms,
        floorCount,
        totalAreaSqFt
    };

    return {
        version: 1,
        createdAt: Date.now(),
        strategy: 'master_bath_priority',
        summary,
        bounds,
        exteriorWalls: frame.exteriorWalls,
        origin: frame.origin,
        rotationRad: frame.rotationRad,
        rooms
    };
}

export function generateGeneratedFloorplanSvg(model: GeneratedLayoutModel): string {
    const { rooms } = model;
    const wallBounds = extractBoundsFromWalls(model.exteriorWalls || []);
    const padding = 0.4;
    const viewBox = `${wallBounds.minX - padding} ${wallBounds.minY - padding} ${(wallBounds.maxX - wallBounds.minX) + 2 * padding} ${(wallBounds.maxY - wallBounds.minY) + 2 * padding}`;

    const wallPaths = (model.exteriorWalls || []).map(wall => (
        `<line x1="${wall.start.x}" y1="${wall.start.y}" x2="${wall.end.x}" y2="${wall.end.y}" stroke="#111" stroke-width="0.08" stroke-linecap="square" />`
    )).join('\n');

    const roomRects = rooms.map(room => {
        const width = room.bounds.maxX - room.bounds.minX;
        const height = room.bounds.maxY - room.bounds.minY;
        const localCenter = { x: room.bounds.minX + width / 2, y: room.bounds.minY + height / 2 };
        const roomPoints = [
            { x: room.bounds.minX, y: room.bounds.minY },
            { x: room.bounds.maxX, y: room.bounds.minY },
            { x: room.bounds.maxX, y: room.bounds.maxY },
            { x: room.bounds.minX, y: room.bounds.maxY }
        ].map(point => localToWorld(point, model.origin, model.rotationRad));
        const labelPoint = localToWorld(localCenter, model.origin, model.rotationRad);
        const polygonPoints = roomPoints.map(point => `${point.x},${point.y}`).join(' ');
        return `
            <polygon points="${polygonPoints}" fill="#f7f7f7" stroke="#222" stroke-width="0.04" />
            <text x="${labelPoint.x}" y="${labelPoint.y}" font-size="0.4" text-anchor="middle" dominant-baseline="middle" fill="#333">${room.type}</text>
        `;
    }).join('\n');

    return `
        <svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" style="background-color: #ffffff; transform: scale(1, -1);">
            ${wallPaths}
            ${roomRects}
        </svg>
    `;
}
