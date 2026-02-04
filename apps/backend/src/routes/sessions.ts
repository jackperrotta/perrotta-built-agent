import { Router, type Response } from 'express';
import { db } from '../config/firebase.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { type ScanSession, type CreateSessionResponse } from '@construction/shared';

const router = Router();
const sessionsCollection = db.collection('sessions');

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

export default router;
