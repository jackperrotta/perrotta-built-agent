import { getToken } from '../auth.js';

const API_BASE = window.location.hostname === 'localhost' && window.location.port === '3000'
    ? 'http://localhost:8080'
    : '';

const API_URL = `${API_BASE}/api/accounting`;

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

export async function seedChartOfAccounts() {
    return request('/accounts/seed', { method: 'POST' });
}

export async function getAccounts() {
    return request('/accounts', { method: 'GET' });
}

export async function createImport(payload) {
    return request('/imports', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function processImport(importId, payload) {
    return request(`/imports/${importId}/process`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function getImports() {
    return request('/imports', { method: 'GET' });
}

export async function getTransactions(params = {}) {
    const query = new URLSearchParams(params).toString();
    const suffix = query ? `?${query}` : '';
    return request(`/transactions${suffix}`, { method: 'GET' });
}

export async function categorizeTransaction(transactionId, payload) {
    return request(`/transactions/${transactionId}/categorize`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function getRules() {
    return request('/rules', { method: 'GET' });
}

export async function createRule(payload) {
    return request('/rules', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function createReceipt(payload) {
    return request('/receipts', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function processReceipt(receiptId, payload) {
    return request(`/receipts/${receiptId}/process`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function linkReceipt(receiptId, payload) {
    return request(`/receipts/${receiptId}/link-transaction`, {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function getReceipts() {
    return request('/receipts', { method: 'GET' });
}

export async function getJournalEntries(params = {}) {
    const query = new URLSearchParams(params).toString();
    const suffix = query ? `?${query}` : '';
    return request(`/journal-entries${suffix}`, { method: 'GET' });
}

export async function createJournalEntry(payload) {
    return request('/journal-entries', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
}

export async function deleteJournalEntry(entryId) {
    return request(`/journal-entries/${entryId}`, { method: 'DELETE' });
}
