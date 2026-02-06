import { type ScanSession } from '@construction/shared';
import { type Point } from '@construction/geometry';

export * from './roomPlanTypes.js';
export * from './floorplanGenerator.js';
export * from './generatedLayout.js';

export interface LayoutProposal {
    id: string;
    walls: { start: Point; end: Point }[];
}

export function generateLayout(scan: ScanSession): LayoutProposal {
    return { id: 'proposal-1', walls: [] };
}
