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
function nextPage() {
  const model = walls.map(w => ({
    x1: w.getAttribute("x1"),
    y1: w.getAttribute("y1"),
    x2: w.getAttribute("x2"),
    y2: w.getAttribute("y2")
  }));

  localStorage.setItem("floorPlan", JSON.stringify(model));
  alert("Floor plan saved. Next page: templates.");
}
