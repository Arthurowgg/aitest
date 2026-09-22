// ============================================================================
// APEX HORIZON — headless integration tests (no GPU required)
//   node tools/nodetest.mjs
// ============================================================================
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---------------------------------------------------------------- static checks
let fail = 0;
const ok = (c, msg) => { console.log(`${c ? '  ✓' : '  ✗'} ${msg}`); if (!c) fail++; };

console.log('== static DOM/asset references ==');
const idsInHtml = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const srcFiles = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) srcFiles.push(p); } })(path.join(ROOT, 'src'));
const usedIds = new Set();
for (const f of srcFiles) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\$\('([a-z0-9-]+)'\)|getElementById\('([a-z0-9-]+)'\)/g)) usedIds.add(m[1] || m[2]);
}
const DYNAMIC = new Set(['roam-mapseg','ph-snap','ph-filter','ph-hide','ph-reset','ph-exit','snack']);
const missingIds = [...usedIds].filter((i) => !idsInHtml.has(i) && !DYNAMIC.has(i));
ok(missingIds.length === 0, `all getElementById targets exist (${usedIds.size} checked)` + (missingIds.length ? ` → missing: ${missingIds.join(', ')}` : ''));

const allSrc = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n') + html + fs.readFileSync(path.join(ROOT, 'styles/main.css'), 'utf8');
const iconRefs = new Set([...allSrc.matchAll(/assets\/icons\/([a-z0-9_.-]+\.png)/g)].map((m) => m[1]));
const dynIcons = new Set([...allSrc.matchAll(/icons\/\$\{[^}]*\}\.png/g)].map((m) => m[0]));
const missingIcons = [...iconRefs].filter((i) => !fs.existsSync(path.join(ROOT, 'assets/icons', i)));
ok(missingIcons.length === 0, `icon files exist (${iconRefs.size} refs)` + (missingIcons.length ? ` → missing: ${missingIcons.join(', ')}` : ''));
const texRefs = new Set([...allSrc.matchAll(/assets\/(tex|art)\/([a-z0-9_.-]+\.(png|jpg))/g)].map((m) => `${m[1]}/${m[2]}`));
const missingTex = [...texRefs].filter((i) => !fs.existsSync(path.join(ROOT, 'assets', i)));
ok(missingTex.length === 0, `texture/art files exist (${texRefs.size} refs)` + (missingTex.length ? ` → missing: ${missingTex.join(', ')}` : ''));

// ---------------------------------------------------------------- jsdom boot
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true });
global.localStorage = window.localStorage;
global.HTMLElement = window.HTMLElement;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.Image = window.Image;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
global.cancelAnimationFrame = clearTimeout;
global.devicePixelRatio = 1;
global.addEventListener = window.addEventListener.bind(window);
global.removeEventListener = window.removeEventListener.bind(window);

// canvas 2d stub
const ctxStub = () => new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return {};
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (typeof k === 'string') return t[k] !== undefined ? t[k] : (...a) => undefined;
    return undefined;
  },
  set(t, k, v) { t[k] = v; return true; },
});
window.HTMLCanvasElement.prototype.getContext = function () { return ctxStub(); };
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

// ---------------------------------------------------------------- three + game modules
const THREE = await import('three');
const { Assets } = await import('../src/core/assets.js');
const { MAP_DEFS, EVENT_LIST, buildWorld } = await import('../src/world/maps.js');
const { Vehicle } = await import('../src/cars/physics.js');
const { AIDriver } = await import('../src/cars/ai.js');
const { RaceSession, RoamSession } = await import('../src/race/race.js');
const { buildCar } = await import('../src/cars/model.js');
const { CARS, carStats, CAR_BY_ID } = await import('../src/cars/catalog.js');
const { QUALITY } = await import('../src/core/renderer.js');

const fakeRenderer = {
  q: QUALITY.high,
  renderer: { capabilities: { getMaxAnisotropy: () => 8 } },
  scene: new THREE.Scene(),
  setFog() {}, setExposure() {},
};

console.log('== world building ==');
const worlds = {};
for (const key of Object.keys(MAP_DEFS)) {
  const t0 = Date.now();
  try {
    const w = await buildWorld(key, Assets, fakeRenderer, () => {});
    worlds[key] = w;
    const h = w.heightAt(0, 0);
    ok(Number.isFinite(h) && w.checkpoints.length > 4 && w.spawns.length === 12 && w.group.children.length > 4,
      `${key}: built in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${w.group.children.length} roots · ${w.checkpoints.length} cps · track ${(w.main.length / 1000).toFixed(2)}km`);
  } catch (e) {
    ok(false, `${key} build failed: ${e.message}\n${e.stack.split('\n').slice(1, 4).join('\n')}`);
  }
}

console.log('== vehicle physics ==');
{
  const w = worlds.city;
  const car = CAR_BY_ID['kurogane-r'];
  const v = new Vehicle(car, carStats(car, {}), w);
  const sp = w.spawns[0];
  v.reset(sp.x, sp.z, sp.angle, sp.y);
  const inp = { throttle: 1, brake: 0, steer: 0, handbrake: false, boost: false };
  for (let i = 0; i < 600; i++) v.step(1 / 60, inp, { abs: true, tcs: true, stm: true });
  ok(v.speedKmh > 90, `accelerates to ${Math.round(v.speedKmh)} km/h in 10s`);
  const yaw0 = v.yaw;
  for (let i = 0; i < 90; i++) v.step(1 / 60, { ...inp, steer: 0.7 }, {});
  ok(Math.abs(v.yaw - yaw0) > 0.2, `steers (Δyaw ${(v.yaw - yaw0).toFixed(2)} rad)`);
  v.reset(sp.x, sp.z, sp.angle, sp.y);
  for (let i = 0; i < 400; i++) v.step(1 / 60, inp, {});
  const vBefore = v.speedKmh;
  let minSpd = 999;
  for (let i = 0; i < 210; i++) { v.step(1 / 60, { throttle: 0, brake: 1, steer: 0, handbrake: false, boost: false }, {}); minSpd = Math.min(minSpd, v.speedKmh); }
  ok(minSpd < 6, `brakes from ${Math.round(vBefore)} km/h to stop (min ${minSpd.toFixed(1)})`);
  // reverse
  for (let i = 0; i < 120; i++) v.step(1 / 60, { throttle: 0, brake: 1, steer: 0, handbrake: false, boost: false }, {});
  ok(v.wheelSpeed < -0.5, `reverse engages (${(v.wheelSpeed * 3.6).toFixed(1)} km/h)`);
  // handbrake drift
  v.reset(sp.x, sp.z, sp.angle, sp.y);
  for (let i = 0; i < 300; i++) v.step(1 / 60, inp, {});
  for (let i = 0; i < 90; i++) v.step(1 / 60, { ...inp, steer: 0.9, handbrake: true }, {});
  ok(v.slip > 0.3, `handbrake breaks traction (slip ${v.slip.toFixed(2)})`);
  ok(Number.isFinite(v.pos.x) && Number.isFinite(v.pos.y), 'state stays finite');
}

console.log('== car models ==');
for (const c of CARS) {
  try {
    const m = buildCar(c, Assets, { detail: 'full' });
    let tris = 0;
    m.traverse((o) => { if (o.geometry) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    m.userData.update(1 / 60, { wheelSpeed: 10, steerVisual: 0.2, pitch: 0, roll: 0, airborne: 0, braking: true });
    ok(tris > 2000, `${c.id}: ${Math.round(tris).toLocaleString()} tris`);
  } catch (e) { ok(false, `${c.id} model failed: ${e.message}`); }
}

console.log('== full race simulation (AI autopilot) ==');
{
  const w = worlds.city;
  const cars = [];
  for (let i = 0; i < 4; i++) {
    const spec = CARS[i % CARS.length];
    const v = new Vehicle(spec, carStats(spec, {}), w);
    const m = buildCar(spec, Assets, { detail: 'ai' });
    const c = { vehicle: v, model: m, car: spec, you: i === 0, name: i === 0 ? 'YOU' : `AI${i}`, color: '#fff', driver: new AIDriver(w, 0.8) };
    cars.push(c);
  }
  cars.forEach((c, i) => { const sp = w.spawns[w.spawns.length - 1 - i]; c.vehicle.reset(sp.x, sp.z, sp.angle, sp.y); });
  const sess = new RaceSession({ world: w, event: EVENT_LIST[0], cars, difficulty: 1, laps: 2, assists: { abs: true, tcs: true, stm: true, autoGear: true }, wet: true });
  let t = 0;
  const playerDriver = new AIDriver(w, 0.85);
  while (t < 420 && !sess.finished) {
    const dt = 1 / 60;
    const pi = playerDriver.update(dt, cars[0].vehicle, null, 1);
    sess.update(dt, pi, { countdown() {}, bigMessage() {}, toast() {}, wrongWay() {} });
    cars.forEach((c) => { c.model.position.copy(c.vehicle.pos); c.model.rotation.y = c.vehicle.yaw; });
    t += dt;
  }
  ok(sess.finished, `race finished in ${t.toFixed(1)}s sim time`);
  const res = sess.results;
  ok(res && res.position >= 1 && res.rows.length === 4, `results: P${res?.position}, ${res?.rows.length} rows, +${res?.credits}cr +${res?.xp}xp`);
  const st = sess.standingsRows();
  ok(st.length === 4 && st[0].gap === '—', 'standings rows well-formed');
  // laps recorded
  ok(cars.every((c) => c.bestLap != null), `all cars recorded lap times (${cars.map((c) => (c.bestLap / 1000).toFixed(1) + 's').join(', ')})`);
}

console.log('== free roam session ==');
{
  const w = worlds.island;
  const spec = CAR_BY_ID['tundra-raid'];
  const v = new Vehicle(spec, carStats(spec, {}), w);
  v.reset(w.spots[0].x, w.spots[0].z + 6, 0, w.heightAt(w.spots[0].x, w.spots[0].z));
  const m = buildCar(spec, Assets, { detail: 'full' });
  const sess = new RoamSession(w, v, m);
  const fakeHud = { toast() {}, driftPop() {}, chime() {} };
  for (let i = 0; i < 600; i++) {
    v.step(1 / 60, { throttle: 1, brake: 0, steer: Math.sin(i / 60) * 0.4, handbrake: false, boost: false }, {});
    m.position.copy(v.pos);
    sess.update(1 / 60, fakeHud);
  }
  ok(sess.score > 0, `roam score accumulates (${Math.round(sess.score)})`);
  ok(Number.isFinite(v.pos.y), 'roam vehicle stable on terrain');
}

console.log('== AI driver sanity ==');
{
  const w = worlds.touge;
  const spec = CAR_BY_ID['kaze-86'];
  const v = new Vehicle(spec, carStats(spec, {}), w);
  v.reset(w.spawns[0].x, w.spawns[0].z, w.spawns[0].angle, w.spawns[0].y);
  const ai = new AIDriver(w, 0.85);
  let maxDist = 0;
  for (let i = 0; i < 60 * 90; i++) {
    const inp = ai.update(1 / 60, v, null, 1);
    v.step(1 / 60, inp, { abs: true, tcs: true, stm: true });
    const info = w.roadInfoAt(v.pos.x, v.pos.z);
    maxDist = Math.max(maxDist, info.dist);
    if (!Number.isFinite(v.pos.x)) break;
  }
  ok(maxDist < 30, `AI stays on the touge road (max offset ${maxDist.toFixed(1)}m)`);
  const prog = ai.progress(v.pos.x, v.pos.z);
  ok(prog > 200, `AI completed distance (s=${Math.round(prog)}m of ${Math.round(w.main.length)}m)`);
}

console.log('== frame loop smoke (regression: menuSky.key crash) ==');
{
  const { Game } = await import('../src/game.js');
  const { default: Save } = await import('../src/core/save.js');
  const fakeGameRenderer = {
    q: QUALITY.high, qualityName: 'high', fps: 60, onFps: null, onFallback: null,
    renderer: { capabilities: { getMaxAnisotropy: () => 8 } },
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(72, 1, 0.35, 4000),
    renderPass: { scene: null },
    grade: { uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uSpeed: { value: 0 }, uVignette: { value: 0.42 },
      uGrain: { value: 0.055 }, uSat: { value: 1.08 }, uContrast: { value: 1.06 }, uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(0x88ddff) }, uTint: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 0 },
    } },
    beginFrame() {}, render() {}, resize() {},
    setQuality() {}, setScene(s) { this.scene = s; this.renderPass.scene = s; },
    setFog() {}, setExposure() {},
  };
  fakeGameRenderer.renderPass.scene = fakeGameRenderer.scene;
  // keep assets headless-instant: no textures (same conditions worlds were built under)
  const realLoad = Assets.load.bind(Assets);
  Assets.load = async () => Assets.tex;
  const game = new Game(null, fakeGameRenderer);
  try {
    await game.boot(() => {});
    game.setShowroomCar(Save.data.active);
    game.clock.getDelta = () => 1 / 60; // deterministic dt
    const runFrames = (nn, label) => {
      try { for (let i = 0; i < nn; i++) game.frame(); ok(true, `${label}: ${nn} frames clean`); }
      catch (e) { ok(false, `${label} frame crashed: ${e.message} @ ${(e.stack.split('\n')[1] || '').trim()}`); }
    };
    game.state = 'title'; runFrames(30, 'title loop');
    game.state = 'menu'; runFrames(30, 'menu loop');
    await game.startEvent(EVENT_LIST[0].id, { rivals: 3, laps: 1 });
    runFrames(600, 'race loop (10s sim)');
    game.paused = true; runFrames(10, 'paused loop'); game.paused = false;
    game.state = 'photo'; runFrames(10, 'photo loop'); game.state = 'playing';
    await game.startRoam(game.world.key);
    runFrames(120, 'roam loop');
    game.quitToMenu(); runFrames(10, 'quit-to-menu loop');
  } catch (e) {
    ok(false, `smoke boot/start crashed: ${e.message} @ ${(e.stack.split('\n')[1] || '').trim()}`);
  } finally {
    Assets.load = realLoad;
  }
}

console.log(fail === 0 ? '\nALL TESTS PASSED' : `\n${fail} FAILURES`);
process.exit(fail ? 1 : 0);
