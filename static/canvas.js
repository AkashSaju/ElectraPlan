const canvas = document.getElementById("designCanvas");
const ctx = canvas.getContext("2d");

let importedFilename = null;

/* ✅ Canvas Pan (Move View) */
let viewOffsetX = 0;
let viewOffsetY = 0;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let spaceDown = false;

/* ---------------- SCALE SETTINGS ----------------
   Requirement: 1 grid block = 1 meter
*/
let gridSize = 40;               // 40px = 1 meter
const WALL_THICKNESS_M = 0.15;   // 0.15m wall thickness
const DOOR_WIDTH_M = 0.9;        // 0.9m door width
const WINDOW_WIDTH_M = 1.2;      // default window width

const WALL_THICKNESS = WALL_THICKNESS_M * gridSize;   // px
const DOOR_WIDTH_PX = DOOR_WIDTH_M * gridSize;        // px
const WINDOW_WIDTH_PX = WINDOW_WIDTH_M * gridSize;    // px

let tool = "wall";
let canvasObjects = []; // walls, rooms, doors, windows
let selectedObject = null;

let isDrawing = false;
let startPoint = null;
let hoverPoint = null;

let isDragging = false;
let dragStart = null;

/* ---------------- CANVAS RESIZE ---------------- */
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  redraw();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* ---------------- UTILS ---------------- */
function snap(v) {
  return Math.round(v / gridSize) * gridSize;
}

function getMouse(e) {
  const rect = canvas.getBoundingClientRect();
  const rawX = e.clientX - rect.left;
  const rawY = e.clientY - rect.top;

  // ✅ Screen -> World (respect pan offset)
  const worldX = rawX - viewOffsetX;
  const worldY = rawY - viewOffsetY;

  return {
    x: snap(worldX),
    y: snap(worldY),
    rawX,
    rawY
  };
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function pixelsToMeters(px) {
  return px / gridSize;
}

/* ---------------- TOOL ---------------- */
function setTool(t) {
  tool = t;
  cancelDrawing();
  selectedObject = null;
  redraw();
}

/* ---------------- GRID ---------------- */
function drawGrid() {
  // Blueprint base
  ctx.fillStyle = "#0E1428";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = "rgba(34,211,238,0.12)";
  ctx.lineWidth = 1;

  for (let x = 0; x <= canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Major grid every 5 meters
  ctx.strokeStyle = "rgba(34,211,238,0.22)";
  for (let x = 0; x <= canvas.width; x += gridSize * 5) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += gridSize * 5) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

/* ---------------- DRAW WALL (THICK) ---------------- */
function drawWall(w, selected = false, dashed = false) {
  ctx.save();

  if (dashed) ctx.setLineDash([12, 8]);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = WALL_THICKNESS;

  // Outer stroke glow
  ctx.strokeStyle = selected ? "#A3E635" : "rgba(34,211,238,0.6)";
  ctx.shadowColor = selected ? "#A3E635" : "#22D3EE";
  ctx.shadowBlur = selected ? 18 : 10;

  ctx.beginPath();
  ctx.moveTo(w.x1, w.y1);
  ctx.lineTo(w.x2, w.y2);
  ctx.stroke();

  // Inner wall core
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(2, WALL_THICKNESS - 6);
  ctx.strokeStyle = "#11162A";
  ctx.beginPath();
  ctx.moveTo(w.x1, w.y1);
  ctx.lineTo(w.x2, w.y2);
  ctx.stroke();

  // Measurement label
  const lengthMeters = pixelsToMeters(dist(w.x1, w.y1, w.x2, w.y2));
  const midX = (w.x1 + w.x2) / 2;
  const midY = (w.y1 + w.y2) / 2;

  ctx.fillStyle = "#E5E7EB";
  ctx.font = "12px Segoe UI";
  ctx.fillText(`${lengthMeters.toFixed(1)} m`, midX + 8, midY - 8);

  ctx.restore();
}

/* ---------------- DRAW ROOM ---------------- */
function drawRoom(r, selected = false, dashed = false) {
  const x = Math.min(r.x1, r.x2);
  const y = Math.min(r.y1, r.y2);
  const w = Math.abs(r.x2 - r.x1);
  const h = Math.abs(r.y2 - r.y1);

  ctx.save();

  if (dashed) ctx.setLineDash([12, 8]);

  // Room fill
  ctx.fillStyle = "rgba(59,130,246,0.10)";
  ctx.fillRect(x, y, w, h);

  // Room border
  ctx.lineWidth = selected ? 3 : 2;
  ctx.strokeStyle = selected ? "#A3E635" : "rgba(34,211,238,0.75)";
  ctx.shadowColor = selected ? "#A3E635" : "#22D3EE";
  ctx.shadowBlur = selected ? 16 : 8;
  ctx.strokeRect(x, y, w, h);

  // Label
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#E5E7EB";
  ctx.font = "14px Segoe UI";
  ctx.fillText(r.label || "Room", x + 10, y + 22);

  // Dimensions in meters
  const wm = pixelsToMeters(w);
  const hm = pixelsToMeters(h);
  ctx.fillStyle = "rgba(229,231,235,0.85)";
  ctx.font = "12px Segoe UI";
  ctx.fillText(`${wm.toFixed(1)}m × ${hm.toFixed(1)}m`, x + 10, y + 40);

  ctx.restore();
}

/* ---------------- DOOR (rotation supported) ---------------- */
function drawDoor(d, selected = false) {
  ctx.save();

  ctx.strokeStyle = selected ? "#A3E635" : "#3B82F6";
  ctx.lineWidth = 3;
  ctx.shadowColor = selected ? "#A3E635" : "#22D3EE";
  ctx.shadowBlur = selected ? 16 : 8;

  const size = DOOR_WIDTH_PX;
  const angle = (d.rotation || 0) * (Math.PI / 180);

  ctx.translate(d.x, d.y);
  ctx.rotate(angle);

  // door base line
  ctx.beginPath();
  ctx.moveTo(-size / 2, 0);
  ctx.lineTo(size / 2, 0);
  ctx.stroke();

  // swing arc
  ctx.beginPath();
  ctx.arc(-size / 2, 0, size, 0, Math.PI / 2);
  ctx.stroke();

  ctx.restore();
}

/* ---------------- WINDOW ---------------- */
function drawWindow(win, selected = false) {
  ctx.save();

  ctx.strokeStyle = selected ? "#A3E635" : "#22D3EE";
  ctx.lineWidth = 6;
  ctx.shadowColor = selected ? "#A3E635" : "#22D3EE";
  ctx.shadowBlur = selected ? 14 : 8;

  ctx.beginPath();
  ctx.moveTo(win.x1, win.y1);
  ctx.lineTo(win.x2, win.y2);
  ctx.stroke();

  // inner window line
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(win.x1, win.y1);
  ctx.lineTo(win.x2, win.y2);
  ctx.stroke();

  ctx.restore();
}

/* ---------------- REDRAW ---------------- */
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // grid fixed on screen
  drawGrid();

  // objects move with pan offset
  ctx.save();
  ctx.translate(viewOffsetX, viewOffsetY);

  canvasObjects.forEach(obj => {
    const sel = selectedObject && selectedObject.id === obj.id;

    if (obj.type === "wall") drawWall(obj, sel);
    if (obj.type === "room") drawRoom(obj, sel);
    if (obj.type === "door") drawDoor(obj, sel);
    if (obj.type === "window") drawWindow(obj, sel);
  });

  // live preview
  if (isDrawing && startPoint && hoverPoint) {
    if (tool === "wall") {
      drawWall({ x1: startPoint.x, y1: startPoint.y, x2: hoverPoint.x, y2: hoverPoint.y }, true, true);
    }
    if (tool === "room") {
      const label = document.getElementById("roomName")?.value || "Room";
      drawRoom({ x1: startPoint.x, y1: startPoint.y, x2: hoverPoint.x, y2: hoverPoint.y, label }, true, true);
    }
  }

  // cursor dot
  if (hoverPoint) {
    ctx.fillStyle = "rgba(163,230,53,0.85)";
    ctx.beginPath();
    ctx.arc(hoverPoint.x, hoverPoint.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/* ---------------- HIT DETECTION ---------------- */
function pointInRoom(px, py, r) {
  const xMin = Math.min(r.x1, r.x2);
  const xMax = Math.max(r.x1, r.x2);
  const yMin = Math.min(r.y1, r.y2);
  const yMax = Math.max(r.y1, r.y2);
  return px >= xMin && px <= xMax && py >= yMin && py <= yMax;
}

function distPointToLine(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;

  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function findObject(px, py) {
  for (let i = canvasObjects.length - 1; i >= 0; i--) {
    const obj = canvasObjects[i];

    if (obj.type === "room") {
      if (pointInRoom(px, py, obj)) return obj;
    }

    if (obj.type === "wall") {
      const d = distPointToLine(px, py, obj.x1, obj.y1, obj.x2, obj.y2);
      if (d < WALL_THICKNESS) return obj;
    }

    if (obj.type === "door") {
      if (dist(px, py, obj.x, obj.y) < 18) return obj;
    }

    if (obj.type === "window") {
      const d = distPointToLine(px, py, obj.x1, obj.y1, obj.x2, obj.y2);
      if (d < 10) return obj;
    }
  }
  return null;
}

/* ---------------- EVENTS ---------------- */
canvas.addEventListener("mousemove", (e) => {
  hoverPoint = getMouse(e);

  // ✅ Pan (SPACE + Drag)
  if (isPanning) {
    const dx = hoverPoint.rawX - panStart.x;
    const dy = hoverPoint.rawY - panStart.y;

    viewOffsetX += dx;
    viewOffsetY += dy;

    panStart = { x: hoverPoint.rawX, y: hoverPoint.rawY };
    redraw();
    return;
  }

  // move selected object
  if (tool === "select" && isDragging && selectedObject && dragStart) {
    const dx = hoverPoint.x - dragStart.x;
    const dy = hoverPoint.y - dragStart.y;

    if (selectedObject.type === "wall") {
      selectedObject.x1 += dx; selectedObject.y1 += dy;
      selectedObject.x2 += dx; selectedObject.y2 += dy;
    }

    if (selectedObject.type === "room") {
      selectedObject.x1 += dx; selectedObject.y1 += dy;
      selectedObject.x2 += dx; selectedObject.y2 += dy;
    }

    if (selectedObject.type === "door") {
      selectedObject.x += dx; selectedObject.y += dy;
    }

    if (selectedObject.type === "window") {
      selectedObject.x1 += dx; selectedObject.y1 += dy;
      selectedObject.x2 += dx; selectedObject.y2 += dy;
    }

    dragStart = { x: hoverPoint.x, y: hoverPoint.y };
    redraw();
    return;
  }

  redraw();
});

canvas.addEventListener("mousedown", (e) => {
  const pos = getMouse(e);

  // ✅ Pan mode start
  if (spaceDown) {
    isPanning = true;
    panStart = { x: pos.rawX, y: pos.rawY };
    canvas.style.cursor = "grabbing";
    return;
  }

  if (tool === "select") {
    const hit = findObject(pos.x, pos.y);
    selectedObject = hit;
    isDragging = !!hit;
    dragStart = pos;
    redraw();
  }
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
  isPanning = false;
  dragStart = null;
  canvas.style.cursor = spaceDown ? "grab" : "default";
});

canvas.addEventListener("click", (e) => {
  const pos = getMouse(e);

  // WALL DRAW
  if (tool === "wall") {
    if (!isDrawing) {
      isDrawing = true;
      startPoint = pos;
    } else {
      canvasObjects.push({
        id: Date.now(),
        type: "wall",
        x1: startPoint.x,
        y1: startPoint.y,
        x2: pos.x,
        y2: pos.y
      });

      isDrawing = false;
      startPoint = null;
      redraw();
    }
    return;
  }

  // ROOM DRAW
  if (tool === "room") {
    if (!isDrawing) {
      isDrawing = true;
      startPoint = pos;
    } else {
      const label = document.getElementById("roomName")?.value || "Room";

      canvasObjects.push({
        id: Date.now(),
        type: "room",
        label: label,
        x1: startPoint.x,
        y1: startPoint.y,
        x2: pos.x,
        y2: pos.y
      });

      isDrawing = false;
      startPoint = null;
      redraw();
    }
    return;
  }

  // DOOR PLACE ANYWHERE
  if (tool === "door") {
    canvasObjects.push({
      id: Date.now(),
      type: "door",
      x: pos.x,
      y: pos.y,
      rotation: 0
    });
    redraw();
    return;
  }

  // WINDOW PLACE ANYWHERE
  if (tool === "window") {
    canvasObjects.push({
      id: Date.now(),
      type: "window",
      x1: pos.x - WINDOW_WIDTH_PX / 2,
      y1: pos.y,
      x2: pos.x + WINDOW_WIDTH_PX / 2,
      y2: pos.y
    });
    redraw();
    return;
  }
});

/* ---------------- KEYBOARD ---------------- */
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cancelDrawing();
  if (e.key === "Delete") deleteSelected();

  // door rotate
  if (e.key.toLowerCase() === "r" && selectedObject && selectedObject.type === "door") {
    selectedObject.rotation = (selectedObject.rotation || 0) + 90;
    if (selectedObject.rotation >= 360) selectedObject.rotation = 0;
    redraw();
  }

  // ✅ space for pan
  if (e.code === "Space") {
    spaceDown = true;
    canvas.style.cursor = "grab";
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") {
    spaceDown = false;
    isPanning = false;
    canvas.style.cursor = "default";
  }
});

/* ---------------- ACTIONS ---------------- */
function cancelDrawing() {
  isDrawing = false;
  startPoint = null;
  redraw();
}

function deleteSelected() {
  if (!selectedObject) return;
  canvasObjects = canvasObjects.filter(o => o.id !== selectedObject.id);
  selectedObject = null;
  redraw();
}

function clearAll() {
  canvasObjects = [];
  selectedObject = null;
  cancelDrawing();
}

function savePlan() {
  fetch("/save-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(canvasObjects)
  })
    .then(r => r.json())
    .then(() => alert("Plan Saved ✅"))
    .catch(() => alert("Save failed ❌"));
}

/* ---------------- IMPORT + DETECT ---------------- */
function triggerImport() {
  document.getElementById("planFile").click();
}

document.getElementById("planFile")?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/upload-plan", {
    method: "POST",
    body: formData
  });

  const data = await res.json();

  if (data.error) {
    alert("Upload failed: " + data.error);
    return;
  }

  importedFilename = data.filename;
  alert("Plan imported ✅ Now click Detect Walls");
});

async function detectWalls() {
  if (!importedFilename) {
    alert("Please import a plan image first.");
    return;
  }

  const res = await fetch("/detect-walls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: importedFilename })
  });

  const data = await res.json();

  if (data.error) {
    alert("Detection failed: " + data.error);
    return;
  }

  const walls = data.walls.map(w => ({
    id: Date.now() + Math.random(),
    type: "wall",
    x1: w.x1,
    y1: w.y1,
    x2: w.x2,
    y2: w.y2
  }));

  canvasObjects = [...canvasObjects, ...walls];

  alert(`Detected ${data.count} wall segments ✅`);
  redraw();
}

redraw();
