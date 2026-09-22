// ============================================================================
// APEX HORIZON — map definitions & world assembly
// ============================================================================
import * as THREE from 'three';
import { catmull, resample, polylineLength, nearestOnPolyline, mulberry32, clamp } from '../core/math.js';
import { WorldFields, buildTerrainMesh, buildWater } from '../core/terrain.js';
import { buildSky } from '../core/sky.js';
import { buildRoad, buildGate } from '../core/road.js';
import { buildCityBlocks, buildNeonSigns, buildTrees, buildTrees as _t, torii, festivalStage, ferrisWheel, billboard, streetFurniture } from '../core/props.js';
import { PetalField, RainField } from '../core/fx.js';

// ============================================================================
// MAP DEFINITIONS
// ============================================================================
export const MAP_DEFS = {
  city: {
    name: 'Shibuya Neon Circuit',
    region: 'Downtown · Night',
    desc: 'Rain-slicked streets under a canyon of neon. Tight 90s, tram lines and glowing towers.',
    poster: 'posterCity',
    env: 'envNight',
    sky: 'night',
    rain: true,
    bounds: 2400,
    conf: {
      size: 2400, res: 230, seed: 21, amplitude: 7, noiseScale: 380, ridgeAmount: 0,
      seaLevel: -14, corridor: 26, grassScale: 70, rockScale: 50, rockStart: 40,
    },
    world: {
      night: true, density: 1.0, maxHeight: 58, depth: 30, treeCount: 260, sakuraMix: 0.85,
      neon: true, city: true, streetlights: true, petals: true,
    },
    roads: [
      {
        halfWidth: 8.5, wet: true, sidewalks: true, streetlights: true, curbs: false, barrier: 'none',
        control: [
          [0, 40], [300, 10], [520, -120], [560, -340], [430, -540], [190, -620],
          [-80, -600], [-300, -480], [-360, -270], [-300, -80], [-150, 20],
        ],
        closed: true,
      },
      {
        halfWidth: 7, wet: true, sidewalks: true, streetlights: true, barrier: 'none', startLine: false, centreLine: true,
        control: [[-300, -80], [-520, -140], [-700, -60], [-760, 140], [-640, 300], [-420, 320], [-300, 200]],
        closed: false,
      },
    ],
    activities: [
      { type: 'trap', x: 120, z: -20, angle: 1.4, name: 'Neon Straight' },
      { type: 'trap', x: -330, z: -380, angle: 2.2, name: 'Kabuki Rush' },
      { type: 'drift', x: 520, z: -230, r: 90, name: 'Arcade Corner' },
      { type: 'drift', x: -220, z: -560, r: 100, name: 'Crossing Drift' },
      { type: 'jump', x: -640, z: 250, angle: 2.0, name: 'Canal Leap' },
    ],
    spots: [
      { name: 'Festival Plaza', x: -150, z: 60, icon: 'i-festival' },
      { name: 'Shibuya Crossing', x: 300, z: 10, icon: 'i-map' },
      { name: 'Harbour Gate', x: -760, z: 140, icon: 'i-map' },
    ],
  },

  touge: {
    name: 'Mt. Akina Touge',
    region: 'Mountain Pass · Dawn',
    desc: 'Five hairpins down a misty volcano slope. Guardrails, pines and no run-off.',
    poster: 'posterTouge',
    env: 'envDawn',
    sky: 'dawn',
    bounds: 2800,
    conf: {
      size: 2800, res: 240, seed: 88, amplitude: 52, noiseScale: 460, ridgeAmount: 46,
      seaLevel: -30, corridor: 20, grassScale: 60, rockScale: 46, rockStart: 22,
    },
    world: {
      night: false, city: false, treeCount: 900, sakuraMix: 0.3, sakuraLine: 18,
      streetlights: false, neon: false, petals: true,
    },
    roads: [
      {
        halfWidth: 6.5, sidewalks: false, streetlights: false, curbs: true, barrier: 'armco', barrierSides: [-1, 1],
        control: [
          [0, 60], [240, -40], [360, -260], [300, -500], [120, -640], [-120, -680],
          [-300, -560], [-320, -360], [-180, -260], [-20, -300], [40, -440], [-40, -560], [-200, -560],
        ],
        closed: true,
      },
    ],
    activities: [
      { type: 'drift', x: 330, z: -380, r: 90, name: 'Hairpin 2' },
      { type: 'drift', x: -300, z: -460, r: 90, name: 'Hairpin 4' },
      { type: 'trap', x: 60, z: -120, angle: 1.2, name: 'Summit Straight' },
      { type: 'jump', x: -120, z: -680, angle: 4.6, name: 'Crest Jump' },
    ],
    spots: [
      { name: 'Summit Shrine', x: 0, z: 60, icon: 'i-festival' },
      { name: 'Hairpin 3', x: 120, z: -640, icon: 'i-map' },
      { name: 'Valley Floor', x: -200, z: -560, icon: 'i-map' },
    ],
  },

  coast: {
    name: 'Sunset Coast Highway',
    region: 'Seaside Cliffs · Golden Hour',
    desc: 'Sweeping cliff-top sweepers above the Pacific. Fast, flowing and blinding at sunset.',
    poster: 'posterCoast',
    env: 'envSunset',
    sky: 'sunset',
    bounds: 3000,
    conf: {
      size: 3000, res: 240, seed: 55, amplitude: 26, noiseScale: 520, ridgeAmount: 16,
      seaLevel: -6, coastDir: [1, 0], coastStart: 0.42, coastDepth: 34, corridor: 24,
      grassScale: 80, rockScale: 52, rockStart: 12,
    },
    world: {
      night: false, city: false, treeCount: 620, sakuraMix: 0.45, streetlights: true,
      neon: false, water: true, petals: true,
    },
    roads: [
      {
        halfWidth: 8, sidewalks: false, streetlights: true, curbs: false, barrier: 'armco', barrierSides: [1],
        control: [
          [0, 60], [320, 0], [600, -140], [740, -400], [680, -700], [440, -900],
          [120, -960], [-200, -880], [-420, -660], [-460, -380], [-340, -140], [-140, -20],
        ],
        closed: true,
      },
    ],
    activities: [
      { type: 'trap', x: 200, z: 20, angle: 1.5, name: 'Cliff Straight' },
      { type: 'trap', x: -300, z: -800, angle: 4.4, name: 'Bay Run' },
      { type: 'drift', x: 720, z: -540, r: 110, name: 'Lighthouse Sweep' },
      { type: 'jump', x: -460, z: -520, angle: 3.4, name: 'Cliff Leap' },
    ],
    spots: [
      { name: 'Lighthouse', x: 740, z: -400, icon: 'i-map' },
      { name: 'Bay Beach', x: -200, z: -880, icon: 'i-festival' },
      { name: 'Cliff Overlook', x: 600, z: -140, icon: 'i-map' },
    ],
  },

  island: {
    name: 'Horizon Island',
    region: 'Open World · Midday',
    desc: 'The whole festival island: city edge, mountain spine, coast roads and dirt spurs. No rules.',
    poster: 'posterIsland',
    env: 'envDay',
    sky: 'day',
    bounds: 4200,
    conf: {
      size: 4200, res: 260, seed: 7, amplitude: 34, noiseScale: 620, ridgeAmount: 40,
      seaLevel: -7, island: true, islandDepth: 30, islandLift: 8, corridor: 26,
      grassScale: 90, rockScale: 55, rockStart: 26, terrainSegments: 240,
    },
    world: {
      night: false, city: true, density: 0.5, maxHeight: 34, depth: 40, treeCount: 1500,
      sakuraMix: 0.5, streetlights: true, neon: true, water: true, petals: true,
    },
    roads: [
      {
        halfWidth: 8, sidewalks: false, streetlights: true, curbs: false, barrier: 'none',
        control: [
          [0, -320], [520, -400], [940, -220], [1040, 300], [840, 780], [320, 1020],
          [-280, 1000], [-740, 780], [-980, 300], [-880, -240], [-460, -440],
        ],
        closed: true,
      },
      {
        halfWidth: 7, sidewalks: false, streetlights: false, curbs: true, barrier: 'armco', startLine: false,
        control: [[-700, 220], [-320, 140], [40, 80], [400, -20], [760, -120]],
        closed: false,
      },
      {
        halfWidth: 6, sidewalks: false, streetlights: false, curbs: true, barrier: 'armco', startLine: false,
        control: [[220, 420], [380, 660], [320, 920], [80, 1060]],
        closed: false,
      },
    ],
    activities: [
      { type: 'trap', x: 260, z: -360, angle: 1.4, name: 'Airport Straight' },
      { type: 'trap', x: -820, z: 60, angle: 1.7, name: 'West Coast Run' },
      { type: 'trap', x: 60, z: 80, angle: 1.5, name: 'Cross-Island Dash' },
      { type: 'drift', x: 980, z: 60, r: 120, name: 'East Hairpin' },
      { type: 'drift', x: -500, z: 900, r: 120, name: 'Cliff Switchbacks' },
      { type: 'drift', x: 350, z: 780, r: 100, name: 'Mountain Spur' },
      { type: 'jump', x: -880, z: -240, angle: 0.4, name: 'Dune Launch' },
      { type: 'jump', x: 320, z: 920, angle: 3.2, name: 'Ridge Gap' },
    ],
    spots: [
      { name: 'Festival Main Stage', x: 0, z: -320, icon: 'i-festival' },
      { name: 'Mountain Shrine', x: 80, z: 1060, icon: 'i-map' },
      { name: 'East Docks', x: 1040, z: 300, icon: 'i-map' },
      { name: 'West Beach', x: -980, z: 300, icon: 'i-map' },
    ],
  },
};

export const EVENT_LIST = [
  { id: 'city-1', map: 'city', name: 'Neon Nights Sprint', type: 'Sprint', laps: 2, rivals: 5, pi: 500, reward: 9000 },
  { id: 'city-2', map: 'city', name: 'Shibuya GP', type: 'Circuit', laps: 3, rivals: 7, pi: 620, reward: 14000 },
  { id: 'city-3', map: 'city', name: 'Midnight Drift Battle', type: 'Drift', laps: 2, rivals: 5, pi: 600, reward: 12000 },
  { id: 'touge-1', map: 'touge', name: 'Akina Descent', type: 'Circuit', laps: 2, rivals: 5, pi: 560, reward: 12000 },
  { id: 'touge-2', map: 'touge', name: 'Hairpin King', type: 'Circuit', laps: 3, rivals: 7, pi: 680, reward: 18000 },
  { id: 'coast-1', map: 'coast', name: 'Golden Hour Grand Tour', type: 'Circuit', laps: 3, rivals: 5, pi: 640, reward: 15000 },
  { id: 'coast-2', map: 'coast', name: 'Cliff Edge Time Attack', type: 'Time', laps: 2, rivals: 0, pi: 700, reward: 16000 },
  { id: 'island-1', map: 'island', name: 'Island Ring Marathon', type: 'Circuit', laps: 3, rivals: 7, pi: 720, reward: 22000 },
  { id: 'island-2', map: 'island', name: 'Festival Showdown', type: 'Circuit', laps: 5, rivals: 7, pi: 800, reward: 32000 },
];

// ============================================================================
// WORLD BUILDER
// ============================================================================
export async function buildWorld(key, Assets, renderer, onStep = () => {}) {
  const def = MAP_DEFS[key];
  const step = async (label, frac) => { onStep(label, frac); await new Promise((r) => setTimeout(r, 0)); };

  await step('Surveying terrain…', 0.05);
  const fields = new WorldFields(def.conf);

  // dense road polylines
  const roads = def.roads.map((r) => {
    const dense = catmull(new Float64Array(r.control.flat()), r.closed, 22);
    const pts = resample(dense, 5, r.closed);
    return { ...r, points: pts, length: polylineLength(pts) };
  });
  fields.paintRoads(roads);

  await step('Sculpting landscape…', 0.2);
  const group = new THREE.Group();
  group.add(buildTerrainMesh(fields, Assets, def.conf));

  if (def.world.water) {
    const w = buildWater(fields, Assets, def.conf);
    group.add(w);
    group.userData.water = w;
  }

  await step('Painting the sky…', 0.32);
  const sky = buildSky(def.sky, def.skyOverride || {});
  group.add(sky.mesh);
  group.add(sky.sun); group.add(sky.sun.target); group.add(sky.hemi);

  await step('Laying asphalt…', 0.45);
  const roadGroups = roads.map((r) => buildRoad(r, fields, Assets, def.world));
  roadGroups.forEach((g) => group.add(g));

  await step('Raising the skyline…', 0.6);
  if (def.world.city) group.add(buildCityBlocks(fields, roads, Assets, def.world));
  if (def.world.neon) group.add(buildNeonSigns(fields, roads, Assets, def.world));
  group.add(buildTrees(fields, Assets, { ...def.world, seed: def.conf.seed }));
  group.add(streetFurniture(fields, roads, Assets, def.world));

  await step('Hanging the lanterns…', 0.72);
  // landmarks per map
  const anims = [];
  if (key === 'city') {
    const t = torii(1.4); t.position.set(-150, fields.heightAt(-150, 60), 60); group.add(t);
    const st = festivalStage(Assets); st.position.set(-190, fields.heightAt(-190, 110), 120); st.rotation.y = 0.6; group.add(st); anims.push(st);
    const fw = ferrisWheel(); fw.position.set(-90, fields.heightAt(-90, 150), 170); group.add(fw); anims.push(fw);
    const bb = billboard(Assets, 'keyart', 18, 10); bb.position.set(60, fields.heightAt(60, -30), -60); bb.rotation.y = 2.6; group.add(bb);
    const bb2 = billboard(Assets, 'posterCity', 14, 8); bb2.position.set(-420, fields.heightAt(-420, -200), -180); bb2.rotation.y = -1.2; group.add(bb2);
  } else if (key === 'touge') {
    const t = torii(1.1); t.position.set(0, fields.heightAt(0, 60), 60); t.rotation.y = 1.4; group.add(t);
    const t2 = torii(0.9); t2.position.set(-200, fields.heightAt(-200, -560), -560); t2.rotation.y = 0.4; group.add(t2);
  } else if (key === 'coast') {
    const bb = billboard(Assets, 'posterCoast', 18, 10); bb.position.set(120, fields.heightAt(120, 40), 60); bb.rotation.y = 3.0; group.add(bb);
    const t = torii(1.2); t.position.set(-200, fields.heightAt(-200, -880), -880); group.add(t);
  } else {
    const st = festivalStage(Assets); st.position.set(0, fields.heightAt(0, -360), -360); group.add(st); anims.push(st);
    const fw = ferrisWheel(); fw.position.set(60, fields.heightAt(60, -260), -260); group.add(fw); anims.push(fw);
    const t = torii(1.3); t.position.set(80, fields.heightAt(80, 1060), 1060); group.add(t);
    const bb = billboard(Assets, 'posterIsland', 20, 11); bb.position.set(-300, fields.heightAt(-300, -380), -380); bb.rotation.y = 0.4; group.add(bb);
    const bb2 = billboard(Assets, 'keyart', 16, 9); bb2.position.set(700, fields.heightAt(700, -160), -160); bb2.rotation.y = -1.4; group.add(bb2);
  }

  await step('Seeding particles…', 0.82);
  let petals = null, rain = null;
  const petalCount = Math.round(420 * (renderer.q?.petals ?? 1));
  if (def.world.petals && petalCount > 0) {
    petals = new PetalField(Assets.tex.petal, petalCount, 90, key === 'island' ? 0xffd3e6 : 0xffc0d8);
    group.add(petals.cloud.points);
  }
  if (def.rain) {
    rain = new RainField(Assets.tex.glow, 2600, 70);
    group.add(rain.cloud.points);
  }

  await step('Baking reflections…', 0.9);
  // IBL environment from generated panorama
  const envTex = Assets.tex[def.env];
  if (envTex) {
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer.renderer);
    pmrem.compileEquirectangularShader();
    const rt = pmrem.fromEquirectangular(envTex);
    renderer.scene.environment = rt.texture;
    renderer.scene.environmentIntensity = def.world.night ? 0.7 : 1.0;
    pmrem.dispose();
  }
  renderer.setFog(new THREE.Color(sky.preset.fog), 60, renderer.q?.fogFar ?? 1700);
  renderer.setExposure(sky.preset.exposure);

  await step('Opening the island…', 1.0);

  // checkpoints + progress helper for the main (first) road
  const main = roads[0];
  const checkpoints = [];
  const cpEvery = Math.max(60, main.length / 40);
  const n = main.points.length / 2;
  for (let s = 0, i = 0; i < n; i++) {
    // accumulate
  }
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += Math.hypot(main.points[i * 2] - main.points[(i - 1) * 2], main.points[i * 2 + 1] - main.points[(i - 1) * 2 + 1]);
    if (acc >= cpEvery * checkpoints.length + 1) {
      const b = (i + 1) % n;
      const dx = main.points[b * 2] - main.points[i * 2], dz = main.points[b * 2 + 1] - main.points[i * 2 + 1];
      checkpoints.push({
        index: checkpoints.length, x: main.points[i * 2], z: main.points[i * 2 + 1],
        angle: Math.atan2(dx, dz), s: acc,
      });
    }
  }

  // sparse checkpoint gates
  {
    const gates = new THREE.Group();
    checkpoints.forEach((cp, i) => {
      if (i % 5 !== 0 && i !== checkpoints.length - 1) return;
      gates.add(buildGate(cp.x, fields.heightAt(cp.x, cp.z), cp.angle, main.halfWidth, Assets, i === 0 ? 0x9dff3c : 0x22e1ff));
    });
    group.add(gates);
  }

  // spawns on the start straight (grid behind line)
  const spawns = [];
  const t0 = [main.points[2] - main.points[0], main.points[3] - main.points[1]];
  const tl = Math.hypot(t0[0], t0[1]) || 1;
  const tx = t0[0] / tl, tz = t0[1] / tl;
  const rx = -tz, rz = tx;
  for (let i = 0; i < 12; i++) {
    const row = (i / 2) | 0, col = i % 2;
    const back = 14 + row * 9;
    const side = col ? 3.4 : -3.4;
    const x = main.points[0] - tx * back + rx * side;
    const z = main.points[1] - tz * back + rz * side;
    spawns.push({ x, z, angle: Math.atan2(tx, tz), y: fields.heightAt(x, z) });
  }

  const world = {
    key, def, group, fields, sky, roads, main, checkpoints, spawns,
    activities: def.activities.map((a, i) => ({ ...a, id: `${key}-act-${i}`, done: false, best: null })),
    spots: def.spots,
    heightAt: (x, z) => fields.heightAt(x, z),
    roadInfoAt: (x, z) => fields.roadInfoAt(x, z),
    trackProgress(x, z, hint = -1) {
      const r = nearestOnPolyline(main.points, x, z, hint, hint >= 0 ? 40 : 0);
      // arc length
      let s = r.index * 5 + r.t * 5;
      return { s, dist: Math.sqrt(r.dist2), index: r.index, t: r.t };
    },
    update(dt, t, camPos, playerPos) {
      sky.update(t, camPos);
      for (const a of anims) a.userData.update && a.userData.update(t);
      if (group.userData.water) group.userData.water.userData.update(t);
      if (petals) petals.update(dt, { x: Math.sin(t * 0.1) * 1.6, z: Math.cos(t * 0.13) * 1.2 }, playerPos || camPos);
      if (rain) rain.update(dt, { x: 3.4, z: 1.2 }, playerPos || camPos);
    },
    gatesGroup: null,
  };
  return world;
}

export function buildCheckpointGates(world, Assets) {
  const g = new THREE.Group();
  world.checkpoints.forEach((cp, i) => {
    const gate = buildGate(cp.x, world.heightAt(cp.x, cp.z), cp.angle, world.main.halfWidth, Assets, i === 0 ? 0x9dff3c : 0x22e1ff);
    g.add(gate);
  });
  world.gatesGroup = g;
  return g;
}
