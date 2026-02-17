import { type ScanSession } from '@construction/shared';
import { type Point } from '@construction/geometry';
import { generateLayoutCandidatesFromScan, type LayoutPipelineResult } from './engine/LayoutPipeline.js';
import { type ProgramIntentInput } from './engine/models/intent.js';
import { type RoomPlanJson } from './roomPlanTypes.js';

export * from './roomPlanTypes.js';
export * from './floorplanGenerator.js';
export * from './engine/models/index.js';
export * from './engine/LayoutPipeline.js';

export interface LayoutProposal {
    id: string;
    walls: { start: Point; end: Point }[];
}

export interface GenerateLayoutOptionsRequest {
    scanGeometry: RoomPlanJson;
    intent?: ProgramIntentInput;
}

export function generateLayoutOptions(input: GenerateLayoutOptionsRequest): LayoutPipelineResult {
    return generateLayoutCandidatesFromScan(input.scanGeometry, input.intent);
}

export function generateLayout(scan: ScanSession): LayoutProposal {
    const segmentCount = scan.segments.length;
    const floorPlateFallback = { id: `proposal-${scan.id}`, walls: [] as { start: Point; end: Point }[] };
    if (segmentCount === 0) {
        return floorPlateFallback;
    }

    return floorPlateFallback;
}
