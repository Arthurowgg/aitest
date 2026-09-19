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

/* ── input: pointer, keyboard, touch — everything is a button press ─────── */
const Input = (DG.Input = {
  keys: Object.create(null),
  pressed: Object.create(null),        // consumed once per tick
  mx: 240, my: 144,                    // pointer in canvas space
  down: false,                         // pointer held
  clicked: false,                      // pointer went down this tick
  released: false,
  inside: false,
  anyKey: false,
  lastDevice: "kb",
  touchButtons: [],
  pointers: 0,                         // how many fingers are on the glass
  /* held controls: the keyboard writes through the same flags the touch deck
     does, so a phone can drill and steer at the same time and the game never
     has to care which one it was */
  hold: { drill: false, left: false, right: false },

  key(code) { return !!this.keys[code]; },
  hit(code) { const v = !!this.pressed[code]; this.pressed[code] = false; return v; },
  clear() {
    this.pressed = Object.create(null);
    this.clicked = false;
    this.released = false;
  },
  releaseAll() {
    this.hold.drill = this.hold.left = this.hold.right = false;
    this.keys = Object.create(null);
    this.down = false;
    this.pointers = 0;
  },
});

DG.initInput = function (canvas) {
  const I = Input;

  const toGame = (cx, cy) => {
    const r = canvas.getBoundingClientRect();
    I.mx = ((cx - r.left) / r.width) * canvas.width;
    I.my = ((cy - r.top) / r.height) * canvas.height;
  };

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
  addEventListener("blur", () => { I.releaseAll(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) I.releaseAll();    /* no stuck drill when you tab away */
  });

  const down = (e, p) => {
    e.preventDefault();
    const t = p || (e.touches ? e.touches[0] || e.changedTouches[0] : e);
    toGame(t.clientX, t.clientY);
    I.down = true;
    I.clicked = true;
    I.inside = true;
    DG.Audio.unlock();
  };
  const move = (e, p) => {
    const t = p || (e.touches ? e.touches[0] || e.changedTouches[0] : e);
    toGame(t.clientX, t.clientY);
    I.inside = true;
  };

  canvas.addEventListener("mousedown", (e) => { I.lastDevice = "mouse"; down(e); });
  canvas.addEventListener("mousemove", (e) => { if (I.lastDevice !== "touch") I.lastDevice = "mouse"; move(e); });
  addEventListener("mouseup", () => {
    I.down = false;
    I.released = true;
  });
  canvas.addEventListener("mouseleave", () => { I.inside = false; });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  /* ── touch: every finger on the glass is tracked ─────────────────────────
     One finger can hold the rig down while another steers on the deck below:
     the deck owns its own elements, the glass just counts pointers, and the
     pointer position follows whichever finger moved last. */
  const live = new Map();
  const touchStart = (e) => {
    e.preventDefault();
    I.lastDevice = "touch";
    for (const t of e.changedTouches) live.set(t.identifier, t);
    I.pointers = live.size;
    const first = e.changedTouches[0];
    down(e, first);
  };
  const touchMove = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) live.set(t.identifier, t);
    I.pointers = live.size;
    move(e, e.changedTouches[0]);
  };
  const touchEnd = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) live.delete(t.identifier);
    I.pointers = live.size;
    if (I.pointers === 0) {
      I.down = false;
      I.released = true;
      I.mx = -99; I.my = -99;          /* nothing is hovering a phantom finger */
    } else {
      const last = [...live.values()].pop();
      move(e, last);
    }
  };

  canvas.addEventListener("touchstart", touchStart, { passive: false });
  canvas.addEventListener("touchmove", touchMove, { passive: false });
  canvas.addEventListener("touchend", touchEnd, { passive: false });
  canvas.addEventListener("touchcancel", touchEnd, { passive: false });

  /* ── pointer events, when the browser has them: one path for pen and touch,
        and a pen/mouse still behaves exactly like a mouse ───────────────── */
  if (typeof window !== "undefined" && window.PointerEvent) {
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;         /* touch is handled above */
      I.lastDevice = e.pointerType === "pen" ? "pen" : "mouse";
      down(e);
    });
  }

  /* a rumble in the pocket when the rig comes apart */
  DG.Input.rumble = (pattern) => {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  };
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
  let amb = null;
  function startAmbience() {
    const c = ensure(); if (!c || amb) return;
    const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = 41;
    const o2 = c.createOscillator(); o2.type = "sine"; o2.frequency.value = 61.5;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 150; f.Q.value = 2.5;
    const g = c.createGain(); g.gain.value = 0;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.06;
    const lg = c.createGain(); lg.gain.value = 0.008;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
    lfo.connect(lg); lg.connect(g.gain);
    o.start(); o2.start(); lfo.start();
    amb = { o, o2, f, g };
  }
  /* the mine breathes: a low drone that swells with depth */
  function ambience(depth, active) {
    const c = ensure(); if (!c) return;
    startAmbience();
    if (!amb) return;
    const target = active && !muted ? 0.010 + Math.min(0.034, depth / 260 * 0.05) : 0;
    amb.g.gain.setTargetAtTime(target, c.currentTime, 1.4);
    amb.f.frequency.setTargetAtTime(120 + depth * 0.9, c.currentTime, 1.8);
    amb.o.frequency.setTargetAtTime(38 + depth * 0.06, c.currentTime, 1.8);
  }
  return {
    unlock, ensure, ambience,
    /* ── the console speaks in machines, not in swords ───────────────── */
    heartbeat() { tone(58, "sine", 0.16, 0.07, 40); },
    click() { noise(0.03, 0.06, 2400, 3, "highpass"); tone(660, "square", 0.02, 0.02); },
    dig(hard) { noise(0.05, 0.09, hard ? 900 : 1400, 1.2, "bandpass"); tone(hard ? 160 : 240, "square", 0.035, 0.02); },
    crack(hard) { noise(0.16, 0.2, hard ? 500 : 900, 0.8); tone(hard ? 110 : 190, "triangle", 0.1, 0.05, 60); },
    pop() { tone(660, "square", 0.07, 0.05, 990); },
    coin() { tone(1180, "square", 0.06, 0.04); tone(1560, "square", 0.09, 0.03); },
    buy() { tone(880, "square", 0.08, 0.05); tone(1320, "square", 0.12, 0.04); },
    deny() { tone(180, "square", 0.12, 0.05, 120); },
    hitFx() { noise(0.1, 0.14, 300, 0.6); tone(180, "square", 0.08, 0.05, 80); },
    vent() { noise(1.1, 0.16, 1500, 0.6, "highpass"); },
    winch() { tone(70, "sawtooth", 0.9, 0.05, 190); noise(0.9, 0.05, 500, 0.7); },
    sonar() { tone(1250, "sine", 0.18, 0.05, 640); tone(640, "sine", 0.35, 0.03, 320); },
    forge() { tone(320, "square", 0.14, 0.06, 520); setTimeout(() => tone(780, "square", 0.25, 0.05, 1180), 120); },
    siren() { tone(720, "square", 0.25, 0.05, 380); setTimeout(() => tone(720, "square", 0.25, 0.05, 380), 260); },
    alarm() { tone(240, "sawtooth", 0.4, 0.06, 160); noise(0.3, 0.08, 300, 0.6); },
  };
})();

/* ── storage ─────────────────────────────────────────────────────────────── */
DG.store = {
  KEY: "deepdig.save.v1",
  save(obj) { try { localStorage.setItem(this.KEY, JSON.stringify(obj)); return true; } catch (e) { return false; } },
  load() { try { const s = localStorage.getItem(this.KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
  clear() { try { localStorage.removeItem(this.KEY); } catch (e) {} },
};
