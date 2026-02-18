import { firestore } from 'firebase-admin';
import { WorkOrder } from '@construction/shared';
import { workOrderConverter } from '../models/WorkOrder.js';

export class WorkOrderService {
    private db = firestore();

    private getCollection(projectId: string) {
        return this.db
            .collection('projects')
            .doc(projectId)
            .collection('workOrders')
            .withConverter(workOrderConverter);
    }

    async createWorkOrder(projectId: string, data: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt' | 'projectId'>): Promise<WorkOrder> {
        const ref = this.getCollection(projectId);
        const docRef = ref.doc();
        const newItem: WorkOrder = {
            id: docRef.id,
            projectId,
            ...data,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: data.status || 'draft',
            taskIds: data.taskIds || [],
            paymentIds: []
        };
        await docRef.set(newItem);
        return newItem;
    }

    async getWorkOrders(projectId: string): Promise<WorkOrder[]> {
        const ref = this.getCollection(projectId);
        const snapshot = await ref.orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => doc.data());
    }

    async updateWorkOrder(projectId: string, id: string, data: Partial<WorkOrder>): Promise<WorkOrder> {
        const ref = this.getCollection(projectId).doc(id);
        const updateData = { ...data, updatedAt: Date.now() };
        await ref.update(updateData);
        const snap = await ref.get();
        if (!snap.exists) throw new Error(`WorkOrder ${id} not found`);
        return snap.data() as WorkOrder;
    }

    async deleteWorkOrder(projectId: string, id: string): Promise<void> {
        await this.getCollection(projectId).doc(id).delete();
    }
}
