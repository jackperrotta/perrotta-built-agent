import { auth } from '../auth.js';

const API_BASE = '/api/pm';

async function request(endpoint, options = {}) {
    const token = await auth.currentUser?.getIdToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'API request failed');
    }

    if (response.status === 204) {
        return null;
    }

    return response.json();
}

export const pmApi = {
    // Projects
    getProjects: () => request('/projects'), // Assuming this exists or will be added
    getProject: (id) => request(`/projects/${id}`),

    // Tasks
    getTasks: (projectId) => request(`/projects/${projectId}/tasks`),
    createTask: (projectId, data) => request(`/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateTask: (projectId, taskId, data) => request(`/projects/${projectId}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deleteTask: (projectId, taskId) => request(`/projects/${projectId}/tasks/${taskId}`, {
        method: 'DELETE'
    }),

    // Phases
    getPhases: (projectId) => request(`/projects/${projectId}/phases`),
    createPhase: (projectId, data) => request(`/projects/${projectId}/phases`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updatePhase: (projectId, phaseId, data) => request(`/projects/${projectId}/phases/${phaseId}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deletePhase: (projectId, phaseId) => request(`/projects/${projectId}/phases/${phaseId}`, {
        method: 'DELETE'
    }),
    reorderPhases: (projectId, orderedPhaseIds) => request(`/projects/${projectId}/phases/reorder`, {
        method: 'POST',
        body: JSON.stringify({ orderedPhaseIds })
    }),

    // Work Orders
    getWorkOrders: (projectId) => request(`/projects/${projectId}/work-orders`),
    createWorkOrder: (projectId, data) => request(`/projects/${projectId}/work-orders`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateWorkOrder: (projectId, orderId, data) => request(`/projects/${projectId}/work-orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
    deleteWorkOrder: (projectId, orderId) => request(`/projects/${projectId}/work-orders/${orderId}`, {
        method: 'DELETE'
    }),

    // Field Logs
    getLogs: (projectId) => request(`/projects/${projectId}/field-logs`),
    createLog: (projectId, data) => request(`/projects/${projectId}/field-logs`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    updateLog: (projectId, logId, data) => request(`/projects/${projectId}/field-logs/${logId}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    }),
};
