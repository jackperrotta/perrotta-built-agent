import { type Point } from '@construction/geometry';
import { type RoomType } from './intent.js';

export interface CandidateRoom {
    id: string;
    roomType: RoomType;
    polygon: Point[];
    areaSqFt: number;
    widthFt: number;
    heightFt: number;
}

export interface ConstraintViolation {
    constraintId: string;
    message: string;
}

export interface SoftPenalty {
    ruleId: string;
    penalty: number;
    reasoning: string;
}

export interface CandidateDiagnostics {
    attemptId: string;
    derivedData: string[];
    inventedData: string[];
    assumptions: string[];
    hardFailures: ConstraintViolation[];
    softPenalties: SoftPenalty[];
}

export interface CategoryScore {
    score: number;
    reasoning: string[];
}

export interface LayoutCandidateScore {
    totalScore: number;
    categories: {
        codeCompliance: CategoryScore;
        efficiency: CategoryScore;
        structuralRisk: CategoryScore;
        marketability: CategoryScore;
        constructionCost: CategoryScore;
    };
}

export interface LayoutCandidate {
    id: string;
    rooms: CandidateRoom[];
    score: LayoutCandidateScore;
    diagnostics: CandidateDiagnostics;
}

export interface RankedCandidatesResult {
    candidates: LayoutCandidate[];
    rejectedAttempts: CandidateDiagnostics[];
    metadata: {
        attemptsRequested: number;
        attemptsExecuted: number;
        generatedAt: string;
        modelSpace?: {
            widthFt: number;
            heightFt: number;
            areaSqFt: number;
            toleranceFt: number;
            confidence: number;
            fillTargetAreaSqFt: number;
            extractionStats?: Record<string, unknown>;
        };
        envelopePolygon?: Point[];
    };
}
