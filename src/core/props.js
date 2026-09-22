// ============================================================================
// APEX HORIZON — world dressing: buildings, neon signage, trees, landmarks,
// billboards, street furniture. Everything instanced for performance.
// ============================================================================
import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './math.js';

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _c = new THREE.Color();

function tangentAt(pts, i) {
  const n = pts.length / 2;
  const a = ((i - 1) % n + n) % n, b = ((i + 1) % n + n) % n;
  const dx = pts[b * 2] - pts[a * 2], dz = pts[b * 2 + 1] - pts[a * 2 + 1];
  const L = Math.hypot(dx, dz) || 1;
  return [dx / L, dz / L];
}

// ---------------------------------------------------------------------------
export function buildCityBlocks(fields, roads, Assets, conf) {
  const g = new THREE.Group(); g.name = 'buildings';
  const rng = mulberry32(conf.seed ?? 4242);
  const mats = [];
  const facadeMat = new THREE.MeshStandardMaterial({
    map: Assets.repeated('facade', 2, 3),
    emissiveMap: Assets.tex.facade || null, emissive: new THREE.Color(0xffffff),
    emissiveIntensity: conf.night ? 1.15 : 0.05,
    roughness: 0.55, metalness: 0.25, envMapIntensity: conf.night ? 1.2 : 0.7,
    color: 0x8f97a3,
  });
  const boxes = [];
  const colors = [];
  const density = conf.density ?? 1;
  for (const road of roads) {
    const pts = road.points, n = pts.length / 2;
    const step = Math.max(2, Math.round((conf.spacing ?? 16) / 5));
    for (let i = 0; i < n; i += step) {
      for (const side of [-1, 1]) {
        if (rng() > 0.82 * density) continue;
        const [tx, tz] = tangentAt(pts, i);
        const rx = -tz, rz = tx;
        const off = (road.halfWidth ?? 7) + 14 + rng() * (conf.depth ?? 26);
        const jitter = (rng() - 0.5) * 10;
        const x = pts[i * 2] + rx * side * off + tx * jitter;
        const z = pts[i * 2 + 1] + rz * side * off + tz * jitter;
        const info = fields.roadInfoAt(x, z);
        if (info.dist < (road.halfWidth ?? 7) + 9) continue;
        const h = fields.heightAt(x, z);
        if (h < fields.sea + 1.5) continue;
        const fw = 9 + rng() * 13, fd = 9 + rng() * 13;
        let ht = 10 + rng() * (conf.maxHeight ?? 46);
        if (rng() < 0.12) ht *= 1.9;                       // occasional tower
        const ang = Math.atan2(tx, tz) + (rng() - 0.5) * 0.2;
        _q.setFromEuler(_e.set(0, ang, 0));
        _m4.compose(_v.set(x, h + ht / 2 - 0.6, z), _q, _s.set(fw, ht, fd));
        boxes.push(_m4.clone());
        const shade = 0.75 + rng() * 0.5;
        colors.push(_c.setRGB(shade, shade, shade * (0.95 + rng() * 0.1)).clone());
      }
    }
  }
  if (boxes.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), facadeMat, boxes.length);
    boxes.forEach((m, i) => im.setMatrixAt(i, m));
    colors.forEach((c, i) => im.setColorAt(i, c));
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    g.add(im);
  }
  g.userData.facadeMat = facadeMat;
  return g;
}

// ---------------------------------------------------------------------------
export function buildNeonSigns(fields, roads, Assets, conf) {
  const g = new THREE.Group(); g.name = 'neon';
  if (!conf.night && !conf.neon) return g;
  const rng = mulberry32(777);
  const texs = ['neonA', 'neonB', 'neonC'];
  const buckets = texs.map(() => ({ mats: [], colors: [] }));
  for (const road of roads) {
    const pts = road.points, n = pts.length / 2;
    for (let i = 0; i < n; i += 6) {
      for (const side of [-1, 1]) {
        if (rng() > 0.3) continue;
        const [tx, tz] = tangentAt(pts, i);
        const rx = -tz, rz = tx;
        const off = (road.halfWidth ?? 7) + 11 + rng() * 8;
        const x = pts[i * 2] + rx * side * off, z = pts[i * 2 + 1] + rz * side * off;
        const h = fields.heightAt(x, z);
        const sy = 4 + rng() * 16;
        const w = 3 + rng() * 6, hh = 6 + rng() * 12;
        const vertical = rng() < 0.5;
        const ang = Math.atan2(tx, tz) + (side > 0 ? Math.PI : 0) + (rng() - 0.5) * 0.3;
        _q.setFromEuler(_e.set(0, ang, 0));
        _m4.compose(_v.set(x, h + sy, z), _q, _s.set(vertical ? w * 0.45 : w, vertical ? hh : hh * 0.45, 1));
        const b = buckets[(rng() * 3) | 0];
        b.mats.push(_m4.clone());
        const tint = [0xff5fa8, 0x46e6ff, 0xffc23c, 0x9dff57, 0xffffff][(rng() * 5) | 0];
        b.colors.push(new THREE.Color(tint).multiplyScalar(1.4 + rng()));
      }
    }
  }
  buckets.forEach((b, i) => {
    if (!b.mats.length) return;
    const mat = Assets.neon(texs[i], 1);
    mat.depthWrite = false;
    const plane = new THREE.PlaneGeometry(1, 1);
    const im = new THREE.InstancedMesh(plane, mat, b.mats.length);
    b.mats.forEach((m, k) => im.setMatrixAt(k, m));
    b.colors.forEach((c, k) => im.setColorAt(k, c));
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.frustumCulled = false; im.renderOrder = 6;
    g.add(im);
  });
  return g;
}

// ---------------------------------------------------------------------------
export function buildTrees(fields, Assets, conf) {
  const g = new THREE.Group(); g.name = 'trees';
  const rng = mulberry32(conf.seed ? conf.seed + 31 : 913);
  const sakuraTrunks = [], sakuraCanopy = [], pineTrunks = [], pineCones = [];
  const pineColors = [];
  const target = conf.treeCount ?? 700;
  let tries = 0;
  while (sakuraTrunks.length + pineTrunks.length < target && tries < target * 14) {
    tries++;
    const x = (rng() - 0.5) * fields.size * 0.96;
    const z = (rng() - 0.5) * fields.size * 0.96;
    const info = fields.roadInfoAt(x, z);
    if (info.dist < info.halfWidth + 5) continue;
    const h = fields.heightAt(x, z);
    if (h < fields.sea + 1.2) continue;
    // slope check
    const hx = fields.heightAt(x + 3, z), hz = fields.heightAt(x, z + 3);
    const slope = Math.hypot(hx - h, hz - h) / 3;
    if (slope > 0.85) continue;
    const ang = rng() * Math.PI * 2;
    const sakura = h < (conf.sakuraLine ?? 30) && rng() < (conf.sakuraMix ?? 0.5);
    const sc = 0.8 + rng() * 0.7;
    _q.setFromEuler(_e.set(0, ang, 0));
    if (sakura) {
      _m4.compose(_v.set(x, h + 2.1 * sc, z), _q, _s.set(sc, sc, sc));
      sakuraTrunks.push(_m4.clone());
      _m4.compose(_v.set(x, h + 4.6 * sc, z), _q, _s.set(sc * (1 + rng() * 0.4), sc, sc * (1 + rng() * 0.4)));
      sakuraCanopy.push(_m4.clone());
    } else {
      _m4.compose(_v.set(x, h + 2.6 * sc, z), _q, _s.set(sc * 0.8, sc, sc * 0.8));
      pineTrunks.push(_m4.clone());
      _m4.compose(_v.set(x, h + 6.4 * sc, z), _q, _s.set(sc * (0.9 + rng() * 0.5), sc * (1 + rng() * 0.6), sc * (0.9 + rng() * 0.5)));
      pineCones.push(_m4.clone());
      const shade = 0.55 + rng() * 0.4;
      pineColors.push(_c.setRGB(shade * 0.5, shade, shade * 0.55).clone());
    }
  }
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a382c, roughness: 0.95 });
  const canopyMat = Assets.canopy(0xffffff);
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x2c5236, roughness: 0.9 });

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 4.4, 5);
  const canopyGeo = new THREE.PlaneGeometry(7.5, 7.5);
  const pineGeo = new THREE.ConeGeometry(2.6, 9, 7);
  const pineTrunkGeo = new THREE.CylinderGeometry(0.18, 0.34, 5.4, 5);

  if (sakuraTrunks.length) {
    const t = new THREE.InstancedMesh(trunkGeo, trunkMat, sakuraTrunks.length);
    sakuraTrunks.forEach((m, i) => t.setMatrixAt(i, m));
    t.castShadow = true; t.frustumCulled = false; g.add(t);
    // crossed double planes for canopy
    const geo2 = canopyGeo.clone();
    const merged = mergeCrossed(geo2);
    const c = new THREE.InstancedMesh(merged, canopyMat, sakuraCanopy.length);
    sakuraCanopy.forEach((m, i) => c.setMatrixAt(i, m));
    c.castShadow = true; c.frustumCulled = false; g.add(c);
  }
  if (pineTrunks.length) {
    const t = new THREE.InstancedMesh(pineTrunkGeo, trunkMat, pineTrunks.length);
    pineTrunks.forEach((m, i) => t.setMatrixAt(i, m));
    t.castShadow = true; t.frustumCulled = false; g.add(t);
    const c = new THREE.InstancedMesh(pineGeo, pineMat, pineCones.length);
    pineCones.forEach((m, i) => c.setMatrixAt(i, m));
    pineColors.forEach((col, i) => c.setColorAt(i, col));
    c.instanceColor.needsUpdate = true;
    c.castShadow = true; c.frustumCulled = false; g.add(c);
  }
  return g;
}

function mergeCrossed(planeGeo) {
  const a = planeGeo.clone(); a.rotateX(-Math.PI / 2);
  const b = planeGeo.clone(); b.rotateX(-Math.PI / 2); b.rotateY(Math.PI / 2);
  const posA = a.attributes.position.array, posB = b.attributes.position.array;
  const uvA = a.attributes.uv.array, uvB = b.attributes.uv.array;
  const iA = a.index.array, iB = b.index.array;
  const pos = new Float32Array(posA.length * 2);
  pos.set(posA, 0); pos.set(posB, posA.length);
  const uv = new Float32Array(uvA.length * 2);
  uv.set(uvA, 0); uv.set(uvB, uvA.length);
  const idx = new Uint16Array(iA.length * 2);
  idx.set(iA, 0);
  const off = posA.length / 3;
  for (let i = 0; i < iB.length; i++) idx[iA.length + i] = iB[i] + off;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// ---------------------------------------------------------------------------
// landmarks
// ---------------------------------------------------------------------------
export function torii(scale = 1) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xb0181f, roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.7 });
  const col = new THREE.CylinderGeometry(0.42, 0.55, 9, 10);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(col, red); m.position.set(s * 5.2, 4.5, 0); m.castShadow = true; g.add(m);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.9, 1.5), black);
  top.position.y = 9.4; top.castShadow = true; g.add(top);
  const top2 = new THREE.Mesh(new THREE.BoxGeometry(15.8, 0.55, 1.9), black);
  top2.position.y = 10.2; top2.castShadow = true; g.add(top2);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.7, 1.1), red);
  beam.position.y = 7.6; beam.castShadow = true; g.add(beam);
  g.scale.setScalar(scale);
  return g;
}

export function festivalStage(Assets) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x23262c, metalness: 0.7, roughness: 0.5 });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(26, 2.4, 14), metal);
  platform.position.y = 1.2; platform.castShadow = true; platform.receiveShadow = true; g.add(platform);
  const screenMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.5, 2.2) });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(22, 10), screenMat);
  screen.position.set(0, 8.6, -6.6); g.add(screen);
  for (const s of [-1, 1]) {
    const truss = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 1.2), metal);
    truss.position.set(s * 12, 7, -6); truss.castShadow = true; g.add(truss);
    const spk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6, 3), new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.8 }));
    spk.position.set(s * 15, 5.4, 2); spk.castShadow = true; g.add(spk);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(28, 0.8, 16), metal);
  roof.position.y = 14.4; roof.castShadow = true; g.add(roof);
  g.userData.update = (t) => {
    const hue = (t * 0.06) % 1;
    screenMat.color.setHSL(hue, 0.85, 0.55).multiplyScalar(2.2);
  };
  return g;
}

export function ferrisWheel() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.8, roughness: 0.35 });
  const wheel = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 0.5, 8, 40), metal);
  wheel.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(16, 0.5, 8, 40), metal);
  ring2.position.z = 2.2; wheel.add(ring2);
  const cabGeo = new THREE.BoxGeometry(2.2, 2.4, 2.6);
  const cabMat = new THREE.MeshStandardMaterial({ color: 0xff2e93, roughness: 0.5, emissive: 0x55112e, emissiveIntensity: 0.6 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const cab = new THREE.Mesh(cabGeo, i % 2 ? cabMat : new THREE.MeshStandardMaterial({ color: 0x22e1ff, roughness: 0.5, emissive: 0x0a4450, emissiveIntensity: 0.6 }));
    cab.position.set(Math.cos(a) * 16, Math.sin(a) * 16, 1.1);
    wheel.add(cab);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 32, 5), metal);
    spoke.rotation.z = a + Math.PI / 2;
    wheel.add(spoke);
  }
  wheel.position.y = 20;
  g.add(wheel);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 22, 6), metal);
    leg.position.set(s * 5, 10, 1.1); leg.rotation.z = s * 0.28; leg.castShadow = true;
    g.add(leg);
  }
  g.userData.update = (t) => { wheel.rotation.z = t * 0.12; };
  return g;
}

export function billboard(Assets, texKey, w = 16, h = 9) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.6, roughness: 0.5 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: Assets.tex[texKey] || null, color: new THREE.Color(1.25, 1.25, 1.25) }));
  face.position.y = h / 2 + 7;
  g.add(face);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 8, 6), metal);
    leg.position.set(s * w * 0.3, 4, -0.4); leg.castShadow = true;
    g.add(leg);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, h + 0.8, 0.5), metal);
  frame.position.y = h / 2 + 7; frame.position.z = -0.3;
  g.add(frame);
  return g;
}

export function streetFurniture(fields, roads, Assets, conf) {
  const g = new THREE.Group();
  const rng = mulberry32(555);
  // vending machines + bins + cones along city sidewalks
  const vm = [];
  const vmMat = new THREE.MeshStandardMaterial({ color: 0xcc2233, roughness: 0.4, emissive: 0x661122, emissiveIntensity: conf.night ? 1.2 : 0.1 });
  for (const road of roads) {
    const pts = road.points, n = pts.length / 2;
    for (let i = 0; i < n; i += 9) {
      if (rng() > 0.3) continue;
      const [tx, tz] = tangentAt(pts, i);
      const rx = -tz, rz = tx;
      const side = rng() < 0.5 ? 1 : -1;
      const off = (road.halfWidth ?? 7) + 2.2;
      const x = pts[i * 2] + rx * side * off, z = pts[i * 2 + 1] + rz * side * off;
      const h = fields.heightAt(x, z);
      _q.setFromEuler(_e.set(0, Math.atan2(tx, tz), 0));
      _m4.compose(_v.set(x, h + 0.95, z), _q, _s.set(1, 1, 1));
      vm.push(_m4.clone());
    }
  }
  if (vm.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 1.9, 0.8), vmMat, vm.length);
    vm.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.frustumCulled = false;
    g.add(im);
  }
  return g;
}
