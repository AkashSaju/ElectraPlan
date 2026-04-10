const PLAN_ID = Number(window.PLAN_ID);

const previewCanvas = document.getElementById("previewCanvas");
const pctx = previewCanvas.getContext("2d");

let planObjects = [];
window.selectedTemplate = "cost";


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

    // ================= CUSTOM SECTION (FIXED) =================
    if (mode === "custom") {
      const rCenter = roomCenterPoint(r);

      // --- FIX: Define oppositeWall for Custom Mode ---
      let oppositeWall = t.longestWall; 
      if (t.counters && t.counters.length > 0) {
          const cMid = { x: (t.counters[0].x1 + t.counters[0].x2)/2, y: (t.counters[0].y1 + t.counters[0].y2)/2 };
          const counterWall = nearestWall(cMid.x, cMid.y, t.walls);
          if (counterWall) {
              const cwMid = wallMid(counterWall);
              oppositeWall = t.walls.reduce((prev, curr) => {
                  const d1 = Math.hypot(wallMid(prev).x - cwMid.x, wallMid(prev).y - cwMid.y);
                  const d2 = Math.hypot(wallMid(curr).x - cwMid.x, wallMid(curr).y - cwMid.y);
                  return (d2 > d1) ? curr : prev;
              });
          }
      }

      // 1. CUSTOM AMBIENCE: 3-Point Lighting
      if (oppositeWall) {
        const len = wallLength(oppositeWall);
        const xMin = Math.min(oppositeWall.x1, oppositeWall.x2);
        const yMin = Math.min(oppositeWall.y1, oppositeWall.y2);
        const pushX = rCenter.x > xMin ? 15 : -15;
        const pushY = rCenter.y > yMin ? 15 : -15;
        const isH = Math.abs(oppositeWall.x2 - oppositeWall.x1) > Math.abs(oppositeWall.y2 - oppositeWall.y1);

        [0.2, 0.5, 0.8].forEach((pos, index) => {
          if (isH) {
            add("elec_light", xMin + (len * pos), yMin + pushY, `Custom Light ${index + 1}`);
          } else {
            add("elec_light", xMin + pushX, yMin + (len * pos), `Custom Light ${index + 1}`);
          }
        });
      }

      // 2. CUSTOM APPLIANCE HUB
      if (label.includes("kitchen")) {
        if (entryWall && oppositeWall) {
          const cornerX = Math.max(entryWall.x1, entryWall.x2);
          const cornerY = Math.max(entryWall.y1, entryWall.y2);
          add("elec_socket", cornerX - 40, cornerY - 40, "Appliance Hub (32A)");
        }
        const roomArea = Math.abs((r.x2 - r.x1) * (r.y2 - r.y1));
        if (roomArea > 50000) {
          add("elec_socket", center.x, center.y, "Island Floor Socket");
        }
      }

      // 3. SMART SWITCH
      if (entryWall) {
        const mid = wallMid(entryWall);
        add("elec_switch", mid.x, mid.y, "Smart Panel");
      }
      continue; // Custom mode finished, skip other modes
    }
    // ================= COST-EFFECTIVE =================
   // ================= COST-EFFECTIVE =================
   if (mode === "cost") {
    // 1. CEILING FAN (Always Central)
    // Fan removed as requested

    if (label.includes("kitchen")) {
        const rCenter = roomCenterPoint(r);
        // Add centered ceiling fan exclusively for kitchen in Cost mode
        add("elec_fan", center.x, center.y, "Fan");
        
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



    // ================= STANDARD (INTELLIGENT) =================
    if (mode === "standard") {
      // Basic Lighting & Fan
      
     
    if (label.includes("kitchen")) {
    const rCenter = roomCenterPoint(t.room);

    // Add centered ceiling fan exclusively for kitchen in Standard mode
    add("elec_fan", center.x, center.y, "Fan");

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
    // Fan removed as requested
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

function drawFanSymbol(x, y) {
  pctx.shadowBlur = 6;
  pctx.shadowColor = "#3B82F6";

  pctx.strokeStyle = "#3B82F6";
  pctx.lineWidth = 2;

  pctx.beginPath();
  pctx.arc(x, y, 10, 0, Math.PI * 2);
  pctx.stroke();

  pctx.beginPath();
  pctx.moveTo(x, y);
  pctx.lineTo(x, y - 8);
  pctx.moveTo(x, y);
  pctx.lineTo(x + 7, y + 4);
  pctx.moveTo(x, y);
  pctx.lineTo(x - 7, y + 4);
  pctx.stroke();

  pctx.shadowBlur = 0;
}

// ============================
// POP-IN ANIMATION ENGINE
// ============================
// Tracks animation state per-point id:  { scale, startTime }
window._animStates = {};
const ANIM_DURATION = 450; // ms total for full bounce

// Easing: elastic overshoot — snaps past 1.0 then settles
function easeOutElastic(t) {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1
        : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

// Called when template changes or item placed — seeds fresh animation
function triggerPopIn(points) {
    const now = performance.now();
    points.forEach((p, i) => {
        // Stagger each component by 30ms so they cascade in rather than all at once
        window._animStates[p.id] = { startTime: now + i * 30, done: false };
    });
}

// Checks if at least one point is still animating
function isAnimating() {
    const now = performance.now();
    return Object.values(window._animStates).some(s => !s.done && now < s.startTime + ANIM_DURATION + 100);
}

function getScale(p) {
    const state = window._animStates[p.id];
    if (!state) return 1; // fully rendered, no animation
    const now = performance.now();
    const elapsed = now - state.startTime;
    if (elapsed < 0) return 0;  // not started yet (stagger delay)
    if (elapsed >= ANIM_DURATION) { state.done = true; return 1; }
    return easeOutElastic(elapsed / ANIM_DURATION);
}

function drawElectrical(points) {
  for (const p of points) {
    const scale = getScale(p);
    if (scale <= 0) continue; // not yet visible during stagger

    // Apply scale transform centered on the point
    pctx.save();
    pctx.translate(p.x, p.y);
    pctx.scale(scale, scale);
    pctx.translate(-p.x, -p.y);

    pctx.globalAlpha = Math.min(1, scale);

    if (window.selectedTemplate === "custom") {
        if (p.type.includes("light")) drawLightSymbol(p.x, p.y);
        else if (p.type.includes("switch")) drawSwitchSymbol(p.x, p.y);
        else if (p.type.includes("socket")) drawSocketSymbol(p.x, p.y);
        else if (p.type.includes("exhaust")) drawExhaustSymbol(p.x, p.y);
        else if (p.type.includes("fan")) drawFanSymbol(p.x, p.y);
    } else {
        if (p.type === "elec_light") drawLightSymbol(p.x, p.y);
        if (p.type === "elec_switch") drawSwitchSymbol(p.x, p.y);
        if (p.type === "elec_socket") drawSocketSymbol(p.x, p.y);
        if (p.type === "elec_exhaust") drawExhaustSymbol(p.x, p.y);
        if (p.type === "elec_fan") drawFanSymbol(p.x, p.y);
    }

    pctx.restore();
    pctx.globalAlpha = 1;

    // Labels draw at full opacity after component appears
    if (p.label && scale > 0.5) {
      pctx.shadowBlur = 0;
      pctx.fillStyle = `rgba(229, 231, 235, ${Math.min(1, (scale - 0.5) * 2)})`;
      pctx.font = "bold 10px Segoe UI";
      pctx.textAlign = "center";
      pctx.fillText(p.label, p.x, p.y - 18);
    }
  }
}

// ============================
// PREVIEW RENDER
// ============================
function drawPreview() {
    pctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    drawGrid();
    drawWallsAndRooms(planObjects);

    let pointsToDraw = [];

    if (selectedTemplate === 'custom' && typeof CustomModule !== 'undefined') {
        // Only draw Akash's manual/edited points
        pointsToDraw = CustomModule.getPoints(); 
    } else {
        // Only draw the computer's calculated points
        pointsToDraw = generateElectrical(planObjects, selectedTemplate);
    }

    
    // NIGHT MODE SIMULATION OVERLAY
    if (window.isNightMode) {
        pctx.fillStyle = "rgba(10, 15, 30, 0.95)";
        pctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
        
        // Use 'screen' to beautifully blend light overlaps and brighten the dark floorplan underneath
        pctx.globalCompositeOperation = "screen";
        pointsToDraw.forEach(p => {
            if (p.type.includes('light')) {
                // Parse label to determine specific light type
                const isSink = p.label && p.label.toLowerCase().includes('sink');
                
                // Sink lights are focused spotlights, Main lights are larger floodlights
                const radius = isSink ? 110 : 160; 
                const radgrad = pctx.createRadialGradient(p.x, p.y, 5, p.x, p.y, radius);
                
                if (isSink) {
                    // Warm Ambient Sink Light (Reduced Intensity)
                    radgrad.addColorStop(0, "rgba(255, 230, 150, 0.75)"); 
                    radgrad.addColorStop(0.3, "rgba(255, 200, 100, 0.25)"); 
                    radgrad.addColorStop(1, "rgba(255, 180, 50, 0)");
                } else {
                    // Crisp Daylight/White Main Light (Reduced Intensity)
                    radgrad.addColorStop(0, "rgba(255, 255, 255, 0.75)"); 
                    radgrad.addColorStop(0.3, "rgba(225, 235, 255, 0.25)"); 
                    radgrad.addColorStop(1, "rgba(200, 220, 255, 0)");
                }
                
                pctx.fillStyle = radgrad;
                pctx.beginPath();
                pctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                pctx.fill();
            }
        });
        // Reset composite operation so CAD symbols draw normally on top
        pctx.globalCompositeOperation = "source-over";
    }

    drawElectrical(pointsToDraw);

    // UX Enhancement: Display selected mode deeply on the canvas overlay
    pctx.fillStyle = "rgba(148, 163, 184, 0.8)";
    pctx.font = "bold 16px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
    pctx.textAlign = "right";
    
    let modeLabel = "Cost Effective Layout";
    if (selectedTemplate === "standard") modeLabel = "Standard Intelligent Layout";
    if (selectedTemplate === "premium") modeLabel = "Premium Luxury Layout";
    if (selectedTemplate === "custom") modeLabel = "Custom Designer Layout";
    
    pctx.shadowColor = "rgba(0,0,0,0.8)";
    pctx.shadowBlur = 4;
    pctx.fillText(modeLabel, previewCanvas.width - 20, 30);
    pctx.shadowBlur = 0;

    // Draw wall hover highlight if Elevation Mode is active
    if (typeof drawElevationHoverHighlight === 'function') drawElevationHoverHighlight();
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
    window.selectedTemplate = mode;
    window._animStates = {}; // Reset all animation states on template switch
    
    const toolbox = document.getElementById('customToolsPanel');
    if (mode === 'custom') {
        toolbox.style.display = 'block';
        CustomModule.init(planObjects); 
    } else {
        toolbox.style.display = 'none';
    }

    // Seed pop-in animation for the newly generated points
    const pts = mode === 'custom' && typeof CustomModule !== 'undefined'
        ? CustomModule.getPoints()
        : generateElectrical(planObjects, mode);
    triggerPopIn(pts);

    // Run the animation loop until all components have settled
    function animLoop() {
        drawPreview();
        if (isAnimating()) requestAnimationFrame(animLoop);
    }
    animLoop();
}

function previewOnly() {
  drawPreview();
}

window.isNightMode = false;
function toggleNightMode() {
    window.isNightMode = !window.isNightMode;
    const btn = document.getElementById("nightModeBtn");
    if (window.isNightMode) {
        btn.style.background = "var(--success-neon)";
        btn.style.color = "#000";
        btn.innerHTML = "☀️ Return to Day Mode";
    } else {
        btn.style.background = "rgba(30, 41, 59, 0.8)";
        btn.style.color = "#fff";
        btn.innerHTML = "🌙 Simulate Lights";
    }
    drawPreview();
}

async function applySelectedTemplate() {
  // 1. Remove old electrical points from the list to prevent doubles
  let updated = planObjects.filter(o => !String(o.type).startsWith("elec_"));
  
  // 2. Decide what points to save based on the active template
  let finalPoints = [];
  if (selectedTemplate === 'custom') {
    finalPoints = CustomModule.getPoints(); // Get Akash's hand-placed points
  } else {
    finalPoints = generateElectrical(planObjects, selectedTemplate); // Get auto-points
  }

  // 3. Combine architecture with the new electrical points
  updated = [...updated, ...finalPoints];

  // 4. Save to Database and Go to Wiring Page
  const res = await fetch(`/save-plan/${PLAN_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated)
  });

  if (res.ok) {
    window.location.href = `/wiring/${PLAN_ID}?mode=${selectedTemplate}`;
  } else {
    alert("Error saving. Please try again.");
  }
}

function setActiveTool(tool) {
  // Tell the Custom Brain which tool we are holding
  CustomModule.setTool(tool);
  
  // Visual Feedback: Make the clicked button look active
  document.querySelectorAll('.btn').forEach(b => b.classList.remove('active-tool'));
  if (event && event.target) {
    event.target.classList.add('active-tool');
  }
}

window.selectTemplate = selectTemplate;
window.setActiveTool = setActiveTool;
window.applySelectedTemplate = applySelectedTemplate;
window.toggleNightMode = toggleNightMode;

// ============================
// WALL ELEVATION VIEW ENGINE
// ============================
window.isElevationMode = false;
let _elevHoverWall = null; // The wall currently under mouse

function toggleElevationMode() {
    window.isElevationMode = !window.isElevationMode;
    const btn = document.getElementById('elevBtn');
    const canvas = document.getElementById('previewCanvas');

    if (window.isElevationMode) {
        btn.style.background = '#a78bfa';
        btn.style.color = '#000';
        btn.innerHTML = '🧱 Click a Wall…';
        canvas.classList.add('elevation-mode');
    } else {
        btn.style.background = 'rgba(30, 41, 59, 0.8)';
        btn.style.color = '#a78bfa';
        btn.innerHTML = '🧱 Wall Elevation';
        canvas.classList.remove('elevation-mode');
        _elevHoverWall = null;
        drawPreview(); // Clean up any hover highlight
    }
}

function closeElevation() {
    document.getElementById('elevationModal').classList.remove('open');
    window.isElevationMode = false;
    toggleElevationMode(); // Reset button state cleanly
}

// Returns the nearest wall object and its distance to a point
function findNearestWallToPoint(px, py, walls) {
    let nearest = null, nearestDist = Infinity;
    walls.forEach(w => {
        // Project point onto wall segment
        const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
        const len2 = dx*dx + dy*dy;
        let t = len2 > 0 ? ((px - w.x1)*dx + (py - w.y1)*dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const cx = w.x1 + t*dx, cy = w.y1 + t*dy;
        const dist = Math.hypot(px - cx, py - cy);
        if (dist < nearestDist) { nearestDist = dist; nearest = w; }
    });
    return { wall: nearest, dist: nearestDist };
}

// Hook canvas mousemove for wall hover highlight in elevation mode
previewCanvas.addEventListener('mousemove', (e) => {
    if (!window.isElevationMode) return;
    const rect = previewCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const walls = planObjects.filter(o => o.type === 'wall');
    if (walls.length === 0) return;

    const { wall, dist } = findNearestWallToPoint(mx, my, walls);
    if (dist < 35) {
        _elevHoverWall = wall;
    } else {
        _elevHoverWall = null;
    }
    drawPreview(); // Redraw with hover highlight
});

// Hook canvas click to open elevation when in elevation mode
previewCanvas.addEventListener('click', (e) => {
    if (!window.isElevationMode) return;
    const rect = previewCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const walls = planObjects.filter(o => o.type === 'wall');
    if (walls.length === 0) return;

    const { wall, dist } = findNearestWallToPoint(mx, my, walls);
    if (dist < 50 && wall) {
        drawElevation(wall);
    }
});

// Called from drawPreview to overlay the hover highlight on canvas
function drawElevationHoverHighlight() {
    if (!window.isElevationMode || !_elevHoverWall) return;
    const w = _elevHoverWall;
    pctx.beginPath();
    pctx.moveTo(w.x1, w.y1);
    pctx.lineTo(w.x2, w.y2);
    pctx.strokeStyle = '#a78bfa';
    pctx.lineWidth = 5;
    pctx.shadowColor = 'rgba(167, 139, 250, 0.8)';
    pctx.shadowBlur = 14;
    pctx.stroke();
    pctx.shadowBlur = 0;

    // Tooltip hint
    const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
    pctx.fillStyle = 'rgba(167, 139, 250, 0.9)';
    pctx.font = 'bold 11px Inter, sans-serif';
    pctx.textAlign = 'center';
    pctx.fillText('Click to view elevation ↑', mx, my - 12);
}

/**
 * THE ELEVATION DRAWING ENGINE
 * Renders a professional 2D front-face wall elevation with components at real mounting heights.
 */
function drawElevation(wall) {
    const modal = document.getElementById('elevationModal');
    const ec = document.getElementById('elevationCanvas');
    const label = document.getElementById('elevWallLabel');

    modal.classList.add('open');

    // Determine wall geometry
    const wallLenPx = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    const wallLenM  = (wallLenPx / 40).toFixed(1); // 40px = 1 meter

    label.textContent = `Wall Length: ${wallLenM} m  ·  Click any wall on the floor plan to switch view`;

    // Set canvas size to match panel
    ec.width  = ec.offsetWidth || 800;
    ec.height = 320;
    const ctx2 = ec.getContext('2d');

    // ---- CONSTANTS ----
    const ROOM_HEIGHT_M  = 2.75; // Standard Kerala room height
    const PAD_L = 50, PAD_R = 30, PAD_T = 30, PAD_B = 50;
    const drawW = ec.width  - PAD_L - PAD_R;
    const drawH = ec.height - PAD_T - PAD_B;

    // Scale: pixels per meter
    const scaleX = drawW / parseFloat(wallLenM);
    const scaleY = drawH / ROOM_HEIGHT_M;

    // Helper: converts real-world position along wall and height to canvas coords
    const toCanvasX = (mFromLeft) => PAD_L + mFromLeft * scaleX;
    const toCanvasY = (mFromFloor) => PAD_T + drawH - mFromFloor * scaleY;

    // Background
    ctx2.fillStyle = '#060d1a';
    ctx2.fillRect(0, 0, ec.width, ec.height);

    // --- WALL FACE (brick-like texture) ---
    ctx2.fillStyle = '#1e293b';
    ctx2.strokeStyle = 'rgba(34,211,238,0.3)';
    ctx2.lineWidth = 1;
    ctx2.fillRect(PAD_L, PAD_T, drawW, drawH);
    ctx2.strokeRect(PAD_L, PAD_T, drawW, drawH);

    // Subtle brick rows
    ctx2.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let row = 0; row < 8; row++) {
        const y = PAD_T + (drawH / 8) * row;
        ctx2.beginPath(); ctx2.moveTo(PAD_L, y); ctx2.lineTo(PAD_L + drawW, y); ctx2.stroke();
    }
    for (let col = 0; col < 12; col++) {
        const x = PAD_L + (drawW / 12) * col;
        ctx2.beginPath(); ctx2.moveTo(x, PAD_T); ctx2.lineTo(x, PAD_T + drawH); ctx2.stroke();
    }

    // --- FLOOR & CEILING LINES ---
    ctx2.strokeStyle = '#a78bfa';
    ctx2.lineWidth = 2;
    ctx2.setLineDash([]);
    // Floor
    ctx2.beginPath(); ctx2.moveTo(PAD_L, toCanvasY(0)); ctx2.lineTo(PAD_L + drawW, toCanvasY(0)); ctx2.stroke();
    // Ceiling
    ctx2.beginPath(); ctx2.moveTo(PAD_L, toCanvasY(ROOM_HEIGHT_M)); ctx2.lineTo(PAD_L + drawW, toCanvasY(ROOM_HEIGHT_M)); ctx2.stroke();

    // --- HEIGHT LABELS (left axis) ---
    ctx2.fillStyle = '#64748b';
    ctx2.font = '10px Inter, sans-serif';
    ctx2.textAlign = 'right';
    [0, 0.5, 1.0, 1.2, 1.4, 2.0, ROOM_HEIGHT_M].forEach(h => {
        const cy = toCanvasY(h);
        ctx2.beginPath();
        ctx2.moveTo(PAD_L - 6, cy); ctx2.lineTo(PAD_L, cy);
        ctx2.strokeStyle = 'rgba(100,116,139,0.5)';
        ctx2.lineWidth = 1;
        ctx2.stroke();
        ctx2.fillText(`${h}m`, PAD_L - 8, cy + 4);
    });

    // --- FIND COMPONENTS ON THIS WALL ---
    const allPoints = selectedTemplate === 'custom' && typeof CustomModule !== 'undefined'
        ? CustomModule.getPoints()
        : generateElectrical(planObjects, selectedTemplate);

    // A component belongs to this wall if it's within 40px of the wall line
    const wallDx = wall.x2 - wall.x1, wallDy = wall.y2 - wall.y1;
    const wallLen2 = wallDx*wallDx + wallDy*wallDy;

    const onWallComponents = allPoints.filter(p => {
        if (wallLen2 === 0) return false;
        let t = ((p.x - wall.x1)*wallDx + (p.y - wall.y1)*wallDy) / wallLen2;
        t = Math.max(0, Math.min(1, t));
        const cx = wall.x1 + t*wallDx, cy = wall.y1 + t*wallDy;
        return Math.hypot(p.x - cx, p.y - cy) < 40;
    });

    // --- MOUNTING HEIGHT MAP ---
    const MOUNT_HEIGHTS = {
        elec_switch:        1.40,
        elec_light:         ROOM_HEIGHT_M - 0.05,
        elec_fan:           ROOM_HEIGHT_M - 0.15,
        elec_socket:        1.20,
        elec_socket_fridge: 0.50,
        elec_socket_mixi:   1.00,
        elec_socket_oven:   0.80,
        elec_socket_water:  1.80,
        elec_exhaust:       ROOM_HEIGHT_M - 0.30,
    };

    const COMP_COLORS = {
        elec_switch:        '#eab308',
        elec_light:         '#fde68a',
        elec_fan:           '#38bdf8',
        elec_socket:        '#3b82f6',
        elec_socket_fridge: '#3b82f6',
        elec_socket_mixi:   '#3b82f6',
        elec_socket_oven:   '#ef4444',
        elec_socket_water:  '#ef4444',
        elec_exhaust:       '#a3e635',
    };

    // Draw components on the elevation wall
    onWallComponents.forEach(p => {
        // Project where on the wall this component sits (0 = left end, wallLenM = right end)
        let t = wallLen2 > 0 ? ((p.x - wall.x1)*wallDx + (p.y - wall.y1)*wallDy) / wallLen2 : 0.5;
        t = Math.max(0.02, Math.min(0.98, t));
        const posAlongWall = t * parseFloat(wallLenM);
        const mountH = MOUNT_HEIGHTS[p.type] || 1.2;
        const color  = COMP_COLORS[p.type]   || '#94a3b8';

        const cx = toCanvasX(posAlongWall);
        const cy = toCanvasY(mountH);

        // Glow
        ctx2.shadowColor = color;
        ctx2.shadowBlur  = 12;

        // Draw component face-plate
        ctx2.fillStyle = color;
        if (p.type.includes('fan') || p.type.includes('light')) {
            // Circular ceiling mount
            ctx2.beginPath();
            ctx2.arc(cx, cy, 12, 0, Math.PI * 2);
            ctx2.fill();
        } else {
            // Rectangular wall box
            ctx2.fillRect(cx - 10, cy - 8, 20, 16);
        }
        ctx2.shadowBlur = 0;

        // Mounting height dashed line from floor
        ctx2.setLineDash([3, 4]);
        ctx2.strokeStyle = `${color}55`;
        ctx2.lineWidth = 1;
        ctx2.beginPath();
        ctx2.moveTo(cx, toCanvasY(0));
        ctx2.lineTo(cx, cy);
        ctx2.stroke();
        ctx2.setLineDash([]);

        // Label
        const lbl = (p.label || p.type.replace('elec_','').replace('socket_','')).toUpperCase();
        ctx2.fillStyle = '#f8fafc';
        ctx2.font = 'bold 9px Inter, sans-serif';
        ctx2.textAlign = 'center';
        ctx2.fillText(lbl, cx, cy + (p.type.includes('fan') || p.type.includes('light') ? 22 : 20));
        ctx2.fillStyle = color;
        ctx2.fillText(`${mountH.toFixed(1)}m`, cx, cy - (p.type.includes('fan') || p.type.includes('light') ? 18 : 14));
    });

    // "No components on this wall" message
    if (onWallComponents.length === 0) {
        ctx2.fillStyle = '#334155';
        ctx2.font = '13px Inter, sans-serif';
        ctx2.textAlign = 'center';
        ctx2.fillText('No electrical components found on this wall', ec.width / 2, ec.height / 2);
    }

    // Wall length dimension at the bottom
    ctx2.fillStyle = '#a78bfa';
    ctx2.font = 'bold 11px Inter, sans-serif';
    ctx2.textAlign = 'center';
    ctx2.fillText(`← ${wallLenM} m →`, PAD_L + drawW / 2, toCanvasY(0) + 30);
}

window.toggleElevationMode = toggleElevationMode;
window.closeElevation = closeElevation;
window.drawElevationHoverHighlight = drawElevationHoverHighlight;

loadPlan();

