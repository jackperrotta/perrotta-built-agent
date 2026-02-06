import { Router, type Response } from 'express';
import crypto from 'crypto';
import { db } from '../config/firebase.js';
import { verifyToken, type AuthenticatedRequest } from '../middleware/auth.js';
import { type Project } from '@construction/shared';

const router = Router();
const projectsCollection = db.collection('projects');

const PROJECT_TYPE_LABELS: Record<Project['projectType'], string> = {
    flip: 'Flip',
    remodel: 'Remodel',
    addition: 'Addition',
    other: 'Project'
};

const parseAddress = (address: string) => {
    const cleaned = address.trim();
    const parts = cleaned.split(',').map(part => part.trim()).filter(Boolean);
    const line1 = parts[0] || cleaned;
    const city = parts[1];
    const stateZip = parts[2] || '';
    const stateZipParts = stateZip.split(' ').map(part => part.trim()).filter(Boolean);
    const state = stateZipParts[0];
    const postalCode = stateZipParts[1];

    return {
        addressLine1: line1 || undefined,
        city,
        state,
        postalCode
    };
};

const deriveProjectName = (address: string, projectType: Project['projectType']) => {
    const parsed = parseAddress(address);
    const street = parsed.addressLine1 || address.trim();
    const typeLabel = PROJECT_TYPE_LABELS[projectType] || 'Project';
    return `${street} ${typeLabel}`.trim();
};

const buildProject = (payload: Partial<Project>, projectId: string): Project => {
    const now = Date.now();
    const address = payload.address?.trim() || '';
    const projectType = payload.projectType ?? 'other';
    const name = payload.name?.trim() || deriveProjectName(address, projectType);
    const parsed = parseAddress(address);

    return {
        id: projectId,
        name,
        address,
        addressLine1: payload.addressLine1 ?? parsed.addressLine1,
        addressLine2: payload.addressLine2,
        city: payload.city ?? parsed.city,
        state: payload.state ?? parsed.state,
        postalCode: payload.postalCode ?? parsed.postalCode,
        country: payload.country,
        projectType,
        customerId: payload.customerId,
        status: payload.status ?? 'active',
        startDate: payload.startDate,
        endDate: payload.endDate,
        scanSessionIds: payload.scanSessionIds ?? [],
        createdAt: payload.createdAt ?? now,
        updatedAt: now
    };
};

// GET /api/projects
router.get('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const snapshot = await projectsCollection.orderBy('createdAt', 'desc').get();
        const projects = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as Project);
        res.json(projects);
    } catch (error) {
        console.error('Error listing projects:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/projects
router.post('/', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<Project>;
        if (!body.address || !body.projectType) {
            return res.status(400).json({ error: 'Project address and projectType are required.' });
        }

        const projectId = body.id || crypto.randomUUID();
        const project = buildProject(body, projectId);
        await projectsCollection.doc(projectId).set(project);
        res.json({ status: 'success', project });
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/projects/:id
router.get('/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const doc = await projectsCollection.doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Project not found.' });
        }
        res.json(doc.data() as Project);
    } catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/projects/:id
router.put('/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const body = req.body as Partial<Project>;
        const projectId = req.params.id;
        const docRef = projectsCollection.doc(projectId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        const existing = doc.data() as Project;
        const nextAddress = body.address ?? existing.address;
        const nextType = body.projectType ?? existing.projectType;
        const nextName = body.name ?? existing.name;
        const shouldAutoName = !body.name && (body.address || body.projectType);
        const parsed = body.address ? parseAddress(body.address) : undefined;

        await docRef.update({
            ...body,
            id: projectId,
            name: shouldAutoName ? deriveProjectName(nextAddress, nextType) : nextName,
            addressLine1: body.addressLine1 ?? parsed?.addressLine1 ?? existing.addressLine1,
            city: body.city ?? parsed?.city ?? existing.city,
            state: body.state ?? parsed?.state ?? existing.state,
            postalCode: body.postalCode ?? parsed?.postalCode ?? existing.postalCode,
            updatedAt: Date.now()
        });
        const updated = (await docRef.get()).data() as Project;
        res.json({ status: 'success', project: updated });
    } catch (error) {
        console.error('Error updating project:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/projects/:id (soft archive)
router.delete('/:id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const projectId = req.params.id;
        const docRef = projectsCollection.doc(projectId);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Project not found.' });
        }

        await docRef.update({
            status: 'archived',
            updatedAt: Date.now()
        });
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error archiving project:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
