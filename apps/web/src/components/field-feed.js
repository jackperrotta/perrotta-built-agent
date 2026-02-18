import { projectStore } from '../stores/project-store.js';

export class FieldFeed extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.unsubscribe = null;
    }

    connectedCallback() {
        this.unsubscribe = projectStore.subscribe(this.render.bind(this));
        // Use initial state or default to empty
        this.render(projectStore.state);
        this.setupEventListeners(); // Initial setup
    }

    disconnectedCallback() {
        if (this.unsubscribe) this.unsubscribe();
    }

    // We defer heavy DOM updates/re-renders to avoid trashing inputs
    // In a real app we'd use a lightweight VDOM or focused updates.
    render(state) {
        const logs = state.fieldLogs || [];
        const sortedLogs = [...logs].sort((a, b) => b.createdAt - a.createdAt);

        // Simple diff: check if log count changed or if we are loading
        if (this.lastLogCount === sortedLogs.length && !state.loading && !state.error) {
            return; // Skip re-render if data is likely same (simplistic)
        }
        this.lastLogCount = sortedLogs.length;

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    font-family: 'Inter', sans-serif;
                    background: #f9fafb;
                    border-left: 1px solid #e5e7eb;
                }
                .feed-header {
                    padding: 1rem;
                    background: #fff;
                    border-bottom: 1px solid #e5e7eb;
                    font-weight: 600;
                }
                .feed-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .log-card {
                    background: #fff;
                    border: 1px solid #e5e7eb;
                    border-radius: 0.5rem;
                    padding: 1rem;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .log-meta {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.75rem;
                    color: #6b7280;
                    margin-bottom: 0.5rem;
                }
                .log-content {
                    font-size: 0.875rem;
                    color: #1f2937;
                    line-height: 1.5;
                }
                .log-photos {
                    display: flex;
                    gap: 0.5rem;
                    margin-top: 0.5rem;
                    overflow-x: auto;
                }
                .log-photo {
                    width: 64px;
                    height: 64px;
                    border-radius: 0.25rem;
                    object-fit: cover;
                    background: #f3f4f6;
                }
                .input-area {
                    padding: 1rem;
                    background: #fff;
                    border-top: 1px solid #e5e7eb;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                textarea {
                    width: 100%;
                    border: 1px solid #d1d5db;
                    border-radius: 0.375rem;
                    padding: 0.5rem;
                    font-family: inherit;
                    resize: vertical;
                    min-height: 80px;
                }
                button {
                    align-self: flex-end;
                    background: #2563eb;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 0.375rem;
                    font-weight: 500;
                    cursor: pointer;
                }
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
            </style>

            <div class="feed-header">Field Updates</div>
            
            <div class="feed-list">
                ${sortedLogs.length === 0 ? '<div style="text-align:center;color:#9ca3af;margin-top:2rem;">No logs yet.</div>' : ''}
                ${sortedLogs.map(log => `
                    <div class="log-card">
                        <div class="log-meta">
                            <span>${new Date(log.createdAt).toLocaleString()}</span>
                            <span>${log.authorId || 'Unknown'}</span>
                        </div>
                        <div class="log-content">${log.content}</div>
                        ${log.photos && log.photos.length ? `
                            <div class="log-photos">
                                ${log.photos.map(url => `<img src="${url}" class="log-photo" alt="Field photo">`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            <div class="input-area">
                <textarea placeholder="What's happening on site?"></textarea>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <label style="font-size:0.875rem;color:#6b7280;cursor:pointer;">
                        📷 Add Photo
                        <input type="file" accept="image/*" multiple style="display:none">
                    </label>
                    <button id="post-btn">Post Update</button>
                </div>
            </div>
        `;

        this.setupEventListeners();
    }

    setupEventListeners() {
        const btn = this.shadowRoot.getElementById('post-btn');
        const textarea = this.shadowRoot.querySelector('textarea');
        const fileInput = this.shadowRoot.querySelector('input[type="file"]');

        if (!btn || !textarea) return; // Might be in loading state

        btn.onclick = async () => {
            const content = textarea.value.trim();
            if (!content) return;

            btn.disabled = true;
            btn.textContent = 'Posting...';

            try {
                // Mock photo upload for now or handle via a service
                // In real implementation we would upload files first -> get URLs -> create log
                const projectId = projectStore.state.currentProject?.id;
                await projectStore.createLog(projectId, {
                    content,
                    type: 'daily_update',
                    authorId: 'current-user', // Should come from Auth
                    photos: [], // TODO: Handle uploads
                    date: Date.now()
                });

                textarea.value = '';
            } catch (e) {
                alert('Failed to post log: ' + e.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Post Update';
            }
        };
    }
}

customElements.define('field-feed', FieldFeed);
