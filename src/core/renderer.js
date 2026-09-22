// ============================================================================
// APEX HORIZON — renderer, post-processing chain & quality presets
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { clamp } from './math.js';

export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },        // 0..1 radial motion blur + CA amount
    uVignette: { value: 0.42 },
    uGrain: { value: 0.055 },
    uSat: { value: 1.08 },
    uContrast: { value: 1.06 },
    uFlash: { value: 0 },        // white/colour flash (nitro, hit)
    uFlashColor: { value: new THREE.Color(0x88ddff) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFade: { value: 0 },         // 0..1 black fade for transitions
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime, uSpeed, uVignette, uGrain, uSat, uContrast, uFlash, uFade;
    uniform vec3 uFlashColor, uTint;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }

    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r = length(c);

      // radial motion blur toward centre at speed
      vec3 col = vec3(0.0);
      float blur = uSpeed * 0.028 * smoothstep(0.12, 0.75, r);
      const int TAPS = 7;
      for (int i = 0; i < TAPS; i++){
        float t = float(i) / float(TAPS - 1);
        vec2 off = c * blur * t;
        // chromatic aberration grows with radius + speed
        float ca = (0.0016 + uSpeed * 0.006) * r;
        col.r += texture2D(tDiffuse, uv - off + c * ca).r;
        col.g += texture2D(tDiffuse, uv - off).g;
        col.b += texture2D(tDiffuse, uv - off - c * ca).b;
      }
      col /= float(TAPS);

      // grade
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col *= uTint;

      // vignette
      float vig = smoothstep(0.98, 0.28, r * (1.0 + uVignette));
      col *= mix(1.0, vig, uVignette);

      // grain
      float g = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7);
      col += (g - 0.5) * uGrain;

      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
      col *= (1.0 - clamp(uFade, 0.0, 1.0));

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export const QUALITY = {
  low:    { dpr: 0.65, shadows: false, shadowSize: 512,  bloom: false, aa: 'none', water: false, petals: 0.25, fogFar: 700,  aniso: 2,  dof: false },
  medium: { dpr: 0.85, shadows: true,  shadowSize: 1024, bloom: true,  aa: 'fxaa', water: true,  petals: 0.5,  fogFar: 1100, aniso: 4,  dof: false },
  high:   { dpr: 1.0,  shadows: true,  shadowSize: 2048, bloom: true,  aa: 'smaa', water: true,  petals: 1.0,  fogFar: 1700, aniso: 8,  dof: false },
  ultra:  { dpr: 1.25, shadows: true,  shadowSize: 4096, bloom: true,  aa: 'smaa', water: true,  petals: 1.6,  fogFar: 2600, aniso: 16, dof: true },
};

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.35, 4000);
    this.camera.position.set(0, 6, -14);

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.62, 0.62, 0.82);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.smaa = new SMAAPass();
    this.fxaa = new FXAAPass();
    this.aaPass = null;

    this.quality = 'high';
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;
    this.onFps = null;

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  setQuality(name, resScale = 1) {
    const q = QUALITY[name] || QUALITY.high;
    this.qualityName = name;
    this.q = q;
    this.resScale = resScale;
    this.renderer.shadowMap.enabled = q.shadows;
    this.bloom.enabled = q.bloom;
    if (this.aaPass) { this.composer.removePass(this.aaPass); this.aaPass = null; }
    if (q.aa === 'smaa') { this.aaPass = this.smaa; this.composer.addPass(this.smaa); }
    else if (q.aa === 'fxaa') { this.aaPass = this.fxaa; this.composer.addPass(this.fxaa); }
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const q = this.q || QUALITY.high;
    const dpr = Math.min(devicePixelRatio || 1, q.dpr) * (this.resScale ?? 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setScene(scene) {
    this.scene = scene;
    this.renderPass.scene = scene;
  }
  setExposure(e) { this.renderer.toneMappingExposure = e; }
  setFog(color, near, far) {
    this.scene.fog = new THREE.Fog(color, near, far);
  }

  beginFrame(dt, t) {
    this.grade.uniforms.uTime.value = t;
  }
  render(dt) {
    // fps tracking
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc > 0.5) {
      this.fps = this._fpsN / this._fpsAcc;
      this._fpsAcc = 0; this._fpsN = 0;
      if (this.onFps) this.onFps(this.fps);
    }
    if (this._postBroken) { this.renderer.render(this.scene, this.camera); return; }
    try {
      this.composer.render(dt);
    } catch (e) {
      this._postFails = (this._postFails || 0) + 1;
      console.error('[renderer] post-processing failed, disabling:', e);
      if (this._postFails >= 2) {
        this._postBroken = true;
        if (this.onFallback) this.onFallback();
      }
      try { this.renderer.render(this.scene, this.camera); } catch (e2) { console.error(e2); }
    }
  }
}
