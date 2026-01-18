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

function generateElectrical(objects, mode) {
  const rooms = objects.filter(o => o.type === "room");
  const elec = [];

  const add = (type, x, y, label = "") => {
    elec.push({ id: Date.now() + Math.random(), type, x, y, label });
  };

  for (const r of rooms) {
    const label = (r.label || "").toLowerCase();
    const c = roomCenter(r);

    if (mode === "custom") {
      add("elec_light", c.x, c.y);
      add("elec_switch", r.x1 + 40, r.y1 + 40);
      continue;
    }

    if (mode === "cost") {
      if (label.includes("living")) {
        add("elec_light", c.x, c.y);
        add("elec_switch", r.x1 + 40, r.y1 + 40);
        add("elec_socket", r.x1 + 60, r.y2 - 40, "General");
      }

      if (label.includes("bedroom")) {
        add("elec_light", c.x, c.y);
        add("elec_switch", r.x1 + 40, r.y1 + 40);
        add("elec_socket", r.x2 - 60, r.y2 - 40, "General");
      }

      if (label.includes("kitchen")) {
        add("elec_light", c.x, c.y);
        add("elec_switch", r.x1 + 40, r.y1 + 40);
        add("elec_socket", r.x1 + 60, r.y2 - 40, "Fridge");
        add("elec_socket", r.x1 + 140, r.y2 - 40, "Mixi");
        add("elec_socket", r.x1 + 220, r.y2 - 40, "General");
      }

      if (label.includes("bath")) {
        add("elec_light", c.x, c.y);
        add("elec_switch", r.x1 + 40, r.y1 + 40);
        add("elec_exhaust", r.x2 - 40, r.y1 + 40, "Exhaust");
      }
    }

    if (mode === "standard") {
      if (label.includes("living")) {
        add("elec_light", c.x, c.y);
        add("elec_light", c.x + 60, c.y);
        add("elec_switch", r.x1 + 40, r.y1 + 40);
        add("elec_socket", r.x1 + 60, r.y2 - 40, "General");
        add("elec_socket", r.x2 - 60, r.y2 - 40, "General");
      }

      if (label.includes("bedroom")) {
        add("elec_light", c.x, c.y);
        add("elec_switch", r.x1 + 40, r.y1 + 40);
        add("elec_socket", r.x2 - 60, r.y2 - 40, "General");
        add("elec_socket", r.x1 + 60, r.y2 - 40, "Charging");
      }

      if (label.includes("kitchen")) {
        add("elec_light", c.x, c.y);
        add("elec_switch", r.x1 + 40, r.y1 + 40);
        add("elec_socket", r.x1 + 60, r.y2 - 40, "Fridge");
        add("elec_socket", r.x1 + 140, r.y2 - 40, "Mixi");
        add("elec_socket", r.x1 + 220, r.y2 - 40, "General");
        add("elec_socket", r.x2 - 60, r.y2 - 40, "Extra");
      }

      if (label.includes("bath")) {
        add("elec_light", c.x, c.y);
        add("elec_switch", r.x1 + 40, r.y1 + 40);
        add("elec_exhaust", r.x2 - 40, r.y1 + 40, "Exhaust");
      }
    }
  }

  return elec;
}

function drawWallsAndRooms(objects) {
  // rooms
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

  // walls
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

function drawElectrical(points) {
  for (const p of points) {
    // base glow circle
    pctx.beginPath();
    pctx.fillStyle = "rgba(163,230,53,0.9)";
    pctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    pctx.fill();

    // label
    pctx.fillStyle = "rgba(229,231,235,0.85)";
    pctx.font = "11px Segoe UI";

    let t = p.type.replace("elec_", "").toUpperCase();
    if (p.label) t += ` (${p.label})`;
    pctx.fillText(t, p.x + 10, p.y - 10);
  }
}

function drawPreview() {
  drawGrid();
  drawWallsAndRooms(planObjects);

  const points = generateElectrical(planObjects, selectedTemplate);
  drawElectrical(points);
}

async function loadPlan() {
  const res = await fetch(`/load-plan/${PLAN_ID}`);
  const data = await res.json();

  planObjects = data.canvasObjects || [];

  resizePreviewCanvas();
  selectTemplate("cost");
}

function selectTemplate(mode) {
  selectedTemplate = mode;

  // UI active state
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
  // Remove previous electrical objects if any
  let updated = planObjects.filter(o => !String(o.type).startsWith("elec_"));

  const points = generateElectrical(planObjects, selectedTemplate);

  updated = [...updated, ...points];

  // Save in DB
  await fetch(`/save-plan/${PLAN_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated)
  });

  alert("Template applied ✅");
  window.location.href = `/editor/${PLAN_ID}`;
}

// Expose functions to HTML
window.selectTemplate = selectTemplate;
window.previewOnly = previewOnly;
window.applySelectedTemplate = applySelectedTemplate;

loadPlan();
