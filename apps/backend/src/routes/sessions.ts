import { Router, type Response } from 'express';
import { db } from '../config/firebase.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { type ScanSession, type CreateSessionResponse, type GeneratedLayout } from '@construction/shared';
import { generateGeneratedFloorplanSvg, generateGeneratedLayoutModel, type RoomPlanJson } from '@construction/layout';
import { uploadBufferToStorage, deleteStorageFileByUrl } from '../services/storage.js';
import { storage } from '../config/firebase.js';
import { unzipSync } from 'fflate';

const router = Router();
const sessionsCollection = db.collection('sessions');

const ZIP_MAGIC = [0x50, 0x4b];

const isZipBuffer = (buffer: Buffer) => buffer.length >= 2 && buffer[0] === ZIP_MAGIC[0] && buffer[1] === ZIP_MAGIC[1];

const parseRoomPlanJson = (raw: Buffer, sourceLabel: string): RoomPlanJson => {
    if (isZipBuffer(raw)) {
        const unzipped = unzipSync(new Uint8Array(raw));
        const jsonEntryName = Object.keys(unzipped).find(name => name.toLowerCase().endsWith('.json'));
        if (!jsonEntryName) {
            throw new Error(`RoomPlan zip missing json entry for ${sourceLabel}`);
        }
        const jsonBuffer = Buffer.from(unzipped[jsonEntryName]);
        return JSON.parse(jsonBuffer.toString('utf-8')) as RoomPlanJson;
    }

    return JSON.parse(raw.toString('utf-8')) as RoomPlanJson;
};

const loadRoomPlanJson = async (roomPlanUrl?: string): Promise<RoomPlanJson | null> => {
    if (!roomPlanUrl) return null;

    if (roomPlanUrl.startsWith('http')) {
        const response = await fetch(roomPlanUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch RoomPlan JSON: ${response.statusText}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        return parseRoomPlanJson(buffer, roomPlanUrl);
    }

    const bucket = storage.bucket();
    const [fileBuffer] = await bucket.file(roomPlanUrl).download();
    return parseRoomPlanJson(fileBuffer, roomPlanUrl);
};

// POST /api/sessions: Create or Update Session
router.post('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const sessionData = req.body as ScanSession;

        if (!sessionData.id) {
            return res.status(400).json({ error: 'Session ID is required' });
        }

        // Ensure session creator is linked to the authenticated user
        const userId = req.user?.uid;

        // Add metadata if new
        const docRef = sessionsCollection.doc(sessionData.id);
        const doc = await docRef.get();

        if (!doc.exists) {
            await docRef.set({
                ...sessionData,
                creatorId: userId,
                createdAt: sessionData.createdAt || Date.now(),
                updatedAt: Date.now()
            });
        } else {
            await docRef.update({
                ...sessionData,
                updatedAt: Date.now()
            });
        }

        const response: CreateSessionResponse = {
            status: 'success',
            sessionId: sessionData.id
        };

        res.json(response);
    } catch (error) {
        console.error('Error saving session:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/sessions: List sessions
router.get('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        // Optional: Filter by user ownership
        // const userId = req.user?.uid;
        // const snapshot = await sessionsCollection.where('creatorId', '==', userId).orderBy('createdAt', 'desc').get();

        // For now, listing all for simplicity or admin view
        const snapshot = await sessionsCollection.orderBy('createdAt', 'desc').get();

        const sessions = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as ScanSession);
        res.json(sessions);
    } catch (error) {
        console.error('Error listing sessions:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/sessions/:id: Get session details
router.get('/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const doc = await sessionsCollection.doc(id).get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const data = doc.data() as ScanSession;


        res.json(data);
    } catch (error) {
        console.error('Error fetching session:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/sessions/:id/generate: Generate optimized layout
router.post('/:id/generate', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const doc = await sessionsCollection.doc(id).get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = doc.data() as ScanSession;
        const segmentWithRoomPlan = session.segments?.find(segment => segment.roomPlanJSONRemoteURL);
        const roomPlanJson = await loadRoomPlanJson(segmentWithRoomPlan?.roomPlanJSONRemoteURL);

        const layoutModel = generateGeneratedLayoutModel(session, roomPlanJson);
        const floorplanSvg = generateGeneratedFloorplanSvg(layoutModel);

        const timestamp = Date.now();
        const layoutJsonPath = `generated-layouts/${id}/layout_${timestamp}.json`;
        const floorplanSvgPath = `generated-layouts/${id}/floorplan_${timestamp}.svg`;

        const layoutJsonUrl = await uploadBufferToStorage(
            layoutJsonPath,
            Buffer.from(JSON.stringify(layoutModel, null, 2)),
            'application/json'
        );
        const floorplanSvgUrl = await uploadBufferToStorage(
            floorplanSvgPath,
            Buffer.from(floorplanSvg),
            'image/svg+xml'
        );

        const generatedLayout: GeneratedLayout = {
            version: layoutModel.version,
            createdAt: layoutModel.createdAt,
            strategy: layoutModel.strategy,
            summary: layoutModel.summary,
            artifacts: {
                layoutJsonUrl,
                floorplanSvgUrl
            }
        };

        await sessionsCollection.doc(id).update({
            generatedLayout,
            updatedAt: Date.now()
        });

        res.json(generatedLayout);
    } catch (error) {
        console.error('Error generating layout:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/sessions/:id/generated-layout: Clear generated layout
router.delete('/:id/generated-layout', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { id } = req.params;
        const doc = await sessionsCollection.doc(id).get();

        if (!doc.exists) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const session = doc.data() as ScanSession;
        const generatedLayout = session.generatedLayout;

        if (generatedLayout?.artifacts) {
            const { layoutJsonUrl, floorplanSvgUrl, modelUrl } = generatedLayout.artifacts;
            await Promise.all([
                deleteStorageFileByUrl(layoutJsonUrl),
                deleteStorageFileByUrl(floorplanSvgUrl || ''),
                deleteStorageFileByUrl(modelUrl || '')
            ]);
        }

        await sessionsCollection.doc(id).update({
            generatedLayout: null,
            updatedAt: Date.now()
        });

        res.json({ status: 'cleared' });
    } catch (error) {
        console.error('Error clearing generated layout:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
