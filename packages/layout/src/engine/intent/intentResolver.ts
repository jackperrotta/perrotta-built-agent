import {
    type ProgramIntent,
    type ProgramIntentInput,
    type ConstraintPolicy,
    type RoomDemand
} from '../models/intent.js';

const DEFAULT_POLICY: ConstraintPolicy = {
    envelopeToleranceRatio: 0.08,
    maxGenerationAttempts: 80,
    targetCandidateCount: 24,
    rejectLowConfidenceScansBelow: 0.35
};

const DEFAULT_ROOM_DEMANDS: RoomDemand[] = [
    { roomType: 'living_room', minCount: 1, minAreaSqFt: 180, minWidthFt: 10, preferredAdjacency: ['kitchen', 'dining_room'] },
    { roomType: 'kitchen', minCount: 1, minAreaSqFt: 120, minWidthFt: 8, preferredAdjacency: ['living_room', 'dining_room'] },
    { roomType: 'bathroom', minCount: 1, minAreaSqFt: 36, minWidthFt: 5, preferredAdjacency: ['bedroom'] }
];

export function resolveProgramIntent(input: ProgramIntentInput = {}): ProgramIntent {
    const assumptions: ProgramIntent['assumptions'] = [];
    const missingUserInputs: string[] = [];

    const targetUse = input.targetUse ?? 'flip';
    if (!input.targetUse) {
        assumptions.push({ key: 'targetUse', value: targetUse, reason: 'defaulted because user did not provide it' });
        missingUserInputs.push('targetUse');
    }

    const units = input.units ?? 'feet';
    if (!input.units) {
        assumptions.push({ key: 'units', value: units, reason: 'defaulted to feet for US GC heuristics' });
        missingUserInputs.push('units');
    }

    const marketGoal = input.marketGoal ?? { strategy: 'balanced', budgetSensitivity: 0.5 };
    if (!input.marketGoal) {
        assumptions.push({ key: 'marketGoal', value: 'balanced', reason: 'default market objective' });
        missingUserInputs.push('marketGoal');
    }

    let roomDemands = input.roomDemands;
    if (!roomDemands) {
        roomDemands = [...DEFAULT_ROOM_DEMANDS];
        assumptions.push({ key: 'roomDemands', value: 'default_core_program', reason: 'room program not provided' });
        missingUserInputs.push('roomDemands');
    }

    if (typeof input.desiredBedrooms === 'number') {
        roomDemands = upsertDemand(roomDemands, {
            roomType: 'bedroom',
            minCount: Math.max(0, Math.floor(input.desiredBedrooms)),
            targetCount: Math.max(0, Math.floor(input.desiredBedrooms)),
            minAreaSqFt: 110,
            minWidthFt: 9,
            preferredAdjacency: ['bathroom']
        });
    } else {
        missingUserInputs.push('desiredBedrooms');
    }

    if (typeof input.desiredBathrooms === 'number') {
        roomDemands = upsertDemand(roomDemands, {
            roomType: 'bathroom',
            minCount: Math.max(1, Math.floor(input.desiredBathrooms)),
            targetCount: Math.max(1, Math.floor(input.desiredBathrooms)),
            minAreaSqFt: 36,
            minWidthFt: 5,
            preferredAdjacency: ['bedroom']
        });
    } else {
        missingUserInputs.push('desiredBathrooms');
    }

    const policy: ConstraintPolicy = { ...DEFAULT_POLICY, ...(input.policy ?? {}) };

    return {
        targetUse,
        units,
        marketGoal,
        roomDemands,
        policy,
        guards: {
            inferStructuralWalls: false,
            inferExactCodeCompliance: false,
            inferPlumbingStackFeasibility: false,
            inferPreciseWallThickness: false
        },
        assumptions,
        missingUserInputs
    };
}

function upsertDemand(existing: RoomDemand[], update: RoomDemand): RoomDemand[] {
    const idx = existing.findIndex((d) => d.roomType === update.roomType);
    if (idx < 0) {
        return [...existing, update];
    }

    const next = [...existing];
    next[idx] = {
        ...next[idx],
        ...update,
        minAreaSqFt: Math.max(next[idx].minAreaSqFt, update.minAreaSqFt),
        minWidthFt: Math.max(next[idx].minWidthFt, update.minWidthFt)
    };
    return next;
}
