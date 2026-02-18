import { pmApi } from '../services/pm-api.js';

class ProjectStore {
    constructor() {
        this.subscribers = new Set();
        this.state = {
            currentProject: null,
            tasks: [],
            phases: [],
            workOrders: [],
            fieldLogs: [],
            loading: false,
            error: null
        };
    }

    subscribe(callback) {
        this.subscribers.add(callback);
        callback(this.state);
        return () => this.subscribers.delete(callback);
    }

    notify() {
        this.subscribers.forEach(cb => cb(this.state));
    }

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.notify();
    }

    async loadProjectData(projectId) {
        this.setState({ loading: true, error: null });
        try {
            const [tasks, phases, workOrders, fieldLogs] = await Promise.all([
                pmApi.getTasks(projectId),
                pmApi.getPhases(projectId),
                pmApi.getWorkOrders(projectId),
                pmApi.getLogs(projectId)
            ]);

            this.setState({
                tasks,
                phases,
                workOrders,
                fieldLogs,
                loading: false
            });
        } catch (error) {
            console.error('Failed to load project data:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    // Task Actions
    async createTask(projectId, data) {
        try {
            const newTask = await pmApi.createTask(projectId, data);
            this.setState({ tasks: [...this.state.tasks, newTask] });
            return newTask;
        } catch (error) {
            console.error('Create task failed:', error);
            throw error;
        }
    }

    async updateTask(projectId, taskId, data) {
        try {
            const updated = await pmApi.updateTask(projectId, taskId, data);
            this.setState({
                tasks: this.state.tasks.map(t => t.id === taskId ? updated : t)
            });
            return updated;
        } catch (error) {
            console.error('Update task failed:', error);
            throw error;
        }
    }

    // Phase Actions
    async createPhase(projectId, data) {
        try {
            const newPhase = await pmApi.createPhase(projectId, data);
            this.setState({ phases: [...this.state.phases, newPhase] });
            return newPhase;
        } catch (error) {
            console.error('Create phase failed:', error);
            throw error;
        }
    }

    async reorderPhases(projectId, orderedPhaseIds) {
        // Optimistic update
        const sortedPhases = orderedPhaseIds
            .map(id => this.state.phases.find(p => p.id === id))
            .filter(Boolean)
            .map((p, index) => ({ ...p, orderIndex: index }));

        const previousPhases = this.state.phases;
        this.setState({ phases: sortedPhases });

        try {
            await pmApi.reorderPhases(projectId, orderedPhaseIds);
        } catch (error) {
            console.error('Reorder phases failed:', error);
            this.setState({ phases: previousPhases }); // Revert on error
            throw error;
        }
    }
}

export const projectStore = new ProjectStore();
