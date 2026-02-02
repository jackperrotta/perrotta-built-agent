import { Router, type Response } from 'express';
import { generateSignedUploadUrl } from '../services/storage.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { type UploadUrlRequest, type UploadUrlResponse } from '@construction/shared';

const router = Router();

router.post('/url', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { filename, contentType } = req.body as UploadUrlRequest;

        if (!filename || !contentType) {
            return res.status(400).json({ error: 'Missing filename or contentType' });
        }

        // Basic security check: ensure filename belongs to a session or user path if possible
        // For now, allowing any path but could restrict to `sessions/{sessionId}/...`

        const uploadUrl = await generateSignedUploadUrl(filename, contentType);
        const response: UploadUrlResponse = { uploadUrl };

        res.json(response);
    } catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
