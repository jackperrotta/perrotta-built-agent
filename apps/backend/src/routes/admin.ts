import { Router, type Response } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { db, storage } from '../config/firebase.js';
import { generateLayoutOptions, type ProgramIntentInput, type RoomPlanJson } from '@construction/layout';
import { type ScanSession } from '@construction/shared';

const router = Router();
const sessionsCollection = db.collection('sessions');

// GET /api/admin/status: Check admin access
router.get('/status', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    // We can add strict role checking here or in a separate middleware
    // For now, just returning the user info to prove the role is attached

    res.json({
        status: 'authenticated',
        user: req.user,
        message: `Hello ${req.user?.role || 'User'}, welcome to the secure backend.`
    });
});

interface LayoutDebugIntentInput {
    buildingType: string;
    unitCount: number;
    bedroomRange: {
        min: number;
        max: number;
    };
    bathroomRange: {
        min: number;
        max: number;
    };
    marketGoal: 'flip' | 'rental' | 'resale';
    jurisdiction: string;
}

interface LayoutDebugRequestBody {
    segmentId?: string;
    intent?: LayoutDebugIntentInput;
    topK?: number;
}

// POST /api/admin/scans/:scanSessionId/layout-debug
router.post('/scans/:scanSessionId/layout-debug', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({
                error: 'Forbidden: admin role required for layout debug endpoint.'
            });
        }

        const { scanSessionId } = req.params;
        const body = req.body as LayoutDebugRequestBody;
        if (!scanSessionId) {
            return res.status(400).json({ error: 'scanSessionId is required.' });
        }
        if (!body.intent) {
            return res.status(400).json({
                error: 'Debug intent is required. This endpoint does not infer intent.'
            });
        }

        const intentValidation = validateDebugIntent(body.intent);
        if (!intentValidation.valid) {
            return res.status(400).json({
                error: 'Invalid debug intent payload.',
                details: intentValidation.errors
            });
        }

        const doc = await sessionsCollection.doc(scanSessionId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: `Scan session ${scanSessionId} not found.` });
        }

        const session = doc.data() as ScanSession;
        const segment = selectSegmentForDebug(session, body.segmentId);
        if (!segment.roomPlanJSONRemoteURL) {
            return res.status(400).json({
                error: `Segment ${segment.id} has no roomPlanJSONRemoteURL for raw geometry.`
            });
        }

        // Raw scan geometry passthrough for debug inspection (no backend normalization/cleanup).
        const rawScanGeometry = await fetchRawRoomPlanJson(segment.roomPlanJSONRemoteURL);
        const defaultedFields: string[] = [];
        const explicitFields = [
            'intent.buildingType',
            'intent.unitCount',
            'intent.bedroomRange',
            'intent.bathroomRange',
            'intent.marketGoal',
            'intent.jurisdiction'
        ];
        const topK = typeof body.topK === 'number' && Number.isFinite(body.topK) ? Math.max(1, Math.floor(body.topK)) : 10;
        if (body.topK === undefined) {
            defaultedFields.push('topK=10');
        }

        const mappedIntent = mapDebugIntentToProgramIntent(body.intent);
        const start = Date.now();
        const generated = generateLayoutOptions({
            scanGeometry: rawScanGeometry,
            intent: mappedIntent
        });
        const durationMs = Date.now() - start;

        const ranked = generated.candidates.slice(0, topK).map((candidate, index) => ({
            rank: index + 1,
            candidateId: candidate.id,
            totalScore: candidate.score.totalScore,
            rooms: candidate.rooms,
            categoryScores: candidate.score.categories,
            hardFailures: candidate.diagnostics.hardFailures,
            softPenalties: candidate.diagnostics.softPenalties,
            assumptions: candidate.diagnostics.assumptions,
            diagnostics: {
                derivedData: candidate.diagnostics.derivedData,
                inventedData: candidate.diagnostics.inventedData
            }
        }));

        const rawMetadata = {
            sessionId: session.id,
            segmentId: segment.id,
            segmentType: segment.type,
            scanSessionMetadata: {
                createdAt: session.createdAt,
                projectId: session.projectId ?? null,
                stairwayCount: Array.isArray(session.stairways) ? session.stairways.length : 0,
                segmentCount: Array.isArray(session.segments) ? session.segments.length : 0,
                orientation: (session as Record<string, unknown>).orientation ?? null,
                height: (session as Record<string, unknown>).height ?? null,
                floors: (session as Record<string, unknown>).floors ?? null
            },
            segmentMetadata: {
                startTime: segment.startTime ?? null,
                endTime: segment.endTime ?? null,
                story: (segment as Record<string, unknown>).story ?? null,
                orientation: (segment as Record<string, unknown>).orientation ?? null,
                height: (segment as Record<string, unknown>).height ?? null
            },
            geometrySource: segment.roomPlanJSONRemoteURL,
            modelSpaceFromEngine: (generated.metadata as unknown as { modelSpace?: unknown }).modelSpace ?? null,
            envelopePolygonFromEngine: (generated.metadata as unknown as { envelopePolygon?: unknown }).envelopePolygon ?? null,
            scanGeometryStats: buildScanGeometryStats(rawScanGeometry)
        };

        res.json({
            debugMode: true,
            manualTrigger: true,
            endpoint: '/api/admin/scans/:scanSessionId/layout-debug',
            generatedAt: new Date().toISOString(),
            runtimeMs: durationMs,
            scanSessionId,
            candidateCount: generated.candidates.length,
            rankedCandidates: ranked,
            rejectedAttempts: generated.rejectedAttempts,
            summary: {
                attemptsRequested: generated.metadata.attemptsRequested,
                attemptsExecuted: generated.metadata.attemptsExecuted,
                retriesObserved: Math.max(0, generated.metadata.attemptsExecuted - generated.candidates.length),
                warningsCount: generated.warnings.length,
                errorCount: generated.errors.length
            },
            assumptionsAndDefaults: {
                explicitFields,
                defaultedFields,
                engineAssumptions: generated.warnings,
                engineErrors: generated.errors
            },
            intentEcho: body.intent,
            rawDiagnosticMetadata: rawMetadata
        });
    } catch (error) {
        console.error('Error running admin layout debug:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Internal Server Error'
        });
    }
});

function validateDebugIntent(intent: LayoutDebugIntentInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!intent.buildingType || typeof intent.buildingType !== 'string') {
        errors.push('intent.buildingType is required.');
    }
    if (!Number.isFinite(intent.unitCount) || intent.unitCount < 1) {
        errors.push('intent.unitCount must be a positive number.');
    }
    if (!intent.bedroomRange || !Number.isFinite(intent.bedroomRange.min) || !Number.isFinite(intent.bedroomRange.max)) {
        errors.push('intent.bedroomRange.min and intent.bedroomRange.max are required.');
    }
    if (!intent.bathroomRange || !Number.isFinite(intent.bathroomRange.min) || !Number.isFinite(intent.bathroomRange.max)) {
        errors.push('intent.bathroomRange.min and intent.bathroomRange.max are required.');
    }
    if (!intent.marketGoal || !['flip', 'rental', 'resale'].includes(intent.marketGoal)) {
        errors.push('intent.marketGoal must be one of: flip, rental, resale.');
    }
    if (!intent.jurisdiction || typeof intent.jurisdiction !== 'string') {
        errors.push('intent.jurisdiction is required.');
    }
    return { valid: errors.length === 0, errors };
}

function selectSegmentForDebug(session: ScanSession, segmentId?: string): ScanSession['segments'][number] {
    if (segmentId) {
        const selected = session.segments.find((segment) => segment.id === segmentId);
        if (!selected) {
            throw new Error(`Segment ${segmentId} not found in session ${session.id}.`);
        }
        return selected;
    }

    const firstWithJson = session.segments.find((segment) => typeof segment.roomPlanJSONRemoteURL === 'string');
    if (!firstWithJson) {
        throw new Error(`Session ${session.id} has no segment with roomPlanJSONRemoteURL.`);
    }
    return firstWithJson;
}

async function fetchRawRoomPlanJson(remoteUrl: string): Promise<RoomPlanJson> {
    if (!remoteUrl || typeof remoteUrl !== 'string') {
        throw new Error('Raw scan geometry source URL/path is missing.');
    }

    if (remoteUrl.startsWith('http://') || remoteUrl.startsWith('https://')) {
        return fetchRoomPlanFromHttp(remoteUrl);
    }

    return fetchRoomPlanFromStoragePath(remoteUrl);
}

async function fetchRoomPlanFromHttp(url: string): Promise<RoomPlanJson> {
    const response = await fetch(url);
    const payloadText = await response.text();

    if (!response.ok) {
        throw new Error(
            `Failed to fetch raw scan geometry from URL (${response.status} ${response.statusText}). Source=${url}. Body=${truncate(payloadText)}`
        );
    }

    const parsed = parseJsonObject(payloadText, `URL source ${url}`);
    return validateRoomPlanShape(parsed, `URL source ${url}`);
}

async function fetchRoomPlanFromStoragePath(source: string): Promise<RoomPlanJson> {
    const { bucketName, objectPath } = parseStorageSource(source);
    const bucket = bucketName ? storage.bucket(bucketName) : storage.bucket();
    const file = bucket.file(objectPath);

    const [exists] = await file.exists();
    if (!exists) {
        throw new Error(`Raw scan geometry file not found in storage. bucket=${bucket.name}, path=${objectPath}`);
    }

    const [buffer] = await file.download();
    const payloadText = buffer.toString('utf8');
    const parsed = parseJsonObject(payloadText, `storage source ${source}`);
    return validateRoomPlanShape(parsed, `storage source ${source}`);
}

function parseStorageSource(source: string): { bucketName?: string; objectPath: string } {
    if (source.startsWith('gs://')) {
        const withoutScheme = source.slice('gs://'.length);
        const slashIndex = withoutScheme.indexOf('/');
        if (slashIndex < 0) {
            throw new Error(`Invalid gs:// source (missing object path): ${source}`);
        }
        const bucketName = withoutScheme.slice(0, slashIndex).trim();
        const objectPath = withoutScheme.slice(slashIndex + 1).trim();
        return { bucketName, objectPath };
    }

    const objectPath = source.replace(/^\/+/, '').trim();
    if (!objectPath) {
        throw new Error(`Invalid storage path source: ${source}`);
    }
    return { objectPath };
}

function parseJsonObject(payloadText: string, sourceLabel: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(payloadText) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error(`Expected a JSON object at ${sourceLabel}.`);
        }
        return parsed as Record<string, unknown>;
    } catch {
        throw new Error(`Raw scan geometry is not valid JSON at ${sourceLabel}. Body=${truncate(payloadText)}`);
    }
}

function validateRoomPlanShape(raw: Record<string, unknown>, sourceLabel: string): RoomPlanJson {
    if (!Array.isArray(raw.walls) || !Array.isArray(raw.windows) || !Array.isArray(raw.doors) || !Array.isArray(raw.openings)) {
        throw new Error(
            `Raw scan geometry is missing RoomPlan arrays at ${sourceLabel}. Expected walls/windows/doors/openings.`
        );
    }
    return raw as unknown as RoomPlanJson;
}

function truncate(value: string, maxLen = 200): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLen) {
        return normalized;
    }
    return `${normalized.slice(0, maxLen)}...`;
}

function mapDebugIntentToProgramIntent(intent: LayoutDebugIntentInput): ProgramIntentInput {
    const bedrooms = Math.max(1, Math.floor(intent.bedroomRange.max));
    const bathrooms = Math.max(1, Math.floor(intent.bathroomRange.max));
    return {
        targetUse: intent.marketGoal,
        units: 'feet',
        desiredBedrooms: bedrooms,
        desiredBathrooms: bathrooms,
        marketGoal: {
            strategy: intent.marketGoal === 'rental' ? 'maximize_rent' : 'maximize_resale',
            budgetSensitivity: intent.marketGoal === 'flip' ? 0.8 : 0.5
        },
        roomDemands: [
            {
                roomType: 'living_room',
                minCount: intent.unitCount,
                minAreaSqFt: 170,
                minWidthFt: 10,
                preferredAdjacency: ['kitchen', 'dining_room']
            },
            {
                roomType: 'kitchen',
                minCount: intent.unitCount,
                minAreaSqFt: 120,
                minWidthFt: 8,
                preferredAdjacency: ['living_room', 'dining_room']
            },
            {
                roomType: 'bedroom',
                minCount: Math.max(1, Math.floor(intent.bedroomRange.min)),
                targetCount: bedrooms,
                minAreaSqFt: 110,
                minWidthFt: 9,
                preferredAdjacency: ['bathroom']
            },
            {
                roomType: 'bathroom',
                minCount: Math.max(1, Math.floor(intent.bathroomRange.min)),
                targetCount: bathrooms,
                minAreaSqFt: 36,
                minWidthFt: 5,
                preferredAdjacency: ['bedroom']
            }
        ]
    };
}

function buildScanGeometryStats(scan: RoomPlanJson): {
    wallCount: number;
    maxWallLengthFt: number;
    avgWallLengthFt: number;
    wallLengthsFtTop5: number[];
} {
    const wallLengthsFt = scan.walls
        .map((wall) => {
            const dimX = wall.dimensions[0] ?? 0;
            const dimZ = wall.dimensions[2] ?? 0;
            const meters = Math.max(0, dimX, dimZ);
            return meters * 3.28084;
        })
        .filter((v) => Number.isFinite(v) && v > 0);

    const maxWallLengthFt = wallLengthsFt.length > 0 ? Math.max(...wallLengthsFt) : 0;
    const avgWallLengthFt = wallLengthsFt.length > 0
        ? wallLengthsFt.reduce((acc, n) => acc + n, 0) / wallLengthsFt.length
        : 0;
    const wallLengthsFtTop5 = [...wallLengthsFt]
        .sort((a, b) => b - a)
        .slice(0, 5);

    return {
        wallCount: scan.walls.length,
        maxWallLengthFt,
        avgWallLengthFt,
        wallLengthsFtTop5
    };
}

export default router;
