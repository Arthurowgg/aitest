/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG - game - states, screen effects, save, and the boot loop
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

let game_time = 0;

DG.Game = class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d", { alpha: false });
    this.view = { w: canvas.width, h: canvas.height };
    this.state = "title";
    this.time = 0;
    this.logLines = [];
    this.flashCol = "#ffffff";
    this.flashT = 0;
    this.shakeT = 0;
    this.shakeAmt = 0;
    this.sonar = 0;
    this.saveT = 0;
    this.titleT = 0;
    this.wreckT = 0;
    this.pauseFrom = "console";
    this.acc = 0;
    this.steerDir = 0;                  /* held steering: pads and arrow keys */
    this.steerT = 0;
    this.steerRepeats = 0;
    this.rig = null;
    this.newRun(true);
  }

  /* ── run lifecycle ─────────────────────────────────────────────────── */
  newRun(fresh) {
    let saved = null;
    if (!fresh) { try { saved = DG.store.load(); } catch (e) { saved = null; } }
    const seed = saved ? saved.seed : (Math.random() * 0xffffffff) >>> 0;
    this.rig = new DG.Rig(seed);
    if (saved) {
      try { this.rig.load(saved.rig, seed); } catch (e) { console.warn("save could not be loaded", e); }
    }
    this.logLines = [];
    this.log(saved ? "CONSOLE ONLINE - SAVE RESTORED" : "CONSOLE ONLINE - NEW SHAFT", "info");
    if (DG.Console) DG.Console.reset(this.rig);
    this.state = "title";
    this.titleT = 0;
  }

  save() {
    if (!this.rig) return;
    try {
      DG.store.save({ v: 2, seed: this.rig.well.SEED, rig: this.rig.serialize(), at: Date.now() });
    } catch (e) { /* storage may be unavailable in the harness */ }
  }

  /* ── screen feedback ───────────────────────────────────────────────── */
  log(msg, tone) {
    this.logLines.push({ msg, tone: tone || "info", t: this.time });
    if (this.logLines.length > 40) this.logLines.shift();
  }
  popup(text, ore) { DG.Console.popup(text, ore); }
  flash(col, t) { this.flashCol = col; this.flashT = Math.max(this.flashT, t); }
  shake(t, amt) { this.shakeT = Math.max(this.shakeT, t); this.shakeAmt = Math.max(this.shakeAmt, amt); }

  /* ── transitions ───────────────────────────────────────────────────── */
  deploy() {
    this.rig.descend(this);
    this.state = "console";
    DG.Audio.winch();
    this.save();
  }
  onSurface() {
    this.state = "depot";
    let moved = 0;
    for (const [ore, n] of Object.entries(this.rig.cargo)) {
      this.rig.bank[ore] = (this.rig.bank[ore] || 0) + n;
      moved += n;
    }
    this.rig.cargo = {};
    this.log(moved ? `${moved} UNITS TRANSFERRED TO ORE BANK` : "BACK AT THE SURFACE",
             moved ? "good" : "info");
    DG.Audio.pop();
    this.save();
  }
  onWreck() {
    const rig = this.rig;
    this.state = "wrecked";
    this.wreckT = 0;
    DG.Audio.alarm();
    if (DG.Input.rumble) DG.Input.rumble([40, 70, 160]);
    this.flash("#ff3a3a", 0.7);
    this.shake(1.1, 8);
    const lost = rig.cargoUsed;
    rig.lastLost = lost;
    rig.cargo = {};
    this.log(`RIG DESTROYED AT ${Math.round(rig.metres)} m`, "bad");
    if (lost) this.log(`${lost} UNITS OF ORE LOST WITH THE HULL`, "bad");
    this.save();
  }
  redeploy() {
    const rig = this.rig;
    rig.wrecked = false;
    rig.hull = rig.hullMax;
    rig.heat = 0;
    rig.status = "idle";
    rig.grubs = [];
    rig.alerts = [];
    rig.x = 5;
    rig.y = 0;
    rig.drillOn = false;
    this.log("NEW RIG DEPLOYED FROM THE DEPOT", "good");
    this.state = "depot";
    this.save();
  }

  /* ── main tick ─────────────────────────────────────────────────────── */
  update(dt) {
    this.time += dt;
    game_time = this.time;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeAmt = 0; }
    if (this.sonar > 0) this.sonar -= dt;
    if (this.state === "title") this.titleT += dt;
    if (this.state === "wrecked") this.wreckT += dt;

    if (this.state === "console") this.rig.tick(dt, this);
    else if (this.rig) {
      for (let i = this.rig.sparks.length - 1; i >= 0; i--) {
        const s = this.rig.sparks[i];
        s.life -= dt; s.vy += 400 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.life <= 0) this.rig.sparks.splice(i, 1);
      }
      for (let i = this.rig.steam.length - 1; i >= 0; i--) {
        const s = this.rig.steam[i];
        s.life -= dt; s.y -= 12 * dt;
        if (s.life <= 0) this.rig.steam.splice(i, 1);
      }
    }

    /* held steering: tap to step one column, hold to crawl along the seam.
       The deck's pads, A/D and the arrows all feed the same two flags. */
    if (this.state === "console") {
      const I = DG.Input;
      const left = !!(I.hold.left || I.key("KeyA") || I.key("ArrowLeft"));
      const right = !!(I.hold.right || I.key("KeyD") || I.key("ArrowRight"));
      const dir = (left ? -1 : 0) + (right ? 1 : 0);
      if (dir !== this.steerDir) {
        this.steerDir = dir;
        this.steerT = 0;
        this.steerRepeats = 0;
        if (dir && !this.rig.wrecked) { DG.Audio.click(); this.rig.cmdMove(dir, this); }
      } else if (dir) {
        this.steerT += dt;
        if (this.steerT >= (this.steerRepeats ? 0.17 : 0.34)) {
          this.steerT = 0;
          this.steerRepeats++;
          if (!this.rig.wrecked) this.rig.cmdMove(dir, this);
        }
      }
    } else {
      this.steerDir = 0;
    }

    DG.Console.setScanFx(this.sonar > 0 ? Math.min(1, this.sonar * 1.6) : 0);

    /* the mine breathes: drone swells with depth while the console runs */
    this.ambT = (this.ambT || 0) - dt;
    if (this.ambT <= 0) {
      this.ambT = 0.5;
      try { DG.Audio.ambience(this.rig ? this.rig.metres : 0, this.state === "console"); } catch (e) {}
    }

    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 20; if (this.state !== "title") this.save(); }
  }

  /* ── input per state ───────────────────────────────────────────────── */
  handleInput() {
    const I = DG.Input;

    if (this.state === "title") {
      if (I.hit("Space") || I.hit("Enter") || I.clicked) {
        const has = !!DG.store.load();
        this.newRun(!has);
        this.state = "depot";
        if (has) this.log("SAVE RESTORED - DEPOT ONLINE", "good");
      } else if (I.hit("KeyN") || I.hit("KeyR")) {
        try { DG.store.clear(); } catch (e) {}
        this.newRun(true);
        this.state = "depot";
      }
      return;
    }

    if (this.state === "console") {
      if (I.hit("Escape")) { this.pauseFrom = "console"; this.state = "pause"; this.save(); return; }
      if (I.hit("KeyX")) this.rig.cmdVent(this);
      if (I.hit("KeyC")) this.rig.cmdScan(this);
      if (I.hit("KeyR")) this.rig.useConsumable("patch", this);
      if (I.hit("KeyQ")) this.rig.useConsumable("purge", this);
      if (I.hit("KeyE")) this.rig.cmdAscend(this);
      if (I.hit("KeyM")) this.log(DG.Audio.toggle() ? "AUDIO MUTED" : "AUDIO ON", "info");
      /* drilling: SPACE, the deck's DRILL button, or a held finger/mouse on the
         borehole itself — any of them, all at once */
      const v = DG.Console.L.view;
      const overGlass = I.mx > v.x && I.mx < v.x + v.w && I.my > v.y + 24 && I.my < v.y + v.h;
      const overButton = DG.UI.hot.hover === "drillBtn";
      this.rig.cmdDrill(!!(I.key("Space") || I.hold.drill ||
                           (I.down && (overGlass || overButton))));
      return;
    }

    if (this.state === "depot") {
      if (I.hit("Escape")) { this.pauseFrom = "depot"; this.state = "pause"; }
      return;
    }

    if (this.state === "wrecked") {
      if (this.wreckT > 1.0 && (I.hit("Space") || I.hit("Enter") || I.clicked)) this.redeploy();
      return;
    }

    if (this.state === "pause") {
      if (I.hit("Escape") || I.hit("Space") || I.hit("Enter")) this.state = this.pauseFrom;
      else if (I.hit("KeyQ")) { this.save(); this.newRun(false); }
      else if (I.hit("KeyN")) { try { DG.store.clear(); } catch (e) {} this.newRun(true); }
      else if (I.hit("KeyM")) this.log(DG.Audio.toggle() ? "AUDIO MUTED" : "AUDIO ON", "info");
    }
  }
};
