import { firestore } from 'firebase-admin';
import { FieldLog } from '@construction/shared';
import { fieldLogConverter } from '../models/FieldLog.js';

export class FieldLogService {
    private db = firestore();

    private getCollection(projectId: string) {
        return this.db
            .collection('projects')
            .doc(projectId)
            .collection('fieldLogs')
            .withConverter(fieldLogConverter);
    }

    async createLog(projectId: string, data: Omit<FieldLog, 'id' | 'createdAt' | 'projectId'>): Promise<FieldLog> {
        const ref = this.getCollection(projectId);
        const docRef = ref.doc();
        const newItem: FieldLog = {
            id: docRef.id,
            projectId,
            ...data,
            createdAt: Date.now(),
            date: data.date || Date.now(),
            flaggedIssues: data.flaggedIssues || [],
            photos: data.photos || [],
            taskUpdates: data.taskUpdates || []
        };
        await docRef.set(newItem);
        return newItem;
    }

    async getLogs(projectId: string): Promise<FieldLog[]> {
        const ref = this.getCollection(projectId);
        const snapshot = await ref.orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => doc.data());
    }

    async updateLog(projectId: string, id: string, data: Partial<FieldLog>): Promise<FieldLog> {
        const ref = this.getCollection(projectId).doc(id);
        await ref.update(data);
        const snap = await ref.get();
        if (!snap.exists) throw new Error(`FieldLog ${id} not found`);
        return snap.data() as FieldLog;
    }
}
