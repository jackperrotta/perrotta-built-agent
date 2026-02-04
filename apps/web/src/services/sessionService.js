import { getToken } from '../auth.js';

// Base API URL
// In local dev (port 3000), target port 8080. In production (same origin), use relative path.
const API_BASE = window.location.hostname === 'localhost' && window.location.port === '3000'
    ? 'http://localhost:8080'
    : '';

const API_URL = `${API_BASE}/api`;

/**
 * Fetch all scan sessions
 * @returns {Promise<Array>} List of sessions
 */
export async function getSessions() {
    const token = await getToken();
    const response = await fetch(`${API_URL}/sessions`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch sessions: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Fetch a single scan session by ID
 * @param {string} id 
 * @returns {Promise<Object>} Session details
 */
export async function getSessionById(id) {
    const token = await getToken();
    const response = await fetch(`${API_URL}/sessions/${id}`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch session ${id}: ${response.statusText}`);
    }

    return await response.json();
}
