import { Router, type Response } from 'express';
import crypto from 'crypto';
import { db } from '../config/firebase.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { type Task } from '@construction/shared';

const router = Router();
const tasksCollection = db.collection('tasks');

const removeUndefined = <T extends Record<string, unknown>>(data: T): T => {
    return Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined)
    ) as T;
};

// GET /api/tasks?projectId=<id>
router.get('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { projectId } = req.query;
        let query = tasksCollection.orderBy('createdAt', 'desc');

        if (projectId) {
            query = query.where('projectId', '==', projectId);
        }

        const snapshot = await query.get();
        const tasks = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as Task);
        res.json(tasks);
    } catch (error) {
        console.error('Error listing tasks:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/tasks/:id
router.get('/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const doc = await tasksCollection.doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Task not found.' });
        }
        res.json(doc.data() as Task);
    } catch (error) {
        console.error('Error fetching task:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/tasks
router.post('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<Task>;
        if (!body.projectId || !body.title) {
            return res.status(400).json({ error: 'projectId and title are required.' });
        }

        const taskId = body.id || crypto.randomUUID();
        const now = Date.now();

        const persistenceBody: Task = {
            id: taskId,
            projectId: body.projectId,
            title: body.title,
            description: body.description,
            status: body.status || 'open',
            priority: body.priority || 'medium',
            assigneeId: body.assigneeId,
            startDate: body.startDate,
            dueDate: body.dueDate,
            completedDate: body.completedDate,
            dependencies: body.dependencies || [],
            costCode: body.costCode,
            estimatedHours: body.estimatedHours,
            actualHours: body.actualHours,
            laborCost: body.laborCost,
            materialCost: body.materialCost,
            createdAt: body.createdAt || now,
            updatedAt: now
        };

        const cleanBody = removeUndefined(persistenceBody as unknown as Record<string, unknown>);
        await tasksCollection.doc(taskId).set(cleanBody);
        res.json({ status: 'success', task: cleanBody });
    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/tasks/:id
router.put('/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const taskId = req.params.id;
        const body = req.body as Partial<Task>;
        const docRef = tasksCollection.doc(taskId);

        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Task not found.' });
        }

        // Logic check: if status changing to 'completed' and no completedDate, set it
        if (body.status === 'completed' && !body.completedDate) {
            body.completedDate = Date.now();
        }

        const updates = removeUndefined({
            ...body,
            updatedAt: Date.now()
        });

        await docRef.update(updates);
        const updated = (await docRef.get()).data() as Task;
        res.json({ status: 'success', task: updated });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/tasks/:id
router.delete('/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        await tasksCollection.doc(req.params.id).delete();
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/tasks/:id/assign
router.post('/:id/assign', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { assigneeId } = req.body;
        if (!assigneeId) return res.status(400).json({ error: 'assigneeId is required' });

        const docRef = tasksCollection.doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Task not found' });

        await docRef.update({
            assigneeId,
            status: 'assigned',
            updatedAt: Date.now()
        });

        // TODO: Trigger Notification to assigneeId
        console.log(`[Notification] Task ${req.params.id} assigned to ${assigneeId}`);

        res.json({ status: 'success', message: 'Task assigned' });
    } catch (error) {
        console.error('Error assigning task:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
