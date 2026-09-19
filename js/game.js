/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · game — loop, mining, combat, forge, shop, save
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

let game_time = 0;                       // seconds since boot (used by shaders-ish f/x)

DG.Game = class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d", { alpha: false });
    this.view = { w: canvas.width, h: canvas.height };
    this.state = "title";
    this.particles = new DG.Particles();
    this.floaters = new DG.Floaters();
    this.bombs = [];
    this.shakeAmt = 0; this.shakeT = 0;
    this.hint = ""; this.hintT = 0;
    this.hintCool = 0;
    this.spawnT = 0;
    this.swingCd = 0;
    this.digTile = -1;
    this.saveT = 0;
    this.acc = 0; this.last = performance.now();
    this.menuIndex = 0;
    this.uiHover = null;
    this.titleT = 0;
    this.deathT = 0;
    this.stats = { deepest: 0, mined: 0, kills: 0 };
    this.newWorld(true);
  }

  /* ── world bootstrap ─────────────────────────────────────────────────── */
  newWorld(fresh) {
    const saved = fresh ? null : DG.store.load();
    const seed = saved ? saved.seed : (Math.random() * 0xffffffff) >>> 0;
    this.world = new DG.World(seed);
    const spawnX = this.world.campX * TILE + 2;
    const spawnY = (this.world.campY - 3) * TILE;
    this.player = new DG.Player(spawnX, spawnY);
    this.mobs = [];
    this.drops = new DG.Drops();
    this.particles.list.length = 0;
    this.floaters.list.length = 0;
    this.bombs.length = 0;
    this.craftT = 0;
    if (saved) this.applySave(saved);
    DG.Render.initCamera(this.world);
    DG.Render.camera.x = this.player.cx - this.view.w / 2;
    DG.Render.camera.y = this.player.cy - this.view.h / 2;
    this.hintMsg("WASD/arrows to walk · SPACE to jump · hold CLICK to mine", 5);
  }

  applySave(s) {
    const p = this.player;
    this.world.applyMods(s.mods);
    p.x = s.x; p.y = s.y;
    p.hp = Math.max(1, s.hp); p.maxHp = s.maxHp; p.coins = s.coins;
    p.ore = s.ore || {};
    p.tier = s.tier || 0;
    p.bombs = s.bombs ?? 1;
    p.up = Object.assign({ lantern: false, boots: false, cushion: false, magnet: false }, s.up);
    this.stats = Object.assign({ deepest: 0, mined: 0, kills: 0 }, s.stats);
  }

  save() {
    const p = this.player;
    DG.store.save({
      v: 1, seed: this.world.SEED,
      x: p.x, y: p.y, hp: Math.max(1, p.hp), maxHp: p.maxHp, coins: p.coins,
      ore: p.ore, tier: p.tier, bombs: p.bombs, up: p.up,
      stats: this.stats,
      mods: this.world.serializeMods(),
    });
  }

  /* ── helpers ─────────────────────────────────────────────────────────── */
  shake(t, amt) { DG.Render.camera.shakeT = Math.max(DG.Render.camera.shakeT, t); DG.Render.camera.shake = Math.max(DG.Render.camera.shake || 0, amt); }
  hintMsg(text, t = 3) {
    if (this.hintCool > 0 && text === this.hint) return;
    this.hint = text; this.hintT = t; this.hintCool = 0.6;
  }

  /* ── aim ─────────────────────────────────────────────────────────────── */
  computeAim() {
    const p = this.player, c = DG.Render.camera;
    let wx, wy;
    if (DG.Input.lastDevice === "touch" && DG.Input.touch.aimId >= 0) {
      wx = DG.Input.touch.ax + c.x; wy = DG.Input.touch.ay + c.y;
    } else if (DG.Input.lastDevice === "touch") {
      wx = p.cx + p.face * 40; wy = p.cy;
    } else {
      wx = DG.Input.mouse.x + c.x; wy = DG.Input.mouse.y + c.y;
    }
    const dx = wx - p.cx, dy = wy - p.cy;
    const dist = Math.hypot(dx, dy);
    const reach = p.pick.reach * TILE;
    const capped = dist > reach ? reach / dist : 1;
    const tx = Math.floor((p.cx + dx * capped) / TILE);
    const ty = Math.floor((p.cy + dy * capped) / TILE);
    return {
      wx: p.cx + dx * capped, wy: p.cy + dy * capped,
      dx, dy, dist, tx, ty,
      inReach: dist <= reach,
      mine: DG.Input.mouse.down || DG.Input.touch.mine,
    };
  }

  /* ── mining & swinging ───────────────────────────────────────────────── */
  doMining(dt, aim) {
    const { world, player } = this;
    const i = world.inside(aim.tx, aim.ty) ? world.idx(aim.tx, aim.ty) : -1;

    /* only the tile under the cursor keeps its crack progress */
    if (i !== this.digTile) {
      if (this.digTile != null && this.digTile >= 0) world.damage[this.digTile] = 0;
      this.digTile = i;
    }

    if (!aim.mine) {
      this.digSfx = 0;
      if (i >= 0) world.damage[i] = Math.max(0, world.damage[i] - dt * 1.5);
      return;
    }
    if (i < 0) return;
    const tile = world.get(aim.tx, aim.ty);
    const d = TILES[tile];

    /* monsters first — a pickaxe is also a weapon */
    const hit = this.mobAt(aim.wx, aim.wy, 11);
    if (hit) { this.attackMob(hit, aim); return; }

    if (tile === T.AIR || tile === T.LAVA) {
      if (this.hintCool <= 0 && Math.random() < 0.05)
        this.hintMsg(tile === T.LAVA ? "that is lava — leave it alone" : "nothing here — aim at rock", 1.2);
      return;
    }
    if (!aim.inReach) return;

    const verdict = world.canMine(aim.tx, aim.ty, player.tier + 1);
    if (verdict === "hard") {
      if (this.hintCool <= 0) { DG.Audio.deny(); this.hintMsg("bedrock — the world's floor", 1.6); }
      return;
    }
    if (verdict === "tier") {
      if (this.hintCool <= 0) {
        DG.Audio.deny();
        const need = DG.PICKS[d.tier - 1];
        this.hintMsg(`${d.name} needs a ${need ? need.name : "better"} pickaxe`, 2);
      }
      return;
    }

    const time = world.mineTime(aim.tx, aim.ty, player.tier + 1, player.pick.power, player.pick.speed);
    world.damage[i] += dt / Math.max(0.02, time);
    this.digSfx -= dt;
    if (this.digSfx <= 0) {
      this.digSfx = 0.16;
      DG.Audio.dig(d.hard > 1.2);
      this.particles.burst(aim.wx, aim.wy, 2,
        { kind: "chip", size: (aim.tx + aim.ty) % 4, speed: 40, life: 0.35, g: 300,
          angle: Math.atan2(aim.dy, aim.dx) + Math.PI });
    }
    if (world.damage[i] >= 1) {
      const res = world.breakTile(aim.tx, aim.ty);
      if (res) this.onBreak(res, aim);
    }
  }

  onBreak(res, aim) {
    const { player } = this;
    const wx = res.x * TILE + 8, wy = res.y * TILE + 8;
    DG.Audio.crack();
    this.shake(0.12, 2);
    this.stats.mined++;
    const chipSet = res.ore ? 3 : 0;
    this.particles.burst(wx, wy, 8, { kind: "chip", size: (res.x + res.y) % 4, speed: 70, life: 0.5, g: 340 });
    if (res.ore) {
      this.particles.burst(wx, wy, 5, { kind: "glint", speed: 55, life: 0.6, g: -40,
        col: ORE_DEFS[res.ore].glow || "#ffe9a0" });
      this.drops.add(wx, wy, res.ore, res.coins, res.yield);
      if (res.yield > 1) this.floaters.add(wx, wy, "+" + res.yield + " " + res.ore, "#7df5a8");
      const next = DG.PICKS[player.tier + 1];
      if (next && next.cost[res.ore]) {
        const have = (player.ore[res.ore] || 0) + res.yield, need = next.cost[res.ore];
        if (have >= need && (player.ore[res.ore] || 0) < need)
          this.hintMsg("forge is ready — TAB to upgrade!", 4);
      }
    } else if (res.coins) {
      this.drops.add(wx, wy, null, res.coins);
    }
  }

  mobAt(wx, wy, r) {
    for (const m of this.mobs) {
      if (m.dead) continue;
      if (Math.hypot(m.cx - wx, m.cy - wy) < r + Math.max(m.k.w, m.k.h) / 2) return m;
    }
    return null;
  }

  attackMob(m, aim) {
    if (this.swingCd > 0) return;
    this.swingCd = 0.28;
    const p = this.player;
    p.swing = 0.26; p.swingDir = aim.dx >= 0 ? 1 : -1;
    const dmg = p.pick.power;
    const kx = sign(aim.dx || 1) * 60, ky = -70;
    const died = m.hurt(dmg, kx, ky);
    DG.Audio.hitFx();
    this.shake(0.14, 3);
    this.particles.burst(m.cx, m.cy, 6, { kind: "spark", speed: 80, life: 0.35, g: 200, col: "#ffd35c" });
    this.floaters.add(m.cx, m.cy, "-" + dmg, "#ffe9a0");
    if (died) {
      this.stats.kills++;
      this.drops.add(m.cx, m.cy, null, m.k.coins);
      this.particles.burst(m.cx, m.cy, 10, { kind: "chip", size: 1, speed: 90, life: 0.6, g: 320 });
      if (m.kind === "golem" && Math.random() < 0.5) {
        const ore = ["iron", "silver", "gold"][Math.min(2, Math.floor(this.world.depthMeters(m.cy / TILE) / 90))];
        this.drops.add(m.cx, m.cy, ore, 0);
      }
      this.floaters.add(m.cx, m.cy - 8, "slain!", "#7df5a8");
    }
  }

  /* ── monsters ────────────────────────────────────────────────────────── */
  updateMobs(dt) {
    const { world, player } = this;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.update(dt, world, player, this.particles);
      /* contact damage */
      if (!m.dead && !player.dead &&
          Math.abs(m.cx - player.cx) < (m.k.w + player.w) / 2 &&
          Math.abs(m.cy - player.cy) < (m.k.h + player.h) / 2) {
        if (player.hurt(m.k.dmg, m.cx)) {
          this.shake(0.2, 3);
          this.floaters.add(player.cx, player.y, "-" + m.k.dmg, "#ff6b7a");
          this.particles.burst(player.cx, player.cy, 6, { kind: "chip", size: 2, speed: 90, life: 0.4 });
        }
      }
      const far = Math.hypot(m.cx - player.cx, m.cy - player.cy);
      if (m.dead || far > 520) this.mobs.splice(i, 1);
    }
    /* spawn in the dark, never in sight */
    this.spawnT -= dt;
    const depth = world.depthMeters(player.cy / TILE);
    const cap = 3 + Math.min(4, Math.floor(depth / 70));
    if (this.spawnT <= 0 && this.mobs.length < cap) {
      this.spawnT = 1.6;
      for (let tries = 0; tries < 14; tries++) {
        const x = Math.floor(player.cx / TILE) + (Math.random() < 0.5 ? -1 : 1) * (11 + Math.floor(Math.random() * 16));
        const y = Math.floor(player.cy / TILE) + Math.floor((Math.random() - 0.5) * 18);
        if (!world.inside(x, y) || y < world.surfaceAt(x) + 3) continue;
        if (world.get(x, y) !== T.AIR || world.get(x, y - 1) !== T.AIR) continue;
        if (!world.isSolid(x, y + 1)) continue;
        const ceilFree = world.get(x, y - 2) === T.AIR;
        let kind = "bat";
        if (depth > 100) kind = Math.random() < 0.5 ? "golem" : "bat";
        if (depth > 190) kind = Math.random() < 0.45 ? "ember" : (Math.random() < 0.5 ? "golem" : "bat");
        if (kind === "golem" && !ceilFree) continue;
        this.mobs.push(new DG.Mob(kind, x * TILE + 2, y * TILE + 2));
        break;
      }
    }
  }

  /* ── bombs ───────────────────────────────────────────────────────────── */
  dropBomb() {
    const p = this.player;
    if (p.bombs <= 0) { DG.Audio.deny(); this.hintMsg("no bombs — buy more in the shop", 2); return; }
    p.bombs--;
    this.bombs.push({ x: p.cx, y: p.cy, vy: -90, t: 1.7 });
    DG.Audio.torch();
  }
  updateBombs(dt) {
    const { world, player } = this;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.t -= dt;
      b.vy += GRAV * 0.7 * dt;
      let ny = b.y + b.vy * dt;
      if (player.hits(world, b.x - 3, ny - 3)) { ny = b.y; b.vy = 0; }
      b.y = ny;
      this.particles.spawn({ x: b.x, y: b.y - 5, vx: (Math.random() - .5) * 14, vy: -26,
                             life: 0.32, kind: "spark" });
      if (b.t <= 0) {
        this.bombs.splice(i, 1);
        this.explode(b.x, b.y);
      }
    }
  }
  explode(x, y) {
    const { world, player } = this;
    const r = 2.7 * TILE;
    DG.Audio.boom();
    this.shake(0.5, 6);
    this.particles.burst(x, y, 26, { kind: "spark", speed: 220, life: 0.6, g: 120, col: "#ffd35c" });
    this.particles.burst(x, y, 18, { kind: "chip", speed: 170, life: 0.8, g: 400 });
    this.particles.burst(x, y, 12, { kind: "smoke", speed: 60, life: 1.1, g: -30 });
    const broken = world.blast(x / TILE, y / TILE, r / TILE, player.tier + 1);
    for (const res of broken) {
      if (res.ore) {
        const dist = Math.hypot(res.x * TILE + 8 - player.cx, res.y * TILE + 8 - player.cy);
        this.drops.add(res.x * TILE + 8, res.y * TILE + 8, res.ore, dist < 150 ? res.coins : 0);
      } else if (res.coins && Math.random() < 0.5) {
        this.drops.add(res.x * TILE + 8, res.y * TILE + 8, null, res.coins);
      }
    }
    for (const m of this.mobs) {
      const d = Math.hypot(m.cx - x, m.cy - y);
      if (d < r * 1.4) {
        const died = m.hurt(5, sign(m.cx - x) * 160, -180);
        if (died) { this.stats.kills++; this.drops.add(m.cx, m.cy, null, m.k.coins); }
      }
    }
    if (Math.hypot(player.cx - x, player.cy - y) < r * 1.1) player.hurt(2, x);
  }

  /* ── forge / shop ────────────────────────────────────────────────────── */
  canForge(index) {
    const pick = DG.PICKS[index];
    if (!pick) return false;
    for (const [ore, need] of Object.entries(pick.cost))
      if ((this.player.ore[ore] || 0) < need) return false;
    return true;
  }
  forge(index) {
    const p = this.player, pick = DG.PICKS[index];
    if (index !== p.tier + 1 || !this.canForge(index)) { DG.Audio.deny(); return; }
    for (const [ore, need] of Object.entries(pick.cost)) p.ore[ore] -= need;
    p.tier = index;
    DG.Audio.buy();
    this.floaters.add(p.cx, p.y - 6, pick.name + " pick!", "#7df5a8", true);
    this.hintMsg(`${pick.name} pickaxe forged — power ${pick.power}, reach ${pick.reach.toFixed(1)}`, 4);
    this.particles.burst(p.cx, p.cy, 20, { kind: "spark", speed: 120, life: 0.8, g: -30, col: "#ffd35c" });
    this.save();
  }
  buy(item) {
    const p = this.player;
    if (p.coins < item.cost) { DG.Audio.deny(); return; }
    if (item.once && p.up[item.id]) { DG.Audio.deny(); return; }
    if (item.id === "heart" && p.maxHp >= 16) { DG.Audio.deny(); return; }
    p.coins -= item.cost;
    if (item.id === "bomb") p.bombs = Math.min(9, p.bombs + 1);
    else if (item.id === "heart") { p.maxHp += 2; p.heal(2); }
    else p.up[item.id] = true;
    DG.Audio.buy();
    this.hintMsg(item.name + " acquired", 2.5);
    this.save();
  }
  owns(item) {
    if (item.id === "heart") return false;
    return item.once && this.player.up[item.id];
  }

  /* ── coming back from the dead ───────────────────────────────────────── */
  revive() {
    const p = this.player;
    p.dead = false;
    p.hp = p.maxHp;
    p.invuln = 2.2;
    p.vx = p.vy = 0;
    this.player.ore = p.ore;
    this.warpHome();
    /* the dark forgets you for a moment */
    for (const m of this.mobs) {
      if (Math.hypot(m.cx - p.cx, m.cy - p.cy) < 200) m.dead = true;
    }
    this.particles.burst(p.cx, p.cy, 26, { kind: "spark", speed: 140, life: 1, g: -30, col: "#7df5a8" });
    this.hintMsg("you wake at camp — the forge remembers you", 3.5);
    this.state = "play";
    this.save();
  }

  /* ── fast travel ─────────────────────────────────────────────────────── */
  warpHome() {
    const p = this.player;
    this.particles.burst(p.cx, p.cy, 16, { kind: "spark", speed: 120, life: 0.6, g: -40, col: "#8ff0ff" });
    p.x = this.world.campX * TILE + 2;
    p.y = (this.world.campY - 3) * TILE;
    p.vx = p.vy = 0;
    this.particles.burst(p.cx, p.cy, 16, { kind: "spark", speed: 120, life: 0.6, g: -40, col: "#8ff0ff" });
    DG.Audio.warp();
    this.hintMsg("back at camp", 1.6);
    this.shake(0.2, 2);
  }

  /* ── per-frame ───────────────────────────────────────────────────────── */
  update(dt) {
    game_time += dt;
    const p = this.player;
    if (this.hintT > 0) this.hintT -= dt;
    if (this.hintCool > 0) this.hintCool -= dt;
    if (this.swingCd > 0) this.swingCd -= dt;

    this.aim = this.state === "play" ? this.computeAim() : null;

    if (this.state === "play") {
      p.update(dt, this.world, this.aim);
      this.doMining(dt, this.aim);
      this.updateMobs(dt);
      this.updateBombs(dt);
      this.particles.update(dt);
      this.floaters.update(dt);
      this.drops.update(dt, p, p.up.magnet);
      this.stats.deepest = Math.max(this.stats.deepest, this.world.depthMeters(p.cy / TILE));
      DG.Audio.ambience(this.world.depthMeters(p.cy / TILE), true);
      /* a heartbeat when you are nearly out of blood */
      if (p.hp <= 2 && !p.dead) {
        this.beat = (this.beat || 0) - dt;
        if (this.beat <= 0) { this.beat = 1.05; DG.Audio.heartbeat(); }
      }
      if (p.dead) { this.state = "dead"; this.deathT = 0; this.save(); }
    } else {
      DG.Audio.ambience(0, false);
      this.particles.update(dt);
      this.floaters.update(dt);
      if (this.state === "dead") this.deathT += dt;
      if (this.state === "title") this.titleT += dt;
    }

    /* autosave */
    this.saveT -= dt;
    if (this.saveT <= 0) { this.saveT = 12; if (this.state === "play") this.save(); }

    DG.Render.updateCamera(dt, p, this.aim, this.view);
    if (this.state === "shop" || this.state === "pause" || this.state === "dead" || this.state === "title")
      DG.Input.mouse.down = false;
  }

  /* ── keyboard & clicks per state ─────────────────────────────────────── */
  handleInput() {
    const I = DG.Input;
    const p = this.player;

    if (this.state === "title") {
      const hasSave = !!DG.store.load();
      if (I.hit("Space") || I.hit("Enter") || this.clicked()) {
        this.newWorld(hasSave ? false : true);
        this.state = "play";
      } else if (I.hit("KeyN")) {
        DG.store.clear();
        this.newWorld(true);
        this.state = "play";
      }
      return;
    }

    if (this.state === "play") {
      if (I.hit("Escape")) { this.state = "pause"; this.save(); return; }
      if (I.hit("KeyE") || I.hit("Tab")) { this.state = "shop"; this.shopTab = 0; return; }
      if (I.hit("KeyB")) this.dropBomb();
      if (I.hit("KeyT")) this.warpHome();
      if (I.hit("KeyM")) { const m = DG.Audio.toggle(); this.hintMsg(m ? "sound off" : "sound on", 1.4); }
      if (I.hit("KeyF")) { /* quick forge when affordable */
        for (let i = 1; i < DG.PICKS.length; i++) if (i === p.tier + 1 && this.canForge(i)) { this.forge(i); break; }
      }
      return;
    }

    if (this.state === "shop") {
      if (I.hit("Escape") || I.hit("KeyE") || I.hit("Tab")) { this.state = "play"; this.save(); return; }
      if (I.hit("Digit1")) this.shopTab = 0;
      if (I.hit("Digit2")) this.shopTab = 1;
      if (I.hit("KeyF")) {
        for (let i = 1; i < DG.PICKS.length; i++)
          if (i === p.tier + 1 && this.canForge(i)) { this.forge(i); break; }
      }
      const click = this.clickInfo();
      if (click) this.onShopClick(click);
      return;
    }

    if (this.state === "pause") {
      if (I.hit("Escape") || I.hit("Space")) this.state = "play";
      if (I.hit("KeyQ")) { this.save(); this.state = "title"; this.titleT = 0; }
      if (I.hit("KeyR")) { DG.store.clear(); this.newWorld(true); this.state = "play"; }
      return;
    }

    if (this.state === "dead") {
      if (this.deathT > 1.1 && (I.hit("KeyC") || I.hit("Space") || this.clicked())) this.revive();
      if (this.deathT > 1.1 && I.hit("KeyR")) {
        DG.store.clear();
        this.newWorld(true);
        this.state = "play";
      }
    }
  }

  clicked() { return DG.Input.mouse.down; }
  clickInfo() {
    if (!DG.Input.mouse.inside && DG.Input.lastDevice !== "touch") return null;
    if (!DG.Input.mouse.down) return null;
    if (this.clickLatch) return null;
    this.clickLatch = true;
    setTimeout(() => { this.clickLatch = false; }, 180);
    return { x: DG.Input.mouse.x, y: DG.Input.mouse.y };
  }

  /* shop layout is computed in render as well — keep the two in step */
  shopLayout() {
    const v = this.view;
    const rows = [];
    const x = 40, w = v.w - 80;
    let y = 74;
    if (this.shopTab === 0) {
      DG.PICKS.forEach((pick, i) => {
        rows.push({ kind: "pick", index: i, x, y, w, h: 20, pick });
        y += 22;
      });
    } else {
      for (const item of DG.SHOP) { rows.push({ kind: "item", item, x, y, w, h: 20 }); y += 22; }
    }
    const tabs = [
      { name: "FORGE", tab: 0, x: 40, y: 44, w: 76, h: 18 },
      { name: "SHOP", tab: 1, x: 122, y: 44, w: 76, h: 18 },
    ];
    const close = { name: "CLOSE (TAB)", x: v.w - 122, y: 44, w: 100, h: 18 };
    return { rows, tabs, close };
  }

  onShopClick(c) {
    const L = this.shopLayout();
    for (const t of L.tabs) if (inRect(c, t)) { this.shopTab = t.tab; DG.Audio.torch(); return; }
    if (inRect(c, L.close)) { this.state = "play"; this.save(); return; }
    for (const r of L.rows) {
      if (!inRect(c, r)) continue;
      if (r.kind === "pick") {
        if (r.index <= this.player.tier) { DG.Audio.deny(); this.hintMsg("already forged", 1.4); }
        else if (r.index > this.player.tier + 1) { DG.Audio.deny(); this.hintMsg("forge the previous pickaxe first", 1.8); }
        else this.forge(r.index);
      } else this.buy(r.item);
      return;
    }
  }
};

function inRect(p, r) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }

/* ═══════════════════════════════════════════════════════════════════════════
   boot
   ═══════════════════════════════════════════════════════════════════════════ */
(function main() {
  const canvas = document.getElementById("screen");
  const boot = document.getElementById("boot");
  const fill = document.getElementById("boot-fill");
  const note = document.getElementById("boot-note");
  const hintEl = document.getElementById("hint");

  DG.initInput(canvas);

  function fit() {
    const pad = 24;
    const sx = (innerWidth - pad) / canvas.width;
    const sy = (innerHeight - pad) / canvas.height;
    const s = Math.max(1, Math.min(sx, sy));
    const px = Math.floor(canvas.width * s), py = Math.floor(canvas.height * s);
    canvas.style.width = px + "px";
    canvas.style.height = py + "px";
  }
  addEventListener("resize", fit);
  fit();

  DG.Assets.loadAll((p) => {
    fill.style.width = Math.round(p * 100) + "%";
    note.textContent = `forging the world… ${Math.round(p * 100)}%`;
  }).then(() => {
    const game = (DG.game = new DG.Game(canvas));
    boot.classList.add("gone");
    setTimeout(() => hintEl.classList.add("gone"), 6000);

    let acc = 0, last = performance.now();
    const STEP = 1 / 60;
    function loop(now) {
      const raw = (now - last) / 1000;
      last = now;
      acc += Math.min(raw, 0.25);
      while (acc >= STEP) {
        game.handleInput();
        game.update(STEP);
        DG.Input.clear();
        acc -= STEP;
      }
      DG.Render.frame(game.g, game);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    /* touch buttons: jump / bomb / forge */
    DG.Input.touch.buttons = [
      { x: canvas.width - 46, y: canvas.height - 62, w: 40, h: 26, label: "JUMP", down: false, owner: -1,
        onPress: () => { DG.Input.touch.jump = true; setTimeout(() => (DG.Input.touch.jump = false), 120); } },
      { x: canvas.width - 46, y: canvas.height - 32, w: 40, h: 26, label: "BOMB", down: false, owner: -1,
        onPress: () => game.dropBomb() },
      { x: canvas.width - 92, y: canvas.height - 32, w: 40, h: 26, label: "BAG", down: false, owner: -1,
        onPress: () => { if (game.state === "play") { game.state = "shop"; game.shopTab = 0; } } },
    ];
  });
})();
