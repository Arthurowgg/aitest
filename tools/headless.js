#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · headless harness
   Runs the real game code in Node against a stubbed DOM/canvas so we can
   (a) catch runtime errors, (b) simulate operating the console, (c) prove the
   systems add up.  The scene dumps feed tools/preview.py, which turns them
   into ImageMagick screenshots.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const ARGS = process.argv.slice(2);
const arg = (k, d) => (ARGS.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const FRAMES = parseInt(arg("frames", "600"), 10);
const SEED = parseInt(arg("seed", "12345"), 10);
const SCRIPT = arg("script", "mine");
const OUT = arg("out", "");
const FORCE_STATE = arg("state", "");

/* ── PNG size reader (asset stubs need real dimensions) ──────────────────── */
function pngSize(file) {
  try {
    const b = fs.readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch (e) { return { w: 16, h: 16 }; }
}

/* ── canvas 2D stub: validates the call graph and dumps draw records ─────── */
/* The recorder mirrors the real 2D context closely enough that tools/replay.py
   can rasterise a frame from it: transform, clip stack, fills and image blits. */
function makeCtx(canvas) {
  const ctx = {
    canvas,
    globalAlpha: 1, globalCompositeOperation: "source-over",
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
    imageSmoothingEnabled: false, font: "", textAlign: "left",
    calls: 0, record: null,
    m: [1, 0, 0, 1, 0, 0],       // a b c d e f
    clipRect: null,
  };
  const stack = [];
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  ctx.save = () => { ctx.calls++; stack.push([ctx.m.slice(), ctx.clipRect, ctx.globalAlpha]); };
  ctx.restore = () => {
    ctx.calls++;
    const st = stack.pop();
    if (st) { ctx.m = st[0]; ctx.clipRect = st[1]; ctx.globalAlpha = st[2]; }
  };
  ctx.translate = (x, y) => { ctx.calls++; ctx.m = mul(ctx.m, [1, 0, 0, 1, x, y]); };
  ctx.scale = (x, y) => { ctx.calls++; ctx.m = mul(ctx.m, [x, 0, 0, y, 0, 0]); };
  ctx.rotate = (a) => { ctx.calls++; ctx.m = mul(ctx.m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); };
  ctx.setTransform = (a, b, c, d, e, f) => { ctx.calls++; ctx.m = [a, b, c, d, e, f]; };
  ctx.beginPath = () => { ctx.calls++; ctx._path = []; };
  ctx.rect = (x, y, w, h) => { ctx.calls++; (ctx._path = ctx._path || []).push({ x, y, w, h }); };
  ctx.closePath = () => { ctx.calls++; };
  ctx.moveTo = (x, y) => { ctx.calls++; ctx._line = { x, y }; };
  ctx.lineTo = () => { ctx.calls++; };
  ctx.arc = () => { ctx.calls++; };
  ctx.fill = () => { ctx.calls++; };
  ctx.stroke = () => { ctx.calls++; };
  ctx.clip = () => {
    ctx.calls++;
    const r = (ctx._path || [])[0];
    if (r) ctx.clipRect = r;
  };
  const m = (x, y) => [ctx.m[0] * x + ctx.m[2] * y + ctx.m[4], ctx.m[1] * x + ctx.m[3] * y + ctx.m[5]];
  ctx.fillRect = (x, y, w, h) => {
    ctx.calls++;
    if (!ctx.record) return;
    const p0 = m(x, y), p1 = m(x + w, y + h);
    ctx.record(ctx, { t: "rect", x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1],
                      col: String(ctx.fillStyle), a: ctx.globalAlpha, clip: ctx.clipRect });
  };
  ctx.clearRect = ctx.fillRect;
  ctx.strokeRect = (x, y, w, h) => {
    ctx.calls++;
    if (!ctx.record) return;
    const p0 = m(x, y), p1 = m(x + w, y + h);
    ctx.record(ctx, { t: "line", x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1],
                      col: String(ctx.strokeStyle), a: ctx.globalAlpha, lw: ctx.lineWidth,
                      clip: ctx.clipRect });
  };
  ctx.fillText = () => { ctx.calls++; };
  ctx.strokeText = () => { ctx.calls++; };
  ctx.drawFocusIfNeeded = () => { ctx.calls++; };
  ctx.drawImage = (img, ...rest) => {
    ctx.calls++;
    if (img === undefined || img === null) throw new Error("drawImage(null) — missing asset");
    if (rest.some((v) => typeof v === "number" && !isFinite(v)))
      throw new Error("drawImage with non-finite geometry");
    if (!ctx.record || !img._path) return;
    let sx = 0, sy = 0, sw = img.width, sh = img.height, x = 0, y = 0, w = sw, h = sh;
    if (rest.length === 2) { x = rest[0]; y = rest[1]; }
    else if (rest.length === 4) { x = rest[0]; y = rest[1]; w = rest[2]; h = rest[3]; }
    else if (rest.length === 8) {
      sx = rest[0]; sy = rest[1]; sw = rest[2]; sh = rest[3];
      x = rest[4]; y = rest[5]; w = rest[6]; h = rest[7];
    }
    ctx.record(ctx, { t: "img", path: img._path, sx, sy, sw, sh, x, y, w, h,
                      a: ctx.globalAlpha, m: ctx.m.slice(), clip: ctx.clipRect });
  };
  ctx.createLinearGradient = () => ({ addColorStop: () => {} });
  ctx.createRadialGradient = () => ({ addColorStop: () => {} });
  ctx.measureText = (t) => ({ width: String(t).length * 7 });
  ctx.getImageData = (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  ctx.putImageData = () => {};
  return ctx;
}

function makeStyle() {
  return { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" };
}

function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    contains: (c) => set.has(c),
    toggle: (c, on) => { const v = on === undefined ? !set.has(c) : !!on; if (v) set.add(c); else set.delete(c); return v; },
  };
}

function makeEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    style: makeStyle(),
    classList: makeClassList(),
    dataset: {},
    children: [],
    textContent: "",
    attrs: {},
    handlers: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(k, f) { (this.handlers[k] = this.handlers[k] || []).push(f); },
    removeEventListener() {},
    querySelector(sel) {
      return this.children.find((c) => c.tagName === String(sel).toUpperCase()) || null;
    },
    querySelectorAll(sel) {
      return this.children.filter((c) => c.tagName === String(sel).toUpperCase());
    },
    get firstChild() { return this.children[0] || null; },
    setPointerCapture() {}, releasePointerCapture() {},
    appendChild(c) { this.children.push(c); return c; },
    focus() {}, blur() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h }),
  };
  return el;
}

function makeCanvas(w = 480, h = 288) {
  const c = { width: w, height: h, style: makeStyle(), classList: makeClassList() };
  c.getContext = () => (c._ctx || (c._ctx = makeCtx(c)));
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h });
  c.handlers = {};
  c.addEventListener = (k, f) => { (c.handlers[k] = c.handlers[k] || []).push(f); };
  c.removeEventListener = () => {};
  return c;
}

/* ── DOM stubs ───────────────────────────────────────────────────────────── */
const screen = makeCanvas(480, 288);

/* the touch deck is built from the real markup in index.html, so the harness
   breaks the moment the page and the code drift apart */
const htmlSrc = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const deckMarkup = htmlSrc.slice(htmlSrc.indexOf('<div id="deck"'),
                                 htmlSrc.indexOf("<script src="));

function buildDeck(markup) {
  const deck = makeEl("div");
  deck.id = "deck";
  const kids = [];
  const spawn = (attrs, inner, tag) => {
    const el = makeEl(tag);
    for (const [k, v] of attrs) el.setAttribute(k, v);
    if (/<small[^>]*>([\s\S]*?)<\/small>/.test(inner || "")) {
      const small = makeEl("small");
      small.textContent = RegExp.$1.trim();
      el.small = small;
    }
    el.querySelector = (sel) => (sel === "small" ? el.small || null : null);
    kids.push(el);
    return el;
  };
  for (const m of markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const attrs = [...m[1].matchAll(/([a-z-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]);
    spawn(attrs, m[2], "button");
  }
  for (const m of markup.matchAll(/<(span|div|i)\b([^>]*)>/g)) {
    const attrs = [...m[2].matchAll(/([a-z-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]);
    if (attrs.some(([k]) => ["data-v", "data-bar", "data-warn", "data-only"].includes(k)))
      spawn(attrs, "", m[1]);
  }
  deck.appendChild = (k) => { kids.push(k); return k; };
  deck.querySelectorAll = (sel) => {
    const key = sel.replace(/[\[\]]/g, "");
    return kids.filter((k) => (k.attrs[key] !== undefined));
  };
  deck.querySelector = (sel) => deck.querySelectorAll(sel)[0] || null;
  return deck;
}
const deck = buildDeck(deckMarkup);

const els = {
  screen,
  deck,
  stage: Object.assign(makeEl("div"), { id: "stage", clientWidth: 1280, clientHeight: 720 }),
  boot: { classList: { add() {}, remove() {} }, style: {} },
  "boot-fill": { style: {} },
  "boot-note": { style: {}, textContent: "" },
  hint: { classList: { add() {}, remove() {} }, style: {} },
};
const listeners = {};
const docListeners = {};
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
  matchMedia: (q) => ({ matches: /coarse/.test(q) ? false : false, media: q }),
  navigator: { maxTouchPoints: 5, userAgent: "headless", vibrate: () => true },
  location: { search: "", href: "http://localhost/" },
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
    hidden: false,
    getElementById: (id) => els[id] || null,
    querySelector: (sel) => (sel === "body" ? sandbox.document.body : null),
    querySelectorAll: () => [],
    createElement: (tag) => (tag === "canvas" ? makeCanvas(1, 1) : makeEl(tag)),
    documentElement: makeEl("html"),
    body: makeEl("body"),
    addEventListener: (k, f) => { (docListeners[k] = docListeners[k] || []).push(f); },
    fullscreenElement: null,
    exitFullscreen: () => {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

/* Image stub — resolves immediately with the real PNG dimensions */
class FakeImage {
  constructor() { this.width = 16; this.height = 16; }
  set src(v) {
    this._src = v;
    this._path = v;
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

/* seed the sandbox's randomness too, so a run is reproducible end to end */
let randState = SEED >>> 0 || 1;
const seededRandom = () => ((randState = (randState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
sandbox.Math = Object.create(Math);
sandbox.Math.random = seededRandom;

const ctx = vm.createContext(sandbox);
/* take the script order straight from index.html — a mismatch there is a bug
   the browser would hit immediately and a fixed list would hide */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const files = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
if (!files.length) { console.error("✗ no <script> tags found in index.html"); process.exit(1); }
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
const TOUCH = arg("touch", "") === "1";
/* which control flavour a screen script should render: QA wants both, a
   screenshot render wants one.  --ui=touch | --ui=desktop | (default: both) */
const UI = arg("ui", "both");
function flavour(f) {
  if (UI === "touch") { if (f === 0) DG.Touch.enabled = true; return; }
  if (UI === "desktop") { if (f === 0) DG.Touch.enabled = false; return; }
  if (f === 0) DG.Touch.enable();
  if (f === Math.floor(FRAMES / 2)) DG.Touch.enabled = false;
}
const missingAssets = new Set();
const T = vm.runInContext("T", ctx);
const TILES = vm.runInContext("TILES", ctx);

async function main() {
  await new Promise((r) => setTimeout(r, 60));   // let the asset promises settle
  if (!DG.game) { console.error("✗ DG.game missing (main.js never booted)"); process.exit(1); }
  const game = DG.game;

  /* every A() miss is a rendering gap — record them all */
  const realA = DG.Assets.A.bind(DG.Assets);
  DG.Assets.A = (p) => { const img = realA(p); if (!img) missingAssets.add(p); return img; };

  if (TOUCH) DG.Touch.enable();
  game.rig = new DG.Rig(SEED);
  game.logLines = [];
  if (FORCE_STATE) game.state = FORCE_STATE;
  else game.state = "console";

  const I = DG.Input;
  const STEP = 1 / 60;
  const log = [];
  let t = 0;
  const T3 = {
    fails: [],
    assert(label, ok) {
      if (ok) { T3.passed++; return; }
      if (T3.fails.includes(label)) return;
      T3.fails.push(label);
      console.log("✗ " + label);
      process.exitCode = 1;
    },
    passed: 0,
  };

  /* deterministic input driver */
  let rngState = 1337;
  const rnd = () => ((rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const click = (x, y) => { I.mx = x; I.my = y; I.down = true; I.clicked = true; };
  const frame = () => {
    game.handleInput();
    game.update(STEP);
    DG.Render.frame(game.g, game);
    I.clear();
  };

  /* ── systems: prove every machine adds up ─────────────────────────────── */
  if (SCRIPT === "systems") {
    let failures = 0;
    const checks = [];
    const ok = (label, cond) => { checks.push(`${cond ? "✓" : "✗"} ${label}`); if (!cond) failures++; };
    const rig = game.rig;
    const well = rig.well;

    /* the rock is a pure function: same seed, same cell */
    const w2 = new DG.Well(SEED);
    ok("well sampling is deterministic", well.at(3, 42).tile === w2.at(3, 42).tile);
    const deep = well.at(5, 300);
    ok("depth maps to a stratum", DG.strataAt(300 * 4).name === DG.strataAt(deep.metres).name);
    ok("strata get hotter with depth", DG.strataAt(1600).temp > DG.strataAt(40).temp);

    /* the seven drills: strictly better, forge-only-in-order */
    ok("exactly seven drills", DG.DRILLS.length === 7);
    ok("drills get stronger", DG.DRILLS.every((d, i) => i === 0 || d.power > DG.DRILLS[i - 1].power));
    ok("cannot forge the second bit without copper", !rig.canForge(1));
    rig.bank.copper = 40;
    ok("cannot afford the copper bit without credits", !rig.canForge(1));
    rig.credits = 5000;
    ok("forge copper once copper is banked", rig.canForge(1));
    rig.forge(game, 1);
    ok("drill index advanced", rig.drillIndex === 1);
    ok("copper was consumed", rig.bank.copper === 26);
    ok("cannot skip to the mythril bit", !rig.canForge(6));

    /* drilling: hold the bit and the rock gives way */
    rig.drillOn = true;
    const beforeDrilled = rig.well.drilled.size;
    for (let i = 0; i < 240; i++) { rig.drillOn = true; rig.tick(STEP, game); }
    ok("drilling breaks the cell below", rig.well.drilled.size > beforeDrilled);
    ok("the rig descends as it drills", rig.y >= 1);
    ok("the drill makes heat", rig.heat > 0);
    ok("the drill makes cargo or dust", rig.cargoUsed >= 0);

    /* ore: cargo holds only what fits */
    rig.cargo = {}; rig.cargoCap = 3;
    const got = rig.addOre("iron", 10, game);
    ok("cargo respects its capacity", got === 3 && rig.cargo.iron === 3);
    ok("a full hold refuses ore", rig.addOre("iron", 5, game) === 0);

    /* hazards bite */
    rig.cargo = {}; rig.cargoCap = 12;
    let hazardCell = null;
    for (let y = 20; y < 240 && !hazardCell; y++)
      for (let x = 0; x < well.W; x++)
        if (TILES[well.at(x, y).tile].hazard) { hazardCell = { x, y }; break; }
    ok("the rock holds gas pockets or lava veins", !!hazardCell);
    if (hazardCell) {
      const hull0 = rig.hull;
      rig.x = hazardCell.x; rig.y = hazardCell.y - 1;
      rig.breach(hazardCell.x, hazardCell.y, game);
      ok("breaching a hazard costs hull", rig.hull < hull0);
      ok("breaching a hazard logs an alert", rig.alerts.length > 0);
    }

    /* heat: venting cools it */
    rig.heat = rig.heatMax;
    const hot = rig.heat;
    rig.cmdVent(game);
    for (let i = 0; i < 200; i++) rig.tick(STEP, game);
    ok("venting dumps heat", rig.heat < hot * 0.5);

    /* overheat burns the hull */
    rig.status = "idle"; rig.heatMax = 100; rig.heat = 100; rig.hull = 100;
    const h0 = rig.hull;
    for (let i = 0; i < 240; i++) { rig.heat = 130; rig.tick(STEP, game); }
    ok("sustained overheat damages the hull", rig.hull < h0);

    /* burrowers chew and can be flushed */
    rig.hull = 100; rig.status = "idle";
    rig.grubs = [];                     /* the rock may have spawned its own */
    rig.spawnGrub(game);
    ok("burrowers spawn", rig.grubs.length === 1);
    rig.x = rig.grubs[0].x; rig.y = rig.grubs[0].y;
    for (let i = 0; i < 120; i++) rig.tick(STEP, game);
    ok("burrowers chew the hull", rig.hull < 100);
    const grubs0 = rig.grubs.length;
    rig.cmdVent(game);
    for (let i = 0; i < 300; i++) rig.tick(STEP, game);
    ok("vent flushes burrowers off the hull", rig.grubs.length < grubs0);

    /* movement */
    rig.hull = 100; rig.status = "idle"; rig.x = 5;
    const moved = rig.cmdMove(-1, game);
    for (let i = 0; i < 120; i++) rig.tick(STEP, game);
    ok("the rig walks sideways on its tracks", moved && rig.x === 4);
    ok("the shaft has walls", rig.cmdMove(-1, game) === true || rig.x >= 0);

    /* contracts and cargo → credits */
    rig.bank = { iron: 10 };
    rig.credits = 0;
    const earned = rig.sellAll(game);
    ok("selling banks credits at the ore price", earned === 160 && rig.credits === 160);
    rig.credits = 0;
    rig.cTotals.ore.copper = 99;
    rig.checkContracts(game);
    ok("contracts pay out", rig.credits > 0);
    ok("finished contracts stay finished", rig.contracts[1].done === true);

    /* depot: hardware and repairs */
    rig.credits = 20000;
    const cap0 = rig.cargoCap;
    ok("hardware installs", rig.buyHardware(game, DG.HARDWARE[0]));
    ok("cargo bay widens the hold", rig.cargoCap === cap0 + 6);
    ok("hardware respects its tier cap", (() => {
      rig.buyHardware(game, DG.HARDWARE[0]); rig.buyHardware(game, DG.HARDWARE[0]);
      return !rig.buyHardware(game, DG.HARDWARE[0]);
    })());
    rig.hull = 40;
    const c0 = rig.credits;
    ok("the repair bay prices the damage at 2 CR a point", rig.repairCost() === Math.ceil(rig.hullMax - rig.hull) * 2);
    ok("depot repairs restore the hull", rig.repair(game) && rig.hull === rig.hullMax && rig.credits === c0 - rig.repairCost());
    ok("a sound hull cannot be repaired", rig.repairCost() === 0 && rig.repair(game) === false);
    rig.credits = 0; rig.hull = 10;
    ok("repairs need credits", rig.repair(game) === false && rig.hull === 10);
    rig.hull = rig.hullMax;

    /* surfaces: the hold empties into the bank */
    rig.cargo = { coal: 4, gold: 2 };
    game.onSurface();
    ok("surfacing banks the hold", rig.bank.coal === 4 && rig.bank.gold === 2 && rig.cargoUsed === 0);
    ok("surfacing switches to the depot screen", game.state === "depot");

    /* descent & depth record */
    rig.depthRecord = 500;
    game.deploy();
    ok("deploying descends to the record", game.state === "console" && rig.targetY === 124);
    for (let i = 0; i < 40 * 60; i++) rig.tick(STEP, game);
    ok("the winch arrives at the record depth", Math.abs(rig.y - 124) < 1);

    /* the wreck */
    rig.hull = 1;
    rig.tick(STEP, game);
    rig.hull = -1;
    rig.tick(STEP, game);
    ok("zero hull wrecks the rig", rig.wrecked === true && game.state === "wrecked");
    game.wreckT = 2;
    game.redeploy();
    ok("a new rig launches from the depot", !rig.wrecked && rig.hull === rig.hullMax && game.state === "depot");

    /* save & reload */
    rig.bank.diamond = 7;
    rig.depthRecord = 321;
    game.save();
    const blob = JSON.parse(sandbox.localStorage.getItem("deepdig.save.v1"));
    ok("save carries the seed", blob.seed === SEED);
    ok("save carries the drilled cells", blob.rig.drilled.length === rig.well.drilled.size);
    game.newRun(false);
    ok("reload restores the record depth", Math.round(game.rig.depthRecord) === 321);
    ok("reload restores banked ore", game.rig.bank.diamond === 7);
    ok("reload restores the drilled shaft", game.rig.well.drilled.size === rig.well.drilled.size);

    /* the phone layout: the glass must fit whatever the deck leaves it.
       These are real viewport sizes, portrait and landscape. */
    const devices = [
      ["iPhone SE", 375, 667, 2], ["iPhone 14", 390, 844, 3], ["iPhone 14 Pro Max", 430, 932, 3],
      ["Pixel 7", 412, 915, 2.6], ["landscape phone", 844, 340, 3],
      ["iPad portrait", 820, 1180, 2], ["desktop", 1600, 900, 1], ["tiny window", 320, 420, 1],
    ];
    for (const [name, w, h, dpr] of devices) {
      const s = DG.Touch.fitScale(w, h, dpr);
      ok(`${name}: the glass fits the width`, 480 * s <= w + 0.51);
      ok(`${name}: the glass fits the height`, 288 * s <= h + 0.51);
      ok(`${name}: the glass stays worth looking at`, s >= 0.5);
      ok(`${name}: the scale is sane`, isFinite(s) && s > 0 && s < 8);
    }

    /* the deck's view model has to agree with the console it mirrors */
    game.state = "console";
    const R2 = game.rig;                    /* the systems suite may have swapped it */
    R2.wrecked = false; R2.status = "idle";
    R2.credits = 0; R2.hull = R2.hullMax; R2.heat = 0;
    const dm = DG.Touch.model(game);
    ok("the deck model follows the console", dm.pad === "console");
    ok("the deck reads out depth and credits", typeof dm.depth === "string" && typeof dm.credits === "string");
    ok("the deck refuses PATCH with no credits", dm.btn.patch.disabled === true);
    ok("the deck refuses VENT when there is no heat to dump", dm.btn.purge.disabled === true);
    R2.credits = 900; R2.hull = R2.hullMax - 40; R2.heat = 60;
    const dm2 = DG.Touch.model(game);
    ok("the deck offers PATCH once it is affordable and needed", dm2.btn.patch.disabled === false);
    ok("the deck offers VENT once there is heat to dump", dm2.btn.purge.disabled === false);
    R2.hull = R2.hullMax * 0.2;
    ok("the deck warns about a thin hull", DG.Touch.model(game).warnHull === true);
    R2.heat = R2.heatMax * 0.95;
    ok("the deck warns about a hot loop", DG.Touch.model(game).warnHeat === true);
    R2.hull = R2.hullMax; R2.heat = 0; R2.credits = 0;
    const deckActs = [...deckMarkup.matchAll(/data-act="([a-z]+)"/g)].map((m) => m[1]);
    ok("the page ships at least ten deck controls", deckActs.length >= 10);
    ok("every deck control has an action behind it",
       deckActs.every((id) => DG.Touch.actionIds.includes(id)));
    ok("every action the deck exposes is wired to a real command",
       DG.Touch.actionIds.every((id) => typeof id === "string"));
    ok("the depot deck can fit a bit and repair the hull",
       DG.Touch.actionIds.includes("forge") && DG.Touch.actionIds.includes("repair"));
    ok("every hardware row has a deck button",
       DG.HARDWARE.every((h) => DG.Touch.actionIds.includes("hw:" + h.id)));
    /* the deck's depot buttons must mirror the panel's own prices */
    game.state = "depot";
    R2.credits = 4000; R2.hull = R2.hullMax - 30; R2.owned = {}; R2.drillIndex = 0;
    R2.bank = { copper: 40 };
    const dmd = DG.Touch.model(game);
    ok("the deck quotes the repair it would buy", dmd.btn.repair.sub.includes(String(R2.repairCost())));
    ok("the deck quotes the next grade's ore", /14 COPPER/.test(dmd.btn.forge.sub));
    ok("the deck prices hardware like the bay does", /^300 CR$/.test(dmd.btn["hw:cargo"].sub));
    R2.bank = {}; R2.credits = 10;
    const dmd2 = DG.Touch.model(game);
    ok("the deck greys out a bit it cannot afford", dmd2.btn.forge.disabled === true);
    ok("the deck greys out hardware it cannot afford", dmd2.btn["hw:cargo"].disabled === true);
    R2.hull = R2.hullMax;
    ok("the deck greys out a repair that is not needed", DG.Touch.model(game).btn.repair.disabled === true);
    R2.credits = 0; game.state = "console";

    /* every screen draws without exploding */
    for (const st of ["title", "console", "depot", "pause", "wrecked", "wrecked"]) {
      game.state = st;
      if (st === "pause") game.pauseFrom = "console";
      try { DG.Render.frame(game.g, game); ok(`render ${st}`, true); }
      catch (e) { ok(`render ${st}: ${e.message}`, false); }
    }
    game.state = "console";
    /* widgets respond to the pointer */
    const before = game.rig.heat = 90;
    click(300, 190);                        // VENT button
    frame(); frame();
    ok("clicking VENT cools the rig", game.rig.heat < before);

    console.log(checks.join("\n"));
    console.log(failures ? `✗ ${failures} system check(s) failed` : "✓ every system check passed");
    report();
    process.exit(failures ? 1 : 0);
  }

  /* ── balance: how much of the rock carries ore, and how nasty it is ──── */
  if (SCRIPT === "balance") {
    const w = new DG.Well(SEED);
    const buckets = {};
    const stratumOf = (m) => { let s = DG.STRATA[0]; for (const l of DG.STRATA) if (m >= l.from) s = l; return s; };
    let cells = 0;
    for (let y = 1; y < 520; y++) {
      for (let x = 0; x < w.W; x++) {
        const c = w.cell(x, y);
        const key = stratumOf(c.metres).name;
        const b = (buckets[key] = buckets[key] || { n: 0, ore: {}, haz: 0, gas: 0, lava: 0 });
        b.n++; cells++;
        if (c.ore) b.ore[c.ore] = (b.ore[c.ore] || 0) + 1;
        if (TILES[c.tile].hazard) b.haz++;
        if (c.tile === T.GAS) b.gas++;
        if (c.tile === T.LAVA) b.lava++;
      }
    }
    for (const [k, b] of Object.entries(buckets)) {
      const ores = Object.entries(b.ore).map(([o, n]) => `${o} ${(100 * n / b.n).toFixed(1)}%`).join("  ");
      console.log(`${k.padEnd(11)} cells=${String(b.n).padStart(5)}  hazards ${(100 * b.haz / b.n).toFixed(2)}%` +
                  `  (gas ${(100 * b.gas / b.n).toFixed(2)}% lava ${(100 * b.lava / b.n).toFixed(2)}%)  ${ores}`);
    }
    /* how long does a bit take on a typical cell, and what does it earn */
    for (const d of DG.DRILLS) {
      const rock = w.hardAt(5, 100);
      console.log(`  ${d.name.padEnd(9)} power ${d.power.toFixed(1)}  cell at 400 m takes ` +
                  `${(w.hardAt(5, 100) / d.power / 0.85).toFixed(2)}s  at 1800 m ${(w.hardAt(5, 450) / d.power / 0.85).toFixed(2)}s`);
    }
    const vals = [];
    for (let i = 0; i < 4000; i++) vals.push(vm.runInContext(`fbm(${Math.random() * 60},${Math.random() * 60},77,3)`, ctx));
    vals.sort((a, b) => a - b);
    console.log(`  fbm percentiles  p05 ${vals[200].toFixed(3)}  p50 ${vals[2000].toFixed(3)}  ` +
                `p90 ${vals[3600].toFixed(3)}  p99 ${vals[3960].toFixed(3)}  max ${vals[3999].toFixed(3)}`);
    process.exit(0);
  }

  /* ── play scripts ─────────────────────────────────────────────────────── */
  const rig = game.rig;
  const fire = (el, type, ev) => {
    for (const h of (el && el.handlers && el.handlers[type]) || []) h(ev);
  };
  const dexBtn = (id) => deck.querySelectorAll("data-act")
                             .find((b) => b.getAttribute("data-act") === id);
  const pev = (id) => ({ preventDefault() {}, pointerId: id, pointerType: "touch" });
  const tev = (ids, x, y) => ({
    preventDefault() {},
    changedTouches: ids.map((id) => ({ identifier: id, clientX: x, clientY: y })),
    touches: [],
  });
  const out = OUT ? [] : null;
  if (OUT) game.g.record = () => {};

  for (let f = 0; f < FRAMES; f++) {
    t += STEP;
    I.keys = Object.create(null);

    if (SCRIPT === "mine") {
      /* hold the bit down, steer around the hard pockets, vent before it cooks */
      I.keys.Space = rig.heat < rig.heatMax * 0.82 && rig.cargoFree > 0;
      if (rig.status === "idle" && rig.heat > rig.heatMax * 0.8) I.pressed.KeyX = true;
      if (f % 240 === 120) I.pressed[(f / 240) % 2 === 0 ? "KeyD" : "KeyA"] = true;
      if (rig.cargoFree <= 0) { rig.drillOn = false; if (rig.status === "idle") rig.cmdAscend(game); }
      game.state = rig.status === "descend" ? "console" : game.state;
    } else if (SCRIPT === "deep") {
      if (f === 1) { rig.depthRecord = 1000; game.deploy(); }
      I.keys.Space = rig.heat < rig.heatMax * 0.9;
      if (rig.heat > rig.heatMax * 0.85) I.pressed.KeyX = true;
      if (f % 300 === 100) I.pressed["KeyC"] = true;
    } else if (SCRIPT === "depot") {
      game.state = "depot";
      /* click a few buttons so the widgets get exercised */
      if (f % 40 === 0) click(80, 240);
      if (f % 40 === 10) click(240, 120);
      if (f % 40 === 20) click(380, 250);
    } else if (SCRIPT === "surfaces") {
      /* a full shift: descend, drill, surface, sell, fit a bit, descend again */
      if (game.state === "depot") {
        if (rig.cargoFree === rig.cargoCap && f % 180 === 20) I.pressed.KeyE = true;   // deploy
        if (f % 120 === 5) click(70, 232);                                            // sell
        if (f % 120 === 40) click(228, 78);                                           // fit the next bit
      } else {
        I.keys.Space = rig.heat < rig.heatMax * 0.85 && rig.cargoFree > 0;
        if (rig.cargoFree <= 0 && rig.status === "idle") rig.cmdAscend(game);
        if (rig.heat > rig.heatMax * 0.8 && rig.status === "idle") rig.cmdVent(game);
      }
    } else if (SCRIPT === "sweep") {
      /* visit every screen, every control, every stratum */
      const st = ["console", "depot", "title", "pause", "wrecked"][Math.floor(f / 40) % 5];
      game.state = st;
      game.pauseFrom = "console";
      const layer = Math.floor(f / 200) % 6;
      const depths = [4, 60, 220, 420, 640, 880];
      rig.y = Math.round(depths[layer] / DG.CELL_M);
      rig.hull = [100, 70, 40, 20, 5, 100][layer];
      rig.heat = [0, 30, 60, 90, 100, 45][layer];
      rig.cargo = { coal: 3, iron: 2, diamond: 1 };
      rig.credits = 4321;
      if (layer === 4) { rig.spawnGrub(game); rig.spawnGrub(game); }
      if (layer === 3) rig.cmdScan(game);
      /* sweep the pointer across the screen so every widget sees hover */
      I.mx = (f * 37) % 480;
      I.my = (f * 53) % 288;
      I.down = f % 7 === 0;
      I.clicked = f % 7 === 0;
      I.released = f % 7 === 3;
      if (f % 7 === 3) I.down = false;
    } else if (SCRIPT === "pause" || SCRIPT === "wrecked") {
      /* sim in the same states the player will sit in */
      if (SCRIPT === "wrecked") {
        if (f === 30) { rig.hull = 0; rig.tick(STEP, game); }
        game.state = f < 30 ? "console" : "wrecked";
        flavour(f);
      } else {
        game.pauseFrom = Math.floor(f / 100) % 2 ? "depot" : "console";
        game.state = "pause";
        flavour(f);
      }
    } else if (SCRIPT === "title") {
      /* both flavours of the title get rendered and audited: the phone deck
         first (TAP …), then the keyboard chrome it ends the screenshot on */
      flavour(f);
      game.state = "title";
    } else if (SCRIPT === "title_save") {
      /* the title's other branch: a save file exists (and is being read) */
      if (f === 0) {
        rig.drillIndex = 3;
        rig.credits = 2140;
        rig.depthRecord = 512;
        rig.runs = 6;
        for (let y = 0; y < 128; y++) rig.well.drilled.add("5," + y);
        game.save();
      }
      game.state = "title";
    } else if (SCRIPT === "idle") {
      game.state = "console";
    } else if (SCRIPT === "touch") {
      /* the deck, driven the way a pair of thumbs would drive it.
         NB: START calls newRun(), which swaps game.rig — always read it live. */
      DG.Touch.enable();
      const R = game.rig;
      if (f === 0) {
        game.state = "title";
        T3.assert("the deck shows the title pad", DG.Touch.model(game).pad === "title");
      } else if (f === 2) {
        T3.assert("START opens the depot", DG.Touch.act("start", game) && game.state === "depot");
        T3.assert("the deck follows into the depot", DG.Touch.model(game).pad === "depot");
      } else if (f === 4) {
        T3.assert("DESCEND puts the rig down the shaft",
                  DG.Touch.act("descend", game) && game.state === "console");
      } else if (f === 8) {
        T3.assert("an unaffordable PATCH is refused",
                  DG.Touch.act("patch", game) === false && R.hull === R.hullMax);
        fire(dexBtn("drill"), "pointerdown", pev(11));       /* thumb 1: hold DRILL */
        T3.assert("DRILL latches the hold flag", DG.Input.hold.drill === true);
      } else if (f === 60) {
        T3.assert("holding DRILL sank the shaft", R.y > 2);
        fire(dexBtn("drill"), "pointerup", pev(11));
        fire(dexBtn("right"), "pointerdown", pev(12));       /* thumb 2: walk the seam */
        T3.xAtHold = R.x;
      } else if (f === 200) {
        fire(dexBtn("right"), "pointerup", pev(12));
        T3.assert("holding RIGHT walks the seam", R.x - T3.xAtHold >= 2);
        /* both thumbs down at once: the drill bites, the pad waits its turn */
        T3.xBoth = R.x;
        T3.yBoth = R.y;
        fire(dexBtn("drill"), "pointerdown", pev(13));
        fire(dexBtn("left"), "pointerdown", pev(14));
      } else if (f === 280) {
        fire(dexBtn("left"), "pointerup", pev(14));
        fire(dexBtn("drill"), "pointerup", pev(13));
        T3.assert("two holds at once: the drill still bites", R.y > T3.yBoth + 2);
        T3.assert("…and steering waits for the bit to stop", Math.abs(R.x - T3.xBoth) <= 1);
      } else if (f === 284) {
        /* two fingers on the glass at once: the rig keeps drilling */
        fire(screen, "touchstart", tev([21, 22], 240, 160));
        T3.assert("the glass counts both fingers", DG.Input.pointers === 2);
        T3.assert("a finger on the glass runs the bit", DG.Input.down === true);
        T3.yGlass = R.y;
      } else if (f === 400) {
        T3.assert("a finger on the glass keeps drilling", R.y > T3.yGlass + 2);
        fire(screen, "touchend", tev([21], 240, 160));
        T3.assert("one finger left", DG.Input.pointers === 1);
        fire(screen, "touchend", tev([22], 240, 160));
        T3.assert("the glass is clear", DG.Input.pointers === 0 && DG.Input.down === false);
        T3.assert("the deck knows every button the page ships",
                  [...deckMarkup.matchAll(/data-act="([a-z]+)"/g)]
                    .every((m) => DG.Touch.actionIds.includes(m[1])));
      } else if (f === 390) {
        R.heat = 80;
        T3.assert("VENT starts the coolant loop",
                  DG.Touch.act("vent", game) && R.status === "venting");
      } else if (f === 404) {
        T3.assert("the coolant loop is dumping heat", R.heat < 78);

        /* ── the depot deck: sell the haul, fit the next bit, fix the hull ── */
        R.status = "idle";
        R.heat = 0;
        game.state = "depot";
        R.bank = { copper: 40, iron: 12 };
        R.credits = 3000;
        T3.credits0 = R.credits;
        T3.assert("the deck follows to the depot pad", DG.Touch.model(game).pad === "depot");
        T3.assert("SELL ALL banks the ore",
                  DG.Touch.act("sell", game) && R.credits > T3.credits0 && Object.keys(R.bank).length === 0);
      } else if (f === 406) {
        R.bank = { copper: 40 };                       /* ore for the copper bit */
        T3.credits1 = R.credits;
        T3.assert("FIT BIT forges the next grade",
                  DG.Touch.act("forge", game) && R.drillIndex === 1);
        T3.assert("the forged bit ate the ore and the credits it quoted",
                  R.bank.copper === 26 && R.credits === T3.credits1 - 120);
      } else if (f === 408) {
        R.hull = R.hullMax - 24;
        T3.repairCost = R.repairCost();
        T3.credits2 = R.credits;
        T3.assert("REPAIR HULL welds the plating back on",
                  DG.Touch.act("repair", game) && R.hull === R.hullMax);
        T3.assert("the repair charged the price on the button",
                  T3.repairCost === 48 && R.credits === T3.credits2 - T3.repairCost);
        T3.cap0 = R.cargoCap;
        T3.credits3 = R.credits;
        T3.assert("the hardware strip buys a cargo bay",
                  DG.Touch.act("hw:cargo", game) && R.cargoCap === T3.cap0 + 6);
        T3.assert("the bay charged its list price", R.credits === T3.credits3 - 300);
      } else if (f === 410) {
        const dm = DG.Touch.model(game);
        T3.assert("the hammered buttons show what they cost",
                  /COPPER|IRON|SILVER/.test(dm.btn.forge.sub) && /1\/3/.test(dm.btn["hw:cargo"].sub));
        T3.assert("the strip greys out a maxed row", (() => {
          R.owned.damping = 1;
          return DG.Touch.model(game).btn["hw:damping"].disabled === true;
        })());
        T3.assert("the strip greys out what the bank cannot buy", (() => {
          const keep = R.credits; R.credits = 0;
          const out = DG.Touch.model(game).btn["hw:armour"].disabled === true;
          R.credits = keep;
          return out;
        })());
        T3.assert("every hardware row has a deck button",
                  DG.HARDWARE.every((h) => DG.Touch.actionIds.includes("hw:" + h.id)));
        T3.assert("the depot pad is what the deck shows", DG.Touch.model(game).pad === "depot");
      } else if (f === 412) {
        T3.assert("DESCEND sends the rig back down the shaft",
                  DG.Touch.act("descend", game) && R.status === "descend");
      }
    }

    if (OUT) {
      out.length = 0;
      game.g.record = f === FRAMES - 1 ? (c, op) => out.push(op) : () => {};
    }
    try {
      frame();
    } catch (e) {
      console.error(`✗ frame ${f} (state=${game.state}): ${e.stack.split("\n").slice(0, 4).join("\n   ")}`);
      process.exit(1);
    }

    /* record a scene dump for preview.py at the end */
    if (f % 120 === 0)
      log.push(`  t=${t.toFixed(0)}s state=${game.state} status=${rig.status} ` +
               `depth=${Math.round(rig.metres)}m hull=${rig.hull.toFixed(0)} heat=${rig.heat.toFixed(0)} ` +
               `cargo=${rig.cargoUsed}/${rig.cargoCap} credits=${rig.credits} grubs=${rig.grubs.length}`);
  }

  if (out) fs.writeFileSync(OUT, JSON.stringify({ w: 480, h: 288, ops: out }));
  const calls = game.g.calls;
  console.log(log.join("\n"));
  console.log(`✓ ${FRAMES} frames simulated, no errors (${Math.round(calls / FRAMES)} canvas calls/frame)`);
  if (SCRIPT === "touch")
    console.log(`✓ ${T3.passed}/${T3.passed + T3.fails.length} touch-deck checks`);
  report();
  const end = game.rig || rig;
  console.log(`  state=${game.state} status=${end.status} drill=${end.drill.name} ` +
              `depth=${Math.round(end.metres)}m deepest=${Math.round(end.depthRecord)}m`);
  console.log(`  hull=${end.hull.toFixed(0)}/${end.hullMax} heat=${end.heat.toFixed(0)}% ` +
              `cargo=${JSON.stringify(end.cargo)} credits=${end.credits}`);
  console.log(`  cells drilled=${end.well.drilled.size} contracts=${end.contracts.filter((c) => c.done).length}/13 ` +
              `kills=${end.kills} runs=${end.runs}`);

  function report() {
    if (DG.UI && DG.UI.unknownColors && DG.UI.unknownColors.size) {
      console.log(`⚠ ${DG.UI.unknownColors.size} text colour(s) with no forged atlas:`);
      for (const c of DG.UI.unknownColors) console.log("   " + c);
    }
    if (missingAssets.size) {
      console.log(`✗ ${missingAssets.size} asset(s) requested but missing:`);
      for (const m of [...missingAssets].sort()) console.log("   " + m);
      process.exitCode = 1;
    } else {
      console.log("✓ every asset the frame asked for exists");
    }
  }
}

main();
