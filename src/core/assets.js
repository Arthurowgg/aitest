// ============================================================================
// APEX HORIZON — asset loader + PBR material library
// ============================================================================
import * as THREE from 'three';

const BASE = '';   // relative to index.html

export const TEX_SPEC = {
  asphalt:      { url: 'assets/tex/asphalt.png',      srgb: true,  rep: [1, 1] },
  asphaltWet:   { url: 'assets/tex/asphalt_wet.png',  srgb: true,  rep: [1, 1] },
  asphaltWetR:  { url: 'assets/tex/asphalt_wet_r.png', srgb: false, rep: [1, 1] },
  asphaltN:     { url: 'assets/tex/asphalt_n.png',    srgb: false, rep: [1, 1] },
  asphaltR:     { url: 'assets/tex/asphalt_r.png',    srgb: false, rep: [1, 1] },
  concrete:     { url: 'assets/tex/concrete.png',     srgb: true,  rep: [1, 1] },
  concreteN:    { url: 'assets/tex/concrete_n.png',   srgb: false, rep: [1, 1] },
  grass:        { url: 'assets/tex/grass.jpg',        srgb: true,  rep: [1, 1] },
  grassN:       { url: 'assets/tex/grass_n.png',      srgb: false, rep: [1, 1] },
  rock:         { url: 'assets/tex/rock.jpg',         srgb: true,  rep: [1, 1] },
  rockN:        { url: 'assets/tex/rock_n.png',       srgb: false, rep: [1, 1] },
  carbon:       { url: 'assets/tex/carbon.png',       srgb: true,  rep: [1, 1] },
  carbonN:      { url: 'assets/tex/carbon_n.png',     srgb: false, rep: [1, 1] },
  metal:        { url: 'assets/tex/metal.png',        srgb: true,  rep: [1, 1] },
  metalN:       { url: 'assets/tex/metal_n.png',      srgb: false, rep: [1, 1] },
  leather:      { url: 'assets/tex/leather.png',      srgb: true,  rep: [1, 1] },
  leatherN:     { url: 'assets/tex/leather_n.png',    srgb: false, rep: [1, 1] },
  tire:         { url: 'assets/tex/tire.png',         srgb: true,  rep: [1, 1] },
  tireN:        { url: 'assets/tex/tire_n.png',       srgb: false, rep: [1, 1] },
  facade:       { url: 'assets/tex/facade.jpg',       srgb: true,  rep: [1, 1] },
  waterN:       { url: 'assets/tex/water_n.png',      srgb: false, rep: [1, 1] },
  blossom:      { url: 'assets/tex/blossom.png',      srgb: true,  rep: [1, 1] },
  roadLines:    { url: 'assets/tex/road_lines.png',   srgb: true,  rep: [1, 1] },
  skid:         { url: 'assets/tex/skid.png',         srgb: true,  rep: [1, 1] },
  petal:        { url: 'assets/tex/petal.png',        srgb: true,  rep: [1, 1] },
  puff:         { url: 'assets/tex/puff.png',         srgb: true,  rep: [1, 1] },
  glow:         { url: 'assets/tex/glow.png',         srgb: true,  rep: [1, 1] },
  flare:        { url: 'assets/tex/flare_star.png',   srgb: true,  rep: [1, 1] },
  contact:      { url: 'assets/tex/contact_shadow.png', srgb: true, rep: [1, 1] },
  checker:      { url: 'assets/tex/checker.png',      srgb: true,  rep: [1, 1] },
  neonA:        { url: 'assets/tex/neon_a.png',       srgb: true,  rep: [1, 1] },
  neonB:        { url: 'assets/tex/neon_b.png',       srgb: true,  rep: [1, 1] },
  neonC:        { url: 'assets/tex/neon_c.png',       srgb: true,  rep: [1, 1] },
  keyart:       { url: 'assets/art/keyart.jpg',       srgb: true,  dom: true },
  envNight:     { url: 'assets/art/env_night_city.jpg',  srgb: true, equirect: true },
  envSunset:    { url: 'assets/art/env_sunset_coast.jpg', srgb: true, equirect: true },
  envDawn:      { url: 'assets/art/env_dawn_mountain.jpg', srgb: true, equirect: true },
  envDay:       { url: 'assets/art/env_day_island.jpg',   srgb: true, equirect: true },
  posterCity:   { url: 'assets/art/poster_city.jpg',  srgb: true, dom: true },
  posterTouge:  { url: 'assets/art/poster_touge.jpg', srgb: true, dom: true },
  posterCoast:  { url: 'assets/art/poster_coast.jpg', srgb: true, dom: true },
  posterIsland: { url: 'assets/art/poster_island.jpg', srgb: true, dom: true },
};

class AssetLibrary {
  constructor() {
    this.tex = {};
    this.images = {};
    this.aniso = 8;
  }

  setProgress(fn) { this._prog = fn; }

  async load(keys, onProgress) {
    const loader = new THREE.TextureLoader();
    loader.setPath(BASE);
    const list = keys.map((k, i) => ({ key: k, spec: TEX_SPEC[k], i })).filter((e) => e.spec);
    let done = 0;
    const jobs = list.map((entry) => new Promise((res) => {
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        done++;
        if (!ok) console.warn('[assets] failed/timeout:', entry.spec.url);
        onProgress && onProgress(done / list.length, entry.key);
        res();
      };
      // hard timeout so a stalled request can never hang the loading screen
      const to = setTimeout(() => finish(false), 12000);
      loader.load(entry.spec.url, (t) => {
        clearTimeout(to);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (entry.spec.srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = this.aniso;
        this.tex[entry.key] = t;
        finish(true);
      }, undefined, () => { clearTimeout(to); finish(false); });
    }));
    await Promise.all(jobs);
    return this.tex;
  }

  get(key) { return this.tex[key]; }

  white() {
    if (!this._white) {
      this._white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      this._white.needsUpdate = true;
      this._white.wrapS = this._white.wrapT = THREE.RepeatWrapping;
    }
    return this._white;
  }
  repeated(key, rx, ry) {
    const t = this.tex[key] || this.white();
    const c = t.clone();
    c.needsUpdate = true;
    c.repeat.set(rx, ry);
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    return c;
  }

  // ------------------------------------------------------------- materials
  paint(color, finish = 'gloss') {
    const conf = {
      gloss:   { metalness: 0.55, roughness: 0.28, clearcoat: 1.0, ccR: 0.05 },
      metallic:{ metalness: 0.92, roughness: 0.34, clearcoat: 0.9, ccR: 0.12 },
      matte:   { metalness: 0.35, roughness: 0.72, clearcoat: 0.15, ccR: 0.5 },
      satin:   { metalness: 0.7,  roughness: 0.5,  clearcoat: 0.5, ccR: 0.25 },
      chrome:  { metalness: 1.0,  roughness: 0.06, clearcoat: 1.0, ccR: 0.02 },
      pearl:   { metalness: 0.8,  roughness: 0.22, clearcoat: 1.0, ccR: 0.04 },
    }[finish] || { metalness: 0.6, roughness: 0.3, clearcoat: 1, ccR: 0.06 };
    const m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      metalness: conf.metalness, roughness: conf.roughness,
      clearcoat: conf.clearcoat, clearcoatRoughness: conf.ccR,
      envMapIntensity: 1.25,
    });
    if (finish === 'pearl') { m.iridescence = 0.6; m.iridescenceIOR = 1.6; }
    return m;
  }

  carbon() {
    return new THREE.MeshPhysicalMaterial({
      map: this.repeated('carbon', 6, 6), normalMap: this.repeated('carbonN', 6, 6),
      metalness: 0.5, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.1,
      color: 0xbfc6cf,
    });
  }
  chrome() { return new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.08, envMapIntensity: 1.6 }); }
  blackPlastic() { return new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: 0.1, roughness: 0.62 }); }
  rubber() { return new THREE.MeshStandardMaterial({ map: this.repeated('tire', 3, 1), normalMap: this.repeated('tireN', 3, 1), color: 0x9aa0a6, metalness: 0.0, roughness: 0.88 }); }
  glass() {
    return new THREE.MeshPhysicalMaterial({
      color: 0x0d141c, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.36,
      envMapIntensity: 2.0, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
    });
  }
  lightLens(color = 0xffffff, intensity = 4) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: true });
  }
  tailLens(intensity = 3) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6 * intensity, 0.05 * intensity, 0.08 * intensity) }); }
  interior() {
    return new THREE.MeshStandardMaterial({ map: this.repeated('leather', 3, 3), normalMap: this.repeated('leatherN', 3, 3), color: 0x6a6a72, roughness: 0.85, metalness: 0.05 });
  }
  dashScreen() { return new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.9, 1.5) }); }

  asphalt(wet = false, scale = 26) {
    const albedo = wet ? 'asphaltWet' : 'asphalt';
    const rmap = wet ? 'asphaltWetR' : 'asphaltR';
    return new THREE.MeshStandardMaterial({
      map: this.repeated(albedo, scale, scale),
      normalMap: this.repeated('asphaltN', scale, scale),
      roughnessMap: this.tex[rmap] ? this.repeated(rmap, scale, scale) : null,
      roughness: wet ? 0.42 : 0.94, metalness: wet ? 0.28 : 0.02,
      normalScale: new THREE.Vector2(wet ? 0.5 : 0.9, wet ? 0.5 : 0.9),
      envMapIntensity: wet ? 1.5 : 0.6,
      color: 0xffffff,
    });
  }
  concrete(scale = 8) {
    return new THREE.MeshStandardMaterial({
      map: this.repeated('concrete', scale, scale), normalMap: this.repeated('concreteN', scale, scale),
      roughness: 0.9, metalness: 0.02, envMapIntensity: 0.5, color: 0xb9bfc7,
    });
  }
  grass(scale = 40) {
    return new THREE.MeshStandardMaterial({
      map: this.repeated('grass', scale, scale), normalMap: this.repeated('grassN', scale, scale),
      roughness: 0.95, metalness: 0, envMapIntensity: 0.5, color: 0xcfd8c0,
    });
  }
  rock(scale = 12) {
    return new THREE.MeshStandardMaterial({
      map: this.repeated('rock', scale, scale), normalMap: this.repeated('rockN', scale, scale),
      roughness: 0.95, metalness: 0, envMapIntensity: 0.5, color: 0xb7b3ad,
    });
  }
  metal() {
    return new THREE.MeshStandardMaterial({ map: this.repeated('metal', 2, 2), normalMap: this.repeated('metalN', 2, 2), color: 0xb9c0c8, metalness: 0.95, roughness: 0.35, envMapIntensity: 1.2 });
  }
  neon(texKey, mult = 2.4) {
    return new THREE.MeshBasicMaterial({ map: this.tex[texKey] || this.white(), transparent: true, color: new THREE.Color(mult, mult, mult), side: THREE.DoubleSide, toneMapped: true, depthWrite: false });
  }
  canopy(color = 0xffffff) {
    return new THREE.MeshStandardMaterial({
      map: this.repeated('blossom', 2, 2), alphaTest: 0.42, transparent: false,
      side: THREE.DoubleSide, color, roughness: 0.9, metalness: 0, envMapIntensity: 0.6,
    });
  }
  water() {
    const n = this.repeated('waterN', 40, 40);
    const m = new THREE.MeshStandardMaterial({
      color: 0x0b2233, roughness: 0.06, metalness: 0.08, normalMap: n,
      normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.7, transparent: true, opacity: 0.92,
    });
    m.userData.normal = n;
    return m;
  }
  skidMat() {
    return new THREE.MeshBasicMaterial({ map: this.tex.skid || this.white(), transparent: true, opacity: 0.72, depthWrite: false, color: 0x111114, blending: THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  }
  glowSprite(color = 0xffffff, scale = 1) {
    return new THREE.SpriteMaterial({ map: this.tex.glow || this.white(), color: new THREE.Color(color).multiplyScalar(scale), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
  }
  puffMat() {
    return new THREE.MeshBasicMaterial({ map: this.tex.puff || this.white(), transparent: true, depthWrite: false, color: 0xcfd4da, opacity: 0.5 });
  }
  contactShadow() {
    return new THREE.MeshBasicMaterial({ map: this.tex.contact || this.white(), transparent: true, depthWrite: false, opacity: 0.62, color: 0x000000 });
  }
  checker() {
    return new THREE.MeshStandardMaterial({ map: this.repeated('checker', 8, 1), roughness: 0.7, metalness: 0 });
  }
}

export const Assets = new AssetLibrary();
export default Assets;
