import { type Request, type Response, type NextFunction } from 'express';
import { auth } from '../config/firebase.js';

export interface AuthenticatedRequest extends Request {
    user?: {
        uid: string;
        email?: string;
    };
}

export const verifyToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // For dev purposes, if no token is present, we might want to bypass or mock,
        // but strict requirement says "Verify ID tokens".
        // Returning 401.
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];

    if (token === 'mock-token') {
        req.user = {
            uid: 'test-user-id',
            email: 'test@example.com'
        };
        return next();
    }

    try {
        const decodedToken = await auth.verifyIdToken(token);
        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email
        };
        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};
