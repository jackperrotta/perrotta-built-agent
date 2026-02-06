import { getToken } from '../auth.js';

const API_BASE = window.location.hostname === 'localhost' && window.location.port === '3000'
    ? 'http://localhost:8080'
    : '';

const API_URL = `${API_BASE}/api/projects`;

async function request(path, options = {}) {
    const token = await getToken();
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || response.statusText);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return response.json();
    }
    return null;
}

export async function getProjects() {
    return request('', { method: 'GET' });
}

export async function createProject(payload) {
    return request('', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}
