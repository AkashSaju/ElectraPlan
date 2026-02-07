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

      // only base electrical
      if (mainWall) {
        const light = wallMid(mainWall);
        add("elec_light", light.x, light.y);
      }

      if (entryWall) {
        const sw = wallMid(entryWall);
        add("elec_switch", sw.x, sw.y);
      }

      // appliances will be placed manually
      continue;
    }

    // ================= COST =================
    if (mode === "cost") {

      // wall light
      if (mainWall) {
        const light = wallMid(mainWall);
        add("elec_light", light.x, light.y);
      }

      // fan center
      add("elec_fan", center.x, center.y);

      // switch
      if (entryWall) {
        const sw = wallMid(entryWall);
        add("elec_switch", sw.x, sw.y);
      }

      // minimal sockets
      if (label.includes("living") && mainWall) {
        const tv = wallMid(mainWall);
        add("elec_socket", tv.x, tv.y, "TV");
      }

      if (label.includes("kitchen") && bottomWall) {
        const fridge = wallMid(bottomWall);
        add("elec_socket", fridge.x, fridge.y, "Fridge");
      }

      if (label.includes("bath") && topWall) {
        const ex = wallMid(topWall);
        add("elec_exhaust", ex.x, ex.y);
      }
    }

    // ================= STANDARD =================
    if (mode === "standard") {

      // TWO wall lights
      if (mainWall) {
        const light1 = wallMid(mainWall);
        add("elec_light", light1.x, light1.y);

        add("elec_light", light1.x + 60, light1.y);
      }

      // FAN
      add("elec_fan", center.x, center.y);

      // SWITCH
      if (entryWall) {
        const sw = wallMid(entryWall);
        add("elec_switch", sw.x, sw.y);
      }

      // SOCKETS
      if (label.includes("living") && mainWall) {
        const tv = wallMid(mainWall);
        add("elec_socket", tv.x, tv.y, "TV");
      }

      if (label.includes("bedroom") && mainWall) {
        const charge = wallMid(mainWall);
        add("elec_socket", charge.x, charge.y, "Charging");
      }

      if (label.includes("kitchen")) {

        if (bottomWall) {
          const fridge = wallMid(bottomWall);
          add("elec_socket", fridge.x, fridge.y, "Fridge");
        }

        if (mainWall) {
          const mixi = wallMid(mainWall);
          add("elec_socket", mixi.x, mixi.y, "Mixi");
        }
      }

      if (label.includes("bath") && topWall) {
        const ex = wallMid(topWall);
        add("elec_exhaust", ex.x, ex.y);
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
    if (p.type === "elec_light") drawLightSymbol(p.x, p.y);
    if (p.type === "elec_switch") drawSwitchSymbol(p.x, p.y);
    if (p.type === "elec_socket") drawSocketSymbol(p.x, p.y);
    if (p.type === "elec_exhaust") drawExhaustSymbol(p.x, p.y);
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
  let updated = planObjects.filter(o => !String(o.type).startsWith("elec_"));

  const points = generateElectrical(planObjects, selectedTemplate);

  updated = [...updated, ...points];

  await fetch(`/save-plan/${PLAN_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated)
  });

  alert("Template applied ✅");
  window.location.href = `/editor/${PLAN_ID}`;
}

window.selectTemplate = selectTemplate;
window.previewOnly = previewOnly;
window.applySelectedTemplate = applySelectedTemplate;


loadPlan();
