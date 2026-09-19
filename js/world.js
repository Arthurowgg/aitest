/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · world — tile table, procedural strata, carving, ore veins
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

/* tile ids */
const T = {
  AIR: 0,
  DIRT: 1, GRAVEL: 2, STONE: 3, GRANITE: 4, DEEPSLATE: 5,
  CRYSTAL: 6, OBSIDIAN: 7, MAGMA: 8, BEDROCK: 9, LAVA: 10, PLANK: 11,
  COAL: 20, COPPER: 21, IRON: 22, SILVER: 23, GOLD: 24,
  RUBY: 25, DIAMOND: 26, MYTHRIL: 27, COREIUM: 28,
  GRASS: 12,
};

/* ore order doubles as the crafting order shown in the forge */
const ORES = ["coal", "copper", "iron", "silver", "gold", "ruby", "diamond", "mythril", "coreium"];
const ORE_TILE = {
  coal: T.COAL, copper: T.COPPER, iron: T.IRON, silver: T.SILVER, gold: T.GOLD,
  ruby: T.RUBY, diamond: T.DIAMOND, mythril: T.MYTHRIL, coreium: T.COREIUM,
};

/* ── tile table ──────────────────────────────────────────────────────────────
   hard  : seconds of mining at power 1 / speed 1
   tier  : pickaxe tier needed to bite into it (under-tiered rock is slow,
           under-tiered *ore* cannot be mined at all)
   coins : loose change from breaking the tile
   ore   : counts toward forging the next pickaxe
   tint  : light colour the tile throws off
   ────────────────────────────────────────────────────────────────────────── */
const TILES = [];
function def(id, o) { TILES[id] = Object.assign({ id, solid: true, hard: 0.5, tier: 1, coins: 0, ore: null }, o); }

def(T.AIR,   { solid: false, hard: 0, bg: null });
def(T.DIRT,  { name: "dirt", sprites: "dirt", variants: 8, hard: 0.30, coins: 1, bg: "dirt" });
def(T.GRAVEL,{ name: "gravel", sprites: "gravel", variants: 8, hard: 0.34, coins: 1, bg: "gravel" });
def(T.STONE, { name: "stone", sprites: "stone", variants: 12, hard: 0.85, coins: 2, bg: "stone" });
def(T.GRANITE,{name: "granite", sprites: "granite", variants: 8, hard: 1.05, coins: 3, bg: "granite" });
def(T.DEEPSLATE,{ name: "deepslate", sprites: "deepslate", variants: 8, hard: 1.5, tier: 2, coins: 5, bg: "deepslate" });
def(T.CRYSTAL,{ name: "crystal", sprites: "crystal", variants: 5, hard: 2.4, tier: 3, coins: 8, glow: "#2e6ea8", bg: "crystal" });
def(T.OBSIDIAN,{ name: "obsidian", sprites: "obsidian", variants: 3, hard: 3.2, tier: 4, coins: 12, glow: "#4a2f7a", bg: "obsidian" });
def(T.MAGMA, { name: "magma", sprites: "magma", variants: 5, hard: 1.3, tier: 3, coins: 9, glow: "#ff6a1a", bg: "magma" });
def(T.BEDROCK,{ name: "bedrock", sprites: "bedrock", variants: 4, hard: Infinity, tier: 99, unbreakable: true });
def(T.LAVA,  { name: "lava", solid: false, hard: 0, lava: true, bg: null });
def(T.GRASS, { name: "grass", sprites: "grass", variants: 2, hard: 0.32, coins: 1, bg: "dirt" });
def(T.PLANK, { name: "planks", sprites: null, variants: 1, hard: 0.6, coins: 0 });

/* ores: sprite set + upgrade economy */
const ORE_DEFS = {
  coal:    { hard: 0.55, tier: 1, coins: 6,   glow: null },
  copper:  { hard: 0.70, tier: 1, coins: 12,  glow: null },
  iron:    { hard: 0.95, tier: 2, coins: 20,  glow: null },
  silver:  { hard: 1.25, tier: 3, coins: 34,  glow: "#cfe8ff" },
  gold:    { hard: 1.55, tier: 4, coins: 55,  glow: "#ffe9a0" },
  ruby:    { hard: 1.75, tier: 4, coins: 80,  glow: "#ff8a99" },
  diamond: { hard: 2.10, tier: 5, coins: 120, glow: "#8ff0ff" },
  mythril: { hard: 2.45, tier: 5, coins: 180, glow: "#7df5a8" },
  coreium: { hard: 2.90, tier: 6, coins: 280, glow: "#ff8af0" },
};
for (const name of ORES) {
  const d = ORE_DEFS[name];
  def(ORE_TILE[name], {
    name, sprites: "ore_" + name, variants: 3, ore: name,
    hard: d.hard, tier: d.tier, coins: d.coins, glow: d.glow, oreMark: true,
  });
}

/* ── strata ──────────────────────────────────────────────────────────────── */
const LAYERS = [
  { from: 0,   name: "Sky",       base: T.AIR },
  { from: 8,   name: "Soil",      base: T.DIRT,      ores: { coal: 0.020, copper: 0.014 } },
  { from: 52,  name: "Stone",     base: T.STONE,     ores: { coal: 0.016, copper: 0.012, iron: 0.010, silver: 0.005 } },
  { from: 108, name: "Deepslate", base: T.DEEPSLATE, ores: { iron: 0.014, silver: 0.010, gold: 0.006, ruby: 0.004 } },
  { from: 164, name: "Crystal",   base: T.CRYSTAL,   ores: { gold: 0.010, ruby: 0.008, diamond: 0.006, mythril: 0.004 } },
  { from: 216, name: "Magma",     base: T.MAGMA,     ores: { diamond: 0.008, mythril: 0.007, coreium: 0.005 } },
];
DG.LAYER_AT = function (y) {
  let out = LAYERS[0];
  for (const l of LAYERS) if (y >= l.from) out = l;
  return out;
};

/* ── the world ───────────────────────────────────────────────────────────── */
DG.World = class World {
  constructor(seed) {
    this.SEED = seed >>> 0;
    this.W = 384;
    this.H = 256;
    this.surfaceY = 10;
    this.tiles = new Uint8Array(this.W * this.H);
    this.variants = new Uint8Array(this.W * this.H);
    this.bg = new Uint8Array(this.W * this.H);   // backdrop tile id for air
    this.damage = new Float32Array(this.W * this.H); // mining progress 0..1
    this.campX = this.W >> 1;
    this.mods = new Map();                        // idx -> tile, for saving
    this.generate();
  }

  idx(x, y) { return y * this.W + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  get(x, y) {
    if (!this.inside(x, y)) return T.BEDROCK;
    return this.tiles[y * this.W + x];
  }
  defAt(x, y) { return TILES[this.get(x, y)] || TILES[T.STONE]; }
  isSolid(x, y) { return this.defAt(x, y).solid; }
  isLava(x, y) { return this.get(x, y) === T.LAVA; }

  set(x, y, id, opts = {}) {
    if (!this.inside(x, y)) return;
    const i = this.idx(x, y);
    this.tiles[i] = id;
    if (!opts.silent) this.mods.set(i, id);
    if (!opts.keepBg) {
      const old = this.bg[i];
      const d = TILES[id];
      if (!d.solid && d.id !== T.LAVA) {
        this.bg[i] = old || (opts.bgFrom != null ? opts.bgFrom : T.STONE);
      }
    }
  }

  /* ── generation ─────────────────────────────────────────────────────── */
  generate() {
    const rng = makeRng(this.SEED);
    const { W, H } = this;
    const surf = [];
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 46, 0.5, this.SEED, 4);
      surf[x] = Math.round(7 + n * 5);
    }
    this.surface = surf;
    this.surfaceY = Math.round(surf.reduce((a, b) => a + b, 0) / W);

    for (let y = 0; y < H; y++) {
      const layer = DG.LAYER_AT(y);
      const depth = y - this.surfaceY;
      for (let x = 0; x < W; x++) {
        const i = this.idx(x, y);
        this.variants[i] = (Math.random() * 255) | 0;
        if (y < surf[x]) { this.tiles[i] = T.AIR; this.bg[i] = T.AIR; continue; }
        if (y === surf[x]) { this.tiles[i] = T.GRASS; this.bg[i] = T.DIRT; continue; }
        let base = layer.base;
        /* soil bedrock shell + unbreakable floor */
        if (y >= H - 2) base = T.BEDROCK;
        /* patches: gravel sweeps through soil & stone, granite blobs, obsidian pockets */
        const patch = fbm(x / 11, y / 9, this.SEED + 77, 3);
        if (base === T.DIRT && patch > 0.66 && depth > 4) base = T.GRAVEL;
        if (base === T.STONE && patch > 0.70) base = T.GRAVEL;
        if (base === T.STONE && patch < 0.24) base = T.GRANITE;
        if (base === T.DEEPSLATE && patch < 0.20) base = T.OBSIDIAN;
        if (base === T.MAGMA && patch < 0.18) base = T.OBSIDIAN;
        this.tiles[i] = base;
        this.bg[i] = base;
      }
    }

    /* ── caves: fbm thresholding + a few long worms so the map connects ── */
    for (let y = 6; y < H - 3; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = this.idx(x, y);
        const d = y - this.surfaceY;
        if (d < 6) continue;
        const c = fbm(x / 18, y / 12, this.SEED + 991, 4);
        const c2 = fbm(x / 7, y / 6, this.SEED + 4501, 3);
        const bias = d > 150 ? 0.03 : 0;
        if (c * 0.72 + c2 * 0.28 > 0.615 - bias) {
          this.tiles[i] = T.AIR;
          this.bg[i] = fbm(x / 5, y / 5, this.SEED + 31, 2) > 0.5 ? T.DIRT : T.STONE;
        }
      }
    }
    /* worms */
    for (let w = 0; w < 8; w++) {
      let x = 8 + rng() * (W - 16), y = 22 + rng() * (H - 60);
      let ang = rng() * TAU, len = 90 + rng() * 200;
      for (let s = 0; s < len; s++) {
        ang += (rng() - 0.5) * 0.55;
        x += Math.cos(ang) * 1.4; y += Math.sin(ang) * 0.8;
        const r = 1.4 + rng() * 1.4;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++)
            if (dx * dx + dy * dy <= r * r) {
              const tx = Math.round(x + dx), ty = Math.round(y + dy);
              if (this.inside(tx, ty) && ty > surf[tx] && ty < H - 3) {
                const ii = this.idx(tx, ty);
                this.tiles[ii] = T.AIR;
                this.bg[ii] = T.STONE;
              }
            }
      }
    }
    /* the mouth of the mine: a shaft right under the camp */
    for (let y = surf[this.campX]; y < surf[this.campX] + 26; y++)
      for (let x = this.campX - 1; x <= this.campX + 1; x++) {
        const i = this.idx(x, y);
        this.tiles[i] = T.AIR;
        this.bg[i] = y < surf[this.campX] + 4 ? T.DIRT : T.STONE;
      }

    /* ── ore veins: random walks that cluster like real seams ───────────── */
    for (const layer of LAYERS) {
      if (!layer.ores) continue;
      const next = LAYERS[LAYERS.indexOf(layer) + 1];
      const yTo = next ? next.from : H - 2;
      const bands = Math.max(1, Math.round((yTo - layer.from) / 24));
      for (const [ore, rate] of Object.entries(layer.ores)) {
        for (let b = 0; b < bands; b++) {
          const veins = Math.max(1, Math.round(W * 24 * rate / 14));
          for (let v = 0; v < veins; v++) {
            let x = 2 + rng() * (W - 4);
            let y = layer.from + 2 + rng() * Math.max(2, (yTo - layer.from) - 4);
            const size = 3 + Math.floor(rng() * 9);
            for (let s = 0; s < size; s++) {
              const tx = Math.round(x), ty = Math.round(y);
              if (this.inside(tx, ty) && ty > surf[tx] && ty < H - 2) {
                const ii = this.idx(tx, ty);
                if (this.tiles[ii] !== T.AIR && this.tiles[ii] !== T.BEDROCK &&
                    this.tiles[ii] !== T.LAVA && !TILES[this.tiles[ii]].ore) {
                  this.tiles[ii] = ORE_TILE[ore];
                  /* a nudge of neighbours makes seams look set in the rock */
                  if (rng() < 0.55) {
                    const nx = tx + (rng() < 0.5 ? 1 : -1);
                    if (this.inside(nx, ty) && this.tiles[this.idx(nx, ty)] && !TILES[this.tiles[this.idx(nx, ty)]].ore &&
                        this.tiles[this.idx(nx, ty)] !== T.AIR) this.tiles[this.idx(nx, ty)] = ORE_TILE[ore];
                  }
                }
              }
              x += (rng() - 0.5) * 2.4;
              y += (rng() - 0.5) * 1.6 + 0.25;
            }
          }
        }
      }
    }

    /* ── lava pools in the deep ─────────────────────────────────────────── */
    for (let y = 196; y < H - 3; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = this.idx(x, y);
        if (this.tiles[i] !== T.AIR) continue;
        let floor = false;
        if (y < H - 4 && this.tiles[this.idx(x, y + 1)] !== T.AIR) floor = true;
        const lavaChance = (y - 196) / 60;
        if (floor && rng() < 0.08 + lavaChance * 0.5) {
          this.tiles[i] = T.LAVA;
          this.bg[i] = T.MAGMA;
        }
      }
    }

    /* base camp platform */
    const cy = surf[this.campX] - 1;
    for (let x = this.campX - 3; x <= this.campX + 3; x++) {
      const i = this.idx(x, cy);
      if (this.inside(x, cy)) { this.tiles[i] = T.PLANK; this.bg[i] = T.AIR; }
    }
    this.campY = cy;
    this.surface = surf;
  }

  /* how the surface line runs at a given column, for the sky/grass render */
  surfaceAt(x) { return this.surface[clamp(x, 0, this.W - 1)]; }

  depthMeters(y) { return Math.max(0, Math.round((y - this.surfaceY) * 1)); }

  /* ── mining ─────────────────────────────────────────────────────────── */
  /* returns "ok" | "tier" | "hard" */
  canMine(x, y, tier) {
    const d = this.defAt(x, y);
    if (d.unbreakable) return "hard";
    if (d.oreMark && tier < d.tier) return "tier";
    return "ok";
  }

  mineTime(x, y, tier, power, speed) {
    const d = this.defAt(x, y);
    const soft = !d.oreMark && tier < d.tier ? 4 : 1;   // under-tiered rock: slow, not blocked
    return (d.hard * soft) / (power * speed);
  }

  /* break a tile: returns {id, coins, ore} */
  breakTile(x, y) {
    const id = this.get(x, y);
    const d = TILES[id];
    if (!d || d.unbreakable) return null;
    const bgFrom = id === T.GRASS ? T.DIRT : id;
    this.set(x, y, T.AIR, { bgFrom });
    this.damage[this.idx(x, y)] = 0;
    return { id, coins: d.coins, ore: d.ore, name: d.name, x, y };
  }

  /* bombs blow a soft pocket out of the rock */
  blast(cx, cy, r, tier) {
    const out = [];
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        if (!this.inside(x, y)) continue;
        const d = this.defAt(x, y);
        if (d.unbreakable) continue;
        const res = this.breakTile(x, y);
        if (res) out.push(res);
      }
    }
    return out;
  }

  /* ── persistence: only the tiles the player changed ──────────────────── */
  serializeMods() {
    const idxs = new Uint16Array(this.mods.size);
    const vals = new Uint8Array(this.mods.size);
    let i = 0;
    for (const [k, v] of this.mods) { idxs[i] = k; vals[i] = v; i++; }
    return { idxs: Array.from(idxs), vals: Array.from(vals) };
  }
  applyMods(data, damageArr) {
    if (!data) return;
    for (let i = 0; i < data.idxs.length; i++) {
      const k = data.idxs[i];
      this.tiles[k] = data.vals[i];
      this.mods.set(k, data.vals[i]);
    }
  }
};
