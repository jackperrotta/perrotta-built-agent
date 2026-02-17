export type TargetUse = 'flip' | 'rental' | 'resale';
export type UnitSystem = 'feet' | 'meters';

export type RoomType =
    | 'bedroom'
    | 'kitchen'
    | 'living_room'
    | 'bathroom'
    | 'dining_room'
    | 'hallway'
    | 'closet'
    | 'laundry'
    | 'office'
    | 'utility'
    | 'stairwell'
    | 'deck';

export interface RoomDemand {
    roomType: RoomType;
    minCount: number;
    targetCount?: number;
    minAreaSqFt: number;
    minWidthFt: number;
    preferredAdjacency?: RoomType[];
}

export interface MarketGoal {
    strategy: 'maximize_resale' | 'maximize_rent' | 'budget_flip' | 'balanced';
    budgetSensitivity: number; // 0..1
}

export interface ConstraintPolicy {
    envelopeToleranceRatio: number; // 0.02..0.25
    maxGenerationAttempts: number;
    targetCandidateCount: number;
    rejectLowConfidenceScansBelow?: number;
}

export interface InferenceGuards {
    inferStructuralWalls: false;
    inferExactCodeCompliance: false;
    inferPreciseWallThickness: false;
    inferPlumbingStackFeasibility: false;
}

export interface ProgramIntentInput {
    targetUse?: TargetUse;
    units?: UnitSystem;
    desiredBedrooms?: number;
    desiredBathrooms?: number;
    marketGoal?: MarketGoal;
    roomDemands?: RoomDemand[];
    policy?: Partial<ConstraintPolicy>;
}

export interface AssumptionLog {
    key: string;
    value: string;
    reason: string;
}

export interface ProgramIntent {
    targetUse: TargetUse;
    units: UnitSystem;
    marketGoal: MarketGoal;
    roomDemands: RoomDemand[];
    policy: ConstraintPolicy;
    guards: InferenceGuards;
    assumptions: AssumptionLog[];
    missingUserInputs: string[];
}
