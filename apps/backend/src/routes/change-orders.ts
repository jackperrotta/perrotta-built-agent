import { Router, type Response } from 'express';
import crypto from 'crypto';
import { db } from '../config/firebase.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { type ChangeOrder } from '@construction/shared';

const router = Router();
const coCollection = db.collection('change_orders');

const removeUndefined = <T extends Record<string, unknown>>(data: T): T => {
    return Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined)
    ) as T;
};

// GET /api/change-orders?projectId=<id>
router.get('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { projectId } = req.query;
        let query = coCollection.orderBy('createdAt', 'desc');

        if (projectId) {
            query = query.where('projectId', '==', projectId);
        }

        const snapshot = await query.get();
        const orders = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as ChangeOrder);
        res.json(orders);
    } catch (error) {
        console.error('Error listing change orders:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/change-orders
router.post('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<ChangeOrder>;
        const userId = req.user?.uid;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!body.projectId || !body.title) {
            return res.status(400).json({ error: 'projectId and title are required.' });
        }

        const coId = body.id || crypto.randomUUID();
        const now = Date.now();

        const persistenceBody: ChangeOrder = {
            id: coId,
            projectId: body.projectId,
            title: body.title,
            description: body.description || '',
            status: 'draft', // Always start as draft or submitted
            amount: body.amount || 0,
            scheduleImpactDays: body.scheduleImpactDays,
            initiatorId: userId,
            approverId: body.approverId, // Who receives it?
            scope: body.scope || 'project',
            relatedTaskIds: body.relatedTaskIds || [],
            createdAt: body.createdAt || now,
            updatedAt: now
        };

        const cleanBody = removeUndefined(persistenceBody as unknown as Record<string, unknown>);
        await coCollection.doc(coId).set(cleanBody);
        res.json({ status: 'success', changeOrder: cleanBody });
    } catch (error) {
        console.error('Error creating change order:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/change-orders/:id
router.put('/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const coId = req.params.id;
        const body = req.body;
        const docRef = coCollection.doc(coId);

        const updates = removeUndefined({
            ...body,
            updatedAt: Date.now()
        } as unknown as Record<string, unknown>);

        await docRef.update(updates);
        res.json({ status: 'success', updates });
    } catch (error) {
        console.error('Error updating change order:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
