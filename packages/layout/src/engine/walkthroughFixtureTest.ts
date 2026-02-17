import { generateLayoutCandidatesFromScan } from './LayoutPipeline.js';
import { sampleRoomPlanFixture } from './fixtures/sampleRoomPlanFixture.js';

export interface WalkthroughTrace {
    candidateCount: number;
    rejectedCount: number;
    assumptions: string[];
    derivedData: string[];
    inventedData: string[];
}

export async function runFixtureWalkthrough(): Promise<WalkthroughTrace> {
    const result = generateLayoutCandidatesFromScan(sampleRoomPlanFixture, {
        targetUse: 'resale',
        desiredBedrooms: 3,
        desiredBathrooms: 2
    });

    const first = result.candidates[0];
    return {
        candidateCount: result.candidates.length,
        rejectedCount: result.rejectedAttempts.length,
        assumptions: result.warnings,
        derivedData: first?.diagnostics.derivedData ?? [],
        inventedData: first?.diagnostics.inventedData ?? []
    };
}
