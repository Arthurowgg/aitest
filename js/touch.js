/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · touch — the deck under the glass: phones and tablets get real
   finger-sized controls instead of a keyboard.

   The whole thing is a *view model*: DG.Touch.model(game) is a pure function
   that says what every chip and button should look like right now, and the DOM
   layer only paints that model.  That keeps the mobile UI testable in the
   headless harness (no browser needed) and means the deck can never disagree
   with the console about what the rig is doing.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

DG.Touch = (function () {
  const I = DG.Input;
  const hasDOM = typeof document !== "undefined" && typeof document.querySelector === "function";

  let deckEl = null, bodyEl = null;
  let els = {};                       /* [data-v] readouts, [data-bar] meters      */
  let pads = {};                      /* [data-only] groups of controls            */
  let enabled = false;
  let lastSig = "";
  let lastState = "";
  let fullscreenWanted = false;

  /* ── who gets the deck? ───────────────────────────────────────────────── */
  function detect() {
    let q = "";
    try { q = String((typeof location !== "undefined" && location.search) || ""); } catch (e) {}
    if (/[?&]touch=1\b/.test(q)) return true;
    if (/[?&]touch=0\b/.test(q)) return false;
    try { if (typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) return true; } catch (e) {}
    /* a touchscreen laptop still gets the desktop chrome — until a finger
       actually lands on it, which enable()s the deck for good */
    try {
      const w = innerWidth || 0, h = innerHeight || 0;
      const small = Math.min(w, h), big = Math.max(w, h);
      /* a phone-shaped or tablet-shaped window on a touch device: tablets whose
         pointer still reports as fine (iPad with a mouse) land here too */
      if (navigator.maxTouchPoints > 0 && big > 0 && (small <= 480 || big <= 1024)) return true;
    } catch (e) {}
    return false;
  }

  /* ── talk to the fingers ──────────────────────────────────────────────── */
  function buzz(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  /* ── the deck's view model — pure, so the harness can assert on it ────── */
  function model(game) {
    const rig = game && game.rig;
    const state = (game && game.state) || "title";
    const m = {
      state,
      pad: state === "console" ? "console" : state,
      depth: "0 m", credits: "0",
      hull: 100, heat: 0, hullPct: 100, heatPct: 0,
      warnHull: false, warnHeat: false,
      startsaved: false,
      canPause: state === "console" || state === "depot",
      btn: {},
    };
    if (!rig) return m;

    m.depth = `${Math.round(rig.metres)} m`;
    m.credits = String(Math.round(rig.credits));
    m.hullPct = Math.max(0, Math.min(100, (rig.hull / rig.hullMax) * 100));
    m.heatPct = Math.max(0, Math.min(100, (rig.heat / rig.heatMax) * 100));
    m.hull = `${Math.round(m.hullPct)}%`;
    m.heat = `${Math.round(m.heatPct)}%`;
    m.warnHull = m.hullPct < 35;
    m.warnHeat = m.heatPct > 85;

    /* the console */
    const busy = rig.status === "ascend" || rig.status === "descend";
    m.btn.drill = { active: !!rig.drillOn && rig.status === "drilling", disabled: rig.wrecked };
    m.btn.left = { disabled: rig.wrecked || busy };
    m.btn.right = { disabled: rig.wrecked || busy };
    m.btn.vent = { disabled: rig.wrecked || busy, active: rig.status === "venting" };
    m.btn.sonar = { disabled: rig.wrecked || busy };
    const patch = DG.CONSUMABLES.find((c) => c.id === "patch");
    const purge = DG.CONSUMABLES.find((c) => c.id === "purge");
    m.btn.patch = {
      disabled: rig.wrecked || rig.credits < patch.cost || rig.hull >= rig.hullMax,
      sub: `${patch.cost} CR`,
    };
    m.btn.purge = {
      disabled: rig.wrecked || rig.credits < purge.cost || rig.heat <= 5,
      sub: `${purge.cost} CR`,
    };
    m.btn.ascend = { disabled: rig.wrecked || busy };

    /* the depot */
    let bank = 0;
    for (const [ore, n] of Object.entries(rig.bank))
      bank += (DG.ORE_DEFS[ore] ? DG.ORE_DEFS[ore].price : 0) * n;
    m.btn.sell = { disabled: bank <= 0, sub: bank > 0 ? `banked ${bank} CR` : "nothing banked" };
    m.btn.descend = {
      sub: rig.depthRecord > 0 ? `back to ${Math.round(rig.depthRecord)} m` : "begin the first shaft",
    };

    /* the title */
    let saved = null;
    try { saved = DG.store.load(); } catch (e) { saved = null; }
    m.startsaved = !!(saved && saved.rig);
    m.btn.start = { sub: m.startsaved ? `${Math.round((saved.rig.depthRecord) || 0)} m on file` : "a fresh shaft" };

    /* wrecked / pause */
    m.btn.rebuild = { disabled: game.wreckT < 1 };
    return m;
  }

  /* ── painting the model (the only DOM writes in the whole game) ───────── */
  function paint(m) {
    if (!deckEl) return;
    const sig = JSON.stringify(m);
    if (sig !== lastSig) {
      lastSig = sig;
      for (const [k, v] of Object.entries(m)) if (k in els) els[k].textContent = String(v);
      for (const [k, pct] of [["hull", m.hullPct], ["heat", m.heatPct]]) {
        const bar = els["bar:" + k];
        if (bar) bar.style.width = pct.toFixed(1) + "%";
      }
      const warn = { hull: m.warnHull, heat: m.warnHeat };
      for (const k of ["hull", "heat"]) {
        const chip = els["chip:" + k];
        if (chip) chip.classList.toggle("hot", !!warn[k]);
      }
      for (const [id, st] of Object.entries(m.btn)) {
        const b = els["btn:" + id];
        if (!b) continue;
        b.classList.toggle("on", !!st.active);
        if (st.disabled) b.setAttribute("disabled", "");
        else b.removeAttribute("disabled");
        const sub = els["sub:" + id];
        if (sub && st.sub) sub.textContent = st.sub;
      }
      for (const name of Object.keys(pads)) pads[name].classList.toggle("on", name === m.pad);
      const pauseBtn = els["btn:pause"];
      if (pauseBtn) pauseBtn.hidden = !m.canPause;
      deckEl.setAttribute("data-state", m.state);
    }
    if (m.state !== lastState) {
      if (m.state === "wrecked") buzz([30, 60, 120]);
      lastState = m.state;
    }
  }

  /* ── what the buttons do ──────────────────────────────────────────────── */
  const ACTIONS = {
    /* held controls: they set a flag the console reads every frame */
    drill: { hold: "drill", down: (g) => { if (!g.rig.wrecked) buzz(8); } },
    left:  { hold: "left" },
    right: { hold: "right" },
    /* taps */
    vent:  { tap: (g) => g.rig.cmdVent(g) },
    sonar: { tap: (g) => g.rig.cmdScan(g) },
    patch: { tap: (g) => g.rig.useConsumable("patch", g) },
    purge: { tap: (g) => g.rig.useConsumable("purge", g) },
    ascend: { tap: (g) => g.rig.cmdAscend(g) },
    sell:  { tap: (g) => { if (g.rig.sellAll(g)) g.save(); } },
    descend: { tap: (g) => g.deploy() },
    start: { tap: (g) => startRun(g) },
    resume: { tap: (g) => { g.state = g.pauseFrom || "console"; } },
    pause: { tap: (g) => { g.pauseFrom = g.state; g.state = "pause"; g.save(); } },
    save: { tap: (g) => { g.save(); g.log("SHIFT SAVED", "good"); } },
    newshaft: { tap: (g) => { try { DG.store.clear(); } catch (e) {} g.newRun(true); g.state = "depot"; } },
    rebuild: { tap: (g) => { if (g.wreckT >= 1) g.redeploy(); } },
    fullscreen: { tap: () => toggleFullscreen() },
  };

  function startRun(game) {
    const has = !!DG.store.load();
    game.newRun(!has);
    game.state = "depot";
    if (has) game.log("SAVE RESTORED - DEPOT ONLINE", "good");
  }

  /* the same door the keyboard uses — tests call this directly */
  function act(id, game) {
    const a = ACTIONS[id];
    if (!a || !game) return false;
    const rig = game.rig;
    /* respect the model's own disabled state so the two can never diverge */
    const st = model(game).btn[id];
    if (st && st.disabled) return false;
    if (a.hold) return setHold(a.hold, true, game);
    if (a.tap) { a.tap(game); return true; }
    return false;
  }

  function setHold(name, on, game) {
    if (!I.hold) return false;
    if (on && game) {
      const st = model(game).btn[name];
      if (st && st.disabled) return false;
    }
    I.hold[name] = on;
    return true;
  }

  function releaseHold(name, game) {
    if (ACTIONS[name] && ACTIONS[name].hold) I.hold[ACTIONS[name].hold] = false;
    else if (ACTIONS[name] && ACTIONS[name].tap && game) ACTIONS[name].tap(game);
  }

  /* ── fullscreen: the one bit of chrome a phone deserves ───────────────── */
  function toggleFullscreen() {
    if (!hasDOM) return false;
    const d = document;
    try {
      if (!d.fullscreenElement && d.documentElement.requestFullscreen) {
        fullscreenWanted = true;
        d.documentElement.requestFullscreen({ navigationUI: "hide" });
        return true;
      }
      if (d.exitFullscreen) { fullscreenWanted = false; d.exitFullscreen(); return true; }
    } catch (e) {}
    return false;
  }

  /* ── the deck's geometry: how big the glass can be ────────────────────── */
  /* pure maths, so tools/headless.js can check it against real phone sizes */
  function fitScale(availW, availH, dpr) {
    const raw = Math.min(availW / 480, availH / 288);
    let out;
    if (raw >= 1) {
      /* desktop and tablets: whole or half steps keep the pixels square */
      const half = Math.round(raw * 2) / 2;
      out = half <= raw ? half : Math.max(1, Math.floor(raw));
    } else {
      /* phones: smaller than 1:1, so fill the width and let the browser's
         pixelated upscale do the rest — a snapped 0.5x would waste half the
         screen */
      out = raw;
    }
    out = Math.max(0.25, out);
    if (dpr && dpr > 1 && out >= 1) {
      const snapped = Math.round(out * dpr) / dpr;            /* land on device pixels */
      if (snapped <= out + 1e-6) out = snapped;
    }
    return out;
  }

  /* ── wiring ───────────────────────────────────────────────────────────── */
  function boot() {
    if (!hasDOM) return false;
    bodyEl = document.body;
    deckEl = document.getElementById("deck");
    if (!deckEl) return false;

    for (const el of deckEl.querySelectorAll("[data-v]")) els[el.getAttribute("data-v")] = el;
    for (const el of deckEl.querySelectorAll("[data-bar]")) els["bar:" + el.getAttribute("data-bar")] = el;
    for (const el of deckEl.querySelectorAll("[data-warn]")) els["chip:" + el.getAttribute("data-warn")] = el;
    for (const el of deckEl.querySelectorAll("[data-only]")) pads[el.getAttribute("data-only")] = el;

    for (const btn of deckEl.querySelectorAll("[data-act]")) {
      const id = btn.getAttribute("data-act");
      const a = ACTIONS[id];
      if (!a) continue;
      els["btn:" + id] = btn;
      const sub = btn.querySelector("small");
      if (sub) els["sub:" + id] = sub;

      const down = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.pointerId != null && btn.setPointerCapture) {
          try { btn.setPointerCapture(e.pointerId); } catch (err) {}
        }
        btn.classList.add("down");
        if (a.hold) setHold(a.hold, true, DG.game);
        else if (a.tap) { a.tap(DG.game); }
      };
      const up = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        btn.classList.remove("down");
        if (a.hold) setHold(a.hold, false, DG.game);
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("lostpointercapture", up);
      /* a mouse-only browser never fires pointer events here, but keep click
         as the safety net for the analytics-free browsers */
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
      btn.addEventListener("dragstart", (e) => e.preventDefault());
    }

    /* the first real touch turns the deck on, whatever the media queries said */
    const wake = () => enable();
    window.addEventListener("touchstart", wake, { passive: true, once: true });
    if (detect()) enable();
    return true;
  }

  function enable() {
    enabled = true;
    if (bodyEl) bodyEl.classList.add("touch");
    const hint = document.getElementById("hint");
    if (hint) hint.classList.add("gone");
  }

  function sync(game) {
    if (!deckEl || !game) return;
    paint(model(game));
  }

  return {
    boot, enable, sync, model, act, setHold, releaseHold, fitScale, toggleFullscreen, detect,
    get enabled() { return enabled; },
    set enabled(v) { if (v) enable(); else { enabled = false; } },
    get hasDOM() { return hasDOM; },
    get actionIds() { return Object.keys(ACTIONS); },
  };
})();
