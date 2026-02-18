import { firestore } from 'firebase-admin';
import { Task, TaskStatus } from '@construction/shared';
import { taskConverter } from '../models/Task.js';

export class TaskService {
    private db = firestore();

    private getTaskCollection(projectId: string) {
        return this.db
            .collection('projects')
            .doc(projectId)
            .collection('tasks')
            .withConverter(taskConverter);
    }

    async createTask(projectId: string, data: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'projectId'>): Promise<Task> {
        const tasksRef = this.getTaskCollection(projectId);
        const docRef = tasksRef.doc();

        const newTask: Task = {
            id: docRef.id,
            projectId,
            ...data,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: data.status || 'todo'
        };

        await docRef.set(newTask);
        return newTask;
    }

    async getTasksByProject(projectId: string): Promise<Task[]> {
        const tasksRef = this.getTaskCollection(projectId);
        const snapshot = await tasksRef.get();
        return snapshot.docs.map(doc => doc.data());
    }

    async updateTask(projectId: string, taskId: string, data: Partial<Task>): Promise<Task> {
        const tasksRef = this.getTaskCollection(projectId);
        const docRef = tasksRef.doc(taskId);

        const updateData = {
            ...data,
            updatedAt: Date.now()
        };

        await docRef.update(updateData);

        const snapshot = await docRef.get();
        if (!snapshot.exists) {
            throw new Error(`Task ${taskId} not found`);
        }

        return snapshot.data() as Task;
    }

    async deleteTask(projectId: string, taskId: string): Promise<void> {
        const tasksRef = this.getTaskCollection(projectId);
        await tasksRef.doc(taskId).delete();
    }
}
