// Shared math, pooling, and spatial hash. Hot path — keep allocations out.

import { CONFIG } from './config.js';

// ---- Math ----
export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const randRange = (lo, hi) => lo + Math.random() * (hi - lo);

// ---- Object pool (free-list style) ----
// Entities have an `alive` flag; the pool maintains a dense alive list for fast iteration.
// Never hold a reference to an entity across frames — slots get reused.
export class Pool {
  constructor(size, factory, reset) {
    this.size = size;
    this.reset = reset;
    this.slots = new Array(size);
    for (let i = 0; i < size; i++) {
      this.slots[i] = factory();
      this.slots[i].alive = false;
    }
    this.active = [];  // dense list of alive entities, rebuilt each compaction
  }

  spawn(initFn) {
    // linear scan for a free slot; fine because we compact often
    for (let i = 0; i < this.size; i++) {
      const e = this.slots[i];
      if (!e.alive) {
        e.alive = true;
        initFn(e);
        this.active.push(e);
        return e;
      }
    }
    return null; // pool exhausted (CONFIG cap reached)
  }

  // Call once per frame after updates: drops dead entities from the active list.
  compact() {
    let w = 0;
    for (let r = 0; r < this.active.length; r++) {
      const e = this.active[r];
      if (e.alive) this.active[w++] = e;
      else this.reset && this.reset(e);
    }
    this.active.length = w;
  }
}

// ---- Spatial hash ----
// Bucket entities by grid cell. Query returns candidates near a point.
// Rebuild every frame (cheaper than incremental updates at this scale).
export class SpatialHash {
  constructor(cellSize) {
    this.cell = cellSize;
    this.buckets = new Map(); // key "x|y" -> array of entities
  }

  clear() { this.buckets.clear(); }

  _key(cx, cy) { return cx + '|' + cy; }

  insert(e) {
    const cx = Math.floor(e.x / this.cell);
    const cy = Math.floor(e.y / this.cell);
    const k = this._key(cx, cy);
    let bucket = this.buckets.get(k);
    if (!bucket) { bucket = []; this.buckets.set(k, bucket); }
    bucket.push(e);
  }

  // Returns array of candidates whose cell overlaps a circle of `radius` around (x,y).
  // Caller must do precise distance check; this just prunes.
  queryCircle(x, y, radius, out) {
    out.length = 0;
    const c = this.cell;
    const minCx = Math.floor((x - radius) / c);
    const maxCx = Math.floor((x + radius) / c);
    const minCy = Math.floor((y - radius) / c);
    const maxCy = Math.floor((y + radius) / c);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const bucket = this.buckets.get(this._key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }

  // Find nearest entity to (x,y) within range. O(cells in range).
  findNearest(x, y, maxRange) {
    const candidates = [];
    this.queryCircle(x, y, maxRange, candidates);
    let best = null, bestD2 = maxRange * maxRange;
    for (let i = 0; i < candidates.length; i++) {
      const e = candidates[i];
      const d2 = dist2(x, y, e.x, e.y);
      if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
  }
}

// Singleton hashes — one per entity class so queries don't return mixed types.
export const enemyHash = new SpatialHash(CONFIG.render.spatialHashCellSize);

// ---- Drawing helpers ----
// Sphere look: base disk + smaller lighter disk offset top-left (highlight) + outline.
// Two fills + one stroke — ~10x cheaper than createRadialGradient per call.
// `lightColor` defaults to a translucent white highlight that works on any base.
export function drawSphere(ctx, x, y, r, baseColor, lightColor = 'rgba(255,255,255,0.45)', outlineColor = 'rgba(0,0,0,0.35)') {
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.5, 0, TAU);
  ctx.fill();
  if (outlineColor) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
  }
}

// Glowing dot: bright white core inside a translucent colored halo.
// Used for projectiles, gems, anywhere "energy" should read.
export function drawGlowDot(ctx, x, y, coreRadius, color, haloMult = 2.2) {
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius * haloMult, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, coreRadius * 0.45, 0, TAU);
  ctx.fill();
}
