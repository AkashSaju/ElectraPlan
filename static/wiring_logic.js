const canvas = document.getElementById("wiringCanvas");
const ctx = canvas.getContext("2d");
let planObjects = [];

/**
 * 1. INITIALIZATION: Load data and setup canvas
 */
let selectedMode = 'standard'; // Global variable to hold the mode

async function init() {
    try {
        const res = await fetch(`/load-plan/${window.PLAN_ID}`);
        const data = await res.json();
        planObjects = data.canvasObjects || [];

        // Capture the mode from the URL (e.g., ?mode=cost)
        const urlParams = new URLSearchParams(window.location.search);
        selectedMode = urlParams.get('mode') || 'standard'; 

        resize();
        render(); // This will now use the captured selectedMode
    } catch (err) {
        console.error("Failed to load plan:", err);
    }
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
 * 5. BILL OF MATERIALS (BOM) ENGINE
 */
function updateBOM(points, topology, mode = 'cost') {
    let conduitMtrs = 0;
    const mb = points.find(p => p.type.includes('switch'));
    const fan = points.find(p => p.type.includes('fan'));
    if (!mb || !fan) return;

    // --- LOCAL KERALA MARKET RATES (Cost-Effective Tier) ---
    const pricing = {
        conduit: 28,      // Local 20mm PVC
        wire: 18,         // 1.0sqmm (For budget lighting)
        switch: 35,       // Standard Modular
        socket: 65,       // 6A Socket
        labor: 150,       // Local per-point rate
        junctionBox: 15   // PVC Deep box
    };

    points.forEach(p => {
        if (p === mb) return;
        const roomT = topology.find(t => isInside(p.x, p.y, t.room));
        if (!roomT) return;

        // Path Calculation
        if (isPointOnSameWall(p, mb, roomT.walls) && p.type.includes('light')) {
            conduitMtrs += 1.2; // Optimized short drop
        } else if (p === fan) {
            conduitMtrs += (Math.hypot(fan.x - mb.x, fan.y - mb.y) * 0.05); // Direct Slab
        } else {
            const path = calculateRealWorldPath(fan, p, roomT.walls, roomT.room);
            conduitMtrs += (getPathDist(path) * 0.05) + 1.8; // Optimized drop
        }
    });

    const totalWireMtrs = Math.ceil((conduitMtrs * 3) * 1.05); // 5% waste
    const socketCount = points.filter(p => p.type.includes('socket')).length;
    const switchCount = points.filter(p => p.type.includes('switch')).length;

    // --- THE DETAILED PURCHASE LIST ---
    const items = [
        { name: "20mm PVC Conduit (Light Gauge)", qty: Math.ceil(conduitMtrs) + " m", rate: pricing.conduit },
        { name: "1.0 sqmm FR Wire (Lighting Bundle)", qty: totalWireMtrs + " m", rate: pricing.wire },
        { name: "PVC Deep Junction Boxes", qty: points.length + " nos", rate: pricing.junctionBox },
        { name: "20mm PVC Bends/Couplings", qty: Math.ceil(conduitMtrs / 2) + " nos", rate: 8 },
        { name: "Modular Switches (Standard)", qty: switchCount + " nos", rate: pricing.switch },
        { name: "Modular Sockets (6A)", qty: socketCount + " nos", rate: pricing.socket },
        { name: "Electrician Labor (Point Basis)", qty: points.length + " pts", rate: pricing.labor }
    ];

    renderBOMTable(items);
}

function renderBOMTable(items) {
    const bomBody = document.getElementById("bomBody");
    if (!bomBody) return;

    bomBody.innerHTML = items.map(i => `
        <tr>
            <td>
                <b style="color: #fff;">${i.name}</b><br>
                <small style="color: #94a3b8;">Unit Rate: ₹${i.rate}</small>
            </td>
            <td style="text-align: right; font-weight: bold; color: #a3e635;">${i.qty}</td>
        </tr>
    `).join('');

    const total = items.reduce((sum, i) => sum + (parseFloat(i.qty) * i.rate), 0);
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