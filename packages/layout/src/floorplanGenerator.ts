import { RoomPlanJson, RoomPlanObject } from './roomPlanTypes.js';

interface Point2D {
    x: number;
    y: number;
}

interface Line2D {
    start: Point2D;
    end: Point2D;
    type: 'wall' | 'window' | 'door' | 'opening';
}

/**
 * Parses the RoomPlan JSON and generates an SVG string.
 */
export function generateFloorplanSvg(data: RoomPlanJson): string {
    const lines: Line2D[] = [];

    // Helper to get start/end points from a transform matrix and length (X-dim)
    // RoomPlan walls usually extend along their local X-axis (or Z, checking convention).
    // Usually, the transform defines the center. Dimensions are [width, height, length].
    // Let's assume the wall extends along its local X-axis (index 0 of dimensions).
    // Transform is column-major 4x4.
    //
    // [ m00 m10 m20 m30 ]
    // [ m01 m11 m21 m31 ]
    // [ m02 m12 m22 m32 ]
    // [ m03 m13 m23 m33 ]
    //
    // Translation is (m30, m31, m32).
    // Rotation is in the top-left 3x3.
    //
    // We'll project to 2D (Top-down, X-Z plane usually in 3D AR, but let's check standard).
    // ARKit usually uses Y-up, so Floorplan is X-Z plane.

    const extractLine = (obj: RoomPlanObject, type: Line2D['type']) => {
        const mat = obj.transform;
        const width = obj.dimensions[0]; // Local X size

        // Translation components
        const tx = mat[12];
        const tz = mat[14]; // Using Z for 2D top-down Y

        // Rotation components (Local X axis vector in world space)
        // Column 0 of the matrix represents the Local X axis direction
        const rx = mat[0];
        const rz = mat[2];

        // Start and End points (Center +/- Half Length * Direction)
        const halfLen = width / 2;

        const x1 = tx - halfLen * rx;
        const y1 = tz - halfLen * rz;
        const x2 = tx + halfLen * rx;
        const y2 = tz + halfLen * rz;

        lines.push({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            type: type
        });
    };

    data.walls.forEach(w => extractLine(w, 'wall'));
    data.windows.forEach(w => extractLine(w, 'window'));
    data.doors.forEach(d => extractLine(d, 'door'));
    data.openings.forEach(o => extractLine(o, 'opening'));

    if (lines.length === 0) return '<svg></svg>';

    // Calculate Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    lines.forEach(l => {
        minX = Math.min(minX, l.start.x, l.end.x);
        minY = Math.min(minY, l.start.y, l.end.y);
        maxX = Math.max(maxX, l.start.x, l.end.x);
        maxY = Math.max(maxY, l.start.y, l.end.y);
    });

    const padding = 1.0; // Meters
    const viewBox = `${minX - padding} ${minY - padding} ${(maxX - minX) + 2 * padding} ${(maxY - minY) + 2 * padding}`;

    // Generate SVG Paths
    const strokeWidth = 0.05; // 5cm

    // Walls: Black, thick
    const wallPaths = lines.filter(l => l.type === 'wall').map(l =>
        `<line x1="${l.start.x}" y1="${l.start.y}" x2="${l.end.x}" y2="${l.end.y}" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="square" />`
    ).join('\n');

    // Windows: Blue/Cyan, thinner
    const windowPaths = lines.filter(l => l.type === 'window').map(l =>
        `<line x1="${l.start.x}" y1="${l.start.y}" x2="${l.end.x}" y2="${l.end.y}" stroke="#00BFFF" stroke-width="${strokeWidth * 0.8}" />`
    ).join('\n');

    // Doors/Openings: White (to cut walls) or transparent with stroke?
    // Usually doors are shown as arcs or gaps. For simple schematic, let's draw them as a gap (white line on top of wall? no, walls are separate).
    // But in RoomPlan, walls are often continuous segments and doors are separate objects. 
    // If we just draw walls, we might cover doors.
    // For this V1, let's draw Doors in Green or "Gap Color"
    // Actually, RoomPlan walls often DO NOT include the gap.
    // Let's draw doors distinctively.
    const doorPaths = lines.filter(l => l.type === 'door' || l.type === 'opening').map(l =>
        `<line x1="${l.start.x}" y1="${l.start.y}" x2="${l.end.x}" y2="${l.end.y}" stroke="#FFD700" stroke-width="${strokeWidth}" stroke-dasharray="0.1, 0.1"/>`
    ).join('\n');


    return `
        <svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" style="background-color: #f9f9f9; transform: scale(1, -1);">
            <!-- Walls -->
            ${wallPaths}
            <!-- Windows -->
            ${windowPaths}
            <!-- Doors -->
            ${doorPaths}
        </svg>
    `;
}
