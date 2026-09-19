/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · well — the rock under the rig, sampled on demand
   Nothing is stored: strata, ore veins and hazards are pure functions of
   (x, y, seed), so a run can be infinitely deep and still be saved with a
   handful of bytes.  Only the cells the rig has actually drilled are kept.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

const T = (DG.T = {
  AIR: 0, DIRT: 1, GRAVEL: 2, STONE: 3, GRANITE: 4, DEEPSLATE: 5,
  CRYSTAL: 6, OBSIDIAN: 7, MAGMA: 8, BEDROCK: 9, LAVA: 10,
  GAS: 11, REGOLITH: 12,
  COAL: 20, COPPER: 21, IRON: 22, SILVER: 23, GOLD: 24,
  RUBY: 25, DIAMOND: 26, MYTHRIL: 27, COREIUM: 28,
});

const ORES = (DG.ORES = ["coal", "copper", "iron", "silver", "gold", "ruby", "diamond", "mythril", "coreium"]);
const ORE_TILE = {};
ORES.forEach((o, i) => (ORE_TILE[o] = 20 + i));
const TILE_ORE = (DG.TILE_ORE = {});
ORES.forEach((o) => (TILE_ORE[ORE_TILE[o]] = o));

/* ── tile table: hardness drives drill time, heat drives the gauges ─────── */
const TILES = (DG.TILES = []);
function def(id, o) {
  TILES[id] = Object.assign({ id, hard: 1, heat: 1, color: "#707786" }, o);
}
def(T.AIR,        { name: "void", hard: 0, void: true });
def(T.REGOLITH,   { name: "regolith", hard: 0.45, heat: 0.5, sprite: "dirt_1", color: "#6b4a2f" });
def(T.DIRT,       { name: "soil", hard: 0.6, heat: 0.6, sprite: "dirt_1", color: "#6b4a2f" });
def(T.GRAVEL,     { name: "gravel", hard: 0.75, heat: 0.7, sprite: "gravel_1", color: "#5d5762" });
def(T.STONE,      { name: "stone", hard: 1.0, heat: 0.85, sprite: "stone_1", color: "#656c7a" });
def(T.GRANITE,    { name: "granite", hard: 1.35, heat: 1.0, sprite: "granite_1", color: "#6d5b5d" });
def(T.DEEPSLATE,  { name: "deepslate", hard: 1.8, heat: 1.15, sprite: "deepslate_1", color: "#3d4152" });
def(T.CRYSTAL,    { name: "crystal", hard: 2.4, heat: 1.3, sprite: "crystal_1", color: "#33456a", glows: "#5aa0e0" });
def(T.OBSIDIAN,   { name: "obsidian", hard: 3.6, heat: 1.6, sprite: "obsidian_1", color: "#241f36" });
def(T.MAGMA,      { name: "magma", hard: 2.0, heat: 2.1, sprite: "magma_1", color: "#5c3527", glows: "#ff6a1a" });
def(T.LAVA,       { name: "lava vein", hard: 1.2, heat: 3.4, hazard: true, sprite: "lava_0", color: "#e2541a", glows: "#ff9a2e" });
def(T.GAS,        { name: "gas pocket", hard: 0.9, heat: 0.6, hazard: true, sprite: "gas_1", color: "#4d8a4f", glows: "#7df5a8" });
def(T.BEDROCK,    { name: "bedrock", hard: Infinity, unbreakable: true, sprite: "bedrock_1", color: "#111117" });

/* ore: which strata it lives in, how hard, what it is worth */
const ORE_DEFS = (DG.ORE_DEFS = {
  /* `cut` is a noise threshold tuned with tools/headless.js --script=balance
     so each band carries roughly the density we want to see on screen */
  coal:    { from: 0,   to: 420,  cut: 0.694, hard: 0.8,  heat: 0.8,  price: 5,   sprite: "ore_coal_1" },
  copper:  { from: 30,  to: 480,  cut: 0.708, hard: 1.0,  heat: 0.9,  price: 9,   sprite: "ore_copper_1" },
  iron:    { from: 120, to: 660,  cut: 0.732, hard: 1.3,  heat: 1.0,  price: 16,  sprite: "ore_iron_1" },
  silver:  { from: 260, to: 820,  cut: 0.722, hard: 1.6,  heat: 1.2,  price: 26,  sprite: "ore_silver_1" },
  gold:    { from: 380, to: 980,  cut: 0.752, hard: 1.9,  heat: 1.35, price: 42,  sprite: "ore_gold_1" },
  ruby:    { from: 500, to: 1200, cut: 0.748, hard: 2.2,  heat: 1.5,  price: 62,  sprite: "ore_ruby_1" },
  diamond: { from: 620, to: 9999, cut: 0.748, hard: 2.6,  heat: 1.6,  price: 95,  sprite: "ore_diamond_1" },
  mythril: { from: 740, to: 9999, cut: 0.764, hard: 3.0,  heat: 1.7,  price: 145, sprite: "ore_mythril_1" },
  coreium: { from: 880, to: 9999, cut: 0.756, hard: 3.4,  heat: 1.9,  price: 225, sprite: "ore_coreium_1" },
});

/* the strata, by metres */
const STRATA = (DG.STRATA = [
  { from: 0,   name: "TOPSOIL", short: "TOPS",   rock: T.REGOLITH, hard: 0.5, temp: 12,  ores: ["coal", "copper"] },
  { from: 40,  name: "SOIL BAND", short: "SOIL", rock: T.DIRT,     hard: 0.7, temp: 18,  ores: ["coal", "copper", "iron"] },
  { from: 160, name: "STONE", short: "STONE",     rock: T.STONE,    hard: 1.0, temp: 34,  ores: ["copper", "iron", "silver"] },
  { from: 360, name: "DEEPSLATE", short: "DEEP", rock: T.DEEPSLATE, hard: 1.7, temp: 64, ores: ["silver", "gold", "ruby"] },
  { from: 560, name: "CRYSTAL", short: "CRYST",   rock: T.CRYSTAL,  hard: 2.2, temp: 105, ores: ["gold", "ruby", "diamond", "mythril"] },
  { from: 780, name: "MAGMA", short: "MAGMA",     rock: T.MAGMA,    hard: 2.4, temp: 168, ores: ["diamond", "mythril", "coreium"] },
]);

DG.CELL_M = 4;                                   // metres per cell

DG.strataAt = function (metres) {
  let s = STRATA[0];
  for (const l of STRATA) if (metres >= l.from) s = l;
  return s;
};

/* ── the well ────────────────────────────────────────────────────────────── */
DG.Well = class Well {
  constructor(seed) {
    this.SEED = seed >>> 0;
    this.W = 11;                 // columns of the borehole cross-section
    this.drilled = new Set();    // "x,y" of cells the rig has opened
    this.scanned = new Map();    // y -> tick when it was last scanned
    this.marked = new Map();     // "x,y" -> hazard the scanner flagged
  }

  reset() { this.drilled.clear(); this.scanned.clear(); this.marked.clear(); }

  cell(x, y) {
    const m = y * DG.CELL_M;
    const strata = DG.strataAt(m);
    /* wall rock: base strata rock with granite/obsidian pockets */
    const patch = fbm(x / 2.2, y / 3.4, this.SEED + 77, 3);
    let tile = strata.rock;
    if (tile === T.STONE && patch > 0.70) tile = T.GRANITE;
    if (tile === T.CRYSTAL && patch > 0.76) tile = T.OBSIDIAN;
    if (tile === T.MAGMA && patch < 0.24) tile = T.OBSIDIAN;
    /* hazards: gas pockets in the shallow bands, lava veins deeper */
    const gasN = fbm(x / 1.6, y / 2.4, this.SEED + 613, 2);
    const lavaN = fbm(x / 1.4, y / 2.0, this.SEED + 1301, 2);
    if (m > 24 && m < 700 && gasN > 0.752 && patch < 0.6) tile = T.GAS;
    else if (m > 470 && lavaN > 0.772) tile = T.LAVA;

    /* ore veins sit inside the rock, never in a hazard */
    let ore = null;
    if (!TILES[tile].hazard && tile !== T.BEDROCK) {
      for (const name of strata.ores) {
        const d = ORE_DEFS[name];
        if (m < d.from || m > d.to) continue;
        /* veins are smooth fields: a hit usually means two or three cells */
        const v = fbm(x / 1.9 + ORES.indexOf(name) * 13.7, y / 2.6, this.SEED + 909 * (ORES.indexOf(name) + 1), 3);
        /* and they thin out with depth, so each band keeps its own value */
        if (v > d.cut + Math.min(0.05, m / 40000)) { ore = name; break; }
      }
    }
    return { x, y, tile, ore, strata, metres: m };
  }

  /* cached sampling: the renderer asks for the same cell many times a frame */
  at(x, y) {
    const key = y * 64 + x;
    let c = this._cache && this._cache.get(key);
    if (!c) {
      c = this.cell(x, y);
      if (!this._cache) this._cache = new Map();
      this._cache.set(key, c);
      if (this._cache.size > 4096) this._cache.clear();
    }
    return c;
  }

  isDrilled(x, y) { return this.drilled.has(x + "," + y); }
  open(x, y) { this.drilled.add(x + "," + y); this._cache && this._cache.delete(y * 64 + x); }

  hardAt(x, y) {
    const c = this.at(x, y);
    let hard = TILES[c.tile].hard;
    if (c.ore) hard = Math.max(hard, ORE_DEFS[c.ore].hard);
    return hard * DG.strataAt(c.metres).hard * 0.85;
  }
  heatAt(x, y) {
    const c = this.at(x, y);
    let heat = TILES[c.tile].heat;
    if (c.ore) heat += ORE_DEFS[c.ore].heat * 0.5;
    return heat * (0.7 + c.metres / 900);
  }
  hazardAt(x, y) {
    const c = this.at(x, y);
    return TILES[c.tile].hazard ? c.tile : 0;
  }
  /* what the drill pullout yields */
  loot(x, y) {
    const c = this.at(x, y);
    const out = { ore: null, amount: 0 };
    if (c.ore) {
      out.ore = c.ore;
      out.amount = 1 + Math.round(fbm(x * 3.1, y * 3.1, this.SEED + 5, 2) * 2);
    }
    return out;
  }

  /* scan a block of rows below the bit; returns the newly revealed cells */
  scan(fromY, rows) {
    const found = [];
    for (let y = fromY; y < fromY + rows; y++) {
      for (let x = 0; x < this.W; x++) {
        const c = this.at(x, y);
        let mark = null;
        if (c.ore) mark = { kind: "ore", ore: c.ore };
        else if (TILES[c.tile].hazard) mark = { kind: "hazard", tile: c.tile };
        else if (c.tile === T.OBSIDIAN) mark = { kind: "hard" };
        this.marked.set(x + "," + y, mark || { kind: "rock" });
        if (mark && mark.kind !== "rock") found.push({ x, y, mark });
      }
      this.scanned.set(y, performance.now());
    }
    return found;
  }
  isMarked(x, y) { return this.marked.has(x + "," + y); }
  mark(x, y) { return this.marked.get(x + "," + y); }
};
