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

  const topology = [];

  for (const room of rooms) {

    const roomWalls = [];
    const roomDoors = [];

    // map walls → room
    for (const w of walls) {
      const mid = wallMidpoint(w);
      if (pointInsideRoom(mid.x, mid.y, room)) {
        roomWalls.push(w);
      }
    }

    // map doors → nearest wall → room
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

    topology.push({
      room,
      walls: roomWalls,
      doors: roomDoors,
      entryWall,
      longestWall,
      topWall,
      bottomWall
    });
  }

  return topology;
}
