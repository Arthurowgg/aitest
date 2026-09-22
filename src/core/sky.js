// ============================================================================
// APEX HORIZON — procedural sky dome: gradient, sun/moon, stars, fbm clouds
// ============================================================================
import * as THREE from 'three';

export const SKY_PRESETS = {
  night: {
    zenith: 0x050a18, horizon: 0x1a2440, glow: 0xff4fa0, glowStrength: 0.32,
    sunColor: 0xbfd4ff, sunElev: 24, sunAzim: 140, sunSize: 0.02, sunIntensity: 0.5,
    stars: 1.0, cloudCover: 0.28, cloudColor: 0x27314d, cloudLight: 0x40507a,
    ambient: 0x223050, ambientIntensity: 0.5, sunLight: 0x9db4ff, sunLightIntensity: 0.55,
    fog: 0x0a1020, exposure: 1.02,
  },
  dawn: {
    zenith: 0x1d3a63, horizon: 0xffb27a, glow: 0xff7a3c, glowStrength: 0.75,
    sunColor: 0xffd9a8, sunElev: 7, sunAzim: 95, sunSize: 0.035, sunIntensity: 2.2,
    stars: 0.25, cloudCover: 0.4, cloudColor: 0x6d6a86, cloudLight: 0xffc08a,
    ambient: 0x51617f, ambientIntensity: 0.85, sunLight: 0xffc088, sunLightIntensity: 2.0,
    fog: 0xc9a58c, exposure: 1.05,
  },
  sunset: {
    zenith: 0x27356b, horizon: 0xff7b3d, glow: 0xff4d2e, glowStrength: 0.9,
    sunColor: 0xffc46b, sunElev: 4.5, sunAzim: 250, sunSize: 0.05, sunIntensity: 3.0,
    stars: 0.12, cloudCover: 0.45, cloudColor: 0x7a5470, cloudLight: 0xffb066,
    ambient: 0x6a5a72, ambientIntensity: 0.9, sunLight: 0xffa257, sunLightIntensity: 2.4,
    fog: 0xd98a5f, exposure: 1.06,
  },
  day: {
    zenith: 0x2f6fd0, horizon: 0xbfe0ff, glow: 0xffffff, glowStrength: 0.35,
    sunColor: 0xfff4d8, sunElev: 46, sunAzim: 120, sunSize: 0.03, sunIntensity: 3.4,
    stars: 0.0, cloudCover: 0.42, cloudColor: 0xffffff, cloudLight: 0xffffff,
    ambient: 0x9fc0e8, ambientIntensity: 1.0, sunLight: 0xfff2df, sunLightIntensity: 3.1,
    fog: 0xbdd8f2, exposure: 1.0,
  },
  overcast: {
    zenith: 0x5a6472, horizon: 0x9aa4b0, glow: 0xcfd6de, glowStrength: 0.3,
    sunColor: 0xdfe6ee, sunElev: 30, sunAzim: 160, sunSize: 0.08, sunIntensity: 0.9,
    stars: 0.0, cloudCover: 0.85, cloudColor: 0xb9c0c8, cloudLight: 0xdde3ea,
    ambient: 0x8d97a4, ambientIntensity: 1.1, sunLight: 0xd8dee6, sunLightIntensity: 1.3,
    fog: 0x9aa4b0, exposure: 1.0,
  },
};

const VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const FRAG = /* glsl */`
uniform vec3 uZenith, uHorizon, uGlow, uSunColor, uCloudColor, uCloudLight;
uniform vec3 uSunDir;
uniform float uSunSize, uSunIntensity, uStars, uCloudCover, uGlowStrength, uTime;
varying vec3 vDir;

float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
                 mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                 mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for(int i=0;i<5;i++){ s += a*noise(p); p = p*2.03 + vec3(11.7); a *= 0.5; }
  return s;
}
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -1.0, 1.0);

  // base gradient
  float t = pow(clamp(h, 0.0, 1.0), 0.55);
  vec3 col = mix(uHorizon, uZenith, t);
  // below horizon: darken toward ground haze
  col = mix(col, uHorizon*0.55, smoothstep(0.0, -0.25, h));

  // sun glow band on horizon
  float sunDot = dot(d, uSunDir);
  float glow = pow(max(sunDot, 0.0), 6.0) * uGlowStrength;
  col += uGlow * glow * (0.4 + 0.6*(1.0-abs(h)));

  // stars
  if (uStars > 0.01 && h > 0.0){
    vec3 sp = d * 220.0;
    float st = hash(floor(sp));
    st = smoothstep(0.9975, 1.0, st) * uStars;
    float tw = 0.6 + 0.4*sin(uTime*2.0 + st*90.0);
    col += vec3(st) * tw * smoothstep(0.0, 0.25, h);
  }

  // clouds: fbm on a flattened dome projection
  if (uCloudCover > 0.01){
    vec3 cp = d / max(abs(d.y)+0.12, 0.12);
    cp *= 0.9;
    cp.x += uTime * 0.008;
    float n = fbm(cp * 1.1);
    float cover = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover*0.45, n);
    cover *= smoothstep(-0.02, 0.16, h);
    float lit = pow(max(sunDot, 0.0), 3.0);
    vec3 cc = mix(uCloudColor, uCloudLight, lit*0.85);
    // soft cloud shading
    float shade = smoothstep(0.35, 0.75, n);
    cc *= mix(0.72, 1.12, shade);
    col = mix(col, cc, cover * 0.92);
  }

  // sun disc + halo
  float sd = max(sunDot, 0.0);
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize*0.35, sd);
  col += uSunColor * disc * uSunIntensity;
  col += uSunColor * pow(sd, 220.0) * uSunIntensity * 0.5;
  col += uSunColor * pow(sd, 18.0) * uSunIntensity * 0.16;

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function buildSky(presetName, overrides = {}) {
  const p = { ...SKY_PRESETS[presetName], ...overrides };
  const uniforms = {
    uZenith: { value: new THREE.Color(p.zenith) },
    uHorizon: { value: new THREE.Color(p.horizon) },
    uGlow: { value: new THREE.Color(p.glow) },
    uSunColor: { value: new THREE.Color(p.sunColor) },
    uCloudColor: { value: new THREE.Color(p.cloudColor) },
    uCloudLight: { value: new THREE.Color(p.cloudLight) },
    uSunDir: { value: new THREE.Vector3() },
    uSunSize: { value: p.sunSize },
    uSunIntensity: { value: p.sunIntensity },
    uStars: { value: p.stars },
    uCloudCover: { value: p.cloudCover },
    uGlowStrength: { value: p.glowStrength },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 40, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';

  const sunDir = new THREE.Vector3();
  const el = (p.sunElev * Math.PI) / 180, az = (p.sunAzim * Math.PI) / 180;
  sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  uniforms.uSunDir.value.copy(sunDir);

  // lights
  const sun = new THREE.DirectionalLight(new THREE.Color(p.sunLight), p.sunLightIntensity);
  sun.position.copy(sunDir).multiplyScalar(400);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
  sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  const hemi = new THREE.HemisphereLight(new THREE.Color(p.ambient), new THREE.Color(0x2a2620), p.ambientIntensity);

  const api = {
    mesh, sun, hemi, preset: p, uniforms, sunDir,
    update(t, camPos) {
      uniforms.uTime.value = t;
      mesh.position.copy(camPos);
      // shadow frustum follows camera
      sun.position.copy(camPos).addScaledVector(sunDir, 300);
      sun.target.position.copy(camPos);
      sun.target.updateMatrixWorld();
    },
  };
  return api;
}
