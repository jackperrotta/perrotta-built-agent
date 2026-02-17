import { type LayoutCandidate } from '../models/candidate.js';

export function rankCandidates(candidates: LayoutCandidate[]): LayoutCandidate[] {
    const ordered = [...candidates].sort((a, b) => b.score.totalScore - a.score.totalScore);
    if (ordered.length <= 2) {
        return ordered;
    }

    const diversified: LayoutCandidate[] = [];
    const remaining = [...ordered];
    diversified.push(remaining.shift()!);

    while (remaining.length > 0) {
        let bestIdx = 0;
        let bestDiversityScore = -Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            const nearestSimilarity = diversified.reduce((minSim, picked) => {
                const sim = layoutSimilarity(candidate, picked);
                return Math.min(minSim, sim);
            }, Infinity);
            const blend = candidate.score.totalScore - nearestSimilarity * 0.1;
            if (blend > bestDiversityScore) {
                bestDiversityScore = blend;
                bestIdx = i;
            }
        }
        diversified.push(remaining.splice(bestIdx, 1)[0]);
    }

    return diversified;
}

function layoutSimilarity(a: LayoutCandidate, b: LayoutCandidate): number {
    const areaA = a.rooms.reduce((acc, room) => acc + room.areaSqFt, 0);
    const areaB = b.rooms.reduce((acc, room) => acc + room.areaSqFt, 0);
    const roomDelta = Math.abs(a.rooms.length - b.rooms.length);
    return Math.abs(areaA - areaB) / Math.max(1, areaA, areaB) + roomDelta * 0.05;
}
