// Tile map: parsing, collision rects, line of sight, vision cones, path distance fields.
//
// Coordinates: one tile = one world unit. Game x grows right, game y grows up
// (north). ASCII row 0 is the top (north) of the map, so tile (c, r) covers
// x ∈ [c, c+1], y ∈ [H-1-r, H-r].

const TAU = Math.PI * 2;

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

const BLOCKING = new Set(['#', 'o', '=']);

function mergeIntervals(list) {
  list.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const iv of list) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

export class Grid {
  constructor(level) {
    const H = level.map.length;
    const W = Math.max(...level.map.map((r) => r.length));
    this.W = W;
    this.H = H;
    this.rows = level.map.map((r) => r.padEnd(W, '#'));
    this.blocked = new Uint8Array(W * H);
    this.walls = [];      // collision rects for '#'
    this.obstacles = [];  // collision rects for cover ('o' pillar, '=' slab)
    this.segments = [];   // sight-blocking edges {x1, y1, x2, y2}
    this.posted = [];     // 'S' positions in reading order
    this.patrolPoints = {};
    this.exitTiles = [];
    this.start = null;

    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const ch = this.rows[r][c];
        if (BLOCKING.has(ch)) this.blocked[r * W + c] = 1;
        const ctr = this.center(c, r);
        if (ch === 'P') this.start = ctr;
        else if (ch === 'S') this.posted.push(ctr);
        else if (ch === 'E') this.exitTiles.push({ c, r });
        else if (ch >= '1' && ch <= '9') this.patrolPoints[ch] = ctr;
      }
      // Row runs of walls and slabs become single rects.
      let c = 0;
      while (c < W) {
        const ch = this.rows[r][c];
        if (ch === '#' || ch === '=' || ch === 'o') {
          const s = c;
          while (c < W && this.rows[r][c] === ch) c++;
          const n = c - s, y = H - 1 - r;
          if (ch === '#') this.walls.push({ x: s, y, w: n, h: 1 });
          else if (ch === '=') this.obstacles.push({ x: s + 0.05, y: y + 0.2, w: n - 0.1, h: 0.6, kind: 'slab' });
          else if (n === 1) this.obstacles.push({ x: s + 0.15, y: y + 0.15, w: 0.7, h: 0.7, kind: 'pillar' });
          else this.obstacles.push({ x: s + 0.05, y: y + 0.05, w: n - 0.1, h: 0.9, kind: 'pillar' });
        } else c++;
      }
    }
    this.solids = this.walls.concat(this.obstacles);

    // Sight segments: wall faces that border open tiles (merged), plus every cover rect edge.
    const hEdges = new Map(), vEdges = new Map();
    const push = (map, k, iv) => { if (!map.has(k)) map.set(k, []); map.get(k).push(iv); };
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (this.rows[r][c] !== '#') continue;
        const y0 = H - 1 - r, y1 = y0 + 1;
        if (r > 0 && !this.isWall(c, r - 1)) push(hEdges, y1, [c, c + 1]);
        if (r < H - 1 && !this.isWall(c, r + 1)) push(hEdges, y0, [c, c + 1]);
        if (c > 0 && !this.isWall(c - 1, r)) push(vEdges, c, [y0, y1]);
        if (c < W - 1 && !this.isWall(c + 1, r)) push(vEdges, c + 1, [y0, y1]);
      }
    }
    for (const [y, list] of hEdges) for (const [a, b] of mergeIntervals(list)) this.segments.push({ x1: a, y1: y, x2: b, y2: y });
    for (const [x, list] of vEdges) for (const [a, b] of mergeIntervals(list)) this.segments.push({ x1: x, y1: a, x2: x, y2: b });
    for (const o of this.obstacles) {
      const x0 = o.x, x1 = o.x + o.w, y0 = o.y, y1 = o.y + o.h;
      this.segments.push(
        { x1: x0, y1: y0, x2: x1, y2: y0 }, { x1: x1, y1: y0, x2: x1, y2: y1 },
        { x1: x1, y1: y1, x2: x0, y2: y1 }, { x1: x0, y1: y1, x2: x0, y2: y0 },
      );
    }
  }

  isWall(c, r) {
    if (c < 0 || r < 0 || c >= this.W || r >= this.H) return true;
    return this.rows[r][c] === '#';
  }

  isBlocked(c, r) {
    if (c < 0 || r < 0 || c >= this.W || r >= this.H) return true;
    return this.blocked[r * this.W + c] === 1;
  }

  center(c, r) {
    return { x: c + 0.5, y: this.H - 1 - r + 0.5 };
  }

  tileAt(x, y) {
    return { c: Math.floor(x), r: this.H - 1 - Math.floor(y) };
  }

  segmentsNear(x, y, range) {
    const out = [];
    for (const s of this.segments) {
      const minX = Math.min(s.x1, s.x2), maxX = Math.max(s.x1, s.x2);
      const minY = Math.min(s.y1, s.y2), maxY = Math.max(s.y1, s.y2);
      const dx = Math.max(minX - x, 0, x - maxX), dy = Math.max(minY - y, 0, y - maxY);
      if (dx * dx + dy * dy <= range * range) out.push(s);
    }
    return out;
  }

  // Distance along (dx, dy) to the first blocking segment, as a multiple of (dx, dy); capped at maxT.
  raycast(ox, oy, dx, dy, maxT, segs = this.segments) {
    let best = maxT;
    for (const s of segs) {
      const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const qx = s.x1 - ox, qy = s.y1 - oy;
      const t = (qx * ey - qy * ex) / den;
      if (t < 0 || t >= best) continue;
      const u = (qx * dy - qy * dx) / den;
      if (u >= 0 && u <= 1) best = t;
    }
    return best;
  }

  canSee(ax, ay, bx, by) {
    return this.raycast(ax, ay, bx - ax, by - ay, 1) >= 1 - 1e-6;
  }

  // Exact visibility fan for a cone: returns [x0, y0, x1, y1, ...] boundary points
  // from one edge of the cone to the other. Walls cut it sharply; the far end is an arc.
  visionCone(ox, oy, facing, halfAngle, range) {
    const segs = this.segmentsNear(ox, oy, range);
    const rel = [-halfAngle, halfAngle];
    const arcSteps = Math.max(2, Math.ceil((2 * halfAngle) / (Math.PI / 90)));
    for (let i = 1; i < arcSteps; i++) rel.push(-halfAngle + (2 * halfAngle * i) / arcSteps);
    const eps = 1e-4;
    const addCorner = (x, y) => {
      const dx = x - ox, dy = y - oy;
      if (dx * dx + dy * dy > range * range * 1.0001) return;
      const d = angleDiff(facing, Math.atan2(dy, dx));
      if (d < -halfAngle || d > halfAngle) return;
      rel.push(Math.max(-halfAngle, d - eps), d, Math.min(halfAngle, d + eps));
    };
    for (const s of segs) { addCorner(s.x1, s.y1); addCorner(s.x2, s.y2); }
    rel.sort((a, b) => a - b);
    const pts = [];
    let last = -Infinity;
    for (const r of rel) {
      if (r - last < 1e-7) continue;
      last = r;
      const a = facing + r;
      const dx = Math.cos(a), dy = Math.sin(a);
      const t = this.raycast(ox, oy, dx, dy, range, segs);
      pts.push(ox + dx * t, oy + dy * t);
    }
    return pts;
  }

  // Breadth-first step distance from a tile to every reachable tile (-1 = unreachable).
  distanceField(c0, r0) {
    const { W, H } = this;
    const d = new Int32Array(W * H).fill(-1);
    if (this.isBlocked(c0, r0)) return d;
    const q = new Int32Array(W * H);
    let head = 0, tail = 0;
    d[r0 * W + c0] = 0;
    q[tail++] = r0 * W + c0;
    while (head < tail) {
      const i = q[head++];
      const c = i % W, r = (i - c) / W;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (this.isBlocked(nc, nr)) continue;
        const j = nr * W + nc;
        if (d[j] !== -1) continue;
        d[j] = d[i] + 1;
        q[tail++] = j;
      }
    }
    return d;
  }
}
