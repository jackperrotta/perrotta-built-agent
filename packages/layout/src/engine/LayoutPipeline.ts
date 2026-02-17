import { type RoomPlanJson } from '../roomPlanTypes.js';
import { generateCandidates } from './generation/candidateGenerator.js';
import { type RankedCandidatesResult } from './models/candidate.js';
import { type ProgramIntentInput } from './models/intent.js';
import { prepareGenerationContext } from './pipeline/prepareGenerationContext.js';

export interface LayoutPipelineResult extends RankedCandidatesResult {
    warnings: string[];
    errors: string[];
}

export function generateLayoutCandidatesFromScan(
    scan: RoomPlanJson,
    intentInput: ProgramIntentInput = {}
): LayoutPipelineResult {
    const prepared = prepareGenerationContext(scan, intentInput);
    if (!prepared.context) {
        return {
            candidates: [],
            rejectedAttempts: [],
            metadata: {
                attemptsRequested: 0,
                attemptsExecuted: 0,
                generatedAt: new Date().toISOString()
            },
            warnings: prepared.warnings,
            errors: prepared.errors
        };
    }

    const generated = generateCandidates(prepared.context);
    return {
        ...generated,
        warnings: prepared.warnings,
        errors: []
    };
}
