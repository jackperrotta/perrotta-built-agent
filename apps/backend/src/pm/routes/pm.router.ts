import { Router } from 'express';
import { TaskService } from '../services/TaskService.js';
import { PhaseService } from '../services/PhaseService.js';
import { WorkOrderService } from '../services/WorkOrderService.js';
import { FieldLogService } from '../services/FieldLogService.js';

export const pmRouter = Router();

const taskService = new TaskService();
const phaseService = new PhaseService();
const workOrderService = new WorkOrderService();
const fieldLogService = new FieldLogService();

// --- Tasks ---
pmRouter.get('/projects/:projectId/tasks', async (req, res) => {
    try {
        const tasks = await taskService.getTasksByProject(req.params.projectId);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

pmRouter.post('/projects/:projectId/tasks', async (req, res) => {
    try {
        const task = await taskService.createTask(req.params.projectId, req.body);
        res.status(201).json(task);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

pmRouter.patch('/projects/:projectId/tasks/:taskId', async (req, res) => {
    try {
        const { projectId, taskId } = req.params;
        const updateData = req.body;

        const updatedTask = await taskService.updateTask(projectId, taskId, updateData);
        res.json(updatedTask);
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// DELETE /api/pm/projects/:projectId/tasks/:taskId
pmRouter.delete('/projects/:projectId/tasks/:taskId', async (req, res) => {
    try {
        const { projectId, taskId } = req.params;
        await taskService.deleteTask(projectId, taskId);
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting task:', error);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});
