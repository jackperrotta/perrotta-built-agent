import { Router, type Response } from 'express';
import crypto from 'crypto';
import { db } from '../config/firebase.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { type Estimate } from '@construction/shared';

const router = Router();
const estimatesCollection = db.collection('estimates');

const removeUndefined = <T extends Record<string, unknown>>(data: T): T => {
    return Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined)
    ) as T;
};

// GET /api/estimates?projectId=<id>&subcontractorId=<id>
router.get('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { projectId, subcontractorId } = req.query;
        let query = estimatesCollection.orderBy('createdAt', 'desc');

        if (projectId) {
            query = query.where('projectId', '==', projectId);
        }
        if (subcontractorId) {
            query = query.where('subcontractorId', '==', subcontractorId);
        }

        const snapshot = await query.get();
        const estimates = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as Estimate);
        res.json(estimates);
    } catch (error) {
        console.error('Error listing estimates:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/estimates
router.post('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<Estimate>;
        const userId = req.user?.uid;

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!body.projectId || !body.totalAmount) {
            return res.status(400).json({ error: 'projectId and totalAmount can not be empty.' });
        }

        const estimateId = body.id || crypto.randomUUID();
        const now = Date.now();

        const persistenceBody: Estimate = {
            id: estimateId,
            projectId: body.projectId,
            subcontractorId: userId, // Enforce current user as the author
            taskIds: body.taskIds || [],
            status: body.status || 'draft',
            totalAmount: body.totalAmount,
            details: body.details,
            expirationDate: body.expirationDate,
            createdAt: body.createdAt || now,
            updatedAt: now
        };

        const cleanBody = removeUndefined(persistenceBody as unknown as Record<string, unknown>);
        await estimatesCollection.doc(estimateId).set(cleanBody);
        res.json({ status: 'success', estimate: cleanBody });
    } catch (error) {
        console.error('Error creating estimate:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/estimates/:id/status
router.put('/:id/status', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { status } = req.body;
        if (!['draft', 'submitted', 'approved', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const docRef = estimatesCollection.doc(req.params.id);
        const doc = await docRef.get();
        if (!doc.exists) return res.status(404).json({ error: 'Estimate not found' });

        await docRef.update({
            status,
            updatedAt: Date.now()
        });

        res.json({ status: 'success', message: `Estimate ${status}` });
    } catch (error) {
        console.error('Error updating estimate status:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
