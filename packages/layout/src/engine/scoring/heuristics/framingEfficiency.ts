import { type LayoutCandidate } from '../../models/candidate.js';

export interface HeuristicResult {
    score: number;
    reasoning: string[];
}

export function scoreFramingEfficiency(candidate: LayoutCandidate): HeuristicResult {
    if (candidate.rooms.length === 0) {
        return { score: 0, reasoning: ['No rooms present for framing analysis.'] };
    }

    const widths = candidate.rooms.map((r) => Math.round(r.widthFt));
    const heights = candidate.rooms.map((r) => Math.round(r.heightFt));
    const distinctDims = new Set([...widths, ...heights]).size;
    const jaggednessPenalty = Math.min(1, distinctDims / (candidate.rooms.length * 1.5));
    const score = Math.max(0, 1 - jaggednessPenalty);

    return {
        score,
        reasoning: [`${distinctDims} distinct room dimensions; fewer distinct sizes usually frame faster.`]
    };
}
