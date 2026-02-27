const PLAN_ID = Number(window.PLAN_ID);

const previewCanvas = document.getElementById("previewCanvas");
const pctx = previewCanvas.getContext("2d");

let planObjects = [];
let selectedTemplate = "cost";


// resize preview canvas to match CSS size
function resizePreviewCanvas() {
  previewCanvas.width = previewCanvas.clientWidth;
  previewCanvas.height = previewCanvas.clientHeight;
}
window.addEventListener("resize", () => {
  resizePreviewCanvas();
  drawPreview();
});

function drawGrid() {
  pctx.fillStyle = "#0E1428";
  pctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);

  const gridSize = 40;

  pctx.strokeStyle = "rgba(34,211,238,0.10)";
  pctx.lineWidth = 1;

  for (let x = 0; x <= previewCanvas.width; x += gridSize) {
    pctx.beginPath();
    pctx.moveTo(x, 0);
    pctx.lineTo(x, previewCanvas.height);
    pctx.stroke();
  }
  for (let y = 0; y <= previewCanvas.height; y += gridSize) {
    pctx.beginPath();
    pctx.moveTo(0, y);
    pctx.lineTo(previewCanvas.width, y);
    pctx.stroke();
  }
}

function roomCenter(room) {
  return { x: (room.x1 + room.x2) / 2, y: (room.y1 + room.y2) / 2 };
}


function getWalls(objects) {
  return objects.filter(o => o.type === "wall");
}

function distanceToWall(px, py, wall) {
  const x1 = wall.x1, y1 = wall.y1;
  const x2 = wall.x2, y2 = wall.y2;

  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = dot / len_sq;

  if (param < 0) param = 0;
  if (param > 1) param = 1;

  const xx = x1 + param * C;
  const yy = y1 + param * D;

  const dx = px - xx;
  const dy = py - yy;

  return {
    dist: Math.sqrt(dx * dx + dy * dy),
    x: xx,
    y: yy,
    wall
  };
}

function snapToNearestWall(px, py, walls, offset = 14) {
  let nearest = null;

  for (const w of walls) {
    const d = distanceToWall(px, py, w);
    if (!nearest || d.dist < nearest.dist) nearest = d;
  }

  if (!nearest) return { x: px, y: py };

  // push slightly inside room
  const angle = Math.atan2(nearest.wall.y2 - nearest.wall.y1,
                           nearest.wall.x2 - nearest.wall.x1);

  return {
    x: nearest.x - Math.sin(angle) * offset,
    y: nearest.y + Math.cos(angle) * offset
  };
}


// ============================
// ELECTRICAL PLACEMENT ENGINE
/// ============================
/// ============================
// ELECTRICAL PLACEMENT ENGINE (UPGRADED)
// ============================
function generateElectrical(objects, mode) {

  const topology = buildRoomTopology(objects);
  const elec = [];

  const add = (type, x, y, label = "") => {
    elec.push({
      id: Date.now() + Math.random(),
      type,
      x,
      y,
      label
    });
  };

  const wallMid = (w) => ({
    x: (w.x1 + w.x2) / 2,
    y: (w.y1 + w.y2) / 2
  });

  const roomCenterPoint = (r) => ({
    x: (r.x1 + r.x2) / 2,
    y: (r.y1 + r.y2) / 2
  });

  for (const t of topology) {
    const r = t.room;
    const label = (r.label || "").toLowerCase();

    const center = roomCenterPoint(r);
    const entryWall = t.entryWall || t.longestWall;
    const mainWall = t.longestWall;
    const topWall = t.topWall;
    const bottomWall = t.bottomWall;

    // ================= CUSTOM =================
    if (mode === "custom") {
      if (mainWall) {
        const light = wallMid(mainWall);
        add("elec_light", light.x, light.y);
      }
      if (entryWall) {
        const sw = wallMid(entryWall);
        add("elec_switch", sw.x, sw.y);
      }
      continue; 
    }

    // ================= COST-EFFECTIVE =================
   // ================= COST-EFFECTIVE =================
   if (mode === "cost") {
    // 1. CEILING FAN (Always Central)
    add("elec_fan", center.x, center.y, "Fan");

    if (label.includes("kitchen")) {
        const rCenter = roomCenterPoint(r);
        
        // --- 2. THE "CLEAN" WALL (Opposite the Counter) ---
        // We use t.longestWall as the base for the opposite calculation
        let counterWall = null;
        if (t.counters && t.counters.length > 0) {
            const cMid = { x: (t.counters[0].x1 + t.counters[0].x2)/2, y: (t.counters[0].y1 + t.counters[0].y2)/2 };
            counterWall = nearestWall(cMid.x, cMid.y, t.walls);
        }

        // Find the wall opposite the counter
        let oppWall = t.longestWall; 
        if (counterWall) {
            const cMid = wallMid(counterWall);
            oppWall = t.walls.reduce((prev, curr) => {
                const d1 = Math.hypot(wallMid(prev).x - cMid.x, wallMid(prev).y - cMid.y);
                const d2 = Math.hypot(wallMid(curr).x - cMid.x, wallMid(curr).y - cMid.y);
                return (d2 > d1) ? curr : prev;
            });
        }
if (oppWall) {
    const mid = wallMid(oppWall);
    const rCenter = roomCenterPoint(r);
    
    // 1. Orientation & Inward Push
    const isH = Math.abs(oppWall.x2 - oppWall.x1) > Math.abs(oppWall.y2 - oppWall.y1);
    const pushX = rCenter.x > mid.x ? 15 : -15;
    const pushY = rCenter.y > mid.y ? 15 : -15;

    // 2. Identify wall boundaries and length
    const xMin = Math.min(oppWall.x1, oppWall.x2);
    const yMin = Math.min(oppWall.y1, oppWall.y2);
    const len = wallLength(oppWall);

    // 3. Spacing Percentages (Matches Standard logic)
    const lightPos = 0.25;  // 25% along the wall
    const fridgePos = 0.60; // 60% along the wall
    const switchPos = 0.85; // 85% along the wall (At the far end)

    if (isH) {
        // --- HORIZONTAL WALL ---
        add("elec_light", xMin + (len * lightPos), yMin + pushY, "Main Light");
        add("elec_socket", xMin + (len * fridgePos), yMin + pushY, "Fridge");
        add("elec_switch", xMin + (len * switchPos), yMin + pushY, "Main Switch");
    } else {
        // --- VERTICAL WALL ---
        add("elec_light", xMin + pushX, yMin + (len * lightPos), "Main Light");
        add("elec_socket", xMin + pushX, yMin + (len * fridgePos), "Fridge");
        add("elec_switch", xMin + pushX, yMin + (len * switchPos), "Main Switch");
    }
}
        // --- 3. THE "WORK" ZONE (Sides of Sink) ---
       // --- 3. THE "WORK" ZONE (One set on the Main Counter) ---
if (t.counters && t.counters.length > 0) {
    const mc = t.counters[0]; // Take only the first (main) counter
    const rCenter = roomCenterPoint(r);
    
    // Find boundaries
    const xMin = Math.min(mc.x1, mc.x2);
    const xMax = Math.max(mc.x1, mc.x2);
    const yMin = Math.min(mc.y1, mc.y2);
    const yMax = Math.max(mc.y1, mc.y2);
    const len = wallLength(mc);
    
    // Orientation & Inward Push
    const isH = Math.abs(mc.x2 - mc.x1) > Math.abs(mc.y2 - mc.y1);
    const pushX = rCenter.x > (xMin + xMax) / 2 ? 12 : -12;
    const pushY = rCenter.y > (yMin + yMax) / 2 ? 12 : -12;

    if (isH) {
        // --- HORIZONTAL COUNTER ---
        // Mixi at one end (30px margin)
        add("elec_socket", xMin + 30, yMin + pushY, "Mixi");
        // General Socket at the other end (30px margin)
        add("elec_socket", xMax - 30, yMin + pushY, "General Socket");
    } else {
        // --- VERTICAL COUNTER ---
        // Mixi at the top end
        add("elec_socket", xMin + pushX, yMin + 30, "Mixi");
        // General Socket at the bottom end
        add("elec_socket", xMax + pushX, yMax - 30, "General Socket");
    }
}
    } else {
        // Simple default for other rooms in Cost mode
        if (mainWall) add("elec_light", wallMid(mainWall).x, wallMid(mainWall).y, "Main Light");
        if (entryWall) add("elec_switch", wallMid(entryWall).x, wallMid(entryWall).y, "Switch");
    }
}


// ================= CUSTOM SECTION =================
if (mode === "custom") {
    const rCenter = roomCenterPoint(r);
    
    // 1. CUSTOM AMBIENCE: 3-Point Lighting (Professional Look)
    if (oppositeWall) {
        const len = wallLength(oppositeWall);
        const xMin = Math.min(oppositeWall.x1, oppositeWall.x2);
        const yMin = Math.min(oppositeWall.y1, oppositeWall.y2);
        const pushX = rCenter.x > xMin ? 15 : -15;
        const pushY = rCenter.y > yMin ? 15 : -15;
        const isH = Math.abs(oppositeWall.x2 - oppositeWall.x1) > Math.abs(oppositeWall.y2 - oppositeWall.y1);

        // Place 3 balanced lights for a high-end custom feel
        [0.2, 0.5, 0.8].forEach((pos, index) => {
            if (isH) {
                add("elec_light", xMin + (len * pos), yMin + pushY, `Custom Light ${index + 1}`);
            } else {
                add("elec_light", xMin + pushX, yMin + (len * pos), `Custom Light ${index + 1}`);
            }
        });
    }

    // 2. CUSTOM APPLIANCE HUB: Grouped Power
    if (label.includes("kitchen")) {
        // Find the corner where entryWall and oppositeWall meet
        if (entryWall && oppositeWall) {
            const cornerX = Math.max(entryWall.x1, entryWall.x2);
            const cornerY = Math.max(entryWall.y1, entryWall.y2);
            
            // Place a Heavy Duty Hub for Fridge + Microwave + Grinder
            add("elec_socket", cornerX - 40, cornerY - 40, "Appliance Hub (32A)");
        }

        // 3. ISLAND/CENTER POWER: Only if the room is large enough
        const roomArea = Math.abs((r.x2 - r.x1) * (r.y2 - r.y1));
        if (roomArea > 50000) { // Example threshold for a large kitchen
             add("elec_socket", center.x, center.y, "Island Floor Socket");
        }
    }

    // 4. SMART SWITCH: Double Switch for Home Automation
    if (entryWall) {
        const mid = wallMid(entryWall);
        add("elec_switch", mid.x, mid.y, "Smart Panel");
    }
}
    // ================= STANDARD (INTELLIGENT) =================
    if (mode === "standard") {
      // Basic Lighting & Fan
      
     
    if (label.includes("kitchen")) {
    const rCenter = roomCenterPoint(t.room);

    // --- 1. LIGHTS & FRIDGE (Attached to the Same Opposite Wall) ---
    let counterWall = null;
    if (t.counters.length > 0) {
        const cMid = { x: (t.counters[0].x1 + t.counters[0].x2)/2, y: (t.counters[0].y1 + t.counters[0].y2)/2 };
        counterWall = nearestWall(cMid.x, cMid.y, t.walls);
    }

    let oppositeWall = t.longestWall; 
    if (counterWall) {
        const cMid = wallMid(counterWall);
        oppositeWall = t.walls.reduce((prev, curr) => {
            const d1 = Math.hypot(wallMid(prev).x - cMid.x, wallMid(prev).y - cMid.y);
            const d2 = Math.hypot(wallMid(curr).x - cMid.x, wallMid(curr).y - cMid.y);
            return (d2 > d1) ? curr : prev;
        });
    }

   if (oppositeWall) {
        const mid = wallMid(oppositeWall);
        const rCenter = roomCenterPoint(t.room);
        const isH = Math.abs(oppositeWall.x2 - oppositeWall.x1) > Math.abs(oppositeWall.y2 - oppositeWall.y1);
        
        const pushX = rCenter.x > mid.x ? 15 : -15;
        const pushY = rCenter.y > mid.y ? 15 : -15;

        const xMin = Math.min(oppositeWall.x1, oppositeWall.x2);
        const yMin = Math.min(oppositeWall.y1, oppositeWall.y2);
        const len = wallLength(oppositeWall);

        // Define consistent spacing percentages
        const lightPos = 0.25;  // 25% along the wall
        const fridgePos = 0.60; // 60% along the wall
        const switchPos = 0.80; // 80% along the wall (A bit away from the fridge)

        if (isH) {
            // --- HORIZONTAL WALL ---
            add("elec_light", xMin + (len * lightPos), yMin + pushY, "Main Light");
            add("elec_socket", xMin + (len * fridgePos), yMin + pushY, "Fridge");
            // Switch is placed at 80% of the wall, keeping it away from the fridge
            add("elec_switch", xMin + (len * switchPos), yMin + pushY, "Main Switch Board");
        } else {
            // --- VERTICAL WALL ---
            add("elec_light", xMin + pushX, yMin + (len * lightPos), "Main Light");
            add("elec_socket", xMin + pushX, yMin + (len * fridgePos), "Fridge");
            // Switch is placed at 80% of the wall height
            add("elec_switch", xMin + pushX, yMin + (len * switchPos), "Main Switch Board");
        }
    }

 // --- 4. MAIN SWITCH BOARD (Placed exactly at the Door) ---
   // --- 4. MAIN SWITCH BOARD (Placed at the end of the Entry Wall) ---

    // --- 2. MIXI & OVEN (Follows Counter Orientation) ---
    if (t.counters.length > 0) {
        const mc = t.counters[0];
        const mcMid = { x: (mc.x1 + mc.x2)/2, y: (mc.y1 + mc.y2)/2 };
        const mcIsH = Math.abs(mc.x2 - mc.x1) > Math.abs(mc.y2 - mc.y1);
        const mcLen = Math.hypot(mc.x2 - mc.x1, mc.y2 - mc.y1);
        
        const pushX = rCenter.x > mcMid.x ? 12 : -12;
        const pushY = rCenter.y > mcMid.y ? 12 : -12;

        if (mcIsH) {
            // Horizontal Placement
            add("elec_socket", mc.x1 + (mcLen * 0.2), mc.y1 + pushY, "Mixi");
            add("elec_socket", mc.x1 + (mcLen * 0.8), mc.y1 + pushY, "Oven");
        } else {
            // Vertical Placement
            add("elec_socket", mc.x1 + pushX, mc.y1 + (mcLen * 0.2), "Mixi");
            add("elec_socket", mc.x1 + pushX, mc.y1 + (mcLen * 0.8), "Oven");
        }
    }

    // --- 3. GENERAL SOCKETS (Any Extra Counters) ---
    // 3. GENERAL SOCKETS (At the ends of any extra counters)
    for (let i = 1; i < t.counters.length; i++) {
        const ec = t.counters[i];
        
        // Find boundaries
        const xMin = Math.min(ec.x1, ec.x2);
        const xMax = Math.max(ec.x1, ec.x2);
        const yMin = Math.min(ec.y1, ec.y2);
        const yMax = Math.max(ec.y1, ec.y2);
        
        // Midpoint and Orientation
        const ecMid = { x: (xMin + xMax) / 2, y: (yMin + yMax) / 2 };
        const isH = Math.abs(ec.x2 - ec.x1) > Math.abs(ec.y2 - ec.y1);
        
        // Push inward toward room center
        const pushX = rCenter.x > ecMid.x ? 12 : -12;
        const pushY = rCenter.y > ecMid.y ? 12 : -12;

        if (isH) {
            // --- HORIZONTAL EXTRA COUNTER ---
            // Socket at Left End
            add("elec_socket", xMin + 20, yMin + pushY, "General Socket");
            // Socket at Right End
            
        } else {
            // --- VERTICAL EXTRA COUNTER ---
            // Socket at Top End
            add("elec_socket", xMin + pushX, yMin + 20, "General Socket");
            // Socket at Bottom End
            
        }
    }

    // --- 4. SINK LIGHT & FAN ---
    add("elec_fan", center.x, center.y, "Fan");
    t.sinks.forEach(sink => {
        add("elec_light", (sink.x1 + sink.x2) / 2, Math.min(sink.y1, sink.y2) + 5, "Sink Light");
    });
}
      

      
    }
}

  return elec;
}



// ============================
// DRAW ROOMS + WALLS
// ============================
function drawWallsAndRooms(objects) {
  for (const o of objects) {
    if (o.type !== "room") continue;
    const x = Math.min(o.x1, o.x2);
    const y = Math.min(o.y1, o.y2);
    const w = Math.abs(o.x2 - o.x1);
    const h = Math.abs(o.y2 - o.y1);

    pctx.fillStyle = "rgba(59,130,246,0.08)";
    pctx.fillRect(x, y, w, h);

    pctx.strokeStyle = "rgba(34,211,238,0.55)";
    pctx.lineWidth = 2;
    pctx.strokeRect(x, y, w, h);

    pctx.fillStyle = "rgba(229,231,235,0.85)";
    pctx.font = "12px Segoe UI";
    pctx.fillText(o.label || "Room", x + 8, y + 16);
  }

  for (const o of objects) {
    if (o.type !== "wall") continue;
    pctx.strokeStyle = "rgba(34,211,238,0.85)";
    pctx.lineWidth = 8;
    pctx.beginPath();
    pctx.moveTo(o.x1, o.y1);
    pctx.lineTo(o.x2, o.y2);
    pctx.stroke();
  }
}

// ============================
// CAD ELECTRICAL SYMBOLS
// ============================

function drawLightSymbol(x, y) {
  pctx.shadowBlur = 8;
  pctx.shadowColor = "#EAB308";

  pctx.strokeStyle = "#EAB308";
  pctx.lineWidth = 2;

  pctx.beginPath();
  pctx.arc(x, y, 12, 0, Math.PI * 2);
  pctx.stroke();

  pctx.beginPath();
  pctx.moveTo(x - 8, y);
  pctx.lineTo(x + 8, y);
  pctx.moveTo(x, y - 8);
  pctx.lineTo(x, y + 8);
  pctx.stroke();

  pctx.shadowBlur = 0;
}

function drawSwitchSymbol(x, y) {
  pctx.shadowBlur = 6;
  pctx.shadowColor = "#22D3EE";

  pctx.strokeStyle = "#22D3EE";
  pctx.lineWidth = 2;

  pctx.strokeRect(x - 10, y - 6, 20, 12);

  pctx.beginPath();
  pctx.moveTo(x - 6, y);
  pctx.lineTo(x + 6, y);
  pctx.stroke();

  pctx.shadowBlur = 0;
}

function drawSocketSymbol(x, y) {
  pctx.shadowBlur = 6;
  pctx.shadowColor = "#A3E635";

  pctx.strokeStyle = "#A3E635";
  pctx.lineWidth = 2;

  pctx.strokeRect(x - 10, y - 10, 20, 20);

  pctx.beginPath();
  pctx.arc(x - 4, y, 2, 0, Math.PI * 2);
  pctx.arc(x + 4, y, 2, 0, Math.PI * 2);
  pctx.fillStyle = "#A3E635";
  pctx.fill();

  pctx.shadowBlur = 0;
}

function drawExhaustSymbol(x, y) {
  pctx.shadowBlur = 6;
  pctx.shadowColor = "#FB923C";

  pctx.strokeStyle = "#FB923C";
  pctx.lineWidth = 2;

  pctx.strokeRect(x - 12, y - 12, 24, 24);

  pctx.beginPath();
  pctx.moveTo(x, y);
  pctx.lineTo(x + 8, y - 8);
  pctx.moveTo(x, y);
  pctx.lineTo(x - 8, y - 8);
  pctx.moveTo(x, y);
  pctx.lineTo(x + 8, y + 8);
  pctx.moveTo(x, y);
  pctx.lineTo(x - 8, y + 8);
  pctx.stroke();

  pctx.shadowBlur = 0;
}

function drawElectrical(points) {
  for (const p of points) {
    // ... your existing switch/light/exhaust drawing ...
    if (p.type === "elec_light") drawLightSymbol(p.x, p.y);
    if (p.type === "elec_switch") drawSwitchSymbol(p.x, p.y);
    if (p.type === "elec_socket") drawSocketSymbol(p.x, p.y);
    if (p.type === "elec_exhaust") drawExhaustSymbol(p.x, p.y);

    // ✅ ADD LABELS (Understandable Way)
    if (p.label) {
      pctx.shadowBlur = 0;
      pctx.fillStyle = "#E5E7EB";
      pctx.font = "bold 10px Segoe UI";
      pctx.textAlign = "center";
      pctx.fillText(p.label, p.x, p.y - 18); // Place text above symbol
    }
  }
}

// ============================
// PREVIEW RENDER
// ============================
function drawPreview() {
  drawGrid();
  drawWallsAndRooms(planObjects);

  const points = generateElectrical(planObjects, selectedTemplate);
  drawElectrical(points);
}

// ============================
// LOAD PLAN
// ============================
async function loadPlan() {
  const res = await fetch(`/load-plan/${PLAN_ID}`);
  const data = await res.json();

  planObjects = data.canvasObjects || [];

  resizePreviewCanvas();
  selectTemplate("cost");
}

function selectTemplate(mode) {
  selectedTemplate = mode;

  document.getElementById("card-cost").classList.remove("active");
  document.getElementById("card-custom").classList.remove("active");
  document.getElementById("card-standard").classList.remove("active");

  document.getElementById(`card-${mode}`).classList.add("active");

  const badge = document.getElementById("templateBadge");
  badge.textContent =
    mode === "cost" ? "Cost-Effective" :
    mode === "custom" ? "Custom" :
    "Standard";

  drawPreview();
}

function previewOnly() {
  drawPreview();
}

async function applySelectedTemplate() {
    // 1. Gather architecture and current electrical layout
    let updated = planObjects.filter(o => !String(o.type).startsWith("elec_"));
    const autoPoints = generateElectrical(planObjects, selectedTemplate);
    const finalPoints = (selectedTemplate === 'custom') ? [...autoPoints, ...window.customItems] : autoPoints;
    
    updated = [...updated, ...finalPoints];

    // 2. Save to Database
    const res = await fetch(`/save-plan/${PLAN_ID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
    });

    if (res.ok) {
        // 3. Redirect to the new Wiring Analysis & BOM Page
        window.location.href = `/wiring/${PLAN_ID}`;
    } else {
        alert("Error saving plan. Please try again.");
    }
}

window.selectTemplate = selectTemplate;
window.previewOnly = previewOnly;
window.applySelectedTemplate = applySelectedTemplate;


loadPlan();
