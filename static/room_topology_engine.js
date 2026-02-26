/* =====================================================
   ROOM TOPOLOGY ENGINE
   Builds relationship between:
   rooms ↔ walls ↔ doors
   ===================================================== */

function pointInsideRoom(px, py, room) {
  const xMin = Math.min(room.x1, room.x2);
  const xMax = Math.max(room.x1, room.x2);
  const yMin = Math.min(room.y1, room.y2);
  const yMax = Math.max(room.y1, room.y2);

  return px >= xMin && px <= xMax && py >= yMin && py <= yMax;
}

function wallMidpoint(w) {
  return {
    x: (w.x1 + w.x2) / 2,
    y: (w.y1 + w.y2) / 2
  };
}

function wallLength(w) {
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}

function wallOrientation(w) {
  return Math.abs(w.x2 - w.x1) > Math.abs(w.y2 - w.y1)
    ? "horizontal"
    : "vertical";
}

function nearestWall(px, py, walls) {
  let best = null;
  let bestDist = Infinity;

  for (const w of walls) {
    const mx = (w.x1 + w.x2) / 2;
    const my = (w.y1 + w.y2) / 2;
    const d = Math.hypot(px - mx, py - my);

    if (d < bestDist) {
      bestDist = d;
      best = w;
    }
  }
  return best;
}

/* =============================
   MAIN FUNCTION
   ============================= */

function buildRoomTopology(canvasObjects) {
  const rooms = canvasObjects.filter(o => o.type === "room");
  const walls = canvasObjects.filter(o => o.type === "wall");
  const doors = canvasObjects.filter(o => o.type === "door");
  
  // ✅ NEW: Filter for Sinks and Counters
  const sinks = canvasObjects.filter(o => o.type === "sink");
  const counters = canvasObjects.filter(o => o.type === "counter");

  const topology = [];

  for (const room of rooms) {
    const roomWalls = [];
    const roomDoors = [];
    
    // ✅ NEW: Arrays to hold appliances for this room
    const roomSinks = [];
    const roomCounters = [];

    // 1. Map walls → room
    for (const w of walls) {
      const mid = wallMidpoint(w);
      if (pointInsideRoom(mid.x, mid.y, room)) {
        roomWalls.push(w);
      }
    }

    // 2. ✅ NEW: Map Sinks → room
    for (const s of sinks) {
      // Use midpoint of the sink to see if it's in the room
      const midX = (s.x1 + s.x2) / 2;
      const midY = (s.y1 + s.y2) / 2;
      if (pointInsideRoom(midX, midY, room)) {
        roomSinks.push(s);
      }
    }

    // 3. ✅ NEW: Map Counters → room
    for (const c of counters) {
      const midX = (c.x1 + c.x2) / 2;
      const midY = (c.y1 + c.y2) / 2;
      if (pointInsideRoom(midX, midY, room)) {
        roomCounters.push(c);
      }
    }

    // 4. Map doors → nearest wall → room
    for (const d of doors) {
      const w = nearestWall(d.x, d.y, roomWalls);
      if (w) {
        roomDoors.push({ door: d, wall: w });
      }
    }

    // detect longest wall
    let longestWall = null;
    let maxLen = 0;

    for (const w of roomWalls) {
      const len = wallLength(w);
      if (len > maxLen) {
        maxLen = len;
        longestWall = w;
      }
    }

    // detect entry wall
    const entryWall = roomDoors.length ? roomDoors[0].wall : null;

    // detect top & bottom wall
    let topWall = null;
    let bottomWall = null;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const w of roomWalls) {
      const mid = wallMidpoint(w);
      if (mid.y < minY) {
        minY = mid.y;
        topWall = w;
      }
      if (mid.y > maxY) {
        maxY = mid.y;
        bottomWall = w;
      }
    }
// Change your topology.push section for walls to this safe version:
topology.push({
  room,
  walls: roomWalls,
  doors: roomDoors,
  sinks: roomSinks,
  counters: roomCounters,
  entryWall: roomDoors.length ? roomDoors[0].wall : (roomWalls[0] || null),
  longestWall: roomWalls.length ? roomWalls.reduce((a, b) => wallLength(a) > wallLength(b) ? a : b) : null,
  topWall: roomWalls.length ? roomWalls.reduce((a, b) => wallMidpoint(a).y < wallMidpoint(b).y ? a : b) : null,
  bottomWall: roomWalls.length ? roomWalls.reduce((a, b) => wallMidpoint(a).y > wallMidpoint(b).y ? a : b) : null
});
  }

  return topology;
}
