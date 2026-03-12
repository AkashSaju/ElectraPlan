const canvas = document.getElementById("wiringCanvas");
const ctx = canvas.getContext("2d");
let planObjects = [];

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
        render(); 
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

function render() {
    drawGrid();
    drawArchitecture();

    const topology = buildRoomTopology(planObjects);
    const points = planObjects.filter(o => String(o.type).startsWith("elec_"));
    
    topology.forEach(roomT => {
        const roomPoints = points.filter(p => isInside(p.x, p.y, roomT.room));
        if (roomPoints.length > 0) {
            drawRoomWiring(roomPoints, roomT.walls, roomT.room);
        }
    });

    // Pass the selectedMode to the BOM engine
    updateBOM(points, topology, selectedMode);
}

function resize() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}

/**
 * 2. MAIN RENDER LOOP
 */
function render() {
    drawGrid();
    drawArchitecture();

    // Build Topology to understand rooms and walls
    const topology = buildRoomTopology(planObjects);
    const points = planObjects.filter(o => String(o.type).startsWith("elec_"));
    
    // Process each room individually
    topology.forEach(roomT => {
        const roomPoints = points.filter(p => isInside(p.x, p.y, roomT.room));
        if (roomPoints.length > 0) {
            drawRoomWiring(roomPoints, roomT.walls, roomT.room);
        }
    });

    // Calculate and display the Bill of Materials
    updateBOM(points, topology);
}

/**
 * 3. WIRING DRAWING ENGINE
 */
function drawRoomWiring(points, walls, room) {
    const mb = points.find(p => p.type.includes('switch'));
    const fan = points.find(p => p.type.includes('fan'));
    if (!mb || !fan) return;

    // --- MAIN FEED ---
    renderProfessionalPath([{x: mb.x, y: mb.y}, {x: fan.x, y: fan.y}], "#EF4444", 4, []);
    drawJunctionBox(fan.x, fan.y, "circular");
    drawLabel("MAIN FEED", (mb.x + fan.x) / 2, (mb.y + fan.y) / 2 - 10, "#EF4444");

    // Track how many pipes are hitting the fan
    let fanOutletsUsed = 1; // 1 is already used for the Main Feed

    points.forEach(p => {
        if (p === mb || p === fan) return;
        const labelText = (p.label || p.type.replace('elec_', '')).toUpperCase();
        
        if (labelText.includes("FRIDGE")) {
    // Direct to MB - Bypasses Fan outlet
    const path = calculateRealWorldPath(mb, p, walls, room);
    
    // Updated: Added [5, 5] dash array for the "gap line" look
    renderProfessionalPath(path, "#EF4444", 3, [5, 5]); 
    
    drawLabel("FRIDGE", p.x, p.y - 15, "#EF4444");

        } 
        else {
            // Check if we need an extra junction box nearby
            if (fanOutletsUsed >= 4) {
                // Visually show a second junction box or a "Loop"
                drawLabel("ADDL J-BOX REQ", fan.x + 15, fan.y + 15, "#94a3b8");
            }

            const path = calculateRealWorldPath(fan, p, walls, room);
            const isOven = labelText.includes("OVEN");
            renderProfessionalPath(path, isOven ? "#EF4444" : "#FACC15", isOven ? 3 : 2, isOven ? [8, 4] : []);
            drawLabel(labelText, p.x, p.y - 15, isOven ? "#EF4444" : "#FACC15");
            
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

function renderProfessionalPath(path, color, width, dash) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash state
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
    const fan = points.find(p => p.type.includes('fan'));
    if (!mb || !fan) return;

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

    // --- 2. PRICING & MATERIALS ---
    const pricing = {
        conduit: 28,
        wire1_0: 18,   // For Lighting
        wire2_5: 45,   // For Power/High Load
        switch: 35,
        socket: 65,
        labor: 150,
        junctionBox: 15,
        mcb16: 280,
        mcb32: 450
    };

    points.forEach(p => {
        // Load Tracking
        const watts = loadSpecs[p.type] || 60;
        totalWatts += watts;
        if (watts > 1000) highLoadDetected = true;

        if (p === mb) return;
        const roomT = topology.find(t => isInside(p.x, p.y, t.room));
        if (!roomT) return;

        // Path Calculation (Conduit)
        if (isPointOnSameWall(p, mb, roomT.walls) && p.type.includes('light')) {
            conduitMtrs += 1.2;
        } else if (p === fan) {
            conduitMtrs += (Math.hypot(fan.x - mb.x, fan.y - mb.y) * 0.05);
        } else {
            const path = calculateRealWorldPath(fan, p, roomT.walls, roomT.room);
            conduitMtrs += (getPathDist(path) * 0.05) + 1.8;
        }
    });

    // --- 3. SYSTEM CALCULATIONS ---
    const totalAmps = (totalWatts / 230).toFixed(2);
    const mcbRequired = totalAmps > 16 ? "32A DP" : "16A SP";
    
    const totalWireMtrs = Math.ceil((conduitMtrs * 3) * 1.05);
    const socketCount = points.filter(p => p.type.includes('socket')).length;
    const switchCount = points.filter(p => p.type.includes('switch')).length;

    // --- 4. THE COMPOSITE PURCHASE LIST ---
    const items = [
        // Load Analytics (Displayed as Info)
        { name: "Total Connected Load (TCL)", qty: (totalWatts / 1000).toFixed(2) + " kW", rate: 0, isSystem: true },
        { name: "Calculated Current (Amps)", qty: totalAmps + " A", rate: 0, isSystem: true },
        
        // Physical Components
        { name: `Main Protection MCB (${mcbRequired})`, qty: "1 nos", rate: totalAmps > 16 ? pricing.mcb32 : pricing.mcb16 },
        { name: "20mm PVC Conduit (Light Gauge)", qty: Math.ceil(conduitMtrs) + " m", rate: pricing.conduit },
        { name: "1.0 sqmm FR Wire (Lighting)", qty: totalWireMtrs + " m", rate: pricing.wire1_0 },
        
        // Add Heavy Wire if High Load detected
        ...(highLoadDetected ? [{ name: "2.5 sqmm FR Wire (Power Circuits)", qty: "45 m", rate: pricing.wire2_5 }] : []),
        
        { name: "PVC Deep Junction Boxes", qty: points.length + " nos", rate: pricing.junctionBox },
        { name: "Modular Switches/Sockets", qty: (switchCount + socketCount) + " nos", rate: pricing.switch },
        { name: "Electrician Labor (Point Basis)", qty: points.length + " pts", rate: pricing.labor }
    ];

    renderBOMTable(items);
}

function renderBOMTable(items) {
    const bomBody = document.getElementById("bomBody");
    if (!bomBody) return;

    bomBody.innerHTML = items.map(i => {
        // System rows get a cyan highlight, physical rows look standard
        const rowStyle = i.isSystem ? 'background: rgba(34, 211, 238, 0.05); border-left: 2px solid #22d3ee;' : '';
        const qtyColor = i.isSystem ? '#22d3ee' : '#a3e635';

        return `
            <tr style="${rowStyle}">
                <td style="padding: 12px 10px;">
                    <b style="color: #fff;">${i.name}</b><br>
                    <small style="color: #94a3b8;">${i.rate > 0 ? 'Unit Rate: ₹' + i.rate : 'System Value'}</small>
                </td>
                <td style="text-align: right; font-weight: bold; color: ${qtyColor}; padding: 12px 10px;">
                    ${i.qty}
                </td>
            </tr>
        `;
    }).join('');

    // Calculate Grand Total (Filtering out System Info rows with 0 rate)
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

window.onload = init;