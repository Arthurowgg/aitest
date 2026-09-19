/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · core — math, noise, input, procedural audio, storage
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";
const DG = (window.DG = window.DG || {});

/* ── math ────────────────────────────────────────────────────────────────── */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, target, delta) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
const sign = Math.sign;
const TAU = Math.PI * 2;

/* deterministic RNG (mulberry32) — the world is seed-reproducible */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* value noise + fbm, used for terrain, caves and rock detail */
function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, seed, oct = 3, lac = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += vnoise(x * freq, y * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

/* ── input ───────────────────────────────────────────────────────────────── */
const Input = (DG.Input = {
  keys: Object.create(null),
  pressed: Object.create(null),      // consumed once per frame
  mouse: { x: 240, y: 144, down: false, right: false, inside: false },
  touch: { active: false, moveId: -1, aimId: -1, mx: 0, my: 0, ax: 0, ay: 0,
           mine: false, jump: false, bomb: false, buttons: [] },
  anyKey: false,
  lastDevice: "kb",

  key(code) { return !!this.keys[code]; },
  hit(code) { const v = !!this.pressed[code]; this.pressed[code] = false; return v; },
  clear() { this.pressed = Object.create(null); },
});

DG.initInput = function (canvas) {
  const I = Input;
  addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(e.code))
      e.preventDefault();
    if (!I.keys[e.code]) I.pressed[e.code] = true;
    I.keys[e.code] = true;
    I.anyKey = true;
    I.lastDevice = "kb";
    DG.Audio.unlock();
  });
  addEventListener("keyup", (e) => { I.keys[e.code] = false; });
  addEventListener("blur", () => { I.keys = Object.create(null); I.mouse.down = false; });

  const toGame = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    I.mouse.x = ((cx - r.left) / r.width) * canvas.width;
    I.mouse.y = ((cy - r.top) / r.height) * canvas.height;
  };
  canvas.addEventListener("mousemove", (e) => { toGame(e.clientX, e.clientY); I.mouse.inside = true; });
  canvas.addEventListener("mouseleave", () => { I.mouse.inside = false; });
  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    toGame(e.clientX, e.clientY);
    if (e.button === 0) I.mouse.down = true;
    if (e.button === 2) I.mouse.right = true;
    DG.Audio.unlock();
  });
  addEventListener("mouseup", (e) => {
    if (e.button === 0) I.mouse.down = false;
    if (e.button === 2) I.mouse.right = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  /* ── touch: left half steers, right half aims & mines ─────────────────── */
  const relays = (e) => {
    const r = canvas.getBoundingClientRect();
    const tx = (e.clientX - r.left) / r.width * canvas.width;
    const ty = (e.clientY - r.top) / r.height * canvas.height;
    return [tx, ty];
  };
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    I.lastDevice = "touch";
    I.touch.active = true;
    DG.Audio.unlock();
    for (const t of e.changedTouches) {
      const [x, y] = relays(t);
      // on-screen buttons first
      for (const b of I.touch.buttons) {
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) { b.down = true; b.owner = t.identifier; b.onPress && b.onPress(); continue; }
      }
      if (x < canvas.width * 0.42 && I.touch.moveId < 0) {
        I.touch.moveId = t.identifier; I.touch.mx = x; I.touch.my = y;
      } else if (I.touch.aimId < 0) {
        I.touch.aimId = t.identifier; I.touch.ax = x; I.touch.ay = y;
        I.mouse.x = x; I.mouse.y = y; I.mouse.down = true;
      }
    }
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const [x, y] = relays(t);
      if (t.identifier === I.touch.moveId) { I.touch.mx = x; I.touch.my = y; }
      else if (t.identifier === I.touch.aimId) {
        I.touch.ax = x; I.touch.ay = y; I.mouse.x = x; I.mouse.y = y;
      }
      for (const b of I.touch.buttons)
        if (b.owner === t.identifier && !(x > b.x - 6 && x < b.x + b.w + 6 && y > b.y - 6 && y < b.y + b.h + 6)) {
          b.down = false; b.owner = -1;
        }
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === I.touch.moveId) I.touch.moveId = -1;
      if (t.identifier === I.touch.aimId) { I.touch.aimId = -1; I.mouse.down = false; }
      for (const b of I.touch.buttons)
        if (b.owner === t.identifier) { b.down = false; b.owner = -1; }
    }
  };
  canvas.addEventListener("touchend", endTouch, { passive: false });
  canvas.addEventListener("touchcancel", endTouch, { passive: false });
};

/* movement vector from keyboard or left stick */
DG.moveAxis = function () {
  const k = Input.keys;
  let x = 0;
  if (k.ArrowLeft || k.KeyA) x -= 1;
  if (k.ArrowRight || k.KeyD) x += 1;
  if (Input.touch.active && Input.touch.moveId >= 0) {
    const dx = Input.touch.mx - 90;
    if (Math.abs(dx) > 12) x = clamp(dx / 40, -1, 1);
  }
  return x;
};

/* ── procedural audio: everything is synthesised, no sound files ─────────── */
DG.Audio = (function () {
  let ctx = null, master = null, muted = false;
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === "suspended") c.resume(); }
  function env(node, t0, a, d, peak) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function tone(freq, type, dur, vol, slide) {
    if (muted) return;
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
    env(g, t0, 0.005, dur, vol);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, freq, q, type = "lowpass") {
    if (muted) return;
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); env(g, t0, 0.004, dur, vol);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }
  return {
    unlock, ensure,
    get muted() { return muted; },
    toggle() { muted = !muted; if (!muted) unlock(); return muted; },
    dig(hard) { noise(0.05, 0.09, hard ? 900 : 1400, 1.2, "bandpass"); tone(hard ? 160 : 240, "square", 0.035, 0.02); },
    crack() { noise(0.18, 0.22, 700, 0.8); tone(120, "triangle", 0.12, 0.05, 60); },
    pop() { tone(660, "square", 0.07, 0.05, 990); },
    coin() { tone(1180, "square", 0.06, 0.04); tone(1560, "square", 0.09, 0.03); },
    jump() { tone(240, "square", 0.12, 0.045, 420); },
    land() { noise(0.09, 0.13, 420, 0.7); },
    hurt() { tone(300, "sawtooth", 0.18, 0.07, 90); noise(0.12, 0.12, 500, 0.6); },
    swing() { noise(0.07, 0.05, 2200, 2, "highpass"); },
    hitFx() { noise(0.1, 0.14, 300, 0.6); tone(180, "square", 0.08, 0.05, 80); },
    die() { tone(220, "sawtooth", 0.5, 0.09, 60); noise(0.4, 0.1, 300, 0.5); },
    boom() { noise(0.5, 0.35, 220, 0.4); tone(90, "sawtooth", 0.35, 0.12, 30); },
    warp() { tone(500, "sine", 0.3, 0.06, 1500); tone(750, "sine", 0.35, 0.04, 2200); },
    buy() { tone(880, "square", 0.08, 0.05); tone(1320, "square", 0.12, 0.04); },
    deny() { tone(180, "square", 0.12, 0.05, 120); },
    torch() { noise(0.06, 0.03, 1800, 1); },
  };
})();

/* ── storage ─────────────────────────────────────────────────────────────── */
DG.store = {
  KEY: "deepdig.save.v1",
  save(obj) { try { localStorage.setItem(this.KEY, JSON.stringify(obj)); return true; } catch (e) { return false; } },
  load() { try { const s = localStorage.getItem(this.KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) {} },
};
