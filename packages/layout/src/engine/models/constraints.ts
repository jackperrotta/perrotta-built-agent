import { type RoomPlanJson } from '../../roomPlanTypes.js';
import { type Point } from '@construction/geometry';
import { type ProgramIntent } from './intent.js';
import { type RoomGraph } from './graph.js';
import { type LayoutCandidate, type SoftPenalty } from './candidate.js';

export interface TolerantEnvelope {
    polygon: Point[];
    toleranceFt: number;
    widthFt: number;
    heightFt: number;
    confidence: number;
}

export interface NormalizedScan {
    source: RoomPlanJson;
    envelope: TolerantEnvelope;
    notes: string[];
}

export interface GenerationContext {
    intent: ProgramIntent;
    graph: RoomGraph;
    normalizedScan: NormalizedScan;
}

export interface HardConstraintResult {
    pass: boolean;
    message?: string;
}

export interface HardConstraintRule {
    id: string;
    evaluate: (candidate: LayoutCandidate, context: GenerationContext) => HardConstraintResult;
}

export interface SoftConstraintRule {
    id: string;
    weight: number;
    evaluate: (candidate: LayoutCandidate, context: GenerationContext) => SoftPenalty;
}

export interface ConstraintCatalog {
    hardRules: HardConstraintRule[];
    softRules: SoftConstraintRule[];
}
