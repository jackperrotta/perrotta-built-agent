import { getToken } from '../auth.js';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8080'
    : ''; // Adjust based on environment

class ProjectStore {
    constructor() {
        this.projects = [];
        this.tasks = {}; // Map projectId -> tasks[]
        this.logs = {}; // Map projectId -> logs[]
        this.performance = {}; // Map projectId -> performance{}
        this.listeners = [];
    }

    subscribe(listener) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(l => l());
    }

    async request(path, options = {}) {
        const token = await getToken();
        const response = await fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            }
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }
        return response.json();
    }

    async loadProject(projectId) {
        // Parallel fetch of project data
        const [project, performance] = await Promise.all([
            this.request(`/api/projects/${projectId}`),
            this.request(`/api/projects/${projectId}/performance`).then(res => res.performance)
        ]);

        // Update local state
        this.performance[projectId] = performance;

        await Promise.all([
            this.loadTasks(projectId),
            this.loadLogs(projectId),
            this.loadEstimates(projectId),
            this.loadTimeLogs(projectId),
            this.loadChangeOrders(projectId)
        ]);

        this.notify();
        return project;
    }

    async loadEstimates(projectId) {
        const estimates = await this.request(`/api/estimates?projectId=${projectId}`);
        // Store in a new map or specialized structure if needed, for now just sticking to a simple prop
        this.estimates = this.estimates || {};
        this.estimates[projectId] = estimates;
        return estimates;
    }

    async loadTimeLogs(projectId) {
        const logs = await this.request(`/api/time-logs?projectId=${projectId}`);
        this.timeLogs = this.timeLogs || {};
        this.timeLogs[projectId] = logs;
        return logs;
    }

    async loadChangeOrders(projectId) {
        const orders = await this.request(`/api/change-orders?projectId=${projectId}`);
        this.changeOrders = this.changeOrders || {};
        this.changeOrders[projectId] = orders;
        return orders;
    }

    async loadLogs(projectId) {
        const logs = await this.request(`/api/projects/${projectId}/logs`);
        this.logs[projectId] = logs;
        this.notify();
        return logs;
    }

    async loadTasks(projectId) {
        const tasks = await this.request(`/api/tasks?projectId=${projectId}`);
        this.tasks[projectId] = tasks;
        this.notify();
        return tasks;
    }

    async createTask(projectId, taskData) {
        const payload = { ...taskData, projectId };
        const { task } = await this.request('/api/tasks', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        // Optimistic update or refetch
        if (!this.tasks[projectId]) this.tasks[projectId] = [];
        this.tasks[projectId].unshift(task);
        this.notify();
        return task;
    }

    async updateTask(taskId, projectId, updates) {
        const { task } = await this.request(`/api/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });

        // Update local list
        if (this.tasks[projectId]) {
            const index = this.tasks[projectId].findIndex(t => t.id === taskId);
            if (index !== -1) {
                this.tasks[projectId][index] = task;
            }
        }
        this.notify();
        return task;
    }

    getProjectTasks(projectId) {
        return this.tasks[projectId] || [];
    }

    getProjectPerformance(projectId) {
        return this.performance[projectId] || null;
    }

    getProjectLogs(projectId) {
        return this.logs[projectId] || [];
    }
}

export const projectStore = new ProjectStore();
