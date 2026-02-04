const app = document.getElementById('app');
const statusDiv = document.getElementById('status');

async function checkBackendHealth() {
    // API Base: Port 3000 -> localhost:8080, else relative
    const API_BASE = window.location.hostname === 'localhost' && window.location.port === '3000'
        ? 'http://localhost:8080'
        : '';

    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        if (statusDiv) {
            statusDiv.innerText = `Backend Status: ${data.status} at ${data.timestamp}`;
        }
    } catch (error) {
        if (statusDiv) {
            statusDiv.innerText = 'Backend disconnected';
        }
        console.error('Error connecting to backend:', error);
    }
}

checkBackendHealth();
