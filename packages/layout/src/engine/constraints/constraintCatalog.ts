import { calculatePolygonArea } from '@construction/geometry';
import { type ConstraintCatalog, type GenerationContext } from '../models/constraints.js';
import { type LayoutCandidate, type SoftPenalty } from '../models/candidate.js';
import { getBox, isNear, polygonContainedInPolygon, polygonOverlapArea } from '../utils/spatial.js';

export function buildConstraintCatalog(): ConstraintCatalog {
    const OVERLAP_TOLERANCE_SQFT = 0.1;
    const BASE_UNDERFILL_TOLERANCE_RATIO = 0.01; // >= 99% fill before uncertainty allowance
    const BASE_OVERFILL_TOLERANCE_RATIO = 0.01; // <= 101% fill before uncertainty allowance

    return {
        hardRules: [
            {
                id: 'boundary-containment',
                evaluate: (candidate, context) => {
                    for (const room of candidate.rooms) {
                        if (!polygonContainedInPolygon(
                            room.polygon,
                            context.normalizedScan.envelope.polygon,
                            context.normalizedScan.envelope.toleranceFt
                        )) {
                            return {
                                pass: false,
                                message: `Room ${room.id} falls outside the tolerant envelope.`
                            };
                        }
                    }
                    return { pass: true };
                }
            },
            {
                id: 'min-room-dimensions',
                evaluate: (candidate) => {
                    for (const room of candidate.rooms) {
                        if (room.widthFt < 4 || room.heightFt < 4) {
                            return {
                                pass: false,
                                message: `Room ${room.id} is below practical minimum dimension (4ft).`
                            };
                        }
                    }
                    return { pass: true };
                }
            },
            {
                id: 'full-envelope-fill',
                evaluate: (candidate, context) => {
                    const envelopeAreaSqFt = calculatePolygonArea(context.normalizedScan.envelope.polygon);
                    const totalRoomAreaSqFt = candidate.rooms.reduce((acc, room) => acc + calculatePolygonArea(room.polygon), 0);
                    if (envelopeAreaSqFt <= 0) {
                        return {
                            pass: false,
                            message: 'Envelope area is non-positive; cannot validate full fill.'
                        };
                    }

                    const ratio = totalRoomAreaSqFt / envelopeAreaSqFt;
                    const maxEnvelopeDim = Math.max(
                        context.normalizedScan.envelope.widthFt,
                        context.normalizedScan.envelope.heightFt,
                        1
                    );
                    // Allow a small overfill window that scales with scan fuzziness.
                    const uncertaintyRatio = context.normalizedScan.envelope.toleranceFt / maxEnvelopeDim;
                    const overfillToleranceRatio = Math.min(0.03, BASE_OVERFILL_TOLERANCE_RATIO + uncertaintyRatio * 0.15);
                    const underfillToleranceRatio = Math.min(0.03, BASE_UNDERFILL_TOLERANCE_RATIO + uncertaintyRatio * 0.15);
                    const underfillThreshold = 1 - underfillToleranceRatio;
                    const overfillThreshold = 1 + overfillToleranceRatio;

                    if (ratio < underfillThreshold || ratio > overfillThreshold) {
                        return {
                            pass: false,
                            message: `Candidate fill ratio ${ratio.toFixed(4)} is outside tolerance (${underfillThreshold.toFixed(4)} to ${overfillThreshold.toFixed(4)}).`
                        };
                    }

                    return { pass: true };
                }
            },
            {
                id: 'no-room-overlap',
                evaluate: (candidate) => {
                    for (let i = 0; i < candidate.rooms.length; i++) {
                        for (let j = i + 1; j < candidate.rooms.length; j++) {
                            const roomA = candidate.rooms[i];
                            const roomB = candidate.rooms[j];
                            const overlapSqFt = polygonOverlapArea(roomA.polygon, roomB.polygon);
                            if (overlapSqFt > OVERLAP_TOLERANCE_SQFT) {
                                return {
                                    pass: false,
                                    message: `Rooms ${roomA.id} and ${roomB.id} overlap by ${overlapSqFt.toFixed(2)} sq ft (tolerance ${OVERLAP_TOLERANCE_SQFT.toFixed(2)}).`
                                };
                            }
                        }
                    }
                    return { pass: true };
                }
            },
            {
                id: 'forbidden-adjacency',
                evaluate: (candidate, context) => {
                    const forbidden = context.graph.edges.filter((e) => e.strength === 'forbidden');
                    if (forbidden.length === 0) {
                        return { pass: true };
                    }

                    for (const edge of forbidden) {
                        const from = candidate.rooms.find((r) => r.id === edge.fromNodeId);
                        const to = candidate.rooms.find((r) => r.id === edge.toNodeId);
                        if (!from || !to) {
                            continue;
                        }

                        if (isNear(getBox(from.polygon), getBox(to.polygon), 0.75)) {
                            return {
                                pass: false,
                                message: `${edge.fromNodeId} and ${edge.toNodeId} violate forbidden adjacency.`
                            };
                        }
                    }
                    return { pass: true };
                }
            }
        ],
        softRules: [
            {
                id: 'hallway-waste',
                weight: 0.8,
                evaluate: scoreHallwayWaste
            },
            {
                id: 'net-area-efficiency',
                weight: 0.7,
                evaluate: scoreNetAreaEfficiency
            }
        ]
    };
}

function scoreHallwayWaste(candidate: LayoutCandidate): SoftPenalty {
    const hallwayArea = candidate.rooms
        .filter((r) => r.roomType === 'hallway')
        .reduce((acc, r) => acc + r.areaSqFt, 0);
    const totalArea = candidate.rooms.reduce((acc, r) => acc + r.areaSqFt, 0);
    if (totalArea <= 0) {
        return { ruleId: 'hallway-waste', penalty: 1, reasoning: 'No valid room area detected.' };
    }

    const ratio = hallwayArea / totalArea;
    const penalty = Math.max(0, ratio - 0.12) * 10;
    return {
        ruleId: 'hallway-waste',
        penalty,
        reasoning: `Hallway ratio ${(ratio * 100).toFixed(1)}%`
    };
}

function scoreNetAreaEfficiency(candidate: LayoutCandidate, context: GenerationContext): SoftPenalty {
    const roomArea = candidate.rooms.reduce((acc, r) => acc + calculatePolygonArea(r.polygon), 0);
    const envelopeArea = calculatePolygonArea(context.normalizedScan.envelope.polygon);
    const ratio = envelopeArea > 0 ? roomArea / envelopeArea : 0;
    const penalty = Math.max(0, 0.7 - ratio) * 12;
    return {
        ruleId: 'net-area-efficiency',
        penalty,
        reasoning: `Room to envelope fill ratio ${(ratio * 100).toFixed(1)}%`
    };
}
