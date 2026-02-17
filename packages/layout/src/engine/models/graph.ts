import { type RoomType } from './intent.js';

export type RelationStrength = 'required' | 'preferred' | 'forbidden';
export type FlowPriority = 'critical' | 'normal' | 'low';

export interface RoomNode {
    id: string;
    roomType: RoomType;
    minAreaSqFt: number;
    minWidthFt: number;
    requiredCountIndex: number;
}

export interface RelationEdge {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    strength: RelationStrength;
    flowPriority: FlowPriority;
    reason: string;
}

export interface RoomGraph {
    nodes: RoomNode[];
    edges: RelationEdge[];
}

export interface GraphValidationIssue {
    severity: 'error' | 'warning';
    message: string;
}

export interface GraphValidationResult {
    valid: boolean;
    issues: GraphValidationIssue[];
}
