import { Router, type Response } from 'express';
import { type AuthenticatedRequest, verifyToken } from '../middleware/auth.js';
import { generateLayoutsForSession } from '../services/layoutGeneration.js';
import { type ProgramIntentInput } from '@construction/layout';

const router = Router();

interface GenerateLayoutsBody {
    sessionId: string;
    segmentId?: string;
    topK?: number;
    intent?: ProgramIntentInput;
}

router.post('/generate', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as GenerateLayoutsBody;
        if (!body.sessionId) {
            return res.status(400).json({ error: 'sessionId is required.' });
        }

        const result = await generateLayoutsForSession({
            sessionId: body.sessionId,
            segmentId: body.segmentId,
            topK: body.topK,
            intent: body.intent
        });
        res.json(result);
    } catch (error) {
        console.error('Error generating layouts:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Internal Server Error'
        });
    }
});

export default router;
