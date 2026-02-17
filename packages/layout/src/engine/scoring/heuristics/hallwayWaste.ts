import { type LayoutCandidate } from '../../models/candidate.js';

export interface HeuristicResult {
    score: number;
    reasoning: string[];
}

export function scoreHallwayWaste(candidate: LayoutCandidate): HeuristicResult {
    const total = candidate.rooms.reduce((acc, room) => acc + room.areaSqFt, 0);
    if (total <= 0) {
        return { score: 0, reasoning: ['No usable area detected.'] };
    }

    const hallway = candidate.rooms
        .filter((room) => room.roomType === 'hallway')
        .reduce((acc, room) => acc + room.areaSqFt, 0);
    const ratio = hallway / total;
    const score = Math.max(0, Math.min(1, 1 - Math.max(0, ratio - 0.1) * 6));

    return {
        score,
        reasoning: [`Hallway area ratio ${(ratio * 100).toFixed(1)}%.`]
    };
}
