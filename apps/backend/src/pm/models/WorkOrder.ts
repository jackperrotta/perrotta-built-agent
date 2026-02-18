import { QueryDocumentSnapshot, FirestoreDataConverter, Timestamp } from 'firebase-admin/firestore';
import { WorkOrder } from '@construction/shared';

export const workOrderConverter: FirestoreDataConverter<WorkOrder> = {
    toFirestore(workOrder: WorkOrder): FirebaseFirestore.DocumentData {
        return {
            ...workOrder,
            createdAt: Timestamp.fromMillis(workOrder.createdAt),
            updatedAt: Timestamp.fromMillis(workOrder.updatedAt),
            signedAt: workOrder.signedAt ? Timestamp.fromMillis(workOrder.signedAt) : null,
        };
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): WorkOrder {
        const data = snapshot.data();
        return {
            id: snapshot.id,
            projectId: data.projectId,
            subcontractorId: data.subcontractorId,
            status: data.status,
            taskIds: data.taskIds || [],
            totalAmount: data.totalAmount,
            currency: data.currency || 'USD',
            createdAt: data.createdAt?.toMillis() || Date.now(),
            updatedAt: data.updatedAt?.toMillis() || Date.now(),
            signedBy: data.signedBy,
            signedAt: data.signedAt?.toMillis(),
        } as WorkOrder;
    }
};
