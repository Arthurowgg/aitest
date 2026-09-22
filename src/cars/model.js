// ============================================================================
// APEX HORIZON — procedural car model builder
// Lofted / extruded bodies with taper, greenhouse glass, detailed wheels,
// lights, aero, interiors.
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math.js';

function sideShape(pts, closed = true) {
  const curve = new THREE.SplineCurve(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  const shape = new THREE.Shape(curve.getPoints(48));
  return shape;
}

function extrudeLoft(shape, width, bevel = 0.2) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 3, curveSegments: 10, steps: 1,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(Math.PI / 2);   // length(x) -> -z ... we define front at -x so it lands at +z
  geo.computeVertexNormals();
  return geo;
}

export function buildCar(car, Assets, opts = {}) {
  const { color = car.colors[0], finish = 'gloss', detail = 'full' } = opts;
  const B = car.body;
  const hl = B.length / 2, hw = B.width / 2;
  const belt = B.clearance + (B.height - B.clearance) * 0.62;
  const roof = B.height;

  const group = new THREE.Group();
  group.name = `car:${car.id}`;
  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  const paint = Assets.paint(color, finish);
  const carbon = Assets.carbon();
  const chrome = Assets.chrome();
  const plastic = Assets.blackPlastic();
  const glass = Assets.glass();
  const rubber = Assets.rubber();
  const interiorMat = Assets.interior();

  // ------------------------------------------------------------- main body
  const noseH = B.clearance + (roof - B.clearance) * B.nose;
  const tailH = B.clearance + (roof - B.clearance) * B.tail;
  const prof = [
    [-hl + 0.06, B.clearance + 0.10],
    [-hl, B.clearance + 0.30],
    [-hl + 0.02, noseH - 0.06],
    [-hl + 0.28, noseH],
    [-hl * 0.35, noseH + (belt - noseH) * 0.35],
    [-hl * 0.08, belt],
    [hl * 0.30, belt - 0.02],
    [hl * 0.72, tailH],
    [hl - 0.02, tailH - 0.04],
    [hl, B.clearance + 0.34],
    [hl - 0.10, B.clearance + 0.10],
    [hl * 0.4, B.clearance + 0.02],
    [-hl * 0.4, B.clearance + 0.02],
  ];
  const bodyGeo = extrudeLoft(sideShape(prof), B.width, 0.22);
  // width taper: nose & tail narrower, tumblehome above belt
  {
    const pos = bodyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const frontness = smoothstep(-hl * 0.2, -hl, z);       // z=+front after rotate? front at -x -> +z
      const rearness = smoothstep(hl * 0.35, hl, z);
      let taper = 1 - frontness * (1 - B.nose * 0.55) * 0.5 - rearness * 0.16;
      taper *= 1 - 0.10 * smoothstep(belt - 0.05, roof, y);
      pos.setX(i, x * clamp(taper, 0.5, 1));
    }
    bodyGeo.computeVertexNormals();
  }
  const bodyMesh = new THREE.Mesh(bodyGeo, paint);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  bodyGroup.add(bodyMesh);

  // ------------------------------------------------------------- greenhouse
  const cabF = -hl * 0.16, cabR = hl * (B.truck ? 0.86 : 0.62);
  const cabTop = roof;
  const cabProf = [
    [cabF - 0.30, belt + 0.01],
    [cabF, belt + (cabTop - belt) * 0.55],
    [cabF + 0.34, cabTop - 0.02],
    [lerp(cabF, cabR, 0.55), cabTop],
    [cabR - 0.16, cabTop - 0.05],
    [cabR, belt + (cabTop - belt) * 0.35],
    [cabR + 0.12, belt + 0.01],
  ];
  const cabGeo = extrudeLoft(sideShape(cabProf), B.width * (B.truck ? 0.86 : 0.76), 0.16);
  {
    const pos = cabGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const t = 1 - 0.16 * smoothstep(belt, cabTop, y);
      pos.setX(i, x * t);
    }
    cabGeo.computeVertexNormals();
  }
  const cabMesh = new THREE.Mesh(cabGeo, glass);
  cabMesh.renderOrder = 3;
  bodyGroup.add(cabMesh);
  // roof panel (paint) so glass isn't a full bubble
  const roofGeo = new THREE.BoxGeometry(B.width * 0.62, 0.06, (cabR - cabF) * 0.72);
  const roofMesh = new THREE.Mesh(roofGeo, finish === 'matte' ? plastic : paint);
  roofMesh.position.set(0, cabTop - 0.005, (cabF + cabR) / 2 + 0.06);
  roofMesh.castShadow = true;
  bodyGroup.add(roofMesh);

  // ------------------------------------------------------------- details
  const add = (mesh, x, y, z, parent = bodyGroup) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };

  // headlights
  const headMat = Assets.lightLens(0xeaf6ff, detail === 'full' ? 5.5 : 3.2);
  const headGeo = new THREE.BoxGeometry(0.42, 0.13, 0.16);
  const heads = [];
  for (const s of [-1, 1]) {
    const m = add(new THREE.Mesh(headGeo, headMat), s * hw * 0.62, noseH - 0.10, -hl + 0.10);
    m.rotation.y = s * -0.12;
    heads.push(m);
    if (detail === 'full') {
      const sp = new THREE.SpotLight(0xdfefff, 60, 90, Math.PI / 5.2, 0.45, 1.4);
      sp.position.set(s * hw * 0.6, noseH - 0.05, -hl + 0.2);
      const tgt = new THREE.Object3D();
      tgt.position.set(s * hw * 0.5, noseH - 0.9, -hl - 40);
      bodyGroup.add(tgt); sp.target = tgt;
      bodyGroup.add(sp);
    }
    const glow = new THREE.Sprite(Assets.glowSprite(0xbfe6ff, 0.55));
    glow.scale.setScalar(1.1);
    add(glow, s * hw * 0.62, noseH - 0.10, -hl + 0.02);
  }
  // tail lights
  const tailMat = Assets.tailLens(2.4);
  const tailGeo = new THREE.BoxGeometry(0.5, 0.11, 0.1);
  const tails = [];
  for (const s of [-1, 1]) {
    const m = add(new THREE.Mesh(tailGeo, tailMat), s * hw * 0.66, tailH - 0.14, hl - 0.06);
    tails.push(m);
    const glow = new THREE.Sprite(Assets.glowSprite(0xff2038, 0.7));
    glow.scale.setScalar(0.9);
    add(glow, s * hw * 0.66, tailH - 0.14, hl + 0.02);
  }
  const tailStrip = add(new THREE.Mesh(new THREE.BoxGeometry(hw * 1.1, 0.05, 0.06), tailMat), 0, tailH - 0.14, hl - 0.05);

  // grille / splitter / diffuser / skirts
  add(new THREE.Mesh(new THREE.BoxGeometry(hw * 1.1, 0.22, 0.1), plastic), 0, B.clearance + 0.30, -hl + 0.04);
  add(new THREE.Mesh(new THREE.BoxGeometry(hw * 1.7, 0.06, 0.5), carbon), 0, B.clearance + 0.06, -hl + 0.22);
  add(new THREE.Mesh(new THREE.BoxGeometry(hw * 1.6, 0.16, 0.4), carbon), 0, B.clearance + 0.10, hl - 0.18);
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, B.length * 0.5), carbon), s * (hw - 0.02), B.clearance + 0.10, 0);
  // exhausts
  const exN = car.engine.cyl >= 8 ? 4 : 2;
  for (let i = 0; i < exN; i++) {
    const x = (i - (exN - 1) / 2) * 0.32;
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.26, 10), chrome);
    e.rotation.x = Math.PI / 2;
    add(e, x, B.clearance + 0.17, hl - 0.04);
  }
  // mirrors
  for (const s of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), plastic);
    add(stalk, s * (hw * 0.94), belt + 0.10, cabF - 0.16);
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.06), paint);
    add(mir, s * (hw * 1.02), belt + 0.13, cabF - 0.16);
  }
  // wing
  if (B.wing > 0) {
    const wSpan = hw * 1.72, wY = tailH + (B.wing > 1 ? 0.34 : 0.2);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(wSpan, 0.05, 0.42), carbon);
    add(blade, 0, wY, hl - 0.28);
    blade.rotation.x = -0.16;
    for (const s of [-1, 1]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.30, 0.5), carbon);
      add(plate, s * wSpan / 2, wY + 0.1, hl - 0.28);
      const stay = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.08), plastic);
      add(stay, s * wSpan * 0.3, wY - 0.16, hl - 0.24);
    }
  }
  // underbody
  const under = new THREE.Mesh(new THREE.BoxGeometry(B.width * 0.86, 0.08, B.length * 0.82), plastic);
  add(under, 0, B.clearance + 0.02, 0);

  // interior (cockpit view)
  if (detail === 'full') {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(B.width * 0.68, 0.22, 0.4), interiorMat);
    add(dash, 0, belt - 0.16, cabF + 0.16);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), Assets.dashScreen());
    screen.rotation.x = -0.35;
    add(screen, 0, belt - 0.08, cabF + 0.30);
    for (const s of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.5), interiorMat);
      add(seat, s * 0.36, belt - 0.32, 0.16);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.14), interiorMat);
      back.rotation.x = -0.22;
      add(back, s * 0.36, belt - 0.06, 0.42);
    }
    const wheelT = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 20), plastic);
    wheelT.rotation.x = Math.PI / 2 - 0.35;
    add(wheelT, -0.36, belt - 0.14, cabF - 0.06);
  }

  // ------------------------------------------------------------- wheels
  const wheelR = clamp(B.height * 0.34, 0.34, 0.46) * (car.body.truck ? 1.22 : 1);
  const wheelW = 0.30 * (car.body.truck ? 1.15 : 1);
  const wheels = [];
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
  const discMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, metalness: 0.9, roughness: 0.5 });
  const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd7263d, metalness: 0.4, roughness: 0.4 });
  const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 22, 1, false);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, wheelW + 0.02, 18);
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(wheelW * 0.5, wheelR * 0.58, 0.07);
  const flareGeo = new THREE.TorusGeometry(wheelR + 0.10, 0.085, 6, 14, Math.PI);

  for (const [fi, sz] of [[1, -1], [1, 1], [-1, -1], [-1, 1]]) {
    // fi: front(1)/rear(-1) ; sz: side (-1 left, +1 right)
    const pivot = new THREE.Group();
    const z = fi * B.wheelbase / 2 * (fi > 0 ? 1 : -1) * (fi > 0 ? 1 : 1);
    pivot.position.set(sz * (hw - wheelW * 0.34), wheelR, fi * B.wheelbase / 2);
    const spin = new THREE.Group();
    pivot.add(spin);
    const tire = new THREE.Mesh(tireGeo, rubber);
    tire.castShadow = true;
    spin.add(tire);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    spin.add(rim);
    if (detail === 'full') {
      for (let s = 0; s < 5; s++) {
        const sp = new THREE.Mesh(spokeGeo, rimMat);
        sp.rotation.x = (s / 5) * Math.PI * 2;
        sp.position.x = sz * 0.02;
        spin.add(sp);
      }
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.5, wheelR * 0.5, 0.05, 16), discMat);
      disc.rotation.z = Math.PI / 2;
      pivot.add(disc);
      const cal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.22), caliperMat);
      cal.position.set(-sz * 0.02, wheelR * 0.3, -wheelR * 0.3);
      pivot.add(cal);
    }
    bodyGroup.add(pivot);
    // fender flare
    const flare = new THREE.Mesh(flareGeo, paint);
    flare.rotation.z = 0; flare.rotation.y = Math.PI / 2;
    flare.position.set(sz * (hw - 0.03), wheelR, fi * B.wheelbase / 2);
    flare.rotation.x = 0;
    flare.rotateOnAxis(new THREE.Vector3(0, 1, 0), 0);
    flare.rotation.set(0, Math.PI / 2, 0, 'XYZ');
    flare.rotateZ(0);
    bodyGroup.add(flare);
    wheels.push({ pivot, spin, front: fi > 0, side: sz, radius: wheelR });
  }

  // contact shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(B.length * 1.06, B.width * 1.5), Assets.contactShadow());
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.045;
  shadow.renderOrder = 4;
  group.add(shadow);

  group.userData = {
    specs: car, wheels, bodyGroup, shadow, paint, headMat, tailMat,
    wheelRadius: wheelR, wheelbase: B.wheelbase, halfWidth: hw, halfLength: hl, height: B.height,
    update(dt, st) {
      for (const w of wheels) {
        w.spin.rotation.x -= (st.wheelSpeed / w.radius) * dt;
        if (w.front) w.pivot.rotation.y = st.steerVisual;
      }
      bodyGroup.rotation.x = st.pitch;
      bodyGroup.rotation.z = st.roll;
      bodyGroup.position.y = st.suspendY ?? 0;
      shadow.position.y = 0.045;
      shadow.material.opacity = clamp(0.62 - (st.airborne ?? 0) * 0.5, 0.12, 0.62);
      const sc = 1 + (st.airborne ?? 0) * 0.22;
      shadow.scale.set(sc, sc, sc);
      // brake lights
      const b = st.braking ? 4.2 : 1.6;
      tailMat.color.setRGB(b, 0.06 * b, 0.08 * b);
      headMat.color.setRGB(st.night ? 6.5 : 3.0, st.night ? 6.8 : 3.2, st.night ? 7.5 : 3.6);
    },
  };
  return group;
}
