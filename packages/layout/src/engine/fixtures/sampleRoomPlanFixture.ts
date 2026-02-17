import { type RoomPlanJson } from '../../roomPlanTypes.js';

export const sampleRoomPlanFixture: RoomPlanJson = {
    walls: [
        {
            id: 'w1',
            completed: true,
            dimensions: [7.3152, 2.4, 0.1],
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3.6576, 0, 0, 1],
            confidence: 0.84
        },
        {
            id: 'w2',
            completed: true,
            dimensions: [7.3152, 2.4, 0.1],
            transform: [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 7.3152, 0, 3.6576, 1],
            confidence: 0.81
        },
        {
            id: 'w3',
            completed: true,
            dimensions: [7.3152, 2.4, 0.1],
            transform: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 3.6576, 0, 7.3152, 1],
            confidence: 0.79
        },
        {
            id: 'w4',
            completed: true,
            dimensions: [7.3152, 2.4, 0.1],
            transform: [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 3.6576, 1],
            confidence: 0.82
        }
    ],
    windows: [],
    doors: [],
    openings: []
};
