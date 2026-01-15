const canvas = document.getElementById("designCanvas");
const ctx = canvas.getContext("2d");
let lastWallExists = false;
  // used for tool restrictions

/* ---------------- SCALE SETTINGS ----------------
   Your requirement: 1 grid block = 1 meter
   We take gridSize px as one block.
*/
let gridSize = 40;               // 40px = 1 meter
const WALL_THICKNESS_M = 0.15;   // 0.15m (engineering wall thickness)
const DOOR_WIDTH_M = 0.9;        // 0.9m door width
const WINDOW_WIDTH_M = 1.2;      // default window width

const WALL_THICKNESS = WALL_THICKNESS_M * gridSize;   // px
const DOOR_WIDTH_PX = DOOR_WIDTH_M * gridSize;        // px
const WINDOW_WIDTH_PX = WINDOW_WIDTH_M * gridSize;    // px


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
  return {
    x: snap(e.clientX - rect.left),
    y: snap(e.clientY - rect.top),
  };
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function pixelsToMeters(px) {
  // since gridSize px = 1 meter
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

  // outer stroke (shadow glow)
  ctx.strokeStyle = selected ? "#A3E635" : "rgba(34,211,238,0.6)";
  ctx.shadowColor = selected ? "#A3E635" : "#22D3EE";
  ctx.shadowBlur = selected ? 18 : 10;

  ctx.beginPath();
  ctx.moveTo(w.x1, w.y1);
  ctx.lineTo(w.x2, w.y2);
  ctx.stroke();

  // inner core wall stroke (solid dark wall)
  ctx.shadowBlur = 0;
  ctx.lineWidth = WALL_THICKNESS - 6;
  ctx.strokeStyle = "#11162A";
  ctx.beginPath();
  ctx.moveTo(w.x1, w.y1);
  ctx.lineTo(w.x2, w.y2);
  ctx.stroke();

  // measurement label
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

  // Dimensions (meters)
  const wm = pixelsToMeters(w);
  const hm = pixelsToMeters(h);
  ctx.fillStyle = "rgba(229,231,235,0.85)";
  ctx.font = "12px Segoe UI";
  ctx.fillText(`${wm.toFixed(1)}m × ${hm.toFixed(1)}m`, x + 10, y + 40);

  ctx.restore();
}

/* ---------------- DOOR (on wall) ---------------- */
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

  // door base line (hinge to end)
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


/* ---------------- WINDOW (on wall) ---------------- */
function drawWindow(win, selected = false) {
  ctx.save();

  ctx.strokeStyle = selected ? "#A3E635" : "#22D3EE";
  ctx.lineWidth = 6;
  ctx.shadowColor = selected ? "#A3E635" : "#22D3EE";
  ctx.shadowBlur = selected ? 14 : 8;

  const x1 = win.x1, y1 = win.y1;
  const x2 = win.x2, y2 = win.y2;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // inner window line
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.restore();
}

/* ---------------- REDRAW ---------------- */
function redraw() {
  drawGrid();

  // Draw objects
  canvasObjects.forEach(obj => {
    const sel = selectedObject && selectedObject.id === obj.id;

    if (obj.type === "wall") drawWall(obj, sel);
    if (obj.type === "room") drawRoom(obj, sel);
    if (obj.type === "door") drawDoor(obj, sel);
    if (obj.type === "window") drawWindow(obj, sel);
  });

  // Live preview
  if (isDrawing && startPoint && hoverPoint) {
    if (tool === "wall") {
      drawWall({ x1: startPoint.x, y1: startPoint.y, x2: hoverPoint.x, y2: hoverPoint.y }, true, true);
    }
    if (tool === "room") {
      const label = document.getElementById("roomName")?.value || "Room";
      drawRoom({ x1: startPoint.x, y1: startPoint.y, x2: hoverPoint.x, y2: hoverPoint.y, label }, true, true);
    }
  }

  // Snap cursor dot
  if (hoverPoint) {
    ctx.fillStyle = "rgba(163,230,53,0.85)";
    ctx.beginPath();
    ctx.arc(hoverPoint.x, hoverPoint.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
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

function nearestRoomEdge(px, py, threshold = gridSize / 2) {
  let best = null;
  let bestDist = Infinity;

  for (const obj of canvasObjects) {
    if (obj.type !== "room") continue;

    const xMin = Math.min(obj.x1, obj.x2);
    const xMax = Math.max(obj.x1, obj.x2);
    const yMin = Math.min(obj.y1, obj.y2);
    const yMax = Math.max(obj.y1, obj.y2);

    // room edges are 4 lines
    const edges = [
      { x1: xMin, y1: yMin, x2: xMax, y2: yMin, dir: "H" }, // top
      { x1: xMin, y1: yMax, x2: xMax, y2: yMax, dir: "H" }, // bottom
      { x1: xMin, y1: yMin, x2: xMin, y2: yMax, dir: "V" }, // left
      { x1: xMax, y1: yMin, x2: xMax, y2: yMax, dir: "V" }, // right
    ];

    for (const e of edges) {
      const d = distPointToLine(px, py, e.x1, e.y1, e.x2, e.y2);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
  }

  if (best && bestDist <= threshold) return best;
  return null;
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

  // move selected (drag)
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
  } else {
    redraw();
  }
});

canvas.addEventListener("mousedown", (e) => {
  const pos = getMouse(e);

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
  dragStart = null;
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
  }

  // DOOR ON WALL (simple placement)
  if (tool === "door") {
  // must have at least one wall OR room
  const hasWall = canvasObjects.some(o => o.type === "wall");
  const hasRoom = canvasObjects.some(o => o.type === "room");

  if (!hasWall && !hasRoom) {
    alert("Draw a wall or room first before placing a door.");
    return;
  }

  // Try snapping to wall first
  const wall = nearestWall(pos.x, pos.y);

  if (wall) {
    const isHorizontal = Math.abs(wall.y2 - wall.y1) < Math.abs(wall.x2 - wall.x1);

    canvasObjects.push({
      id: Date.now(),
      type: "door",
      x: pos.x,
      y: pos.y,
      rotation: isHorizontal ? 0 : 90
    });

    redraw();
    return;
  }

  // If no wall found, try room boundary
  const roomEdge = nearestRoomEdge(pos.x, pos.y);

  if (!roomEdge) {
    alert("Place the door on a wall or on a room boundary.");
    return;
  }

  canvasObjects.push({
    id: Date.now(),
    type: "door",
    x: pos.x,
    y: pos.y,
    rotation: roomEdge.dir === "H" ? 0 : 90
  });

  redraw();
}

 



  // WINDOW placement (small segment)
  if (tool === "window") {
  const wall = nearestWall(pos.x, pos.y);

  if (!wall) {
    alert("Place the window on a wall.");
    return;
  }

  const isHorizontal = Math.abs(wall.y2 - wall.y1) < Math.abs(wall.x2 - wall.x1);

  if (isHorizontal) {
    canvasObjects.push({
      id: Date.now(),
      type: "window",
      x1: pos.x - WINDOW_WIDTH_PX / 2,
      y1: wall.y1,
      x2: pos.x + WINDOW_WIDTH_PX / 2,
      y2: wall.y1
    });
  } else {
    canvasObjects.push({
      id: Date.now(),
      type: "window",
      x1: wall.x1,
      y1: pos.y - WINDOW_WIDTH_PX / 2,
      x2: wall.x1,
      y2: pos.y + WINDOW_WIDTH_PX / 2
    });
  }

  redraw();
}

});

/* ---------------- KEYBOARD ---------------- */
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cancelDrawing();
  if (e.key === "Delete") deleteSelected();
  if (e.key.toLowerCase() === "r" && selectedObject && selectedObject.type === "door") {
  selectedObject.rotation = (selectedObject.rotation || 0) + 90;
  if (selectedObject.rotation >= 360) selectedObject.rotation = 0;
  redraw();
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

/* ---------------- SAVE (optional for now) ---------------- */
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


function nearestWall(px, py) {
  let bestWall = null;
  let bestDist = Infinity;

  for (const obj of canvasObjects) {
    if (obj.type !== "wall") continue;

    const d = distPointToLine(px, py, obj.x1, obj.y1, obj.x2, obj.y2);
    if (d < bestDist) {
      bestDist = d;
      bestWall = obj;
    }
  }

  // only allow if click is close enough
  if (bestDist <= WALL_THICKNESS) return bestWall;
  return null;
}


redraw();
