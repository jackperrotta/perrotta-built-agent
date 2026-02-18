import { QueryDocumentSnapshot, FirestoreDataConverter, Timestamp } from 'firebase-admin/firestore';
import { FieldLog } from '@construction/shared';

export const fieldLogConverter: FirestoreDataConverter<FieldLog> = {
    toFirestore(log: FieldLog): FirebaseFirestore.DocumentData {
        return {
            ...log,
            date: Timestamp.fromMillis(log.date),
            createdAt: Timestamp.fromMillis(log.createdAt),
        };
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): FieldLog {
        const data = snapshot.data();
        return {
            id: snapshot.id,
            projectId: data.projectId,
            authorId: data.authorId,
            date: data.date?.toMillis() || Date.now(),
            type: data.type,
            content: data.content,
            photos: data.photos || [],
            sentiment: data.sentiment,
            flaggedIssues: data.flaggedIssues || [],
            taskUpdates: data.taskUpdates || [],
            createdAt: data.createdAt?.toMillis() || Date.now(),
        } as FieldLog;
    }
};
