import { type LayoutCandidate } from '../../models/candidate.js';

export interface HeuristicResult {
    score: number;
    reasoning: string[];
}

export function scorePlumbingStacking(candidate: LayoutCandidate): HeuristicResult {
    const plumbingRooms = candidate.rooms.filter((r) => r.roomType === 'bathroom' || r.roomType === 'kitchen' || r.roomType === 'laundry');
    if (plumbingRooms.length <= 1) {
        return { score: 0.75, reasoning: ['Single plumbing zone, limited stacking opportunities to evaluate.'] };
    }

    const centers = plumbingRooms.map((r) => ({
        x: (r.polygon[0].x + r.polygon[2].x) / 2,
        y: (r.polygon[0].y + r.polygon[2].y) / 2
    }));

    let totalDistance = 0;
    let pairs = 0;
    for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
            totalDistance += Math.hypot(centers[i].x - centers[j].x, centers[i].y - centers[j].y);
            pairs += 1;
        }
    }

    const avgDistance = pairs > 0 ? totalDistance / pairs : 0;
    const normalized = Math.max(0, Math.min(1, 1 - avgDistance / 30));
    return {
        score: normalized,
        reasoning: [`Average plumbing room separation ${avgDistance.toFixed(1)}ft.`]
    };
}
