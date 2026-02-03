export type Unit = 'feet' | 'meters' | 'inches';

export interface User {
    id: string;
    email: string;
    displayName?: string;
    ownedProperties: string[];
}

export interface Property {
    id: string;
    ownerId: string;
    address: string;
    name?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type ScanSegmentType =
    | 'FirstFloor'
    | 'SecondFloor'
    | 'Basement'
    | 'Attic'
    | 'Backyard'
    | 'FrontYard'
    | 'Bathroom'
    | 'LivingArea';

export interface ScanSegment {
    id: string;
    type: ScanSegmentType;
    startTime: number; // Timestamp
    endTime: number; // Timestamp
    roomPlanModelUrl?: string;
    arWorldMapUrl?: string;
    videoChunkUrl?: string;
    roomPlanJSONRemoteURL?: string;
}

export interface CapturedImage {
    segmentID: string;
    imageUrl: string;
    worldTransform: number[]; // 16 numbers (simd_float4x4 flat array)
    nearestSurfaceDistance: number;
    nearestSurfaceNormal: [number, number, number];
}

export interface Stairway {
    fromSegmentID: string;
    toSegmentID: string;
    startPoint: [number, number, number];
    endPoint: [number, number, number];
    stepCountEstimate: number;
}

export interface ScanSession {
    id: string;
    createdAt: number; // Timestamp
    segments: ScanSegment[];
    capturedImages: CapturedImage[];
    stairways: Stairway[];
    audioRecordingUrl?: string;
}

// API Request/Response Types
export interface UploadUrlRequest {
    filename: string;
    contentType: string;
}

export interface UploadUrlResponse {
    uploadUrl: string;
}

export interface CreateSessionResponse {
    status: 'success' | 'error';
    sessionId: string;
}


export interface ExtractedNote {
    id: string;
    segmentId: string;
    roomId?: string;
    content: string;
    category: 'structural' | 'mep' | 'code' | 'opportunity' | 'risk';
    confidence: number;
    timestampStart?: number;
    timestampEnd?: number;
}
