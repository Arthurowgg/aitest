// ============================================================================
// APEX HORIZON — UI click-path reproduction (headless jsdom)
//   node tools/clicktest.mjs
// Simulates: boot -> title -> PRESS START -> menu pages -> START RACE ->
//            pause/resume -> quit -> START ROAM, with real async waits.
// ============================================================================
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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
global.performance = window.performance;

const ctxStub = () => new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 300, height: 150, toDataURL: () => 'data:,' };
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

const THREE = await import('three');
const { Assets } = await import('../src/core/assets.js');
const { QUALITY } = await import('../src/core/renderer.js');
const { Game } = await import('../src/game.js');
const { Screens } = await import('../src/ui/screens.js');
const { default: Save } = await import('../src/core/save.js');

let fail = 0;
const ok = (c, msg) => { console.log(`${c ? '  ✓' : '  ✗'} ${msg}`); if (!c) fail++; };

const fakeRenderer = {
  q: QUALITY.high, qualityName: 'high', fps: 60, onFps: null, onFallback: null,
  renderer: { capabilities: { getMaxAnisotropy: () => 8 }, domElement: window.document.getElementById('gl') },
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
fakeRenderer.renderPass.scene = fakeRenderer.scene;
Assets.load = async () => Assets.tex; // headless: no texture files

const game = new Game(null, fakeRenderer);
const screens = new Screens(game);
window.__SCREENS = screens;
window.__GAME = game;
game.renderer.onFallback = () => screens.notify('Post-processing disabled', 'pink');
screens.bind();
await game.boot(() => {});
game.setShowroomCar(Save.data.active);
game.state = 'title';
game.clock.getDelta = () => 1 / 60;
for (let i = 0; i < 5; i++) game.frame();

const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
const frames = (n) => { for (let i = 0; i < n; i++) game.frame(); };
async function waitUntil(cond, label, maxMs = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    frames(2);
    if (cond()) { ok(true, `${label} (${Date.now() - t0}ms)`); return true; }
    await tick(30);
  }
  ok(false, `${label} — timed out after ${maxMs}ms`);
  return false;
}
async function clickIt(sel, label) {
  const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!el) { ok(false, `${label}: element not found (${sel})`); return false; }
  try { el.click(); await tick(20); frames(2); ok(true, `${label} clicked`); return true; }
  catch (e) { ok(false, `${label} threw: ${e.message} @ ${(e.stack.split('\n')[1] || '').trim()}`); return false; }
}

console.log('== title -> PRESS START ==');
await clickIt('#btn-press', 'PRESS START');
ok(document.getElementById('screen-menu').classList.contains('active'), 'main menu screen is active');
ok(!document.getElementById('screen-title').classList.contains('active'), 'title screen hidden');
ok(game.state === 'menu', `game.state = ${game.state}`);
frames(30);

console.log('== menu pages ==');
for (const p of ['menu-events', 'menu-garage', 'menu-freeroam', 'menu-career', 'menu-settings', 'menu-home']) {
  await clickIt(`.nav-item[data-goto="${p}"]`, `nav → ${p}`);
  ok(document.getElementById(p).classList.contains('active'), `${p} page active`);
}

console.log('== events: START RACE ==');
await clickIt('.nav-item[data-goto="menu-events"]', 'nav → events');
const rows = document.querySelectorAll('.event-row');
ok(rows.length > 0, `event rows rendered (${rows.length})`);
const unlocked = [...rows].find((r) => !r.classList.contains('locked'));
if (unlocked) await clickIt(unlocked, 'select first unlocked event');
await clickIt('#btn-start-race', 'START RACE');
await waitUntil(() => game.state === 'playing' && game.mode === 'race' && game.session, 'race loaded → playing');
frames(240);
ok(true, '240 race frames clean');

console.log('== pause / resume ==');
screens.setPause(true);
ok(game.paused === true, 'paused via setPause');
frames(5);
await clickIt('#p-resume', 'RESUME button');
ok(game.paused === false, 'resumed');

console.log('== quit -> free roam ==');
screens.quit(true);
ok(game.state === 'menu', 'quit returned to menu');
await clickIt('.nav-item[data-goto="menu-freeroam"]', 'nav → freeroam');
await clickIt('#btn-start-roam', 'START ROAM');
await waitUntil(() => game.state === 'playing' && game.mode === 'roam' && game.session, 'roam loaded → playing');
frames(120);
ok(true, '120 roam frames clean');

console.log(fail === 0 ? '\nALL CLICK PATHS OK' : `\n${fail} CLICK-PATH FAILURES`);
process.exit(fail ? 1 : 0);
