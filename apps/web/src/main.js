const app = document.getElementById('app');
const statusDiv = document.getElementById('status');

async function checkBackendHealth() {
    try {
        const response = await fetch('http://localhost:8080/health');
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
