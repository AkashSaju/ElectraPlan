const canvas = document.getElementById("wiringCanvas");
const ctx = canvas.getContext("2d");
let planObjects = [];

// ============================
// HEATMAP ENGINE
// ============================
window.isHeatmap = false;

function toggleHeatmap() {
    window.isHeatmap = !window.isHeatmap;
    const btn = document.getElementById('heatmapBtn');
    const legend = document.getElementById('wiringLegend');

    if (window.isHeatmap) {
        btn.style.background = '#f97316';
        btn.style.color = '#000';
        btn.innerHTML = '🔥 Heatmap ON';
        // Update legend to show heatmap gradient scale
        if (legend) legend.innerHTML = `
            <div class="legend-item"><div class="line" style="background:#22d3ee;"></div> Lights (12W)</div>
            <div class="legend-item"><div class="line" style="background:#22c55e;"></div> Fans (75W)</div>
            <div class="legend-item"><div class="line" style="background:#eab308;"></div> Fridge/Mixi</div>
            <div class="legend-item"><div class="line" style="background:#ef4444;"></div> Oven/Heavy</div>
        `;
    } else {
        btn.style.background = 'rgba(30,41,59,0.8)';
        btn.style.color = '#f97316';
        btn.innerHTML = '🔥 Heatmap OFF';
        // Restore original legend
        if (legend) legend.innerHTML = `
            <div class="legend-item"><div class="line" style="background: #EF4444;"></div> Feed</div>
            <div class="legend-item"><div class="line" style="border: 1px dashed #EF4444;"></div> Load</div>
            <div class="legend-item"><div class="line" style="background: #FACC15;"></div> Std</div>
            <div class="legend-item"><div class="line" style="border: 1px dashed #FDE047;"></div> Drop</div>
        `;
    }
    render(); // Force immediate full redraw with BOM
}

/**
 * Converts a wattage value into a smooth heat color string.
 * 0W=Blue, 100W=Green, 400W=Yellow, 800W=Orange, 1000W+=Red
 */
function heatmapColor(watts) {
    if (watts <= 10)  return '#3b82f6'; // Blue   — idle/switch only
    if (watts < 30)   return '#22d3ee'; // Cyan   — lights (12W)
    if (watts < 100)  return '#22c55e'; // Green  — fans (75W)
    if (watts < 600)  return '#eab308'; // Yellow — fridge/mixi (500–750W)
    if (watts < 1500) return '#f97316'; // Orange — water heater (1500W)
    return '#ef4444';                   // Red    — oven / total overload (2000W+)
}

/**
 * Interpolates a glow shadow color from the same palette
 */
function heatGlow(watts) {
    if (watts <= 10)  return 'rgba(59,130,246,0.5)';
    if (watts < 30)   return 'rgba(34,211,238,0.5)';
    if (watts < 100)  return 'rgba(34,197,94,0.5)';
    if (watts < 600)  return 'rgba(234,179,8,0.6)';
    if (watts < 1500) return 'rgba(249,115,22,0.6)';
    return 'rgba(239,68,68,0.7)';
}

/**
 * 1. INITIALIZATION: Load data and setup canvas
 */
let planName = "Kitchen Project"; 

async function init() {
    try {
        const res = await fetch(`/load-plan/${window.PLAN_ID}`);
        const data = await res.json();
        planObjects = data.canvasObjects || [];
        planName = data.name || "Kitchen Project";

        // Display name in the UI for the report
        const titleEl = document.getElementById("planNameDisplay");
        if(titleEl) titleEl.innerText = planName;

        const urlParams = new URLSearchParams(window.location.search);
        selectedMode = urlParams.get('mode') || 'standard'; 

        resize();
        render(); // Initial static render to populate BOM
        animateWiring(); // Kick off 60fps flow animation
    } catch (err) {
        console.error("Failed to load plan:", err);
    }
}

// Adjusted for better PDF contrast
function drawLabel(text, x, y, color) {
    ctx.fillStyle = color;
    ctx.font = "bold 12px Arial"; // Slightly larger for print
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 3;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0; 
}

function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}

let liveWireOffset = 0;

function animateWiring() {
    liveWireOffset -= 0.5; // Speed of the electrical current flow
    render(true);          // Redraw canvas incredibly fast (skip DOM mutations)
    requestAnimationFrame(animateWiring);
}

/**
 * 2. MAIN RENDER LOOP
 */
function render(skipBOM = false) {
    drawGrid();
    drawArchitecture();

    // Build Topology to understand rooms and walls
    const topology = buildRoomTopology(planObjects);
    let points = planObjects.filter(o => String(o.type).startsWith("elec_"));
    
    // Globally Purge any secondary "wall-attached" fans so ONLY the true central Hub remains per room!
    // This stops rogue fans from being drawn as appliances and removes them from the BOM.
    topology.forEach(roomT => {
        const roomFans = points.filter(f => f.type.includes('fan') && isInside(f.x, f.y, roomT.room));
        if (roomFans.length > 1) {
            const rCx = (roomT.room.x1 + roomT.room.x2) / 2;
            const rCy = (roomT.room.y1 + roomT.room.y2) / 2;
            // Find the perfect center fan
            const hubFan = roomFans.reduce((closest, curr) => {
                const d1 = Math.hypot(closest.x - rCx, closest.y - rCy);
                const d2 = Math.hypot(curr.x - rCx, curr.y - rCy);
                return (d2 < d1) ? curr : closest;
            });
            // Filter OUT any fan in this room that isn't the true hubFan
            points = points.filter(p => !roomFans.includes(p) || p === hubFan);
        }
    });

    // Process each room individually
    topology.forEach(roomT => {
        const roomPoints = points.filter(p => isInside(p.x, p.y, roomT.room));
        if (roomPoints.length > 0) {
            drawRoomWiring(roomPoints, roomT.walls, roomT.room);
        }
    });

    // Calculate and display the Bill of Materials only when explicitly needed (not every frame)
    if (!skipBOM) {
        updateBOM(points, topology, typeof selectedMode !== 'undefined' ? selectedMode : 'cost');
    }

    // UX Enhancement: Display active mode overlay on canvas
    ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
    ctx.font = "bold 16px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    ctx.textAlign = "right";
    let modeRaw = typeof selectedMode !== 'undefined' ? selectedMode : "cost";
    
    let modeLabel = "Cost Effective Layout";
    if (modeRaw === "standard") modeLabel = "Standard Intelligent Layout";
    if (modeRaw === "premium") modeLabel = "Premium Luxury Layout";
    if (modeRaw === "custom") modeLabel = "Custom Designer Layout";
    
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.fillText(modeLabel + " Wiring", canvas.width - 20, 30);
    ctx.shadowBlur = 0;
}

/**
 * 3. WIRING DRAWING ENGINE
 */
function drawRoomWiring(points, walls, room) {
    const mb = points.find(p => p.type.includes('switch'));
    
    const fans = points.filter(p => p.type.includes('fan'));
    const rCx = (room.x1 + room.x2) / 2;
    const rCy = (room.y1 + room.y2) / 2;
    const fan = fans.length > 0 ? fans.reduce((closest, curr) => {
        const d1 = Math.hypot(closest.x - rCx, closest.y - rCy);
        const d2 = Math.hypot(curr.x - rCx, curr.y - rCy);
        return (d2 < d1) ? curr : closest;
    }, fans[0]) : null;

    if (!mb || !fan) return;

    // Look up wattage for any type
    const getWatts = (p) => (LOAD_SPECS[p.type] || { watts: 60 }).watts;

    // MAIN FEED — total room load drives the feed wire intensity
    const roomTotalWatts = points.reduce((s, p) => s + getWatts(p), 0);
    const feedColor = window.isHeatmap ? heatmapColor(roomTotalWatts) : '#EF4444';
    const feedWidth = window.isHeatmap ? Math.min(2 + roomTotalWatts / 400, 7) : 4;

    if (window.isHeatmap) {
        ctx.shadowColor = heatGlow(roomTotalWatts);
        ctx.shadowBlur = 12;
    }
    renderProfessionalPath([{x: mb.x, y: mb.y}, {x: fan.x, y: fan.y}], feedColor, feedWidth, []);
    ctx.shadowBlur = 0;

    drawJunctionBox(fan.x, fan.y, "circular");
    drawLabel("MAIN FEED", (mb.x + fan.x) / 2, (mb.y + fan.y) / 2 - 10, feedColor);

    let fanOutletsUsed = 1;

    points.forEach(p => {
        if (p === mb || p === fan) return;
        const labelText = (p.label || p.type.replace('elec_', '')).toUpperCase();
        const watts = getWatts(p);

        if (labelText.includes("FRIDGE")) {
            const path = calculateRealWorldPath(mb, p, walls, room);
            const lineColor = window.isHeatmap ? heatmapColor(watts) : '#EF4444';

            if (window.isHeatmap) { ctx.shadowColor = heatGlow(watts); ctx.shadowBlur = 10; }
            renderProfessionalPath(path, lineColor, window.isHeatmap ? Math.min(2 + watts / 300, 6) : 3, [5, 5]);
            ctx.shadowBlur = 0;
            drawLabel("FRIDGE", p.x, p.y - 15, lineColor);

        } else {
            if (fanOutletsUsed >= 4) {
                drawLabel("ADDL J-BOX REQ", fan.x, fan.y + 20, "#94a3b8");
            }

            const path = calculateRealWorldPath(fan, p, walls, room);
            const isOven = labelText.includes("OVEN");
            const lineColor = window.isHeatmap ? heatmapColor(watts)
                                : (isOven ? "#EF4444" : "#FACC15");
            const lineWidth = window.isHeatmap ? Math.min(1.5 + watts / 400, 5)
                                : (isOven ? 3 : 2);
            const lineDash = isOven && !window.isHeatmap ? [8, 4] : [];

            if (window.isHeatmap) { ctx.shadowColor = heatGlow(watts); ctx.shadowBlur = 8; }
            renderProfessionalPath(path, lineColor, lineWidth, lineDash);
            ctx.shadowBlur = 0;
            drawLabel(labelText, p.x, p.y - 15, lineColor);

            fanOutletsUsed++;
        }
        drawJunctionBox(p.x, p.y, "square");
    });
}

// Helper to write text on the canvas
function drawLabel(text, x, y, color) {
    ctx.fillStyle = color;
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    // Add a slight dark glow for readability on dark backgrounds
    ctx.shadowColor = "black";
    ctx.shadowBlur = 4;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0; // Reset shadow
}

window.showDimensions = false;

// Draws a ← x.xm → measurement callout at the midpoint of any given wire path
function drawDimensionAnnotation(path) {
    if (!window.showDimensions || path.length < 2) return;

    // Total distance in pixels then convert to meters (40px=1m)
    let totalPx = 0;
    for (let i = 1; i < path.length; i++) {
        totalPx += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
    }
    if (totalPx < 5) return; // Skip trivially short wires
    const meters = (totalPx / 40).toFixed(1);

    // Find midpoint segment
    const mid = path[Math.floor(path.length / 2)];
    const prev = path[Math.floor(path.length / 2) - 1] || path[0];
    const angle = Math.atan2(mid.y - prev.y, mid.x - prev.x);

    // Offset label perpendicular to wire direction so it never overlaps the wire
    const perpX = -Math.sin(angle) * 14;
    const perpY =  Math.cos(angle) * 14;
    const lx = (prev.x + mid.x) / 2 + perpX;
    const ly = (prev.y + mid.y) / 2 + perpY;

    const label = `← ${meters} m →`;

    // Pill background
    ctx.font = 'bold 9px Inter, Arial, sans-serif';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(167,139,250,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(lx - tw/2 - 5, ly - 8, tw + 10, 16, 4);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = '#a78bfa';
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.fillText(label, lx, ly + 3);
}

function renderProfessionalPath(path, color, width, dash) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    
    ctx.setLineDash(dash && dash.length > 0 ? dash : [10, 5]);
    ctx.lineDashOffset = liveWireOffset;

    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    // Draw dimension annotation on top of the wire
    drawDimensionAnnotation(path);
}

function drawJunctionBox(x, y, type) {
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (type === "circular") {
        ctx.arc(x, y, 7, 0, Math.PI * 2);
    } else {
        ctx.rect(x - 5, y - 5, 10, 10);
    }
    ctx.fill();
    ctx.stroke();
}

/**
 * 4. PATHFINDING LOGIC (Wall Hugging Drops)
 */
function calculateRealWorldPath(start, end, walls, room) {
    const startWall = nearestWall(start.x, start.y, walls);
    const endWall = nearestWall(end.x, end.y, walls);
    const rCenter = { x: (room.x1 + room.x2)/2, y: (room.y1 + room.y2)/2 };
    
    const getTrunkPoint = (pt, wall) => {
        const isH = Math.abs(wall.x2 - wall.x1) > Math.abs(wall.y2 - wall.y1);
        return {
            x: isH ? pt.x : wall.x1 + (rCenter.x > wall.x1 ? 25 : -25),
            y: isH ? wall.y1 + (rCenter.y > wall.y1 ? 25 : -25) : pt.y
        };
    };

    const p1 = getTrunkPoint(start, startWall); 
    const p2 = getTrunkPoint(end, endWall); 

    if (startWall === endWall) return [start, p1, p2, end];

    const corner = findSharedCorner(startWall, endWall);
    if (corner) {
        const innerCorner = {
            x: Math.abs(p1.x - corner.x) < 5 ? p1.x : p2.x,
            y: Math.abs(p1.y - corner.y) < 5 ? p1.y : p2.y
        };
        return [start, p1, innerCorner, p2, end];
    }
    return [start, p1, p2, end]; 
}


/**
 * 7. LOAD CALCULATION ENGINE
 * Defines standard wattage for Kerala-standard residential fittings
 */
const LOAD_SPECS = {
    elec_fan: { watts: 75, amp: 0.3 },
    elec_switch: { watts: 10, amp: 0.04 }, // Idle/indicator
    elec_socket_fridge: { watts: 500, amp: 2.2 },
    elec_socket_mixi: { watts: 750, amp: 3.3 },
    elec_socket_oven: { watts: 2000, amp: 8.7 },
    elec_socket_water: { watts: 1500, amp: 6.5 },
    elec_light: { watts: 12, amp: 0.05 }
};

function calculateTotalLoad(points) {
    let totalWatts = 0;
    let highLoadPoints = 0;

    points.forEach(p => {
        // Find the matching spec or default to 60W
        const spec = LOAD_SPECS[p.type] || { watts: 60, amp: 0.25 };
        totalWatts += spec.watts;
        if (spec.watts > 1000) highLoadPoints++;
    });

    // Determine Required MCB based on current
    const totalAmps = totalWatts / 230; // Standard voltage in India
    let recommendedMCB = "16A";
    if (totalAmps > 16) recommendedMCB = "25A";
    if (totalAmps > 25) recommendedMCB = "32A";

    return {
        tcl: totalWatts,
        amps: totalAmps.toFixed(2),
        mcb: recommendedMCB,
        isHeavy: highLoadPoints > 0
    };
}



/**
 * 5. BILL OF MATERIALS (BOM) ENGINE
 */
/**
 * UPDATED BOM ENGINE
 * Now includes Load Calculation, MCB Selection, and Wire Gauge Analysis
 */
function updateBOM(points, topology, mode = 'cost') {
    let conduitMtrs = 0;
    const mb = points.find(p => p.type.includes('switch'));
    const globalFan = points.find(p => p.type.includes('fan'));
    if (!mb || !globalFan) return;

    // --- 1. LOAD CALCULATION SPECS ---
    const loadSpecs = {
        elec_fan: 75,
        elec_light: 12,
        elec_socket_fridge: 500,
        elec_socket_mixi: 750,
        elec_socket_oven: 2000,
        elec_socket_water: 1500,
        elec_switch: 0
    };

    let totalWatts = 0;
    let highLoadDetected = false;
    let highLoadConduitMtrs = 0;

    // --- 2. PROFESSIONAL MARKET PRICING (KERALA/INDIA STANDARDS) ---
    const pricing = {
        conduit: 42,       // 20mm PVC (Ivory) with accessories
        wire1_0: 24,       // 1.0 sqmm FR (Lighting/Fans)
        wire2_5: 68,       // 2.5 sqmm FR (Heavy Loads/AC)
        wire1_0_earth: 18, // 1.0 sqmm Green (Earth)
        switch: 85,        // 6A Modular Switch (Decent Brand)
        socket: 145,       // 16A Modular Socket
        mountingBox: 110,  // Metal/PVC Concealed Boxes
        labor: 220,        // Per point (Conduit + Wiring)
        junctionBox: 35,   // Deep junction with cover
        mcb16: 650,        // 6A-16A SP MCB (C-Curve)
        mcb32: 950         // 32A DP Isolator/Heavy MCB
    };

    points.forEach(p => {
        // Load Tracking
        const watts = loadSpecs[p.type] || 60;
        totalWatts += watts;
        
        const labelText = (p.label || p.type.replace('elec_', '')).toUpperCase();
        
        const roomT = topology.find(t => isInside(p.x, p.y, t.room));
        if (!roomT) return;
        
        // Find the specific Switchboard/Mainboard for THIS room
        const roomSwitches = points.filter(s => s.type.includes('switch') && isInside(s.x, s.y, roomT.room));
        const roomMB = roomSwitches.length > 0 ? roomSwitches[0] : mb;

        if (p === roomMB) return; 

        const roomFans = points.filter(f => f.type.includes('fan') && isInside(f.x, f.y, roomT.room));
        const rCx = (roomT.room.x1 + roomT.room.x2) / 2;
        const rCy = (roomT.room.y1 + roomT.room.y2) / 2;
        const roomFan = roomFans.length > 0 ? roomFans.reduce((closest, curr) => {
            const d1 = Math.hypot(closest.x - rCx, closest.y - rCy);
            const d2 = Math.hypot(curr.x - rCx, curr.y - rCy);
            return (d2 < d1) ? curr : closest;
        }, roomFans[0]) : globalFan;

        let pathDist = 0;
        
        if (labelText.includes("FRIDGE") || labelText.includes("OVEN") || labelText.includes("WATER") || watts >= 1000) {
            // Heavy Loads route DIRECTLY to the Main Board
            const path = calculateRealWorldPath(roomMB, p, roomT.walls, roomT.room);
            pathDist = (getPathDist(path) * 0.05) + 1.8;
            conduitMtrs += pathDist;
            highLoadDetected = true;
            highLoadConduitMtrs += pathDist; 
        }
        else if (isPointOnSameWall(p, roomMB, roomT.walls) && p.type.includes('light')) {
            conduitMtrs += 1.2;
        } else if (p.type.includes('fan')) {
            conduitMtrs += (Math.hypot(roomFan.x - roomMB.x, roomFan.y - roomMB.y) * 0.05);
        } else {
            const path = calculateRealWorldPath(roomFan, p, roomT.walls, roomT.room);
            conduitMtrs += (getPathDist(path) * 0.05) + 2.0;
        }
    });

    // --- 3. SYSTEM CALCULATIONS ---
    const totalAmps = (totalWatts / 230).toFixed(2);
    const mcbRequired = totalAmps > 20 ? "40A DP" : "25A DP";
    
    // Total wire calculation (Phase + Neutral + Earth)
    const conduitMtrsInt = Math.ceil(conduitMtrs);
    const wire1_0_qty = Math.ceil((conduitMtrs - highLoadConduitMtrs) * 2 * 1.08); // Phase + Neutral
    const wire_earth_qty = Math.ceil(conduitMtrs * 1.08); // Earth runs everywhere
    const wire_heavy_qty = highLoadDetected ? Math.ceil(highLoadConduitMtrs * 2 * 1.1) : 0;

    const socketCount = points.filter(p => p.type.includes('socket')).length;
    const switchBoardCount = points.filter(p => p.type.includes('switch')).length;
    const fanCount = points.filter(p => p.type.includes('fan')).length;
    const lightCount = points.filter(p => p.type.includes('light')).length;

    // ACTUAL Quantities based on professional standards:
    // Every light and fan needs a switch. General sockets usually have a switch too.
    const actualSwitchQty = lightCount + fanCount + socketCount; 
    
    // EVERY light needs a junction box, EVERY fan needs a fan box. 
    // Plus a few extra for conduit intersections (approx 1 for every 10m of conduit).
    const conduitJunctions = Math.ceil(conduitMtrs / 10);
    const totalDeepBoxes = lightCount + fanCount + conduitJunctions;

    // --- 4. THE COMPOSITE PURCHASE LIST ---
    const items = [
        { name: "Total Connected Load (TCL)", qty: (totalWatts / 1000).toFixed(2) + " kW", rate: 0, isSystem: true },
        { name: "Calculated Design Current", qty: totalAmps + " A", rate: 0, isSystem: true },
        
        { name: `Main Isolator (${mcbRequired})`, qty: "1 nos", rate: totalAmps > 20 ? 1250 : 850 },
        { name: "20mm PVC Rigid Conduit (HMS)", qty: conduitMtrsInt + " m", rate: pricing.conduit },
        { name: "1.0 sqmm FR Wire (Lighting)", qty: wire1_0_qty + " m", rate: pricing.wire1_0 },
        
        ...(highLoadDetected ? [{ name: "2.5 sqmm FR Wire (Power)", qty: wire_heavy_qty + " m", rate: pricing.wire2_5 }] : []),
        { name: "1.0 sqmm FR Wire (Earth)", qty: wire_earth_qty + " m", rate: pricing.wire1_0_earth },
        
        { name: "Modular Switches (6A/16A)", qty: actualSwitchQty + " nos", rate: pricing.switch },
        { name: "Angle/Batten Holders (PC)", qty: lightCount + " nos", rate: 75 },
        { name: "Stepped Fan Regulators", qty: fanCount + " nos", rate: 380 },
        { name: "Modular Sockets (6A/16A)", qty: socketCount + " nos", rate: pricing.socket },
        { name: "Modular Mounting Boxes (GI)", qty: (switchBoardCount + socketCount) + " nos", rate: pricing.mountingBox },
        { name: "Deep Junction / Fan Boxes", qty: totalDeepBoxes + " nos", rate: pricing.junctionBox },
        { name: "Labor Cost (Installation)", qty: points.length + " pts", rate: pricing.labor }
    ];

    renderBOMTable(items);
}

function renderBOMTable(items) {
    const bomBody = document.getElementById("bomBody");
    if (!bomBody) return;

    bomBody.innerHTML = items.map(i => {
        const rowStyle = i.isSystem ? 'background: rgba(34, 211, 238, 0.05); border-left: 2px solid #22d3ee;' : '';
        const qtyColor = i.isSystem ? '#22d3ee' : '#a3e635';
        
        // Calculate line total for non-system rows
        const lineTotal = i.rate > 0 ? (parseFloat(i.qty) * i.rate) : 0;
        const totalDisplay = i.rate > 0 ? `₹${Math.round(lineTotal).toLocaleString('en-IN')}` : '---';

        return `
            <tr style="${rowStyle}">
                <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <b style="color: #f1f5f9; font-size: 11px;">${i.name}</b><br>
                    <small style="color: #64748b;">${i.rate > 0 ? 'Rate: ₹' + i.rate : 'Load Analytics'}</small>
                </td>
                <td style="text-align: center; font-weight: 700; color: ${qtyColor}; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    ${i.qty}
                </td>
                <td style="text-align: right; font-weight: 800; color: #fff; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    ${totalDisplay}
                </td>
            </tr>
        `;
    }).join('');

    // Calculate Grand Total
    const total = items.reduce((sum, i) => sum + (parseFloat(i.qty) * i.rate || 0), 0);
    const costEl = document.getElementById("totalCost");
    if (costEl) costEl.innerText = "₹ " + Math.round(total).toLocaleString('en-IN');
}
/**
 * 6. UTILITY FUNCTIONS
 */
function isPointOnSameWall(p1, p2, walls) {
    const w1 = nearestWall(p1.x, p1.y, walls);
    const w2 = nearestWall(p2.x, p2.y, walls);
    return w1 === w2 && w1 !== null;
}

function findSharedCorner(w1, w2) {
    if (!w1 || !w2) return null;
    const pts1 = [{x: w1.x1, y: w1.y1}, {x: w1.x2, y: w1.y2}];
    const pts2 = [{x: w2.x1, y: w2.y1}, {x: w2.x2, y: w2.y2}];
    for (let p1 of pts1) {
        for (let p2 of pts2) {
            if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < 20) return p1;
        }
    }
    return null;
}

function isInside(x, y, r) {
    return x >= Math.min(r.x1, r.x2) && x <= Math.max(r.x1, r.x2) &&
           y >= Math.min(r.y1, r.y2) && y <= Math.max(r.y1, r.y2);
}

function drawGrid() {
    ctx.fillStyle = "#0E1428";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawArchitecture() {
    planObjects.forEach(o => {
        if (o.type === "wall") {
            ctx.strokeStyle = "rgba(34,211,238,0.3)";
            ctx.lineWidth = 6;
            ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
        }
    });
}

function getPathDist(path) {
    let d = 0;
    for(let i=0; i < path.length - 1; i++) {
        d += Math.hypot(path[i+1].x - path[i].x, path[i+1].y - path[i].y);
    }
    return d;
}

// ============================
// FEATURE B: DIMENSION TOGGLE
// ============================
function toggleDimensions() {
    window.showDimensions = !window.showDimensions;
    const btn = document.getElementById('dimBtn');
    if (window.showDimensions) {
        btn.style.background = '#a78bfa';
        btn.style.color = '#000';
        btn.innerHTML = '📐 Dims ON';
    } else {
        btn.style.background = 'rgba(30,41,59,0.8)';
        btn.style.color = '#a78bfa';
        btn.innerHTML = '📐 Dimensions';
    }
    render(); // Force full redraw with BOM
}

// ============================
// FEATURE C: LOAD BALANCE REPORT
// ============================
function drawGauge(canvasId, fraction, color) {
    const gc = document.getElementById(canvasId);
    if (!gc) return;
    const gctx = gc.getContext('2d');
    const W = gc.width, H = gc.height;
    const cx = W / 2, cy = H - 4;
    const r = Math.min(W, H * 2) / 2 - 6;

    gctx.clearRect(0, 0, W, H);

    // Background arc
    gctx.beginPath();
    gctx.arc(cx, cy, r, Math.PI, 0);
    gctx.strokeStyle = 'rgba(255,255,255,0.06)';
    gctx.lineWidth = 10;
    gctx.lineCap = 'round';
    gctx.stroke();

    // Fill arc (clamp fraction 0–1)
    const f = Math.max(0, Math.min(fraction, 1));
    gctx.beginPath();
    gctx.arc(cx, cy, r, Math.PI, Math.PI + f * Math.PI);
    gctx.strokeStyle = color;
    gctx.lineWidth = 10;
    gctx.shadowColor = color;
    gctx.shadowBlur = 10;
    gctx.stroke();
    gctx.shadowBlur = 0;

    // Percent label
    gctx.fillStyle = color;
    gctx.font = `bold 11px Inter, Arial`;
    gctx.textAlign = 'center';
    gctx.fillText(`${Math.round(f * 100)}%`, cx, cy - 6);
}

function toggleLoadReport() {
    const modal = document.getElementById('loadReportModal');
    modal.classList.add('open');

    const points = planObjects.filter(o => String(o.type).startsWith('elec_'));
    if (points.length === 0) return;

    // 5-Circuit Classification — checks type first, then falls back to label keywords
    // This handles BOTH custom-placed specific types AND auto-generated generic elec_socket with labels
    const CIRCUIT_MAP = {
        'elec_light':          { circuit: 'lighting', label: 'Light Point',   icon: '💡' },
        'elec_fan':            { circuit: 'vent',     label: 'Ceiling Fan',   icon: '🌀' },
        'elec_switch':         { circuit: 'vent',     label: 'Switch Board',  icon: '🎛️' },
        'elec_exhaust':        { circuit: 'vent',     label: 'Exhaust Fan',   icon: '💨' },
        'elec_socket_fridge':  { circuit: 'fridge',   label: 'Refrigerator',  icon: '❄️' },
        'elec_socket_mixi':    { circuit: 'cooking',  label: 'Mixer/Grinder', icon: '🍳' },
        'elec_socket_oven':    { circuit: 'cooking',  label: 'Oven',          icon: '🔥' },
        'elec_socket_water':   { circuit: 'utility',  label: 'Water Heater',  icon: '🚿' },
    };

    // Label keyword → circuit resolver (for auto-templates that use generic "elec_socket")
    function getCircuitClass(p) {
        // Try exact type match first
        if (CIRCUIT_MAP[p.type]) return CIRCUIT_MAP[p.type];

        // For generic elec_socket, check the label
        const lbl = (p.label || '').toLowerCase();
        if (lbl.includes('fridge') || lbl.includes('refrigerator'))
            return { circuit: 'fridge',   label: 'Refrigerator',  icon: '❄️' };
        if (lbl.includes('oven'))
            return { circuit: 'cooking',  label: 'Oven',          icon: '🔥' };
        if (lbl.includes('mixi') || lbl.includes('mixer') || lbl.includes('grinder'))
            return { circuit: 'cooking',  label: 'Mixer/Grinder', icon: '🍳' };
        if (lbl.includes('water') || lbl.includes('heater') || lbl.includes('geyser'))
            return { circuit: 'utility',  label: 'Water Heater',  icon: '🚿' };
        if (lbl.includes('sink'))
            return { circuit: 'utility',  label: 'Sink Socket',   icon: '🚰' };
        if (lbl.includes('island') || lbl.includes('floor'))
            return { circuit: 'lighting', label: 'Floor Socket',  icon: '🔌' };

        // Default: treat generic unknown sockets as general power (lighting circuit)
        return { circuit: 'lighting', label: p.label || 'General Socket', icon: '🔌' };
    }

    const circuits = { lighting: [], vent: [], fridge: [], cooking: [], utility: [] };

    points.forEach(p => {
        const spec  = getCircuitClass(p);
        const watts = (LOAD_SPECS[p.type] || { watts: 60 }).watts;
        // Use the resolved label if meaningful, otherwise fall back to the stored p.label
        const displayLabel = (p.label && p.label.length > 1) ? p.label : spec.label;
        const entry = { label: displayLabel, icon: spec.icon, watts, amps: (watts/230).toFixed(2) };
        (circuits[spec.circuit] || circuits.lighting).push(entry);
    });

    const pickMCB = (amps) => {
        if (amps <= 6)  return { rating: '6A',  color: '#22c55e' };
        if (amps <= 10) return { rating: '10A', color: '#22d3ee' };
        if (amps <= 16) return { rating: '16A', color: '#eab308' };
        if (amps <= 20) return { rating: '20A', color: '#f97316' };
        if (amps <= 32) return { rating: '32A', color: '#ef4444' };
        return                 { rating: '63A', color: '#dc2626' };
    };

    const totalW = Object.values(circuits).flat().reduce((s, e) => s + e.watts, 0);
    const maxW   = Math.max(totalW, 4000);

    // Define per-circuit display config
    const circuitDef = [
        { id: 'lighting', gaugeId: 'gauge-lighting', color: '#fde68a' },
        { id: 'vent',     gaugeId: 'gauge-vent',     color: '#38bdf8' },
        { id: 'fridge',   gaugeId: 'gauge-fridge',   color: '#22d3ee' },
        { id: 'cooking',  gaugeId: 'gauge-cooking',  color: '#f97316' },
        { id: 'utility',  gaugeId: 'gauge-utility',  color: '#ef4444' },
    ];

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };

    circuitDef.forEach(({ id, gaugeId, color }) => {
        const items  = circuits[id];
        const totalW = items.reduce((s, e) => s + e.watts, 0);
        const totalA = totalW / 230;
        const mcb    = pickMCB(totalA);

        drawGauge(gaugeId, totalW / maxW, color);

        set(`stat-${id}`, `${totalW}W`);
        set(`amp-${id}`,  `${totalA.toFixed(1)} A`);
        set(`mcb-${id}`,  `<span style="background:${mcb.color}22; border:1px solid ${mcb.color}; color:${mcb.color}; padding:3px 10px; border-radius:20px; font-size:10px; font-weight:700;">MCB: ${mcb.rating}</span>`);

        // Itemized appliance breakdown
        const listHTML = items.length > 0
            ? items.map(e => `
                <div class="item-row">
                    <span class="item-name">${e.icon} ${e.label}</span>
                    <span class="item-w" style="color:${color};">${e.watts}W / ${e.amps}A</span>
                </div>`).join('')
            : `<div class="item-row" style="color:#334155; font-style:italic; justify-content:center;">No loads on this circuit</div>`;

        set(`items-${id}`, listHTML);
    });

    // Summary totals
    const totalA = totalW / 230;
    const tMCB   = pickMCB(totalA);
    set('lr-total',  `${(totalW/1000).toFixed(2)} kW`);
    set('lr-demand', `${totalA.toFixed(1)} A`);
    set('lr-mcb',    tMCB.rating);
    const lrMCBEl = document.getElementById('lr-mcb');
    if (lrMCBEl) lrMCBEl.style.color = tMCB.color;
}

window.toggleDimensions = toggleDimensions;
window.toggleLoadReport = toggleLoadReport;

window.onload = init;