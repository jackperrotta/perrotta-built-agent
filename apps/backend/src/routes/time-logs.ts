import { Router, type Response } from 'express';
import crypto from 'crypto';
import { db } from '../config/firebase.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { type TimeLog } from '@construction/shared';

const router = Router();
const timeLogsCollection = db.collection('time_logs');

const removeUndefined = <T extends Record<string, unknown>>(data: T): T => {
    return Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined)
    ) as T;
};

// GET /api/time-logs?projectId=<id>&userId=<id>
router.get('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { projectId, userId } = req.query;
        let query = timeLogsCollection.orderBy('startTime', 'desc');

        if (projectId) {
            query = query.where('projectId', '==', projectId);
        }
        if (userId) {
            query = query.where('userId', '==', userId);
        }

        const snapshot = await query.get();
        const logs = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as TimeLog);
        res.json(logs);
    } catch (error) {
        console.error('Error listing time logs:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/time-logs (Clock In / Manual Entry)
router.post('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<TimeLog>;
        const userId = req.user?.uid;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!body.projectId || !body.startTime) {
            return res.status(400).json({ error: 'projectId and startTime are required.' });
        }

        const logId = body.id || crypto.randomUUID();
        const now = Date.now();

        const persistenceBody: TimeLog = {
            id: logId,
            projectId: body.projectId,
            userId: userId,
            taskId: body.taskId,
            startTime: body.startTime,
            endTime: body.endTime,
            durationMinutes: body.durationMinutes,
            description: body.description,
            status: body.status || 'pending_approval',
            geoStart: body.geoStart,
            geoEnd: body.geoEnd,
            createdAt: body.createdAt || now,
            updatedAt: now
        };

        const cleanBody = removeUndefined(persistenceBody as unknown as Record<string, unknown>);
        await timeLogsCollection.doc(logId).set(cleanBody);
        res.json({ status: 'success', log: cleanBody });
    } catch (error) {
        console.error('Error creating time log:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/time-logs/:id (Clock Out / Approve)
router.put('/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const logId = req.params.id;
        const body = req.body;
        const docRef = timeLogsCollection.doc(logId);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Log not found' });

        // Calculate duration if clocking out
        let durationMinutes = body.durationMinutes;
        if (body.endTime && !durationMinutes) {
            const currentData = doc.data() as TimeLog;
            const start = currentData.startTime;
            const ms = body.endTime - start;
            durationMinutes = Math.round(ms / 1000 / 60);
        }

        const updates = removeUndefined({
            ...body,
            durationMinutes,
            updatedAt: Date.now()
        } as unknown as Record<string, unknown>);

        await docRef.update(updates);
        res.json({ status: 'success', updates });
    } catch (error) {
        console.error('Error updating time log:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
