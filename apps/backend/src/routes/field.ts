import { Router, type Response } from 'express';
import crypto from 'crypto';
import { db } from '../config/firebase.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { type FieldLog, type Task } from '@construction/shared';

const router = Router();
const logsCollection = db.collection('field_logs');
const tasksCollection = db.collection('tasks');

const removeUndefined = <T extends Record<string, unknown>>(data: T): T => {
    return Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined)
    ) as T;
};

// GET /api/field/my-tasks
// Returns tasks assigned to the authenticated user
router.get('/my-tasks', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user?.uid;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Fetch tasks where assigneeId matches user ID
        const snapshot = await tasksCollection
            .where('assigneeId', '==', userId)
            .where('status', '!=', 'completed') // Only open tasks
            .get();

        const tasks = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as Task);
        res.json(tasks);
    } catch (error) {
        console.error('Error fetching my-tasks:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/field/logs
// Submit a field log (photo, note, etc.)
router.post('/logs', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<FieldLog>;
        const userId = req.user?.uid;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!body.projectId || !body.type || !body.content) {
            return res.status(400).json({ error: 'projectId, type, and content are required.' });
        }

        const logId = body.id || crypto.randomUUID();
        const now = Date.now();

        const persistenceBody: FieldLog = {
            id: logId,
            projectId: body.projectId,
            taskId: body.taskId,
            authorId: userId,
            type: body.type,
            content: body.content,
            assets: body.assets || [],
            location: body.location,
            weather: body.weather,
            sentiment: body.sentiment, // Could be null, populated by background function later
            createdAt: body.createdAt || now
        };

        const cleanBody = removeUndefined(persistenceBody as unknown as Record<string, unknown>);
        await logsCollection.doc(logId).set(cleanBody);

        res.json({ status: 'success', log: cleanBody });
    } catch (error) {
        console.error('Error bridging field log:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
