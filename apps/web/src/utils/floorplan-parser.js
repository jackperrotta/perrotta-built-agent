
/**
 * Generates an SVG string from RoomPlan JSON data.
 * @param {Object} data - The RoomPlan JSON object
 * @returns {string} The SVG string
 */
export function generateFloorplanSvg(data) {
    const lines = [];

    // Helper to get start/end points from a transform matrix and dimension
    // RoomPlan: Right-handed, Y-up. Floor is X-Z plane.
    // SVG: Y is down.
    // Mapping: x_svg = x_arkit, y_svg = -z_arkit.

    const extractLine = (obj, type) => {
        if (!obj.transform || !obj.dimensions) return;

        const mat = obj.transform;
        const width = obj.dimensions[0];

        const tx = mat[12];
        const tz = mat[14];

        // Rotation (Local X axis)
        const rx = mat[0];
        const rz = mat[2];

        const halfLen = width / 2;

        // Calculate points in ARKit space
        const ar_x1 = tx - halfLen * rx;
        const ar_z1 = tz - halfLen * rz;
        const ar_x2 = tx + halfLen * rx;
        const ar_z2 = tz + halfLen * rz;

        // Map to SVG space (Flip Vertical rel to previous default)
        // User liked the "flipped" version which was y = z (lines.push y: ar_z)
        lines.push({
            start: { x: ar_x1, y: ar_z1 },
            end: { x: ar_x2, y: ar_z2 },
            type: type,
            width: width
        });
    };

    if (data.walls) data.walls.forEach(w => extractLine(w, 'wall'));
    if (data.windows) data.windows.forEach(w => extractLine(w, 'window'));
    if (data.doors) data.doors.forEach(d => extractLine(d, 'door'));
    if (data.openings) data.openings.forEach(o => extractLine(o, 'opening'));

    if (lines.length === 0) return '<svg viewBox="0 0 100 100"><text x="50" y="50" text-anchor="middle">No Plan Data</text></svg>';

    // Calculate Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    lines.forEach(l => {
        minX = Math.min(minX, l.start.x, l.end.x);
        minY = Math.min(minY, l.start.y, l.end.y);
        maxX = Math.max(maxX, l.start.x, l.end.x);
        maxY = Math.max(maxY, l.start.y, l.end.y);
    });

    const padding = 2.0; // Increased padding for outside dimensions
    const viewBox = `${minX - padding} ${minY - padding} ${(maxX - minX) + 2 * padding} ${(maxY - minY) + 2 * padding}`;

    // Styling
    const strokeWidth = 0.05;
    const fontSize = 0.20;

    // Helper: Area Calculation & Centroid
    const calculateArea = (wallLines) => {
        if (wallLines.length < 3) return { sqFt: 0, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } };

        // Simple bounding box center for now, usually sufficient for single rooms
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        let points = [];
        wallLines.forEach(l => { points.push(l.start); points.push(l.end); });

        // Sort points angularly to approximate polygon for Area
        points.sort((a, b) => {
            return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
        });

        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const p1 = points[i];
            const p2 = points[(i + 1) % points.length];
            area += (p1.x * p2.y) - (p2.x * p1.y);
        }
        area = Math.abs(area) / 2;

        return {
            sqFt: Math.round(area * 10.7639),
            center: { x: cx, y: cy }
        };
    };

    const { sqFt, center } = calculateArea(lines.filter(l => l.type === 'wall'));

    // Helper: Format meters
    const formatDim = (meters) => {
        const totalInches = meters * 39.3701;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        return `${feet}' ${inches}"`;
    };

    // Helper: Draw Dimension Line
    // offset: Distance to shift line. Positive = Left of vector, Negative = Right.
    // We want to force it "Outward".
    const drawDimension = (start, end, forceOutward = true, baseOffset = 0.4) => {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return '';

        // Unit vector along wall
        const ux = dx / len;
        const uy = dy / len;

        // Normal vector (90 deg counter-clockwise: -y, x)
        const nx = -uy;
        const ny = ux;

        let finalOffset = baseOffset;

        if (forceOutward) {
            // Midpoint of wall
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;

            // Vector from Center to Wall
            const c2w_x = midX - center.x;
            const c2w_y = midY - center.y;

            // Dot product with Normal
            const dot = c2w_x * nx + c2w_y * ny;

            // If dot is negative, Normal points Inward. We want Outward.
            // We want the offset vector to point same direction as C2W.
            // Offset vector is (offset * nx, offset * ny).
            // If offset > 0, it points in direction of N.
            // So if N points inward (dot < 0), we need offset < 0.
            // If N points outward (dot > 0), we need offset > 0.

            if (dot < 0) {
                finalOffset = -Math.abs(baseOffset);
            } else {
                finalOffset = Math.abs(baseOffset);
            }
        }

        // Offset points
        const p1x = start.x + nx * finalOffset;
        const p1y = start.y + ny * finalOffset;
        const p2x = end.x + nx * finalOffset;
        const p2y = end.y + ny * finalOffset;

        // Text Position
        const midX = (p1x + p2x) / 2;
        const midY = (p1y + p2y) / 2;

        // Text Rotation
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;

        const tick = 0.1;

        return `
            <g class="dimension">
                <line x1="${p1x}" y1="${p1y}" x2="${p2x}" y2="${p2y}" stroke="#666" stroke-width="${strokeWidth * 0.3}" />
                <line x1="${p1x - nx * tick}" y1="${p1y - ny * tick}" x2="${p1x + nx * tick}" y2="${p1y + ny * tick}" stroke="#666" stroke-width="${strokeWidth * 0.5}" />
                <line x1="${p2x - nx * tick}" y1="${p2y - ny * tick}" x2="${p2x + nx * tick}" y2="${p2y + ny * tick}" stroke="#666" stroke-width="${strokeWidth * 0.5}" />
                <line x1="${start.x}" y1="${start.y}" x2="${p1x}" y2="${p1y}" stroke="#999" stroke-width="${strokeWidth * 0.2}" stroke-dasharray="0.05" />
                <line x1="${end.x}" y1="${end.y}" x2="${p2x}" y2="${p2y}" stroke="#999" stroke-width="${strokeWidth * 0.2}" stroke-dasharray="0.05" />
                <text x="${midX}" y="${midY}" 
                      text-anchor="middle" dominant-baseline="middle" 
                      transform="rotate(${angle}, ${midX}, ${midY})" 
                      font-size="${fontSize}" fill="#444" font-family="sans-serif"
                      stroke="#f9f9f9" stroke-width="${fontSize * 0.4}" paint-order="stroke" stroke-linejoin="round">
                    ${formatDim(len)}
                </text>
            </g>
        `;
    }

    let svgContent = '';

    // Walls
    lines.filter(l => l.type === 'wall').forEach(l => {
        svgContent += `<line x1="${l.start.x}" y1="${l.start.y}" x2="${l.end.x}" y2="${l.end.y}" stroke="black" stroke-width="${strokeWidth}" stroke-linecap="square" />`;
        // Outward dimensions with 0.4 offset
        svgContent += drawDimension(l.start, l.end, true, 0.4);
    });

    // Windows (Don't force outward, usually inside or along line is better, or same as wall? Let's use same as wall logic but closer)
    lines.filter(l => l.type === 'window').forEach(l => {
        svgContent += `<line x1="${l.start.x}" y1="${l.start.y}" x2="${l.end.x}" y2="${l.end.y}" stroke="#00BFFF" stroke-width="${strokeWidth * 0.8}" />`;
        // Use outward logic but smaller offset or slightly different to not overlap wall dim
        // Let's put window dims slightly "inward" or Just on the line? "Inward" might be cleaner if Wall is Outward.
        // Let's force Inward (-baseOffset)
        svgContent += drawDimension(l.start, l.end, true, -0.3); // Negative relative to outward logic = Inward? No, logic above flips based on Dot.
        // If we want inward, we just flip the sign of the result of the logic?
        // Actually, if I pass -0.3 to logic:
        // If N points In (Dot<0), logic sets final = -abs(-0.3) = -0.3. So points In.
        // If N points Out (Dot>0), logic sets final = abs(-0.3) = 0.3. So points Out.
        // It basically enforces "Direction of Norm matches Direction of Centroid-Ray".
        // If we want Opposite of Outward (Inward), we should just invert the result of logic, or...
        // Let's just trust "Outward" for windows too but closer? Overlaps wall?
        // Walls are at 0.4. Windows at 0.2?
        // No, User said "Dimensions labels outside".
        // Maybe windows should be outside too, slightly further? or closer?
        // Let's try closer (0.2).
        svgContent += drawDimension(l.start, l.end, true, 0.2);
    });

    // Doors
    lines.filter(l => l.type === 'door').forEach(l => {
        const dx = l.end.x - l.start.x;
        const dy = l.end.y - l.start.y;
        const width = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / width; const uy = dy / width; const nx = -uy; const ny = ux;
        const openX = l.start.x + nx * width;
        const openY = l.start.y + ny * width;
        svgContent += `<line x1="${l.start.x}" y1="${l.start.y}" x2="${openX}" y2="${openY}" stroke="#333" stroke-width="${strokeWidth * 0.5}" />`;
        svgContent += `<path d="M ${openX} ${openY} A ${width} ${width} 0 0 0 ${l.end.x} ${l.end.y}" fill="none" stroke="#ccc" stroke-width="${strokeWidth * 0.3}" stroke-dasharray="0.05, 0.05" />`;
    });

    // Openings
    lines.filter(l => l.type === 'opening').forEach(l => {
        svgContent += `<line x1="${l.start.x}" y1="${l.start.y}" x2="${l.end.x}" y2="${l.end.y}" stroke="#ccc" stroke-width="${strokeWidth}" stroke-dasharray="0.1, 0.1" />`;
    });

    if (sqFt > 0) {
        svgContent += `
            <text x="${center.x}" y="${center.y}" text-anchor="middle" dominant-baseline="middle" 
             font-size="${fontSize * 1.5}" fill="#333" font-weight="bold" font-family="sans-serif"
             stroke="#f9f9f9" stroke-width="${fontSize * 0.4}" paint-order="stroke">
                ${sqFt} sq ft
            </text>
        `;
    }

    return `
        <svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" style="width:100%; height:100%; background-color: #f9f9f9;">
            <g id="viewport">
                ${svgContent}
            </g>
        </svg>
    `;
}
