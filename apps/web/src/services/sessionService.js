import { getToken } from '../auth.js';

// Base API URL
// In production this might be relative, but in local dev we target port 8080 explicitly
const API_URL = 'http://localhost:8080/api';

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
