// ============================================================================
// APEX HORIZON — terrain heightfield, road-distance fields, water plane
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm, ridge, mulberry32 } from './math.js';

/**
 * Builds the shared spatial fields for a map:
 *  - base height noise
 *  - road corridor distance + road height raster (bilinear sampled at runtime)
 */
export class WorldFields {
  constructor(conf) {
    this.size = conf.size;              // world edge length (m)
    this.res = conf.res || 220;         // grid resolution
    this.sea = conf.seaLevel ?? -8;
    this.conf = conf;
    this.half = this.size / 2;
    this.cell = this.size / (this.res - 1);
    this.dist = new Float32Array(this.res * this.res).fill(1e6);
    this.roadH = new Float32Array(this.res * this.res);
    this.roadW = new Float32Array(this.res * this.res);   // half width of nearest road
    this.rng = mulberry32(conf.seed || 1337);
  }

  baseH(x, z) {
    const c = this.conf;
    const s = c.heightScale ?? 1;
    const nx = x / (c.noiseScale ?? 420), nz = z / (c.noiseScale ?? 420);
    let h = (fbm(nx, nz, 5) - 0.45) * (c.amplitude ?? 30) * s;
    h += (ridge(nx * 1.7 + 11.3, nz * 1.7 - 4.1, 4) - 0.5) * (c.ridgeAmount ?? 0) * s;
    if (c.island) {
      const r = Math.hypot(x, z) / this.half;
      h -= smoothstep(0.55, 1.02, r) * (c.islandDepth ?? 26);
      h += (1 - smoothstep(0.0, 0.5, r)) * (c.islandLift ?? 6);
    }
    if (c.coastDir) {                    // carve an ocean basin on one side
      const d = (x * c.coastDir[0] + z * c.coastDir[1]) / this.half;
      h -= smoothstep(c.coastStart ?? 0.45, c.coastStart + 0.5, d) * (c.coastDepth ?? 30);
    }
    return h;
  }

  /** paint road corridors into the raster */
  paintRoads(roads) {
    const { res, cell, half } = this;
    for (const road of roads) {
      const pts = road.points;            // flat [x,z,...]
      const w = road.halfWidth ?? 7;
      const corridor = w + (road.corridor ?? 26);
      const cr = Math.ceil(corridor / cell);
      // smooth road height along path first
      const hs = new Float32Array(pts.length / 2);
      const win = 9;
      for (let i = 0; i < pts.length / 2; i++) {
        let acc = 0, n = 0;
        for (let k = -win; k <= win; k++) {
          const j = ((i + k) % (pts.length / 2) + (pts.length / 2)) % (pts.length / 2);
          acc += this.baseH(pts[j * 2], pts[j * 2 + 1]); n++;
        }
        hs[i] = acc / n;
      }
      for (let i = 0; i < pts.length / 2; i++) {
        const x = pts[i * 2], z = pts[i * 2 + 1];
        const gx = Math.round((x + half) / cell), gz = Math.round((z + half) / cell);
        for (let dz = -cr; dz <= cr; dz++) for (let dx = -cr; dx <= cr; dx++) {
          const ix = gx + dx, iz = gz + dz;
          if (ix < 0 || iz < 0 || ix >= res || iz >= res) continue;
          const wx = ix * cell - half, wz = iz * cell - half;
          const d = Math.hypot(wx - x, wz - z);
          if (d > corridor) continue;
          const idx = iz * res + ix;
          if (d < this.dist[idx]) { this.dist[idx] = d; this.roadH[idx] = hs[i]; this.roadW[idx] = w; }
        }
      }
    }
  }

  /** final terrain height: road corridor flattened into the hills */
  heightAt(x, z) {
    const { res, cell, half } = this;
    const fx = clamp((x + half) / cell, 0, res - 1.001);
    const fz = clamp((z + half) / cell, 0, res - 1.001);
    const ix = fx | 0, iz = fz | 0;
    const tx = fx - ix, tz = fz - iz;
    const i00 = iz * res + ix, i10 = i00 + 1, i01 = i00 + res, i11 = i01 + 1;
    const d = lerp(lerp(this.dist[i00], this.dist[i10], tx), lerp(this.dist[i01], this.dist[i11], tx), tz);
    const rh = lerp(lerp(this.roadH[i00], this.roadH[i10], tx), lerp(this.roadH[i01], this.roadH[i11], tx), tz);
    const rw = lerp(lerp(this.roadW[i00], this.roadW[i10], tx), lerp(this.roadW[i01], this.roadW[i11], tx), tz);
    const base = this.baseH(x, z);
    if (d > 1e5) return Math.max(base, this.sea - 4);
    const flat = 1 - smoothstep(rw + 3, rw + (this.conf.corridor ?? 22), d);
    let h = lerp(base, rh, flat);
    // gentle banking shoulder so roads don't look pasted
    h += (1 - flat) * smoothstep(rw + 40, rw + 6, d) * 0.0;
    return h;
  }

  /** distance to nearest road + road half width (for placement & gameplay) */
  roadInfoAt(x, z) {
    const { res, cell, half } = this;
    const fx = clamp((x + half) / cell, 0, res - 1.001);
    const fz = clamp((z + half) / cell, 0, res - 1.001);
    const ix = fx | 0, iz = fz | 0;
    const tx = fx - ix, tz = fz - iz;
    const i00 = iz * res + ix, i10 = i00 + 1, i01 = i00 + res, i11 = i01 + 1;
    const d = lerp(lerp(this.dist[i00], this.dist[i10], tx), lerp(this.dist[i01], this.dist[i11], tx), tz);
    const rw = lerp(lerp(this.roadW[i00], this.roadW[i10], tx), lerp(this.roadW[i01], this.roadW[i11], tx), tz);
    return { dist: d, halfWidth: rw, onRoad: d < rw + 1.2, shoulder: d < rw + 6 };
  }
}

// ---------------------------------------------------------------------------
// terrain mesh with grass/rock shader blending
// ---------------------------------------------------------------------------
export function buildTerrainMesh(fields, Assets, conf) {
  const seg = conf.terrainSegments ?? 200;
  const geo = new THREE.PlaneGeometry(fields.size, fields.size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const rng = mulberry32(99);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = fields.heightAt(x, z);
    pos.setY(i, h);
    const info = fields.roadInfoAt(x, z);
    // subtle colour variation: darker valleys, dry tops, dirt near road
    const v = 0.82 + fbm(x / 90 + 31, z / 90 - 7, 3) * 0.4;
    let r = v, g = v, b = v;
    if (info.dist < info.halfWidth + 8) { r *= 0.82; g *= 0.8; b *= 0.76; }   // dusty shoulder
    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: Assets.repeated('grass', 1, 1),
    normalMap: Assets.repeated('grassN', 1, 1),
    vertexColors: true,
    roughness: 0.96, metalness: 0.0,
    envMapIntensity: 0.45,
    normalScale: new THREE.Vector2(0.6, 0.6),
  });
  const rockMap = Assets.repeated('rock', 1, 1);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRockMap = { value: rockMap };
    shader.uniforms.uGrassScale = { value: conf.grassScale ?? 90 };
    shader.uniforms.uRockScale = { value: conf.rockScale ?? 55 };
    shader.uniforms.uRockStart = { value: conf.rockStart ?? 26 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPosT; varying vec3 vNrmWT;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vNrmWT = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vWPosT = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPosT; varying vec3 vNrmWT;
        uniform sampler2D uRockMap; uniform float uGrassScale, uRockScale, uRockStart;`)
      .replace('#include <map_fragment>', `
        vec2 uvG = vWPosT.xz / uGrassScale;
        vec2 uvR = vWPosT.xz / uRockScale;
        vec4 gC = texture2D( map, uvG );
        vec4 rC = texture2D( uRockMap, uvR );
        float slope = 1.0 - clamp(vNrmWT.y, 0.0, 1.0);
        float m = smoothstep(0.22, 0.46, slope) + smoothstep(uRockStart, uRockStart + 14.0, vWPosT.y) * 0.55;
        m = clamp(m, 0.0, 1.0);
        vec4 blended = mix(gC, rC, m);
        diffuseColor *= blended;
      `);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// ---------------------------------------------------------------------------
export function buildWater(fields, Assets, conf) {
  const mat = Assets.water();
  const geo = new THREE.PlaneGeometry(fields.size * 1.6, fields.size * 1.6, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = fields.sea;
  mesh.name = 'water';
  mesh.userData.update = (t) => {
    const n = mat.userData.normal;
    if (n) { n.offset.set(t * 0.013, t * 0.021); }
  };
  return mesh;
}
