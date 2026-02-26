const svg = document.getElementById("planSvg");

const GRID = 20;
const WALL_THICKNESS = 8;

let tool = "wall";
let startPoint = null;
let walls = [];
let selectedWall = null;
let dragOffset = null;

/* ---------- Helpers ---------- */
function snap(v) {
  return Math.round(v / GRID) * GRID;
}

function setTool(t) {
  tool = t;
  selectedWall = null;
}

/* ---------- Wall Drawing ---------- */
svg.addEventListener("mousedown", e => {
  const x = snap(e.offsetX);
  const y = snap(e.offsetY);

  if (tool === "wall") {
    startPoint = { x, y };
  }

  if (tool === "select" && e.target.tagName === "line") {
    selectedWall = e.target;
    dragOffset = {
      x: x - parseFloat(selectedWall.getAttribute("x1")),
      y: y - parseFloat(selectedWall.getAttribute("y1"))
    };
  }
  // Add these to your tool selection logic
if (tool === "counter" || tool === "sink") {
    startPoint = { x, y };
}
});

svg.addEventListener("mousemove", e => {
  if (tool === "select" && selectedWall && dragOffset) {
    const x = snap(e.offsetX) - dragOffset.x;
    const y = snap(e.offsetY) - dragOffset.y;

    const dx =
      parseFloat(selectedWall.getAttribute("x2")) -
      parseFloat(selectedWall.getAttribute("x1"));
    const dy =
      parseFloat(selectedWall.getAttribute("y2")) -
      parseFloat(selectedWall.getAttribute("y1"));

    selectedWall.setAttribute("x1", x);
    selectedWall.setAttribute("y1", y);
    selectedWall.setAttribute("x2", x + dx);
    selectedWall.setAttribute("y2", y + dy);
  }
});

svg.addEventListener("mouseup", e => {
  const x = snap(e.offsetX);
  const y = snap(e.offsetY);

  if (tool === "wall" && startPoint) {
    let endX = x;
    let endY = y;

    // Orthogonal snap
    if (Math.abs(endX - startPoint.x) > Math.abs(endY - startPoint.y)) {
      endY = startPoint.y;
    } else {
      endX = startPoint.x;
    }

    const wall = document.createElementNS("http://www.w3.org/2000/svg", "line");
    wall.setAttribute("x1", startPoint.x);
    wall.setAttribute("y1", startPoint.y);
    wall.setAttribute("x2", endX);
    wall.setAttribute("y2", endY);
    wall.setAttribute("stroke", "#111");
    wall.setAttribute("stroke-width", WALL_THICKNESS);
    wall.style.cursor = "pointer";

    svg.appendChild(wall);
    walls.push(wall);
    startPoint = null;
  }

  if ((tool === "counter" || tool === "sink") && startPoint) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    const width = Math.abs(x - startPoint.x);
    const height = Math.abs(y - startPoint.y);
    
    rect.setAttribute("x", Math.min(x, startPoint.x));
    rect.setAttribute("y", Math.min(y, startPoint.y));
    rect.setAttribute("width", width);
    rect.setAttribute("height", height);
    rect.setAttribute("fill", tool === "sink" ? "rgba(0,0,255,0.2)" : "rgba(100,100,100,0.2)");
    rect.setAttribute("stroke", tool === "sink" ? "blue" : "gray");
    rect.setAttribute("data-type", tool); // Store the type here

    svg.appendChild(rect);
    walls.push(rect); // Adding to same array for simple saving
    startPoint = null;
}

  dragOffset = null;
});

/* ---------- Clear ---------- */
function clearPlan() {
  walls.forEach(w => w.remove());
  walls = [];
}

/* ---------- SVG Upload ---------- */
document.getElementById("svgUpload").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "image");
    bg.setAttribute("href", "data:image/svg+xml;base64," + btoa(reader.result));
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("opacity", "0.4");
    svg.prepend(bg);
  };
  reader.readAsText(file);
});

/* ---------- Next Page ---------- */
async function nextPage() {
  // 1. Map SVG lines to the JSON format ElectraPlan expects
  const model = walls.map(w => ({
    id: Date.now() + Math.random(),
    type: "wall",
    x1: parseFloat(w.getAttribute("x1")),
    y1: parseFloat(w.getAttribute("y1")),
    x2: parseFloat(w.getAttribute("x2")),
    y2: parseFloat(w.getAttribute("y2"))
  }));

  // 2. Send to Flask Database instead of localStorage
  // Make sure window.PLAN_ID is defined in your HTML
  try {
    const response = await fetch(`/save-plan/${window.PLAN_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(model)
    });

    if (response.ok) {
      alert("Floor plan saved to database! ✅");
      window.location.href = `/electrical-templates/${window.PLAN_ID}`;
    } else {
      alert("Failed to save to server. ❌");
    }
  } catch (err) {
    console.error("Save Error:", err);
  }
}