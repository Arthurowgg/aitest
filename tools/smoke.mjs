// headless smoke test: boots the game, walks the menus, starts a race, screenshots
import { createRequire } from 'module';
const require = createRequire('/tmp/pptr/package.json');
const puppeteer = require('puppeteer');

const URL = process.env.URL || 'http://127.0.0.1:8080/';
const OUT = process.env.OUT || '/tmp/shots';
import fs from 'fs';
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--enable-webgl', '--ignore-gpu-blocklist', '--disable-dev-shm-usage',
    '--window-size=1600,900',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const errors = [];
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${t}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => errors.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));

console.log('→ open', URL);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

// wait for boot to finish (title screen active)
try {
  await page.waitForFunction(() => document.querySelector('#screen-title')?.classList.contains('active'), { timeout: 90000 });
  console.log('✓ title screen reached');
} catch (e) {
  console.log('✗ title screen timeout');
}
await sleep(1500);
await page.screenshot({ path: `${OUT}/01-title.png` });

// press start
await page.click('#btn-press');
await sleep(2500);
await page.screenshot({ path: `${OUT}/02-menu-home.png` });
console.log('✓ menu home');

// garage
await page.evaluate(() => document.querySelectorAll('.nav-item')[2].click());
await sleep(2000);
await page.screenshot({ path: `${OUT}/03-garage.png` });
console.log('✓ garage');

// events
await page.evaluate(() => document.querySelectorAll('.nav-item')[1].click());
await sleep(1200);
await page.screenshot({ path: `${OUT}/04-events.png` });

// configure: 1 lap, solo rivals for speed, then start
await page.evaluate(() => {
  document.querySelectorAll('#seg-laps button')[0].click();
  document.querySelectorAll('#seg-rivals button')[0].click();
});
await sleep(300);
console.log('→ starting race…');
await page.click('#btn-start-race');
try {
  await page.waitForFunction(() => window.__GAME && window.__GAME.state === 'playing', { timeout: 120000 });
  console.log('✓ race session live');
} catch (e) { console.log('✗ race did not start'); }
await sleep(5000);
await page.screenshot({ path: `${OUT}/05-countdown.png` });
// drive
await page.keyboard.down('w');
await sleep(6000);
await page.keyboard.down('a');
await sleep(1200);
await page.keyboard.up('a');
await sleep(4000);
await page.screenshot({ path: `${OUT}/06-driving.png` });
const stats = await page.evaluate(() => {
  const g = window.__GAME;
  const p = g.session && (g.session.playerCar || { vehicle: g.session.vehicle });
  return {
    fps: Math.round(g.renderer.fps), speed: Math.round(p?.vehicle.speedKmh || 0),
    pos: p?.vehicle.pos.toArray().map((v) => Math.round(v)),
    mode: g.mode, state: g.state,
    tris: g.renderer.renderer.info.render.triangles,
    calls: g.renderer.renderer.info.render.calls,
  };
});
console.log('stats', JSON.stringify(stats));
await page.keyboard.up('w');

// free roam quick check
await page.evaluate(() => { window.__GAME.quitToMenu(); });
await sleep(800);
await page.evaluate(() => { document.querySelectorAll('.nav-item')[3].click(); });
await sleep(800);
await page.screenshot({ path: `${OUT}/07-roam.png` });
await page.evaluate(() => { document.getElementById('btn-start-roam').click(); });
try {
  await page.waitForFunction(() => window.__GAME && window.__GAME.state === 'playing' && window.__GAME.mode === 'roam', { timeout: 120000 });
  console.log('✓ roam live');
} catch (e) { console.log('✗ roam failed'); }
await sleep(3000);
await page.keyboard.down('w'); await sleep(5000); await page.keyboard.up('w');
await page.screenshot({ path: `${OUT}/08-roam-drive.png` });
const stats2 = await page.evaluate(() => ({ fps: Math.round(window.__GAME.renderer.fps), tris: window.__GAME.renderer.renderer.info.render.triangles }));
console.log('roam stats', JSON.stringify(stats2));

console.log('\n=== console issues (first 40) ===');
errors.slice(0, 40).forEach((e) => console.log(' ', e.slice(0, 300)));
console.log('total issues:', errors.length);
await browser.close();
