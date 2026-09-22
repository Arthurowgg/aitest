// ============================================================================
// APEX HORIZON — road ribbon builder: surface, markings, sidewalks,
// guardrails, street lights, start line
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp } from './math.js';

// ---- canvas-made marking textures ----------------------------------------
let _markCache = {};
function markTex(kind) {
  if (_markCache[kind]) return _markCache[kind];
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  if (kind === 'dash') { g.fillStyle = '#f4f7ff'; g.fillRect(22, 0, 20, 74); }
  else if (kind === 'solid') { g.fillStyle = '#eef2fb'; g.fillRect(24, 0, 16, 128); }
  else if (kind === 'curb') {
    g.fillStyle = '#d8262c'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#f2f4f8'; g.fillRect(0, 64, 64, 64);
  } else if (kind === 'checker') {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#111318' : '#eef2f8';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  } else if (kind === 'double') {
    g.fillStyle = '#f7d24a'; g.fillRect(18, 0, 8, 128); g.fillRect(38, 0, 8, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _markCache[kind] = t;
  return t;
}

// ---- ribbon geometry helper ----------------------------------------------
/**
 * cols: array of {offset (m from centre, +right), y (lift), }
 * builds a strip mesh along the polyline with uv.y = arc length / uvScale
 */
function ribbon(pts, heights, cols, uvScale = 6, closed = true) {
  const n = pts.length / 2;
  const rows = closed ? n : n - 1;
  const vCount = rows * cols.length * 2;
  const pos = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = [];
  let s = 0, vi = 0, ii = 0;
  const tang = new THREE.Vector3();
  for (let i = 0; i < rows; i++) {
    const a = i, b = (i + 1) % n;
    const ax = pts[a * 2], az = pts[a * 2 + 1];
    const bx = pts[b * 2], bz = pts[b * 2 + 1];
    tang.set(bx - ax, 0, bz - az).normalize();
    const nx = -tang.z, nz = tang.x;   // right normal
    for (let k = 0; k < cols.length; k++) {
      const o = cols[k].offset, y = cols[k].y ?? 0;
      pos[vi * 3] = ax + nx * o; pos[vi * 3 + 1] = heights[a] + y; pos[vi * 3 + 2] = az + nz * o;
      uv[vi * 2] = cols[k].u ?? k / (cols.length - 1); uv[vi * 2 + 1] = s / uvScale;
      vi++;
    }
    s += Math.hypot(bx - ax, bz - az);
  }
  const rowLimit = closed ? rows : rows - 1;
  for (let i = 0; i < rowLimit; i++) {
    for (let k = 0; k < cols.length - 1; k++) {
      const r0 = i * cols.length, r1 = ((i + 1) % rows) * cols.length;
      idx.push(r0 + k, r1 + k, r1 + k + 1, r0 + k, r1 + k + 1, r0 + k + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function heightsAlong(pts, fields, lift = 0) {
  const n = pts.length / 2;
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) h[i] = fields.heightAt(pts[i * 2], pts[i * 2 + 1]) + lift;
  return h;
}

// ---- instanced helper -----------------------------------------------------
function instanced(geo, mat, matrices, colors) {
  const m = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((mx, i) => m.setMatrixAt(i, mx));
  if (colors) colors.forEach((c, i) => m.setColorAt(i, c));
  m.instanceMatrix.needsUpdate = true;
  if (colors) m.instanceColor.needsUpdate = true;
  m.castShadow = true; m.receiveShadow = true;
  m.frustumCulled = false;
  return m;
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

// ============================================================================
export function buildRoad(def, fields, Assets, opts = {}) {
  const group = new THREE.Group();
  group.name = 'road';
  const pts = def.points;
  const w = def.halfWidth ?? 7;
  const n = pts.length / 2;
  const h = heightsAlong(pts, fields, 0.06);

  // --- asphalt surface (crowned 4-column strip) ---
  const wet = !!def.wet;
  const surfMat = Assets.asphalt(wet, 1);
  surfMat.map.repeat.set(1, 1);
  const cols = [
    { offset: -w, y: 0.0, u: 0 },
    { offset: -w * 0.35, y: 0.05, u: 0.32 },
    { offset: w * 0.35, y: 0.05, u: 0.68 },
    { offset: w, y: 0.0, u: 1 },
  ];
  const surf = new THREE.Mesh(ribbon(pts, h, cols, 14), surfMat);
  surf.receiveShadow = true;
  surf.name = 'asphalt';
  group.add(surf);
  // fix uv scaling: u across = 0..1 -> repeat via material map repeat.x
  surfMat.map.repeat.set(1, 1);
  surfMat.normalMap && surfMat.normalMap.repeat.set(1, 1);

  // --- centre dashes / double line ---
  if (def.centreLine !== false) {
    const dm = new THREE.MeshBasicMaterial({ map: markTex(def.doubleYellow ? 'double' : 'dash'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const cg = ribbon(pts, h, [{ offset: -0.28, y: 0.075, u: 0 }, { offset: 0.28, y: 0.075, u: 1 }], def.doubleYellow ? 9 : 9);
    const mesh = new THREE.Mesh(cg, dm);
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  // --- edge lines ---
  const edgeMat = new THREE.MeshBasicMaterial({ map: markTex('solid'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const side of [-1, 1]) {
    const g = ribbon(pts, h, [{ offset: side * (w - 0.75), y: 0.072, u: 0 }, { offset: side * (w - 0.42), y: 0.072, u: 1 }], 40);
    const m = new THREE.Mesh(g, edgeMat); m.renderOrder = 2; group.add(m);
  }
  // --- curbs (touge / circuit style) ---
  if (def.curbs) {
    const cm = new THREE.MeshBasicMaterial({ map: markTex('curb'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    for (const side of [-1, 1]) {
      const g = ribbon(pts, h, [{ offset: side * (w + 0.05), y: 0.09, u: 0 }, { offset: side * (w + 0.85), y: 0.13, u: 1 }], 6);
      const m = new THREE.Mesh(g, cm); m.renderOrder = 3; group.add(m);
    }
  }

  // --- sidewalks ---
  if (def.sidewalks) {
    const sw = def.sidewalkWidth ?? 3.4;
    const mat = Assets.concrete(1);
    for (const side of [-1, 1]) {
      const g = ribbon(pts, h, [
        { offset: side * (w + 0.15), y: 0.16, u: 0 },
        { offset: side * (w + sw), y: 0.18, u: 1 },
      ], 10);
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m);
    }
  }

  // --- guard rails ---------------------------------------------------------
  if (def.barrier === 'armco' || def.barrier === 'both') {
    const postGeo = new THREE.BoxGeometry(0.14, 0.85, 0.14);
    const railGeo = new THREE.BoxGeometry(0.1, 0.34, 4.2);
    const metal = Assets.metal();
    const posts = [], rails = [], colsP = [];
    const step = 4;
    for (let i = 0; i < n; i += step) {
      const a = i, b = (i + step) % n;
      const ax = pts[a * 2], az = pts[a * 2 + 1], bx = pts[b * 2], bz = pts[b * 2 + 1];
      const ang = Math.atan2(bx - ax, bz - az);
      for (const side of (def.barrierSides || [-1, 1])) {
        const nx = -Math.cos(ang) * -side, nz = Math.sin(ang) * side;
        const px = ax + (-Math.cos(ang)) * 0 + (-Math.sin(ang)) * 0; // placeholder
        const rx = -Math.cos(ang), rz = Math.sin(ang);
        const ox = ax + rx * side * (w + 1.1), oz = az + rz * side * (w + 1.1);
        const oy = fields.heightAt(ox, oz);
        _q.setFromEuler(_e.set(0, ang, 0));
        _m4.compose(_v.set(ox, oy + 0.42, oz), _q, _s.set(1, 1, 1));
        posts.push(_m4.clone());
        const mx = (ax + bx) / 2 + rx * side * (w + 1.15), mz = (az + bz) / 2 + rz * side * (w + 1.15);
        const my = (fields.heightAt(mx, mz)) + 0.72;
        _m4.compose(_v.set(mx, my, mz), _q, _s.set(1, 1, 1));
        rails.push(_m4.clone());
      }
    }
    group.add(instanced(postGeo, metal, posts));
    group.add(instanced(railGeo, metal, rails));
  }
  if (def.barrier === 'jersey' || def.barrier === 'both') {
    const geo = new THREE.BoxGeometry(0.55, 1.0, 3.6);
    const mat = Assets.concrete(2);
    const ms = [];
    for (let i = 0; i < n; i += 4) {
      const a = i, b = (i + 4) % n;
      const ax = pts[a * 2], az = pts[a * 2 + 1], bx = pts[b * 2], bz = pts[b * 2 + 1];
      const ang = Math.atan2(bx - ax, bz - az);
      const rx = -Math.cos(ang), rz = Math.sin(ang);
      for (const side of (def.barrierSides || [-1, 1])) {
        const ox = ax + rx * side * (w + 0.8), oz = az + rz * side * (w + 0.8);
        _q.setFromEuler(_e.set(0, ang, 0));
        _m4.compose(_v.set(ox, fields.heightAt(ox, oz) + 0.5, oz), _q, _s.set(1, 1, 1));
        ms.push(_m4.clone());
      }
    }
    group.add(instanced(geo, mat, ms));
  }

  // --- street lights --------------------------------------------------------
  if (def.streetlights) {
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 8.4, 6);
    const armGeo = new THREE.BoxGeometry(0.1, 0.1, 2.4);
    const headGeo = new THREE.BoxGeometry(0.34, 0.16, 0.9);
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a4048, metalness: 0.8, roughness: 0.5 });
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.2, 3.6) });
    const poles = [], arms = [], heads = [];
    const glowPts = [];
    const step = 26;
    for (let i = 0; i < n; i += step) {
      const a = i, b = (i + step) % n;
      const ax = pts[a * 2], az = pts[a * 2 + 1], bx = pts[b * 2], bz = pts[b * 2 + 1];
      const ang = Math.atan2(bx - ax, bz - az);
      const side = (i / step) % 2 === 0 ? 1 : -1;
      const rx = -Math.cos(ang), rz = Math.sin(ang);
      const ox = ax + rx * side * (w + 1.6), oz = az + rz * side * (w + 1.6);
      const oy = fields.heightAt(ox, oz);
      _q.setFromEuler(_e.set(0, ang, 0));
      _m4.compose(_v.set(ox, oy + 4.2, oz), _q, _s.set(1, 1, 1)); poles.push(_m4.clone());
      _m4.compose(_v.set(ox - rx * side * 1.0, oy + 8.3, oz - rz * side * 1.0), _q, _s.set(1, 1, 1)); arms.push(_m4.clone());
      _m4.compose(_v.set(ox - rx * side * 2.0, oy + 8.2, oz - rz * side * 2.0), _q, _s.set(1, 1, 1)); heads.push(_m4.clone());
      glowPts.push(ox - rx * side * 2.0, oy + 8.1, oz - rz * side * 2.0);
    }
    group.add(instanced(poleGeo, metal, poles));
    group.add(instanced(armGeo, metal, arms));
    const hm = instanced(headGeo, headMat, heads); hm.castShadow = false; group.add(hm);
    // glow sprites via Points
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(glowPts, 3));
    const pm = new THREE.PointsMaterial({ map: Assets.tex.glow || Assets.white(), size: 7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2.4, 2.0, 1.3), sizeAttenuation: true });
    const ptsMesh = new THREE.Points(g, pm);
    ptsMesh.frustumCulled = false;
    group.add(ptsMesh);
  }

  // --- start / finish line ---------------------------------------------------
  if (def.startLine !== false) {
    const g = ribbon(pts.slice(0, 8 * 2).length ? pts : pts, h, [
      { offset: -w, y: 0.09, u: 0 }, { offset: w, y: 0.09, u: 1 },
    ], 4);
    // build a short checker strip at s=0
    const cols2 = [{ offset: -w, y: 0.09, u: 0 }, { offset: w, y: 0.09, u: 1 }];
    const sub = pts.slice(0, 2 * 2), subH = h.slice(0, 2);
    const cg = ribbon(sub.length >= 4 ? sub : pts.slice(0, 4), subH.length >= 2 ? subH : h.slice(0, 2), cols2, 3);
    const mat = new THREE.MeshBasicMaterial({ map: markTex('checker'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(cg, mat); m.renderOrder = 4;
    group.add(m);
  }

  group.userData = { points: pts, halfWidth: w, heights: h, length: def.length };
  return group;
}

// ---------------------------------------------------------------------------
// gantry / checkpoint gate visual
// ---------------------------------------------------------------------------
export function buildGate(x, z, angle, width, Assets, color = 0x22e1ff) {
  const g = new THREE.Group();
  const postGeo = new THREE.CylinderGeometry(0.16, 0.2, 6.4, 8);
  const metal = new THREE.MeshStandardMaterial({ color: 0x20242c, metalness: 0.7, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(postGeo, metal);
    p.position.set(s * (width + 0.6), 3.2, 0);
    p.castShadow = true;
    g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry((width + 0.6) * 2, 0.7, 0.5), metal);
  beam.position.y = 6.2; beam.castShadow = true;
  g.add(beam);
  const strip = new THREE.Mesh(new THREE.BoxGeometry((width + 0.6) * 2, 0.24, 0.56),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.6) }));
  strip.position.y = 5.7;
  g.add(strip);
  g.position.set(x, 0, z);
  g.rotation.y = angle;
  return g;
}
