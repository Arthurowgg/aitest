/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · entities — the miner, the things that bite, and the dust
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

const GRAV = 620, MAX_FALL = 430;

/* ── pickaxes: the whole tech tree ─────────────────────────────────────── */
DG.PICKS = [
  { id: "wood",    name: "Splinter", power: 1,  speed: 1.00, reach: 2.6, cost: {}, boots: 0 },
  { id: "copper",  name: "Copper",   power: 2,  speed: 1.35, reach: 2.8, cost: { copper: 12 } },
  { id: "iron",    name: "Iron",     power: 3,  speed: 1.70, reach: 3.0, cost: { iron: 20 } },
  { id: "silver",  name: "Silver",   power: 4,  speed: 2.10, reach: 3.2, cost: { silver: 24 } },
  { id: "gold",    name: "Gilded",   power: 6,  speed: 2.90, reach: 3.5, cost: { gold: 20, ruby: 12 } },
  { id: "diamond", name: "Diamond",  power: 8,  speed: 3.60, reach: 3.8, cost: { diamond: 22 } },
  { id: "mythril", name: "Mythril",  power: 11, speed: 4.40, reach: 4.2, cost: { mythril: 20, coreium: 8 } },
];

DG.SHOP = [
  { id: "bomb",    name: "Bomb",        cost: 60,  desc: "blows a hole in the rock (B)" },
  { id: "heart",   name: "Heart",       cost: 200, desc: "+1 max heart", repeat: "heart" },
  { id: "lantern", name: "Lantern",     cost: 420, desc: "far brighter lamp", once: true },
  { id: "boots",   name: "Iron Boots",  cost: 520, desc: "move 30% faster", once: true },
  { id: "cushion", name: "Soft Soles",  cost: 460, desc: "no fall damage", once: true },
  { id: "magnet",  name: "Ore Magnet",  cost: 700, desc: "pull in loot from further", once: true },
];

/* ── particles ─────────────────────────────────────────────────────────── */
DG.Particles = class Particles {
  constructor() { this.list = []; }
  spawn(o) {
    if (this.list.length > 420) this.list.shift();
    this.list.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, life: 0.5, max: 0.5, g: 380, drag: 0.986,
      kind: "chip", size: 1, col: null, rot: 0, spin: 0, fade: true,
    }, o));
  }
  burst(x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = o.angle != null ? o.angle + (Math.random() - 0.5) * 1.2 : Math.random() * TAU;
      const s = (o.speed || 70) * (0.4 + Math.random() * 0.9);
      this.spawn(Object.assign({}, o, {
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.lift || 30),
        life: (o.life || 0.5) * (0.6 + Math.random() * 0.8), max: o.life || 0.5,
        rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 12,
      }));
    }
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt;
      p.vx *= Math.pow(p.drag || 1, dt * 60);
      p.vy *= Math.pow(p.drag || 1, dt * 60);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }
};

/* ── floating combat text / pickups ────────────────────────────────────── */
DG.Floaters = class Floaters {
  constructor() { this.list = []; }
  add(x, y, text, col = "#ffe9a0", big = false) {
    this.list.push({ x, y, text, col, t: 0, life: big ? 1.5 : 1.1, big });
    if (this.list.length > 24) this.list.shift();
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.t += dt; f.y -= dt * 16;
      if (f.t > f.life) this.list.splice(i, 1);
    }
  }
};

/* ── loot that flies home ──────────────────────────────────────────────── */
DG.Drops = class Drops {
  constructor() { this.list = []; }
  add(x, y, ore, coins, amount = 1) {
    this.list.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -80 - Math.random() * 40,
                     t: 0, ore, coins, amount, grabbed: false });
  }
  update(dt, player, magnet) {
    const range = magnet ? 90 : 46;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += dt;
      if (!d.grabbed) {
        d.vy += GRAV * 0.5 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt;
        const dx = player.cx - d.x, dy = player.cy - d.y;
        const dist = Math.hypot(dx, dy);
        if (d.t > 0.22 && dist < range) d.grabbed = true;
      } else {
        const dx = player.cx - d.x, dy = player.cy - d.y;
        const dist = Math.hypot(dx, dy) || 1;
        const sp = 260;
        d.x += (dx / dist) * sp * dt;
        d.y += (dy / dist) * sp * dt;
        if (dist < 7) { this.list.splice(i, 1); d.onPickup && d.onPickup(); player.collect(d); }
      }
      if (d.t > 30) this.list.splice(i, 1);
    }
  }
};

/* ── monsters ──────────────────────────────────────────────────────────── */
const MOB_KINDS = {
  bat:   { w: 10, h: 9,  hp: 2, dmg: 1, speed: 46,  coins: 4,  fly: true,  sprite: "bat", frames: 2, anim: 0.18, mag: 0.5 },
  ember: { w: 9,  h: 9,  hp: 3, dmg: 1, speed: 34,  coins: 8,  fly: false, sprite: "ember", frames: 1, hop: true, lava: true, glows: "#ff6a1a", mag: 1 },
  golem: { w: 12, h: 16, hp: 6, dmg: 2, speed: 20, coins: 16, fly: false, sprite: "golem", frames: 2, anim: 0.28, glows: "#ff8a2b", mag: 2 },
};

DG.Mob = class Mob {
  constructor(kind, x, y) {
    const k = MOB_KINDS[kind];
    this.kind = kind; this.k = k;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hp = k.hp; this.maxHp = k.hp;
    this.t = Math.random() * 4; this.frame = 0; this.hurtT = 0; this.dead = false;
    this.face = 1; this.wander = Math.random() * TAU; this.think = 0;
  }
  get cx() { return this.x + this.k.w / 2; }
  get cy() { return this.y + this.k.h / 2; }

  hurt(dmg, kx, ky) {
    this.hp -= dmg; this.hurtT = 0.18;
    this.vx += kx; this.vy += ky;
    if (this.hp <= 0) this.dead = true;
    return this.hp <= 0;
  }

  update(dt, world, player, parts) {
    this.t += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    const dist = Math.hypot(dx, dy);
    const awake = dist < 190;

    if (this.k.fly) {
      this.think -= dt;
      if (this.think <= 0) { this.think = 0.6 + Math.random() * 0.8; this.wander = Math.random() * TAU; }
      let ax, ay;
      if (awake) { ax = dx / (dist || 1); ay = dy / (dist || 1); }
      else { ax = Math.cos(this.wander) * 0.3; ay = Math.sin(this.wander) * 0.3; }
      const sp = this.k.speed * (awake ? 1 : 0.4);
      this.vx = approach(this.vx, ax * sp, 220 * dt);
      this.vy = approach(this.vy, ay * sp, 220 * dt);
      /* keep out of rock */
      const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
      if (world.isSolid(Math.floor((nx + this.k.w / 2) / 16), Math.floor(this.cy / 16))) this.vx *= -0.6;
      if (world.isSolid(Math.floor(this.cx / 16), Math.floor((ny + this.k.h / 2) / 16))) this.vy *= -0.6;
      this.x += this.vx * dt; this.y += this.vy * dt;
    } else {
      const want = awake ? sign(dx) : 0;
      if (this.k.hop) {
        this.vx = approach(this.vx, want * this.k.speed, 120 * dt);
        this.vy += GRAV * dt;
        if (this.onGround && (Math.abs(dx) > 8 || Math.random() < 0.02)) this.vy = -170;
      } else {
        this.vx = approach(this.vx, want * this.k.speed, 90 * dt);
        this.vy += GRAV * dt;
        /* walk up single blocks like a decent monster */
        if (this.onGround && want !== 0) {
          const ahead = Math.floor((this.x + (want > 0 ? this.k.w + 1 : -1)) / 16);
          const feet = Math.floor((this.y + this.k.h - 1) / 16);
          if (world.isSolid(ahead, feet) && !world.isSolid(ahead, feet - 1)) this.vy = -190;
        }
      }
      this.vy = Math.min(this.vy, MAX_FALL);
      /* x then y sweep */
      let nx = this.x + this.vx * dt;
      if (this.hitsAt(world, nx, this.y)) { nx = this.x; this.vx = -this.vx * 0.3; }
      this.x = nx;
      let ny = this.y + this.vy * dt;
      this.onGround = false;
      if (this.hitsAt(world, this.x, ny)) {
        if (this.vy > 0) this.onGround = true;
        ny = this.y; this.vy = 0;
      }
      this.y = ny;
      if (this.k.hop && this.onGround && this.vy >= 0 && Math.random() < 0.06)
        parts.spawn({ x: this.cx, y: this.y + this.k.h, vx: (Math.random() - .5) * 30, vy: -20,
                      life: 0.5, kind: "smoke", size: 1 });
    }
    this.face = dx >= 0 ? 1 : -1;
    if (this.k.frames > 1 && this.k.anim)
      this.frame = Math.floor(this.t / this.k.anim) % this.k.frames;
  }
  hitsAt(world, x, y) {
    const x0 = Math.floor(x / 16), x1 = Math.floor((x + this.k.w - 1) / 16);
    const y0 = Math.floor(y / 16), y1 = Math.floor((y + this.k.h - 1) / 16);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (world.isSolid(tx, ty)) return true;
    return false;
  }
};

/* ── the player ────────────────────────────────────────────────────────── */
DG.Player = class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 8; this.h = 14;
    this.vx = 0; this.vy = 0;
    this.onGround = false; this.coyote = 0; this.jumpBuf = 0; this.wasJump = false;
    this.face = 1;
    this.hp = 10; this.maxHp = 10;
    this.coins = 0;
    this.ore = {};
    this.tier = 0;                 // index into DG.PICKS
    this.bombs = 1;
    this.up = { lantern: false, boots: false, cushion: false, magnet: false };
    this.invuln = 0; this.hurtFlash = 0;
    this.walkT = 0; this.anim = "idle";
    this.swing = 0; this.swingDir = 0; this.mineHit = 0;
    this.dead = false;
    this.bobT = Math.random() * 10;
  }
  get pick() { return DG.PICKS[this.tier]; }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  hurt(n, fromX) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp -= n; this.invuln = 0.9; this.hurtFlash = 0.35;
    this.vx += sign(this.cx - (fromX ?? this.cx)) * 90;
    this.vy = -140;
    DG.Audio.hurt();
    if (this.hp <= 0) { this.hp = 0; this.dead = true; DG.Audio.die(); }
    return true;
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }

  collect(d) {
    if (d.coins) { this.coins += d.coins; DG.Audio.coin(); }
    if (d.ore) {
      const n = d.amount || 1;
      this.ore[d.ore] = (this.ore[d.ore] || 0) + n;
      DG.Audio.pop();
    }
  }

  update(dt, world, aim) {
    const ax = DG.moveAxis();
    const maxSpd = 84 * (this.up.boots ? 1.3 : 1);
    const accel = this.onGround ? 760 : 420;
    this.vx = approach(this.vx, ax * maxSpd, accel * dt);
    if (ax === 0 && this.onGround) this.vx = approach(this.vx, 0, 900 * dt);
    if (ax !== 0) this.face = ax > 0 ? 1 : -1;

    /* jump with coyote time + input buffering — the difference between
       "controls feel great" and "controls feel cheap" */
    const jumpKey = DG.Input.key("Space") || DG.Input.key("KeyW") || DG.Input.key("ArrowUp") ||
                    DG.Input.touch.jump;
    if (jumpKey && !this.wasJump) this.jumpBuf = 0.12;
    this.wasJump = jumpKey;
    this.jumpBuf -= dt; this.coyote -= dt;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = -218; this.jumpBuf = 0; this.coyote = 0;
      this.onGround = false;
      DG.Audio.jump();
      DG.game.particles.burst(this.cx, this.y + this.h, 4,
        { kind: "smoke", speed: 26, life: 0.3, g: -10, col: "#4a4370" });
    }
    if (!jumpKey && this.vy < -60) this.vy += 900 * dt;   // short hop on release

    this.vy = Math.min(this.vy + GRAV * dt, MAX_FALL);

    /* ── move & collide ── */
    let nx = this.x + this.vx * dt;
    if (this.hits(world, nx, this.y)) {
      if (this.onGround) {
        /* a single block is a stair, not a wall */
        if (!this.hits(world, nx, this.y - 13) && this.vy >= -1) { this.y -= 13; this.x = nx; }
        else { nx = this.x; this.vx = 0; }
      } else { nx = this.x; this.vx = 0; }
    }
    this.x = clamp(nx, 1, world.W * 16 - this.w - 1);

    let ny = this.y + this.vy * dt;
    const wasFall = this.vy;
    let landed = false;
    if (this.hits(world, this.x, ny)) {
      if (this.vy > 0) {
        landed = true;
        if (wasFall > 250) {
          const dmg = Math.floor((wasFall - 250) / 110) + 1;
          if (!this.up.cushion) {
            if (this.hurt(dmg)) DG.game.shake(0.25, dmg > 1 ? 3 : 2);
            DG.game.floaters.add(this.cx, this.y, "-" + dmg, "#ff6b7a");
          }
        }
        ny = this.y; this.vy = 0;
      } else {
        ny = this.y; this.vy = 0;
      }
    }
    if (landed && wasFall > 190) {
      DG.Audio.land();
      DG.game.particles.burst(this.cx, this.y + this.h, 6,
        { kind: "smoke", speed: 40, life: 0.35, g: -20, col: "#4a4370" });
      DG.game.shake(0.08, 1);
    }
    this.y = ny;
    this.onGround = this.hits(world, this.x, this.y + 1);
    if (this.onGround) this.coyote = 0.1;

    /* ── animation ── */
    if (!this.onGround) this.anim = "climb";
    else if (Math.abs(this.vx) > 12) {
      this.walkT += dt * Math.abs(this.vx) * 0.045;
      this.anim = Math.floor(this.walkT) % 2 ? "a" : "b";
    } else this.anim = "idle";

    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.swing > 0) this.swing -= dt;
    this.bobT += dt;

    /* doom from the pool */
    if (world.isLava(Math.floor(this.cx / 16), Math.floor((this.y + this.h * 0.6) / 16)) ||
        world.isLava(Math.floor(this.cx / 16), Math.floor((this.y + 2) / 16))) {
      this.lavaT = (this.lavaT || 0) + dt;
      if (this.lavaT > 0.45) { this.lavaT = 0; this.hurt(1); }
      DG.game.particles.burst(this.cx, this.y + this.h, 2,
        { kind: "spark", speed: 50, life: 0.4, g: -80, col: "#ff9a2e" });
    } else this.lavaT = 0;

    /* swinging the pickaxe */
    if (aim && aim.mine) {
      this.swingDir = aim.dx >= 0 ? 1 : -1;
      if (this.swing <= 0) { this.swing = 0.26; DG.Audio.swing(); }
    }
  }

  hits(world, x, y) {
    const x0 = Math.floor(x / 16), x1 = Math.floor((x + this.w - 1) / 16);
    const y0 = Math.floor(y / 16), y1 = Math.floor((y + this.h - 1) / 16);
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++)
        if (world.isSolid(tx, ty)) return true;
    return false;
  }
};
