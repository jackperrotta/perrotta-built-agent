import { FirestoreDataConverter, QueryDocumentSnapshot, Timestamp } from 'firebase-admin/firestore';
import { Task } from '@construction/shared';

export const taskConverter: FirestoreDataConverter<Task> = {
    toFirestore(task: Task): FirebaseFirestore.DocumentData {
        return {
            ...task,
            createdAt: Timestamp.fromMillis(task.createdAt),
            updatedAt: Timestamp.fromMillis(task.updatedAt),
            // Optional dates
            startDate: task.startDate ? Timestamp.fromMillis(task.startDate) : null,
            endDate: task.endDate ? Timestamp.fromMillis(task.endDate) : null,
            actualStartDate: task.actualStartDate ? Timestamp.fromMillis(task.actualStartDate) : null,
            actualCompletedDate: task.actualCompletedDate ? Timestamp.fromMillis(task.actualCompletedDate) : null,
        };
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): Task {
        const data = snapshot.data();
        return {
            id: snapshot.id,
            projectId: data.projectId,
            phaseId: data.phaseId,
            title: data.title,
            description: data.description,
            status: data.status,
            assignedTo: data.assignedTo,
            dependencyIds: data.dependencyIds || [],
            workOrderId: data.workOrderId,

            // Date conversions
            startDate: data.startDate?.toMillis(),
            endDate: data.endDate?.toMillis(),
            actualStartDate: data.actualStartDate?.toMillis(),
            actualCompletedDate: data.actualCompletedDate?.toMillis(),

            createdAt: data.createdAt?.toMillis() || Date.now(),
            updatedAt: data.updatedAt?.toMillis() || Date.now(),
        } as Task;
    }
};
