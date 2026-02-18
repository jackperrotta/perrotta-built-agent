import { projectStore } from '../stores/project-store.js';

export class GanttChart extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.unsubscribe = null;
    }

    connectedCallback() {
        this.unsubscribe = projectStore.subscribe(this.render.bind(this));
        this.render(projectStore.state);
    }

    disconnectedCallback() {
        if (this.unsubscribe) this.unsubscribe();
    }

    render(state) {
        if (state.loading) {
            this.shadowRoot.innerHTML = '<div class="loading">Loading schedule...</div>';
            return;
        }

        const { phases, tasks } = state;
        const sortedPhases = [...phases].sort((a, b) => a.orderIndex - b.orderIndex);

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    font-family: 'Inter', sans-serif;
                    background: #fff;
                    border: 1px solid #e5e7eb;
                    border-radius: 0.5rem;
                    overflow: hidden;
                }
                .header {
                    padding: 1rem;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .phase-list {
                    display: flex;
                    flex-direction: column;
                }
                .phase-row {
                    display: grid;
                    grid-template-columns: 200px 1fr;
                    border-bottom: 1px solid #f3f4f6;
                    min-height: 48px;
                }
                .phase-header {
                    background: #f9fafb;
                    padding: 0.75rem;
                    font-weight: 600;
                    color: #374151;
                    display: flex;
                    align-items: center;
                    cursor: grab;
                }
                .phase-content {
                    padding: 0.5rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .task-bar {
                    background: #3b82f6;
                    color: white;
                    padding: 0.25rem 0.5rem;
                    border-radius: 0.25rem;
                    font-size: 0.875rem;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .add-btn {
                    background: #10b981;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 0.25rem;
                    cursor: pointer;
                }
            </style>
            
            <div class="header">
                <h2>Project Schedule</h2>
                <button class="add-btn" id="add-phase">Add Phase</button>
            </div>

            <div class="phase-list">
                ${sortedPhases.map(phase => `
                    <div class="phase-row" data-id="${phase.id}">
                        <div class="phase-header" draggable="true">
                            <span>:::</span> ${phase.name}
                        </div>
                        <div class="phase-content">
                            ${tasks.filter(t => t.phaseId === phase.id).map(task => `
                                <div class="task-bar" title="${task.title}">
                                    ${task.title}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.setupDragAndDrop();
    }

    setupDragAndDrop() {
        const rows = this.shadowRoot.querySelectorAll('.phase-row');
        let draggedItem = null;

        rows.forEach(row => {
            const header = row.querySelector('.phase-header');

            header.addEventListener('dragstart', (e) => {
                draggedItem = row;
                e.dataTransfer.effectAllowed = 'move';
                row.style.opacity = '0.5';
            });

            header.addEventListener('dragend', () => {
                draggedItem = null;
                row.style.opacity = '1';

                // Collect new order
                const newOrder = Array.from(this.shadowRoot.querySelectorAll('.phase-row'))
                    .map(r => r.dataset.id);

                // Dispatch action
                const projectId = projectStore.state.currentProject?.id; // Needed
                if (projectId) projectStore.reorderPhases(projectId, newOrder);
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                if (draggedItem && draggedItem !== row) {
                    const list = this.shadowRoot.querySelector('.phase-list');
                    const allRows = [...list.children];
                    const draggedIdx = allRows.indexOf(draggedItem);
                    const targetIdx = allRows.indexOf(row);

                    if (draggedIdx < targetIdx) {
                        list.insertBefore(draggedItem, row.nextSibling);
                    } else {
                        list.insertBefore(draggedItem, row);
                    }
                }
            });
        });
    }
}

customElements.define('gantt-chart', GanttChart);
