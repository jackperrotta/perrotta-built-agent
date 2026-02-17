import { type LayoutCandidate } from '../models/candidate.js';
import { type GenerationContext } from '../models/constraints.js';
import { scoreEgressSanity } from './heuristics/egressSanity.js';
import { scoreFramingEfficiency } from './heuristics/framingEfficiency.js';
import { scoreHallwayWaste } from './heuristics/hallwayWaste.js';
import { scorePlumbingStacking } from './heuristics/plumbingStacking.js';

export function scoreLayout(candidate: LayoutCandidate, context: GenerationContext): LayoutCandidate['score'] {
    const plumbing = scorePlumbingStacking(candidate);
    const framing = scoreFramingEfficiency(candidate);
    const egress = scoreEgressSanity(candidate, context);
    const hallway = scoreHallwayWaste(candidate);

    const marketability = (hallway.score * 0.6) + (egress.score * 0.4);
    const efficiency = (hallway.score * 0.5) + (framing.score * 0.5);
    const structuralRisk = framing.score;
    const codeCompliance = egress.score;
    const constructionCost = (plumbing.score * 0.5) + (framing.score * 0.5);

    const total =
        codeCompliance * 0.25 +
        efficiency * 0.2 +
        structuralRisk * 0.2 +
        marketability * 0.2 +
        constructionCost * 0.15;

    return {
        totalScore: Math.round(total * 1000) / 1000,
        categories: {
            codeCompliance: {
                score: codeCompliance,
                reasoning: egress.reasoning
            },
            efficiency: {
                score: efficiency,
                reasoning: hallway.reasoning
            },
            structuralRisk: {
                score: structuralRisk,
                reasoning: framing.reasoning
            },
            marketability: {
                score: marketability,
                reasoning: [
                    ...hallway.reasoning,
                    ...egress.reasoning
                ]
            },
            constructionCost: {
                score: constructionCost,
                reasoning: [
                    ...plumbing.reasoning,
                    ...framing.reasoning
                ]
            }
        }
    };
}
