import { Router, type Response } from 'express';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

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

export default router;
