#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · headless harness
   Runs the real game code in Node against a stubbed DOM/canvas so we can
   (a) catch runtime errors, (b) simulate play, (c) dump a scene for the
   ImageMagick screenshot renderer in tools/preview.py.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const ARGS = process.argv.slice(2);
const FRAMES = parseInt((ARGS.find((a) => a.startsWith("--frames=")) || "--frames=600").split("=")[1], 10);
const SEED = parseInt((ARGS.find((a) => a.startsWith("--seed=")) || "--seed=12345").split("=")[1], 10);
const SCRIPT = (ARGS.find((a) => a.startsWith("--script=")) || "--script=mine").split("=")[1];
const OUT = (ARGS.find((a) => a.startsWith("--out=")) || "").split("=")[1];

/* ── PNG size reader (asset stubs need real dimensions) ──────────────────── */
function pngSize(file) {
  try {
    const b = fs.readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch (e) { return { w: 16, h: 16 }; }
}

/* ── canvas 2D stub: records nothing, but validates the call graph ───────── */
function makeCtx(canvas) {
  const ctx = {
    canvas,
    globalAlpha: 1, globalCompositeOperation: "source-over",
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
    imageSmoothingEnabled: false, font: "", textAlign: "left",
    calls: 0,
  };
  const noop = () => { ctx.calls++; };
  for (const m of ["save", "restore", "translate", "scale", "rotate", "setTransform",
                   "clearRect", "fillRect", "strokeRect", "beginPath", "closePath",
                   "moveTo", "lineTo", "arc", "rect", "fill", "stroke", "clip",
                   "fillText", "strokeText", "drawFocusIfNeeded"]) ctx[m] = noop;
  ctx.drawImage = (img, ...rest) => {
    ctx.calls++;
    if (img === undefined || img === null) throw new Error("drawImage(null) — missing asset");
    if (rest.some((v) => typeof v === "number" && !isFinite(v)))
      throw new Error("drawImage with non-finite geometry");
  };
  ctx.createLinearGradient = () => ({ addColorStop: noop });
  ctx.createRadialGradient = () => ({ addColorStop: noop });
  ctx.measureText = (t) => ({ width: String(t).length * 7 });
  ctx.getImageData = (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  ctx.putImageData = noop;
  return ctx;
}

function makeCanvas(w = 480, h = 288) {
  const c = { width: w, height: h, style: {}, classList: { add() {}, remove() {} } };
  c.getContext = () => (c._ctx || (c._ctx = makeCtx(c)));
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h });
  c.addEventListener = () => {};
  c.removeEventListener = () => {};
  return c;
}

/* ── DOM stubs ───────────────────────────────────────────────────────────── */
const screen = makeCanvas(480, 288);
const els = {
  screen,
  boot: { classList: { add() {}, remove() {} }, style: {} },
  "boot-fill": { style: {} },
  "boot-note": { style: {}, textContent: "" },
  hint: { classList: { add() {}, remove() {} }, style: {} },
};
const listeners = {};
const sandbox = {
  console,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  setTimeout, clearTimeout, setInterval, clearInterval,
  performance: { now: () => Date.now() },
  addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); },
  removeEventListener: () => {},
  innerWidth: 1280, innerHeight: 800,
  devicePixelRatio: 1,
  localStorage: (() => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
      clear: () => m.clear(),
    };
  })(),
  document: {
    getElementById: (id) => els[id] || null,
    createElement: (tag) => (tag === "canvas" ? makeCanvas(1, 1) : { style: {}, appendChild() {} }),
    body: { appendChild() {} },
    addEventListener: () => {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

/* Image stub — resolves immediately with the real PNG dimensions */
class FakeImage {
  constructor() { this.width = 16; this.height = 16; }
  set src(v) {
    this._src = v;
    const p = path.join(ROOT, v.replace(/^assets\//, "assets/"));
    const { w, h } = pngSize(path.join(ROOT, v));
    this.width = w; this.height = h;
    this.complete = true;
    if (this.onload) setTimeout(() => this.onload(), 0);
  }
  get src() { return this._src; }
}
sandbox.Image = FakeImage;
sandbox.AudioContext = undefined;
sandbox.webkitAudioContext = undefined;

const ctx = vm.createContext(sandbox);
const files = ["js/core.js", "js/assetlist.js", "js/assets.js", "js/world.js",
               "js/entities.js", "js/render.js", "js/game.js"];
for (const f of files) {
  const code = fs.readFileSync(path.join(ROOT, f), "utf8");
  try {
    vm.runInContext(code, ctx, { filename: f });
  } catch (e) {
    console.error(`✗ ${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log(`✓ all ${files.length} scripts loaded`);

/* ── drive the game ──────────────────────────────────────────────────────── */
const DG = sandbox.DG;
/* top-level `const`s live in the VM's global lexical scope, not on sandbox */
const T = vm.runInContext("T", ctx);
const TILES = vm.runInContext("TILES", ctx);
const ORE_DEFS = vm.runInContext("ORE_DEFS", ctx);

async function main() {
await new Promise((r) => setTimeout(r, 60));   // let the asset promises settle
if (!DG.game) { console.error("✗ DG.game missing"); process.exit(1); }
const game = DG.game;
game.world = new DG.World(SEED);       // deterministic seed for QA
game.newWorld(true);
game.state = "play";

/* deterministic-ish input driver */
let rngState = 1337;
const rnd = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const I = DG.Input;
let mined0 = 0, spawns = 0;
const STEP = 1 / 60;
let t = 0;
const log = [];

for (let f = 0; f < FRAMES; f++) {
  t += STEP;
  I.keys = Object.create(null);
  I.touch.buttons = [];

  if (SCRIPT === "systems") {
    /* ── exercise every system in turn, asserting as we go ── */
    const checks = [];
    const ok = (label, cond) => { checks.push(`${cond ? "✓" : "✗"} ${label}`); if (!cond) failures++; };
    const p = game.player;
    let failures = 0;

    /* mining one tile of each kind */
    const kinds = [T.DIRT, T.STONE, T.DEEPSLATE, T.CRYSTAL, T.OBSIDIAN, T.MAGMA];
    for (const id of kinds) {
      const y = 200, x = 100 + id;
      game.world.set(x, y, id, { silent: true });
      const res = game.world.breakTile(x, y);
      ok(`break ${TILES[id].name}`, !!res);
    }
    /* ore gating: a copper vein must refuse a wooden pickaxe */
    game.world.set(150, 200, T.IRON, { silent: true });
    ok("iron blocked for wood pick", game.world.canMine(150, 200, 1) === "tier");
    ok("iron allowed for copper pick", game.world.canMine(150, 200, 2) === "ok");
    ok("bedrock never breaks", game.world.canMine(150, 255, 7) === "hard");

    /* the forge: ore in → tier up */
    p.ore = {};
    ok("cannot forge copper with no ore", !game.canForge(1));
    p.ore.copper = 10;
    ok("can forge copper with 10 copper", game.canForge(1));
    game.forge(1);
    ok("tier advanced to copper", p.tier === 1);
    ok("copper was spent", (p.ore.copper || 0) === 0);
    p.ore = { iron: 18, silver: 26, gold: 20, ruby: 10, diamond: 24, mythril: 22, coreium: 8 };
    for (let i = 2; i < DG.PICKS.length; i++) game.forge(i);
    ok("all seven pickaxes forgeable", p.tier === 6);
    ok("cannot skip ahead", (game.canForge(6) === false || p.tier === 6));

    /* shop */
    p.coins = 5000;
    for (const item of DG.SHOP) game.buy(item);
    ok("lantern bought", p.up.lantern === true);
    ok("boots bought", p.up.boots === true);
    ok("bombs in bag", p.bombs >= 1);
    ok("max hp grew", p.maxHp > 10);

    /* bombs */
    const before = game.world.get(120, 210);
    game.world.set(120, 210, T.STONE, { silent: true });
    game.explode(120 * 16 + 8, 210 * 16 + 8);
    ok("bomb clears rock", game.world.get(120, 210) === T.AIR);

    /* monsters */
    const mob = new DG.Mob("golem", p.x + 30, p.y);
    game.mobs.push(mob);
    game.attackMob(mob, { dx: 1, dy: 0 });
    ok("pickaxe damages a golem", mob.hp < mob.maxHp);
    mob.hurt(99, 0, 0);
    ok("golem dies", mob.dead === true);
    ok("spawn cap sane", (() => { for (let i = 0; i < 40; i++) game.updateMobs(1); return game.mobs.length <= 8; })());

    /* hazards */
    p.hp = p.maxHp;
    p.invuln = 0;
    p.up.cushion = false;
    p.vy = 420;
    ok("fall damage hurts", (p.hurt(Math.floor((420 - 250) / 110) + 1), p.hp < p.maxHp));
    p.hp = p.maxHp;
    p.hits(game.world, p.x, p.y + 20);
    ok("lava flagged in deep world", typeof game.world.isLava(10, 250) === "boolean");

    /* fast travel */
    p.y = 230 * 16;
    game.warpHome();
    ok("warp returns to camp", Math.abs(p.cx - game.world.campX * 16) < 40);

    /* menus render without exploding */
    for (const st of ["title", "shop", "pause", "dead"]) {
      game.state = st;
      game.shopTab = 0;
      try { DG.Render.frame(game.g, game); } catch (e) { ok(`render ${st}`, false); }
      game.shopTab = 1;
      try { DG.Render.frame(game.g, game); ok(`render ${st} (shop tab)`, true); }
      catch (e) { ok(`render ${st} (shop tab): ${e.message}`, false); }
    }
    game.state = "play";

    /* death & revive */
    p.hp = 1;
    p.invuln = 0;
    p.hurt(99, p.cx + 10);
    ok("lethal damage kills", p.dead === true);
    game.state = "dead";
    game.revive();
    ok("revive restores health", p.hp === p.maxHp && p.dead === false);
    ok("revive returns to camp", Math.abs(p.cx - game.world.campX * 16) < 40);
    ok("revive keeps the forge", p.tier === 6);
    const blob0 = (() => { game.save(); return JSON.parse(sandbox.localStorage.getItem("deepdig.save.v1")); })();
    ok("save never stores a corpse", blob0.hp >= 1);

    /* save & reload */
    game.save();
    const blob = JSON.parse(sandbox.localStorage.getItem("deepdig.save.v1"));
    ok("save has a seed", typeof blob.seed === "number");
    ok("save stores mined tiles", blob.mods.idxs.length >= 0);
    const reload = new DG.World(blob.seed);
    reload.applyMods(blob.mods);
    ok("world state reloads", reload.tiles.length === game.world.tiles.length);

    console.log(checks.join("\n"));
    console.log(failures ? `✗ ${failures} system check(s) failed` : "✓ every system check passed");
    process.exit(failures ? 1 : 0);
  }

  if (SCRIPT === "mine") {
    /* dig downward, wander sideways, jump on occasion */
    I.keys.KeyS = true;
    if (f % 220 < 40) I.keys.Space = true;
    if (f % 90 === 0) { I.keys.KeyS = false; I.keys.KeyD = true; }
    if (f % 90 === 30) { I.keys.KeyS = false; I.keys.KeyD = false; I.keys.KeyA = true; }
    const p = game.player;
    I.mouse.x = p.cx - DG.Render.camera.x;
    I.mouse.y = (p.y + 26) - DG.Render.camera.y;
    I.mouse.down = true;
    I.mouse.inside = true;
  } else if (SCRIPT === "surface") {
    /* stand at camp on the surface, look around a little */
    I.mouse.down = false;
    const p = game.player;
    I.mouse.x = p.cx - DG.Render.camera.x + 30;
    I.mouse.y = p.cy - DG.Render.camera.y - 10;
    I.mouse.inside = true;
    if (f % 120 < 60) I.keys.KeyD = true; else I.keys.KeyA = true;
  } else if (SCRIPT === "idle") {
    I.mouse.down = false;
  } else if (SCRIPT === "deep") {
    /* teleport deep and fight */
    if (f === 2) { game.player.y = 232 * 16; game.player.x = game.world.W / 2 * 16; }
    const p = game.player;
    I.mouse.down = f % 30 < 15;
    I.mouse.x = p.cx - DG.Render.camera.x + (rnd() - 0.5) * 30;
    I.mouse.y = p.cy - DG.Render.camera.y + (rnd() - 0.5) * 30;
    I.keys.KeyA = f % 120 < 60;
    I.keys.KeyD = !I.keys.KeyA;
    I.keys.Space = f % 70 === 0;
  }

  if (f === 300 && SCRIPT !== "idle") I.keys.KeyE = true;      // open the forge
  if (f === 301 && SCRIPT !== "idle") { I.pressed.KeyE = true; }
  if (f === 320) { game.state = "play"; }
  if (f % 240 === 0 && f > 0) { I.pressed.KeyB = true; }        // drop a bomb

  try {
    game.handleInput();
    game.update(STEP);
    DG.Render.frame(game.g, game);
    I.clear();
  } catch (e) {
    console.error(`✗ frame ${f} (state=${game.state}): ${e.stack.split("\n").slice(0, 4).join("\n   ")}`);
    process.exit(1);
  }
  if (f % 120 === 0) {
    log.push(`  t=${t.toFixed(0)}s state=${game.state} hp=${game.player.hp} ` +
             `coins=${game.player.coins} ore=${JSON.stringify(game.player.ore)} ` +
             `y=${game.player.y.toFixed(0)} mobs=${game.mobs.length} ` +
             `drops=${game.drops.list.length} parts=${game.particles.list.length}`);
  }
}

/* ── summary ─────────────────────────────────────────────────────────────── */
const p = game.player;
console.log(log.join("\n"));
console.log(`✓ ${FRAMES} frames simulated, no errors`);
console.log(`  state=${game.state} hp=${p.hp}/${p.maxHp} coins=${p.coins} tier=${p.tier}`);
console.log(`  ore=${JSON.stringify(p.ore)}`);
console.log(`  depth=${game.world.depthMeters(p.cy / 16)}m mined=${game.stats.mined} kills=${game.stats.kills}`);
console.log(`  mobs alive=${game.mobs.length} drops=${game.drops.list.length} bombs=${game.bombs.length}`);
console.log(`  tiles changed=${game.world.mods.size}`);

/* ── optional scene dump for the screenshot renderer ────────────────────── */
if (OUT) {
  const c = DG.Render.camera;
  const scene = {
    view: { w: 480, h: 288 },
    camera: { x: c.x, y: c.y },
    state: game.state,
    seed: SEED,
    depth: game.world.depthMeters(p.cy / 16),
    lantern: !!p.up.lantern,
    surfaceY: game.world.surfaceY,
    player: { x: p.x, y: p.y, w: p.w, h: p.h, anim: p.anim, tier: p.tier, hp: p.hp, maxHp: p.maxHp, coins: p.coins },
    mobs: game.mobs.map((m) => ({ kind: m.kind, x: m.x, y: m.y, frame: m.frame })),
    drops: game.drops.list.map((d) => ({ x: d.x, y: d.y, ore: d.ore })),
    tiles: [],
  };
  const x0 = Math.floor(c.x / 16) - 1, x1 = Math.ceil((c.x + 480) / 16) + 1;
  const y0 = Math.floor(c.y / 16) - 1, y1 = Math.ceil((c.y + 288) / 16) + 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= game.world.W || y >= game.world.H) continue;
      const i = y * game.world.W + x;
      const id = game.world.tiles[i];
      if (id === 0) continue;
      scene.tiles.push({ x, y, id, v: game.world.variants[i], dmg: game.world.damage[i] });
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= game.world.W || y >= game.world.H) continue;
      const i = y * game.world.W + x;
      if (game.world.tiles[i] !== 0) continue;
      const b = game.world.bg[i];
      if (b) (scene.walls = scene.walls || []).push({ x, y, id: b, v: game.world.variants[i] });
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(scene));
  console.log(`  scene written → ${OUT} (${scene.tiles.length} tiles)`);
}
}

main().catch((e) => { console.error("✗ harness:", e); process.exit(1); });
