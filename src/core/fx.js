// ============================================================================
// APEX HORIZON — particle & decal FX: petals, rain, smoke, sparks, skid marks
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp } from './math.js';

const POINT_VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main(){
  vAlpha = aAlpha; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (320.0 / max(-mv.z, 1.0));
  gl_Position = projectionMatrix * mv;
}`;
const POINT_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform float uOpacity;
varying float vAlpha;
varying vec3 vColor;
void main(){
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, t.a * vAlpha * uOpacity);
  if (gl_FragColor.a < 0.01) discard;
}`;

export class PointCloud {
  constructor({ count, texture, blending = THREE.NormalBlending, opacity = 1, depthWrite = false }) {
    this.count = count;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.color = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uOpacity: { value: opacity } },
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
      transparent: true, depthWrite, blending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }
  flush() {
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// drifting sakura petals / leaves / snow
// ---------------------------------------------------------------------------
export class PetalField {
  constructor(texture, count, bounds, color = 0xffc9de) {
    this.cloud = new PointCloud({ count, texture, opacity: 0.95 });
    this.bounds = bounds;
    this.t = 0;
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) this.respawn(i, true);
    for (let i = 0; i < count; i++) {
      this.cloud.color[i * 3] = c.r * (0.85 + Math.random() * 0.3);
      this.cloud.color[i * 3 + 1] = c.g * (0.85 + Math.random() * 0.3);
      this.cloud.color[i * 3 + 2] = c.b * (0.85 + Math.random() * 0.3);
    }
    this.cloud.flush();
  }
  respawn(i, init = false) {
    const b = this.bounds;
    const c = this.cloud;
    c.pos[i * 3] = (Math.random() - 0.5) * b;
    c.pos[i * 3 + 1] = init ? Math.random() * 26 : 18 + Math.random() * 12;
    c.pos[i * 3 + 2] = (Math.random() - 0.5) * b;
    c.size[i] = 0.16 + Math.random() * 0.22;
    c.alpha[i] = 0.55 + Math.random() * 0.45;
    c.vel[i * 3] = (Math.random() - 0.5) * 0.6;
    c.vel[i * 3 + 1] = -0.5 - Math.random() * 0.7;
    c.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
  }
  update(dt, wind, center) {
    const c = this.cloud;
    this.t += dt;
    for (let i = 0; i < c.count; i++) {
      const ix = i * 3;
      c.pos[ix] += (c.vel[ix] + wind.x) * dt + Math.sin(this.t * 1.7 + i) * 0.012;
      c.pos[ix + 1] += c.vel[ix + 1] * dt;
      c.pos[ix + 2] += (c.vel[ix + 2] + wind.z) * dt + Math.cos(this.t * 1.3 + i * 2) * 0.012;
      if (c.pos[ix + 1] < -1) this.respawn(i);
      // keep around the player
      const dx = c.pos[ix] - center.x, dz = c.pos[ix + 2] - center.z;
      if (dx * dx + dz * dz > this.bounds * this.bounds * 0.25) {
        c.pos[ix] = center.x + (Math.random() - 0.5) * this.bounds * 0.6;
        c.pos[ix + 2] = center.z + (Math.random() - 0.5) * this.bounds * 0.6;
      }
    }
    c.points.position.copy(center); c.points.position.y = center.y;
    c.flush();
  }
}

// ---------------------------------------------------------------------------
// rain
// ---------------------------------------------------------------------------
export class RainField {
  constructor(texture, count, bounds) {
    this.cloud = new PointCloud({ count, texture, opacity: 0.5, blending: THREE.AdditiveBlending });
    this.bounds = bounds;
    for (let i = 0; i < count; i++) {
      const c = this.cloud;
      c.pos[i * 3] = (Math.random() - 0.5) * bounds;
      c.pos[i * 3 + 1] = Math.random() * 30;
      c.pos[i * 3 + 2] = (Math.random() - 0.5) * bounds;
      c.size[i] = 0.09 + Math.random() * 0.08;
      c.alpha[i] = 0.4 + Math.random() * 0.5;
      c.color[i * 3] = 0.62; c.color[i * 3 + 1] = 0.74; c.color[i * 3 + 2] = 0.95;
      c.vel[i * 3 + 1] = -26 - Math.random() * 10;
    }
    this.cloud.flush();
  }
  update(dt, wind, center) {
    const c = this.cloud;
    for (let i = 0; i < c.count; i++) {
      const ix = i * 3;
      c.pos[ix] += wind.x * 2.2 * dt;
      c.pos[ix + 1] += c.vel[ix + 1] * dt;
      c.pos[ix + 2] += wind.z * 2.2 * dt;
      if (c.pos[ix + 1] < 0) { c.pos[ix + 1] = 26 + Math.random() * 6; }
      const dx = c.pos[ix] - center.x, dz = c.pos[ix + 2] - center.z;
      const b2 = this.bounds * this.bounds * 0.25;
      if (dx * dx + dz * dz > b2) {
        c.pos[ix] = center.x + (Math.random() - 0.5) * this.bounds * 0.7;
        c.pos[ix + 2] = center.z + (Math.random() - 0.5) * this.bounds * 0.7;
      }
    }
    c.points.position.set(center.x, center.y, center.z);
    c.flush();
  }
}

// ---------------------------------------------------------------------------
// pooled smoke / dust / sparks
// ---------------------------------------------------------------------------
export class Emitter {
  constructor(texture, count, { blending = THREE.NormalBlending, opacity = 1, gravity = 1.6, grow = 2.4, drag = 1.6 } = {}) {
    this.cloud = new PointCloud({ count, texture, blending, opacity });
    this.opt = { gravity, grow, drag };
    this.cursor = 0;
    this.count = count;
  }
  spawn(x, y, z, vx, vy, vz, size, life, color) {
    const c = this.cloud, i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    c.pos[i * 3] = x; c.pos[i * 3 + 1] = y; c.pos[i * 3 + 2] = z;
    c.vel[i * 3] = vx; c.vel[i * 3 + 1] = vy; c.vel[i * 3 + 2] = vz;
    c.size[i] = size; c.life[i] = life; c.maxLife[i] = life;
    c.alpha[i] = 0.9;
    c.color[i * 3] = color.r; c.color[i * 3 + 1] = color.g; c.color[i * 3 + 2] = color.b;
  }
  update(dt) {
    const c = this.cloud, o = this.opt;
    for (let i = 0; i < this.count; i++) {
      if (c.life[i] <= 0) { c.alpha[i] = 0; continue; }
      c.life[i] -= dt;
      const ix = i * 3;
      const d = Math.exp(-o.drag * dt);
      c.vel[ix] *= d; c.vel[ix + 2] *= d;
      c.vel[ix + 1] = c.vel[ix + 1] * d + o.gravity * dt;
      c.pos[ix] += c.vel[ix] * dt; c.pos[ix + 1] += c.vel[ix + 1] * dt; c.pos[ix + 2] += c.vel[ix + 2] * dt;
      const t = clamp(c.life[i] / c.maxLife[i], 0, 1);
      c.alpha[i] = t * 0.85;
      c.size[i] += o.grow * dt * (0.4 + t);
      if (c.life[i] <= 0) c.alpha[i] = 0;
    }
    c.flush();
  }
}

// ---------------------------------------------------------------------------
// skid mark ribbon (dynamic decal trail on the ground)
// ---------------------------------------------------------------------------
const SKID_VERT = /* glsl */`
attribute float aAlpha;
varying float vA;
varying vec2 vUv;
void main(){ vA = aAlpha; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKID_FRAG = /* glsl */`
uniform sampler2D uMap; uniform vec3 uColor;
varying float vA; varying vec2 vUv;
void main(){
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vA;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export class SkidTrail {
  constructor(texture, maxSegments = 900, width = 0.34, color = 0x0b0c0f) {
    this.max = maxSegments;
    this.width = width;
    this.segs = [];       // {ax,ay,az,bx,by,bz,alpha}
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxSegments * 6 * 3), 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(maxSegments * 6 * 2), 2));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(maxSegments * 6), 1));
    this.geo.setIndex(new THREE.BufferAttribute(new Uint32Array(maxSegments * 6), 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: texture }, uColor: { value: new THREE.Color(color) } },
      vertexShader: SKID_VERT, fragmentShader: SKID_FRAG,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.last = null;
  }
  addSegment(ax, ay, az, bx, by, bz, alpha) {
    this.segs.push({ ax, ay, az, bx, by, bz, alpha });
    if (this.segs.length > this.max) this.segs.shift();
  }
  fade(dt, rate = 0.06) {
    for (const s of this.segs) s.alpha -= dt * rate;
    while (this.segs.length && this.segs[0].alpha <= 0) this.segs.shift();
  }
  rebuild() {
    const pos = this.geo.attributes.position.array;
    const uv = this.geo.attributes.uv.array;
    const al = this.geo.attributes.aAlpha.array;
    const idx = this.geo.index.array;
    let v = 0, ii = 0;
    for (let s = 0; s < this.segs.length; s++) {
      const g = this.segs[s];
      const quad = [
        [g.ax, g.ay, g.az, 0, 1 - g.alpha],
        [g.bx, g.by, g.bz, 1, 1 - g.alpha],
      ];
      // two verts per end (already offset laterally when added)
      pos[v * 3] = g.ax; pos[v * 3 + 1] = g.ay; pos[v * 3 + 2] = g.az; uv[v * 2] = 0; uv[v * 2 + 1] = s * 0.25; al[v] = g.alpha; v++;
      pos[v * 3] = g.bx; pos[v * 3 + 1] = g.by; pos[v * 3 + 2] = g.bz; uv[v * 2] = 1; uv[v * 2 + 1] = s * 0.25; al[v] = g.alpha; v++;
    }
    for (let s = 0; s < this.segs.length - 1; s++) {
      const a = s * 2;
      idx[ii++] = a; idx[ii++] = a + 2; idx[ii++] = a + 3;
      idx[ii++] = a; idx[ii++] = a + 3; idx[ii++] = a + 1;
    }
    this.geo.setDrawRange(0, this.segs.length ? (this.segs.length - 1) * 6 : 0);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.index.needsUpdate = true;
  }
  clear() { this.segs.length = 0; this.geo.setDrawRange(0, 0); }
}

/** helper: add a wheel-track segment given centre + lateral offset */
export function trackPoint(cx, cy, cz, dirX, dirZ, side, width) {
  const nx = -dirZ, nz = dirX;
  return [cx + nx * side * width, cy, cz + nz * side * width];
}
