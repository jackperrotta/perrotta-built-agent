import { FirestoreDataConverter, QueryDocumentSnapshot, Timestamp } from 'firebase-admin/firestore';
import { Phase } from '@construction/shared';

export const phaseConverter: FirestoreDataConverter<Phase> = {
    toFirestore(phase: Phase): FirebaseFirestore.DocumentData {
        return {
            ...phase,
            startDate: phase.startDate ? Timestamp.fromMillis(phase.startDate) : null,
            endDate: phase.endDate ? Timestamp.fromMillis(phase.endDate) : null,
        };
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): Phase {
        const data = snapshot.data();
        return {
            id: snapshot.id,
            projectId: data.projectId,
            name: data.name,
            orderIndex: data.orderIndex,
            startDate: data.startDate?.toMillis(),
            endDate: data.endDate?.toMillis(),
        } as Phase;
    }
};
