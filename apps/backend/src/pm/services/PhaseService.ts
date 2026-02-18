import { firestore } from 'firebase-admin';
import { Phase } from '@construction/shared';
import { phaseConverter } from '../models/Phase.js';

export class PhaseService {
    private db = firestore();

    private getPhaseCollection(projectId: string) {
        return this.db
            .collection('projects')
            .doc(projectId)
            .collection('phases')
            .withConverter(phaseConverter);
    }

    async createPhase(projectId: string, data: Omit<Phase, 'id' | 'orderIndex' | 'projectId'>): Promise<Phase> {
        const phasesRef = this.getPhaseCollection(projectId);
        const snapshot = await phasesRef.orderBy('orderIndex', 'desc').limit(1).get();
        const lastOrderIndex = snapshot.empty ? 0 : (snapshot.docs[0].data().orderIndex || 0);

        const docRef = phasesRef.doc();
        const newPhase: Phase = {
            id: docRef.id,
            projectId,
            ...data,
            orderIndex: lastOrderIndex + 1
        };

        await docRef.set(newPhase);
        return newPhase;
    }

    async getPhasesByProject(projectId: string): Promise<Phase[]> {
        const phasesRef = this.getPhaseCollection(projectId);
        const snapshot = await phasesRef.orderBy('orderIndex', 'asc').get();
        return snapshot.docs.map(doc => doc.data());
    }

    async updatePhase(projectId: string, phaseId: string, data: Partial<Phase>): Promise<Phase> {
        const phasesRef = this.getPhaseCollection(projectId);
        const docRef = phasesRef.doc(phaseId);
        await docRef.update(data);
        const snapshot = await docRef.get();
        if (!snapshot.exists) throw new Error(`Phase ${phaseId} not found`);
        return snapshot.data() as Phase;
    }

    async deletePhase(projectId: string, phaseId: string): Promise<void> {
        const phasesRef = this.getPhaseCollection(projectId);
        await phasesRef.doc(phaseId).delete();
    }

    async reorderPhases(projectId: string, orderedPhaseIds: string[]): Promise<void> {
        const batch = this.db.batch();
        const phasesRef = this.getPhaseCollection(projectId);

        orderedPhaseIds.forEach((phaseId, index) => {
            const docRef = phasesRef.doc(phaseId);
            batch.update(docRef, { orderIndex: index });
        });

        await batch.commit();
    }
}
