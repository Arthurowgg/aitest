/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · rig — the machine, its gauges, and everything that can go wrong
   The player never touches the rock: they operate a console.  Everything below
   is simulation state — heat, hull, cargo, grubs, quakes, contracts.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

/* ── the seven drills: the whole tech tree ──────────────────────────────── */
DG.DRILLS = [
  { id: "wood",    name: "SPLINTER",  power: 1.0,  cost: {},                                  money: 0 },
  { id: "copper",  name: "COPPER",    power: 1.7,  cost: { copper: 14 },                      money: 120 },
  { id: "iron",    name: "IRON",      power: 2.6,  cost: { iron: 18 },                        money: 320 },
  { id: "silver",  name: "SILVER",    power: 3.8,  cost: { silver: 20 },                      money: 700 },
  { id: "gold",    name: "GILDED",    power: 5.4,  cost: { gold: 18, ruby: 10 },              money: 1400 },
  { id: "diamond", name: "DIAMOND",   power: 7.6,  cost: { diamond: 20 },                     money: 2600 },
  { id: "mythril", name: "MYTHRIL",   power: 10.5, cost: { mythril: 18, coreium: 10 },        money: 4200 },
];

/* ── depot stock: buyable hardware ──────────────────────────────────────── */
DG.HARDWARE = [
  { id: "cargo",   name: "CARGO BAY",    cost: 300, times: 3, desc: "+6 cargo slots",  apply: (r) => (r.cargoCap += 6) },
  { id: "coolant", name: "COOLANT LOOP", cost: 380, times: 3, desc: "faster venting",  apply: (r) => (r.coolBonus += 1) },
  { id: "armour",  name: "PLATING",      cost: 420, times: 3, desc: "+30 hull",        apply: (r) => { r.hullMax += 30; r.hull += 30; } },
  { id: "scanner", name: "DEEP SCANNER", cost: 500, times: 2, desc: "+4 rows scanned", apply: (r) => (r.scanRows += 4) },
  { id: "claw",    name: "REPAIR CLAW",  cost: 620, times: 1, desc: "slow self-repair", apply: (r) => (r.claw = true) },
  { id: "damping", name: "DAMPING",      cost: 560, times: 1, desc: "half quake damage", apply: (r) => (r.damping = true) },
];

/* consumables, usable from the console mid-run */
DG.CONSUMABLES = [
  { id: "patch", name: "PATCH",  cost: 130, desc: "+30 hull now",   hotkey: "KeyR" },
  { id: "purge", name: "PURGE",  cost: 100, desc: "-50 heat now",   hotkey: "KeyX" },
];

/* ── contracts: what the company wants from you ─────────────────────────── */
DG.CONTRACTS = [
  { id: "m1", text: "REACH 120 m",              kind: "depth",   at: 120,  pay: 150 },
  { id: "m2", text: "EXTRACT 25 COPPER",        kind: "ore",     ore: "copper", at: 25, pay: 260 },
  { id: "m3", text: "REACH 360 m",              kind: "depth",   at: 360,  pay: 420 },
  { id: "m4", text: "EXTRACT 30 IRON",          kind: "ore",     ore: "iron", at: 30, pay: 600 },
  { id: "m5", text: "BREACH 2 LAVA VEINS",      kind: "lava",    at: 2,    pay: 700 },
  { id: "m6", text: "REACH 700 m",              kind: "depth",   at: 700,  pay: 900 },
  { id: "m7", text: "EXTRACT 20 SILVER",        kind: "ore",     ore: "silver", at: 20, pay: 1200 },
  { id: "m8", text: "KILL 6 BURROWERS",         kind: "grubs",   at: 6,    pay: 1000 },
  { id: "m9", text: "REACH 1100 m",             kind: "depth",   at: 1100, pay: 1600 },
  { id: "m10", text: "EXTRACT 25 GOLD",         kind: "ore",     ore: "gold", at: 25, pay: 2000 },
  { id: "m11", text: "REACH 1600 m",            kind: "depth",   at: 1600, pay: 3200 },
  { id: "m12", text: "EXTRACT 18 MYTHRIL",      kind: "ore",     ore: "mythril", at: 18, pay: 5000 },
  { id: "m13", text: "REACH THE CORE (2000 m)", kind: "depth",   at: 2000, pay: 12000 },
];

DG.Rig = class Rig {
  constructor(seed) {
    this.well = new DG.Well(seed);
    this.reset();
  }

  reset() {
    this.x = 5; this.y = 0;                 // column, cell depth
    this.hullMax = 100; this.hull = 100;
    this.heatMax = 100; this.heat = 0;
    this.cargoCap = 12; this.cargo = {};
    this.drillIndex = 0;
    this.coolBonus = 0;
    this.scanRows = 12;
    this.claw = false; this.damping = false;
    this.credits = 0;
    this.bank = {};                          // ore banked at the depot
    this.depthRecord = 0;
    this.owned = {};                         // hardware tier counts
    this.status = "idle";
    this.timer = 0;
    this.progress = 0;
    this.drillOn = false;
    this.grubs = [];
    this.lavaBreaches = 0;
    this.kills = 0;
    this.contracts = DG.CONTRACTS.map((c) => Object.assign({ done: false }, c));
    this.cTotals = { ore: {}, lava: 0, grubs: 0 };
    this.deployed = 0;                       // descent count
    this.wrecked = false;
    this.ventT = 0;
    this.quakeT = 6;
    this.grubsSeen = 0;
    this.alerts = [];
    this.sparks = [];
    this.steam = [];
    this.runs = 0;
  }

  get drill() { return DG.DRILLS[this.drillIndex]; }
  get metres() { return this.y * DG.CELL_M; }
  get cargoUsed() { return Object.values(this.cargo).reduce((a, b) => a + b, 0); }
  get cargoFree() { return this.cargoCap - this.cargoUsed; }
  get below() { return this.well.at(this.x, this.y + 1); }
  get temp() { return DG.strataAt(this.metres).temp + this.heat * 1.6; }
  get totalOre() { return Object.values(this.bank).reduce((a, b) => a + b, 0) + Object.values(this.cargo).reduce((a, b) => a + b, 0); }

  /* ── helpers ────────────────────────────────────────────────────────── */
  log(game, msg, tone = "info") { game.log(msg, tone); }
  alert(game, msg, tone = "warn") {
    this.alerts.push({ msg, t: 0, tone });
    if (this.alerts.length > 3) this.alerts.shift();
    this.log(game, msg, tone);
  }
  addOre(ore, n, game) {
    if (!ore || !n) return 0;
    const room = Math.min(n, this.cargoFree);
    if (room <= 0) return 0;
    this.cargo[ore] = (this.cargo[ore] || 0) + room;
    this.cTotals.ore[ore] = (this.cTotals.ore[ore] || 0) + room;
    return room;
  }
  spendCredits(n) { if (this.credits < n) return false; this.credits -= n; return true; }

  /* ── the tick ───────────────────────────────────────────────────────── */
  tick(dt, game) {
    const r = this;
    for (const a of r.alerts) a.t += dt;
    r.alerts = r.alerts.filter((a) => a.t < 6);

    /* particles live here so the console just draws them */
    for (let i = r.sparks.length - 1; i >= 0; i--) {
      const s = r.sparks[i];
      s.life -= dt; s.vy += 420 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0) r.sparks.splice(i, 1);
    }
    for (let i = r.steam.length - 1; i >= 0; i--) {
      const s = r.steam[i];
      s.life -= dt; s.y -= 14 * dt; s.x += s.vx * dt;
      if (s.life <= 0) r.steam.splice(i, 1);
    }

    switch (r.status) {
      case "drilling": r.tickDrilling(dt, game); break;
      case "moving":   r.tickMoving(dt, game); break;
      case "venting":  r.tickVenting(dt, game); break;
      case "ascend":   r.tickAscend(dt, game); break;
      case "descend":  r.tickDescend(dt, game); break;
      case "wrecked":  break;
      default:         r.tickIdle(dt, game);
    }

    /* the rock is hot down here: ambient heat leaks in, the loop bleeds it out */
    r.heat += Math.max(0, DG.strataAt(r.metres).temp - 20) / 40 * dt;
    const cool = 0.9 + r.coolBonus * 0.8;
    if (r.status !== "venting") r.heat = Math.max(0, r.heat - cool * dt);
    if (r.heat >= r.heatMax * 0.999 && r.status !== "wrecked") {
      r.heat = r.heatMax;
      r.hull -= 7 * dt;
      if (!r.overheatWarned || game.time - r.overheatWarned > 3) {
        r.overheatWarned = game.time;
        r.alert(game, "OVERHEAT — HULL BURNING, VENT NOW", "bad");
      }
      if (r.steam.length < 60 && Math.random() < 0.6)
        r.steam.push({ x: r.x, y: r.y - 0.2, life: 0.6, vx: (Math.random() - 0.5) * 8 });
    }

    /* repair claw */
    if (r.claw && r.status === "idle" && r.hull < r.hullMax)
      r.hull = Math.min(r.hullMax, r.hull + 0.9 * dt);

    /* burrowers */
    r.tickGrubs(dt, game);

    /* quakes: heat makes the rock unstable */
    r.quakeT -= dt * (1 + r.heat / 120);
    if (r.quakeT <= 0) {
      r.quakeT = 14 + Math.random() * 22;
      const power = 3 + Math.random() * 6 + r.heat / 14;
      const dmg = r.damping ? power * 0.5 : power;
      r.hull -= dmg;
      DG.Audio.alarm();
      game.shake(0.5, 4);
      game.flash("#ffb03a", 0.25);
      r.alert(game, `SEISMIC EVENT — HULL -${dmg.toFixed(0)}`, "bad");
      for (let i = 0; i < 14; i++)
        r.sparks.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30,
                        life: 0.5 + Math.random() * 0.4 });
    }

    /* contracts */
    r.checkContracts(game);

    if (r.hull <= 0 && r.status !== "wrecked") {
      r.hull = 0;
      r.wrecked = true;
      r.status = "wrecked";
      r.drillOn = false;
      game.onWreck();
    }
    r.depthRecord = Math.max(r.depthRecord, r.metres);
  }

  tickIdle(dt, game) {
    const r = this;
    if (r.drillOn && !r.wrecked) {
      if (r.cargoFree <= 0) {
        if (!r.fullWarned) { r.fullWarned = true; r.alert(game, "CARGO FULL — ASCEND TO SELL", "warn"); }
        return;
      }
      if (r.heat >= r.heatMax * 0.98) return;
      r.status = "drilling";
      r.progress = Math.min(r.progress, 0.9);
    }
  }

  tickDrilling(dt, game) {
    const r = this;
    if (!r.drillOn || r.cargoFree <= 0 || r.heat >= r.heatMax * 0.999) {
      r.status = "idle";
      r.progress *= 0.5;
      return;
    }
    const c = r.below;
    if (TILES[c.tile].unbreakable) {
      r.status = "idle"; r.drillOn = false;
      r.alert(game, "IMPENETRABLE LAYER — REROUTE", "bad");
      return;
    }
    const hard = r.well.hardAt(r.x, r.y + 1);
    const rate = (r.drill.power / hard) * 0.85;
    r.progress += rate * dt;
    if (Math.random() < 0.35) DG.Audio.dig(hard > 1.4);
    r.heat += r.well.heatAt(r.x, r.y + 1) * dt * 3.2;
    /* cuttings + bit sparks */
    if (Math.random() < 0.5) {
      const col = TILES[c.tile].color;
      r.sparks.push({ x: r.x + (Math.random() - 0.5) * 0.5, y: r.y + 0.55,
                      vx: (Math.random() - 0.5) * 26, vy: -Math.random() * 40,
                      life: 0.35 + Math.random() * 0.3, col });
    }
    if (r.progress >= 1) {
      r.progress = 0;
      r.breach(r.x, r.y + 1, game);
    }
  }

  /* drill into a cell: this is where the drama lives */
  breach(x, y, game) {
    const r = this;
    const c = r.well.at(x, y);
    const tile = c.tile;
    DG.Audio.crack(r.well.hardAt(x, y) > 1.6);
    r.well.open(x, y);
    r.y = y;
    r.well._cache && r.well._cache.clear();

    if (tile === T.GAS) {
      r.hull -= 11;
      r.heat += 4;
      game.shake(0.4, 5);
      game.flash("#7df5a8", 0.3);
      r.alert(game, "GAS POCKET BREACHED — HULL -11", "bad");
      for (let i = 0; i < 22; i++)
        r.steam.push({ x: x + (Math.random() - 0.5) * 0.8, y, life: 0.7 + Math.random() * 0.6,
                       vx: (Math.random() - 0.5) * 30 });
    } else if (tile === T.LAVA) {
      r.hull -= 15;
      r.heat += 34;
      r.lavaBreaches++;
      r.cTotals.lava++;
      game.shake(0.6, 6);
      game.flash("#ff6a1a", 0.4);
      r.alert(game, "LAVA VEIN BREACHED — HULL -15, HEAT +34", "bad");
      for (let i = 0; i < 18; i++)
        r.steam.push({ x: x + (Math.random() - 0.5) * 0.8, y, life: 0.5 + Math.random() * 0.5,
                       vx: (Math.random() - 0.5) * 20 });
    } else {
      const loot = r.well.loot(x, y);
      if (loot.ore) {
        const got = r.addOre(loot.ore, loot.amount, game);
        if (got > 0) {
          game.popup(`+${got} ${loot.ore.toUpperCase()}`, loot.ore);
          DG.Audio.coin();
          r.log(game, `EXTRACTED ${got} ${loot.ore.toUpperCase()}`, "good");
        } else {
          r.alert(game, "CARGO FULL — ORE LEFT BEHIND", "warn");
        }
      }
      /* opening a cell can wake a burrower nest */
      if (Math.random() < 0.012 + r.metres / 60000) r.spawnGrub(game);
    }
    if (r.heat >= r.heatMax) r.alert(game, "HEAT CRITICAL — VENT (X)", "bad");
  }

  tickMoving(dt, game) {
    const r = this;
    r.timer -= dt;
    r.heat += 0.6 * dt;
    if (Math.random() < 0.35)
      r.sparks.push({ x: r.x, y: r.y + 0.3, vx: (Math.random() - 0.5) * 22, vy: -Math.random() * 25,
                      life: 0.3, col: "#8f97a8" });
    if (r.timer <= 0) {
      r.x = r.targetX;
      r.well.open(r.x, r.y);
      r.well._cache && r.well._cache.clear();
      r.status = "idle";
      if (Math.random() < 0.016 + r.metres / 70000) r.spawnGrub(game);
    }
  }

  tickVenting(dt, game) {
    const r = this;
    r.timer -= dt;
    const rate = 22 + r.coolBonus * 9;
    r.heat = Math.max(0, r.heat - rate * dt);
    if (Math.random() < 0.9)
      r.steam.push({ x: r.x + (Math.random() - 0.5) * 0.7, y: r.y - 0.2,
                     life: 0.5 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 26 });
    /* the flush cooks anything chewing on the hull */
    for (let i = r.grubs.length - 1; i >= 0; i--) {
      const g = r.grubs[i];
      if (Math.abs(g.y - r.y) < 2.2 && Math.abs(g.x - r.x) < 2.2) {
        r.grubs.splice(i, 1);
        r.kills++; r.cTotals.grubs++;
        r.log(game, "BURROWER FLUSHED", "good");
      }
    }
    if (r.timer <= 0) { r.status = "idle"; r.log(game, "VENT COMPLETE", "info"); }
  }

  tickAscend(dt, game) {
    const r = this;
    r.timer -= dt;
    const speed = 26;                      // cells per second on the winch
    r.y = Math.max(0, r.y - speed * dt);
    if (r.y <= 0) {
      r.y = 0;
      r.status = "idle";
      game.onSurface();
    }
  }

  tickDescend(dt, game) {
    const r = this;
    r.timer -= dt;
    const speed = 34;
    r.y = Math.min(r.targetY, r.y + speed * dt);
    if (r.y >= r.targetY - 0.001) {
      r.y = r.targetY;
      r.status = "idle";
      r.drillOn = false;
      r.runs++;
      r.log(game, `DESCENT COMPLETE — ${Math.round(r.metres)} m`, "info");
    }
  }

  /* ── burrowers ──────────────────────────────────────────────────────── */
  spawnGrub(game) {
    const r = this;
    if (r.grubs.length >= 4) return;
    let x = r.x, y = r.y;
    for (let i = 0; i < 20; i++) {
      x = r.x + Math.round((Math.random() - 0.5) * 8);
      y = r.y + Math.round((Math.random() - 0.5) * 10);
      if (r.well.isDrilled(x, y)) break;
    }
    r.grubs.push({ x, y, hp: 2, t: Math.random() * 3, chewing: 0 });
    r.grubsSeen++;
    r.alert(game, "BURROWER DETECTED IN BOREHOLE", "warn");
  }

  tickGrubs(dt, game) {
    const r = this;
    for (const g of r.grubs) {
      g.t += dt;
      const dx = r.x - g.x, dy = r.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.9) {
        const sp = 1.5 * dt;
        g.x += (dx / d) * sp;
        g.y += (dy / d) * sp;
      } else {
        g.chewing += dt;
        r.hull -= 1.2 * dt;
        if (Math.random() < 0.2)
          r.sparks.push({ x: g.x, y: g.y, vx: (Math.random() - 0.5) * 20, vy: -20, life: 0.3, col: "#ff8a8a" });
        if (!g.warned) { g.warned = true; r.alert(game, "HULL UNDER ATTACK — VENT (X) TO FLUSH", "bad"); }
      }
      /* drilling into a burrower kills it */
      if (Math.abs(g.x - r.x) < 0.6 && Math.abs(g.y - (r.y + 1)) < 0.7 && r.status === "drilling") {
        g.hp -= dt * 4;
        if (g.hp <= 0) {
          r.grubs.splice(r.grubs.indexOf(g), 1);
          r.kills++; r.cTotals.grubs++;
          r.log(game, "BURROWER DESTROYED", "good");
          break;
        }
      }
    }
  }

  /* ── commands (called by the console) ───────────────────────────────── */
  cmdDrill(on) {
    if (this.wrecked || this.status === "ascend" || this.status === "descend") return;
    this.drillOn = on;
    if (!on && this.status === "drilling") this.status = "idle";
  }

  cmdMove(dir, game) {
    const r = this;
    if (r.status !== "idle" || r.wrecked) return false;
    const nx = r.x + dir;
    if (nx < 0 || nx >= r.well.W) { r.alert(game, "EDGE OF THE SHAFT", "warn"); return false; }
    const c = r.well.at(nx, r.y);
    if (TILES[c.tile].unbreakable) { r.alert(game, "IMPENETRABLE LAYER", "bad"); return false; }
    r.status = "moving";
    r.targetX = nx;
    r.timer = 0.55 + TILES[c.tile].hard * 0.25 / r.drill.power;
    r.heat += r.well.heatAt(nx, r.y) * 0.5;
    return true;
  }

  cmdVent(game) {
    const r = this;
    if (r.status === "venting") return false;
    if (r.status === "ascend" || r.status === "descend" || r.wrecked) return false;
    r.status = "venting";
    r.timer = Math.max(1.2, 2.6 - r.coolBonus * 0.55);
    DG.Audio.siren();
    r.drillOn = false;
    r.progress *= 0.4;
    DG.Audio.vent();
    r.log(game, "VENTING COOLANT", "info");
    return true;
  }

  cmdAscend(game) {
    const r = this;
    if (r.status === "ascend" || r.status === "descend" || r.wrecked) return false;
    r.status = "ascend";
    r.drillOn = false;
    DG.Audio.winch();
    r.log(game, "ASCENDING — SLOW WINCH", "info");
    return true;
  }

  descend(game) {
    const r = this;
    r.status = "descend";
    r.targetY = Math.max(1, Math.round(r.depthRecord / DG.CELL_M) - 1);
    r.y = 0;
    r.well._cache && r.well._cache.clear();
    DG.Audio.winch();
    r.log(game, `DESCENDING TO ${r.targetY * DG.CELL_M} m`, "info");
  }

  cmdScan(game) {
    const r = this;
    if (r.status === "ascend" || r.status === "descend") return false;
    const found = r.well.scan(r.y + 1, r.scanRows);
    game.sonar = 1;
    DG.Audio.sonar();
    const ores = found.filter((f) => f.mark.kind === "ore").length;
    const hazards = found.filter((f) => f.mark.kind === "hazard").length;
    r.log(game, `SONAR SWEEP — ${ores} ORE CONTACTS, ${hazards} HAZARDS`, ores ? "good" : "info");
    return true;
  }

  /* consumables */
  useConsumable(id, game) {
    const r = this;
    const item = DG.CONSUMABLES.find((c) => c.id === id);
    if (!item) return false;
    if (id === "patch") {
      if (r.hull >= r.hullMax) { r.log(game, "HULL ALREADY NOMINAL", "warn"); return false; }
      if (!r.spendCredits(item.cost)) { r.log(game, "NOT ENOUGH CREDITS", "warn"); return false; }
      r.hull = Math.min(r.hullMax, r.hull + 30);
      r.log(game, "PATCH APPLIED — HULL +30", "good");
    } else {
      if (r.heat <= 5) { r.log(game, "HEAT ALREADY LOW", "warn"); return false; }
      if (!r.spendCredits(item.cost)) { r.log(game, "NOT ENOUGH CREDITS", "warn"); return false; }
      r.heat = Math.max(0, r.heat - 50);
      r.log(game, "COOLANT PURGE — HEAT -50", "good");
    }
    game.flash("#6fe0ff", 0.2);
    return true;
  }

  sellAll(game) {
    let earned = 0;
    for (const [ore, n] of Object.entries(this.bank)) {
      earned += (ORE_DEFS[ore] ? ORE_DEFS[ore].price : 0) * n;
    }
    this.bank = {};
    this.credits += earned;
    if (earned) this.log(game, `ORE SOLD — ${earned} CR`, "good");
    return earned;
  }

  canForge(i) {
    const d = DG.DRILLS[i];
    if (!d || i !== this.drillIndex + 1) return false;
    for (const [ore, need] of Object.entries(d.cost))
      if ((this.bank[ore] || 0) < need) return false;
    return this.credits >= (d.money || 0);
  }
  forge(game, i) {
    const d = DG.DRILLS[i];
    if (!this.canForge(i)) { DG.Audio.deny(); return false; }
    for (const [ore, need] of Object.entries(d.cost)) this.bank[ore] -= need;
    this.credits -= d.money || 0;
    this.drillIndex = i;
    DG.Audio.forge();
    this.log(game, `${d.name} DRILL BIT FITTED — POWER ${d.power}`, "good");
    return true;
  }
  buyHardware(game, item) {
    const have = this.owned[item.id] || 0;
    if (have >= item.times) return false;
    if (!this.spendCredits(item.cost + have * Math.round(item.cost * 0.55))) { DG.Audio.deny(); return false; }
    this.owned[item.id] = have + 1;
    item.apply(this);
    DG.Audio.forge();
    this.log(game, `${item.name} INSTALLED (${have + 1}/${item.times})`, "good");
    return true;
  }

  checkContracts(game) {
    for (const c of this.contracts) {
      if (c.done) continue;
      let ok = false;
      if (c.kind === "depth") ok = this.depthRecord >= c.at;
      else if (c.kind === "ore") ok = (this.cTotals.ore[c.ore] || 0) >= c.at;
      else if (c.kind === "lava") ok = this.cTotals.lava >= c.at;
      else if (c.kind === "grubs") ok = this.cTotals.grubs >= c.at;
      if (ok) {
        c.done = true;
        this.credits += c.pay;
        this.alert(game, `CONTRACT COMPLETE: ${c.text} · +${c.pay} CR`, "good");
      }
    }
  }

  currentContract() {
    return this.contracts.find((c) => !c.done) || null;
  }

  serialize() {
    return {
      x: this.x, y: Math.round(this.y), hull: this.hull, heat: this.heat,
      cargo: this.cargo, drillIndex: this.drillIndex, credits: this.credits,
      bank: this.bank, depthRecord: this.depthRecord, owned: this.owned,
      cargoCap: this.cargoCap, hullMax: this.hullMax, coolBonus: this.coolBonus,
      scanRows: this.scanRows, claw: this.claw, damping: this.damping,
      cTotals: this.cTotals, contracts: this.contracts.map((c) => c.done),
      lavaBreaches: this.lavaBreaches, kills: this.kills, runs: this.runs,
      drilled: Array.from(this.well.drilled),
    };
  }
  load(s, seed) {
    this.well = new DG.Well(seed);
    for (const k of s.drilled || []) this.well.drilled.add(k);
    Object.assign(this, {
      x: s.x, y: s.y, hull: s.hull, heat: s.heat, cargo: s.cargo || {},
      drillIndex: s.drillIndex || 0, credits: s.credits || 0, bank: s.bank || {},
      depthRecord: s.depthRecord || 0, owned: s.owned || {}, cargoCap: s.cargoCap || 12,
      hullMax: s.hullMax || 100, coolBonus: s.coolBonus || 0, scanRows: s.scanRows || 12,
      claw: !!s.claw, damping: !!s.damping, cTotals: s.cTotals || { ore: {}, lava: 0, grubs: 0 },
      lavaBreaches: s.lavaBreaches || 0, kills: s.kills || 0, runs: s.runs || 0,
    });
    this.contracts = DG.CONTRACTS.map((c, i) => Object.assign({ done: (s.contracts || [])[i] || false }, c));
    this.status = "idle";
    this.well._cache && this.well._cache.clear();
  }
};
