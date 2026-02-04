
export interface RoomPlanJson {
    walls: RoomPlanObject[];
    windows: RoomPlanObject[];
    doors: RoomPlanObject[];
    openings: RoomPlanObject[];
}

export interface RoomPlanObject {
    id: string;
    completed: boolean;
    dimensions: number[]; // [width, height, length] or similar. Usually [x-dim, y-dim, z-dim]
    transform: number[]; // 4x4 matrix flattened (16 elements)
    story?: string;
    confidence?: number;
}
