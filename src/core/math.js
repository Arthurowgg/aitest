// ============================================================================
// APEX HORIZON — math & noise utilities
// ============================================================================

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a || 1e-6), 0, 1);
export const smoothstep = (e0, e1, x) => { const t = invLerp(e0, e1, x); return t * t * (3 - 2 * t); };
export const smootherstep = (e0, e1, x) => { const t = invLerp(e0, e1, x); return t * t * t * (t * (t * 6 - 15) + 10); };
// frame-rate independent exponential approach
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;
export const deg = (d) => (d * Math.PI) / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;

// angle helpers -------------------------------------------------------------
export const wrapAngle = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
export const angleLerp = (a, b, t) => a + wrapAngle(b - a) * t;

// seeded rng ----------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

// value noise + fbm ---------------------------------------------------------
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function fbm(x, y, octaves = 4, lac = 2.03, gain = 0.5) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, y * freq);
    norm += amp; amp *= gain; freq *= lac;
  }
  return sum / norm;
}
export function ridge(x, y, octaves = 4) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(vnoise(x * freq, y * freq) * 2 - 1);
    sum += amp * n * n; norm += amp; amp *= 0.5; freq *= 2.07;
  }
  return sum / norm;
}

// formatting ----------------------------------------------------------------
export function fmtTime(ms) {
  if (ms == null || !isFinite(ms) || ms < 0) return '--:--.--';
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const c = Math.floor((t % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}
export function fmtGap(ms) {
  if (ms == null || !isFinite(ms)) return '--.-';
  const s = Math.abs(ms) / 1000;
  return `${ms >= 0 ? '+' : '-'}${s.toFixed(1)}`;
}
export const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
export const kmh = (mps) => mps * 3.6;
export const mph = (mps) => mps * 2.23694;

// geometry helpers ----------------------------------------------------------
export function nearestOnPolyline(points, px, pz, hint = -1, window = 0) {
  // points: Float64Array-ish of [x,z,...]; returns {index, t, dist2, x, z}
  let best = { index: 0, t: 0, dist2: Infinity, x: 0, z: 0 };
  const n = points.length / 2;
  let start = 0, end = n - 1;
  if (window > 0 && hint >= 0) { start = hint - window; end = hint + window; }
  for (let i = start; i <= end; i++) {
    const ii = ((i % n) + n) % n;
    const jj = ((ii + 1) % n);
    const ax = points[ii * 2], az = points[ii * 2 + 1];
    const bx = points[jj * 2], bz = points[jj * 2 + 1];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1e-6;
    let t = ((px - ax) * dx + (pz - az) * dz) / len2;
    t = clamp(t, 0, 1);
    const x = ax + dx * t, z = az + dz * t;
    const d2 = (px - x) ** 2 + (pz - z) ** 2;
    if (d2 < best.dist2) best = { index: ii, t, dist2: d2, x, z };
  }
  return best;
}

export function catmull(points, closed, samplesPerSeg = 24) {
  // returns flat array [x,z, ...] of a Catmull-Rom spline through points
  const n = points.length / 2;
  const out = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = points[(((i - 1) % n) + n) % n], p1 = points[i % n];
    const p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const p0x = points[(((i - 1) % n) + n) % n * 2];
    // use explicit indexing
    const a = pt(points, i - 1, n, closed), b = pt(points, i, n, closed);
    const c = pt(points, i + 1, n, closed), d = pt(points, i + 2, n, closed);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * b[0]) + (-a[0] + c[0]) * t + (2 * a[0] - 5 * b[0] + 4 * c[0] - d[0]) * t2 + (-a[0] + 3 * b[0] - 3 * c[0] + d[0]) * t3);
      const z = 0.5 * ((2 * b[1]) + (-a[1] + c[1]) * t + (2 * a[1] - 5 * b[1] + 4 * c[1] - d[1]) * t2 + (-a[1] + 3 * b[1] - 3 * c[1] + d[1]) * t3);
      out.push(x, z);
    }
  }
  return out;
  function pt(arr, i, nn, closed) {
    if (!closed) i = clamp(i, 0, nn - 1);
    i = ((i % nn) + nn) % nn;
    return [arr[i * 2], arr[i * 2 + 1]];
  }
}

export function polylineLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length / 2 - 1; i++) {
    L += Math.hypot(pts[(i + 1) * 2] - pts[i * 2], pts[(i + 1) * 2 + 1] - pts[i * 2 + 1]);
  }
  return L;
}

// resample a polyline to uniform arc-length spacing
export function resample(pts, spacing, closed = true) {
  const out = [];
  const n = pts.length / 2;
  const last = closed ? n : n - 1;
  let carry = 0;
  for (let i = 0; i < last; i++) {
    const ax = pts[i * 2], az = pts[i * 2 + 1];
    const bx = pts[((i + 1) % n) * 2], bz = pts[((i + 1) % n) * 2 + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    if (seg < 1e-6) continue;
    let d = spacing - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push(lerp(ax, bx, t), lerp(az, bz, t));
      d += spacing;
    }
    carry = (carry + seg) % spacing;
  }
  return out;
}
