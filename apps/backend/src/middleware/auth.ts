import { type Request, type Response, type NextFunction } from 'express';
import { auth } from '../config/firebase.js';
import { getUserRole } from '../services/userService.js';

export interface AuthenticatedRequest extends Request {
    user?: {
        uid: string;
        email?: string;
        role?: string;
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

    // Mock Token Handling
    if (token === 'mock-token') {
        const mockUid = 'test-user-id';
        const role = await getUserRole(mockUid); // Will fetch from mock DB if configured

        req.user = {
            uid: mockUid,
            email: 'test@example.com',
            role: role
        };
        return next();
    }

    // Explicit Admin Mock for Developers
    if (token === 'mock-token-admin') {
        req.user = {
            uid: 'jperrotta-uid',
            email: 'jperrotta521@gmail.com',
            role: 'admin'
        };
        return next();
    }

    try {
        const decodedToken = await auth.verifyIdToken(token);
        const role = await getUserRole(decodedToken.uid);

        req.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            role: role
        };
        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};
