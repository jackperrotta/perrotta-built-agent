import { db } from '../config/firebase.js';
import { generateLayoutOptions, type ProgramIntentInput, type RoomPlanJson } from '@construction/layout';
import { type ScanSession } from '@construction/shared';

const sessionsCollection = db.collection('sessions');

export interface GenerateLayoutsRequest {
    sessionId: string;
    segmentId?: string;
    intent?: ProgramIntentInput;
    topK?: number;
}

export interface GenerateLayoutsResponse {
    sessionId: string;
    segmentId: string;
    assumptions: string[];
    warnings: string[];
    errors: string[];
    rankedCandidates: ReturnType<typeof generateLayoutOptions>['candidates'];
    rejectedAttempts: ReturnType<typeof generateLayoutOptions>['rejectedAttempts'];
    metadata: ReturnType<typeof generateLayoutOptions>['metadata'];
}

export async function generateLayoutsForSession(input: GenerateLayoutsRequest): Promise<GenerateLayoutsResponse> {
    const doc = await sessionsCollection.doc(input.sessionId).get();
    if (!doc.exists) {
        throw new Error(`Session ${input.sessionId} not found.`);
    }

    const session = doc.data() as ScanSession;
    const segment = selectSegment(session, input.segmentId);
    if (!segment.roomPlanJSONRemoteURL) {
        throw new Error(`Segment ${segment.id} does not have roomPlanJSONRemoteURL.`);
    }

    const scanGeometry = await fetchRoomPlanJson(segment.roomPlanJSONRemoteURL);
    const generated = generateLayoutOptions({
        scanGeometry,
        intent: input.intent
    });

    const topK = Math.max(1, input.topK ?? 10);
    return {
        sessionId: input.sessionId,
        segmentId: segment.id,
        assumptions: generated.warnings.filter((w) => w.includes('default') || w.includes('=')),
        warnings: generated.warnings,
        errors: generated.errors,
        rankedCandidates: generated.candidates.slice(0, topK),
        rejectedAttempts: generated.rejectedAttempts,
        metadata: generated.metadata
    };
}

function selectSegment(session: ScanSession, explicitSegmentId?: string): ScanSession['segments'][number] {
    if (explicitSegmentId) {
        const segment = session.segments.find((s) => s.id === explicitSegmentId);
        if (!segment) {
            throw new Error(`Segment ${explicitSegmentId} not found in session ${session.id}.`);
        }
        return segment;
    }

    const firstWithPlan = session.segments.find((s) => typeof s.roomPlanJSONRemoteURL === 'string');
    if (!firstWithPlan) {
        throw new Error(`Session ${session.id} has no segment with roomPlanJSONRemoteURL.`);
    }
    return firstWithPlan;
}

async function fetchRoomPlanJson(remoteUrl: string): Promise<RoomPlanJson> {
    const response = await fetch(remoteUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch RoomPlan JSON: ${response.status} ${response.statusText}`);
    }

    const body = await response.json() as Partial<RoomPlanJson>;
    return {
        walls: Array.isArray(body.walls) ? body.walls : [],
        windows: Array.isArray(body.windows) ? body.windows : [],
        doors: Array.isArray(body.doors) ? body.doors : [],
        openings: Array.isArray(body.openings) ? body.openings : []
    };
}
