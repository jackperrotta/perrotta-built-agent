import { type LayoutCandidate } from '../../models/candidate.js';
import { type GenerationContext } from '../../models/constraints.js';

export interface HeuristicResult {
    score: number;
    reasoning: string[];
}

export function scoreEgressSanity(candidate: LayoutCandidate, context: GenerationContext): HeuristicResult {
    const bedrooms = candidate.rooms.filter((r) => r.roomType === 'bedroom');
    if (bedrooms.length === 0) {
        return { score: 0.8, reasoning: ['No bedrooms; egress constraints are lighter.'] };
    }

    const env = context.normalizedScan.envelope;
    const distances = bedrooms.map((room) => {
        const centerX = (room.polygon[0].x + room.polygon[2].x) / 2;
        const centerY = (room.polygon[0].y + room.polygon[2].y) / 2;
        const toEdge = Math.min(centerX, centerY, env.widthFt - centerX, env.heightFt - centerY);
        return toEdge;
    });

    const worst = Math.max(...distances);
    const score = Math.max(0, Math.min(1, 1 - worst / Math.max(20, env.widthFt * 0.6)));
    return {
        score,
        reasoning: [`Worst bedroom-to-envelope-edge distance ${worst.toFixed(1)}ft.`]
    };
}
