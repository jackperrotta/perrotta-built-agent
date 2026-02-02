import { type ScanSession } from '@construction/shared';
import { type Point } from '@construction/geometry';

export interface LayoutProposal {
    id: string;
    walls: { start: Point; end: Point }[];
}

export function generateLayout(scan: ScanSession): LayoutProposal {
    return { id: 'proposal-1', walls: [] };
}
