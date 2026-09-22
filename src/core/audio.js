// ============================================================================
// APEX HORIZON — procedural audio: engine synthesis, tyre, wind, impacts,
// UI blips and a synthwave festival music loop. Pure WebAudio, zero samples.
// ============================================================================
import { clamp, lerp } from './math.js';

class AudioEngine {
  constructor() {
    this.ready = false;
    this.vol = { master: 0.9, engine: 0.85, sfx: 0.8, music: 0.55, ui: 0.7 };
    this.bus = {};   // safe before init(): setVolume just records levels
    this.enabled = true;
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.vol.master;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 22; this.comp.ratio.value = 8;
    this.master.connect(this.comp); this.comp.connect(c.destination);

    this.bus = {};
    for (const k of ['engine', 'sfx', 'music', 'ui']) {
      const g = c.createGain(); g.gain.value = this.vol[k] ?? 0.8;
      g.connect(this.master); this.bus[k] = g;
    }

    // shared noise buffer
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.buildEngine();
    this.buildTyreWind();
    this.ready = true;
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(k, v) { this.vol[k] = v; if (this.bus && this.bus[k]) this.bus[k].gain.value = v; if (k === 'master' && this.master) this.master.gain.value = v; }

  // ---------------------------------------------------------------- engine
  buildEngine() {
    const c = this.ctx;
    this.eng = { on: false };
    const e = this.eng;
    e.gain = c.createGain(); e.gain.value = 0; e.connect(this.bus.engine);

    e.shaper = c.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * 2.2) * 0.9; }
    e.shaper.curve = curve; e.shaper.oversample = '2x';

    e.lp = c.createBiquadFilter(); e.lp.type = 'lowpass'; e.lp.frequency.value = 700; e.lp.Q.value = 1.1;
    e.bp = c.createBiquadFilter(); e.bp.type = 'peaking'; e.bp.frequency.value = 320; e.bp.gain.value = 7; e.bp.Q.value = 1.4;
    e.shaper.connect(e.bp); e.bp.connect(e.lp); e.lp.connect(e.gain);

    e.oscs = [];
    const mk = (type, mult, gain) => {
      const o = c.createOscillator(); o.type = type;
      const g = c.createGain(); g.gain.value = gain;
      o.connect(g); g.connect(e.shaper); o.start();
      e.oscs.push({ o, mult, g });
      return o;
    };
    mk('sawtooth', 1.0, 0.5);
    mk('sawtooth', 0.5, 0.42);
    mk('square', 2.0, 0.16);
    mk('sawtooth', 1.007, 0.3);   // slight detune for thickness

    // exhaust / intake air
    e.air = c.createBufferSource(); e.air.buffer = this.noiseBuf; e.air.loop = true;
    e.airF = c.createBiquadFilter(); e.airF.type = 'bandpass'; e.airF.frequency.value = 900; e.airF.Q.value = 0.8;
    e.airG = c.createGain(); e.airG.gain.value = 0;
    e.air.connect(e.airF); e.airF.connect(e.airG); e.airG.connect(this.bus.engine); e.air.start();

    // turbo / supercharger whine
    e.whine = c.createOscillator(); e.whine.type = 'sine';
    e.whineG = c.createGain(); e.whineG.gain.value = 0;
    e.whine.connect(e.whineG); e.whineG.connect(this.bus.engine); e.whine.start();
  }

  configureEngine(cfg = {}) {
    if (!this.ready) return;
    this.engCfg = {
      cyl: cfg.cyl ?? 6, idle: cfg.idle ?? 900, redline: cfg.redline ?? 7800,
      turbo: cfg.turbo ?? true, character: cfg.character ?? 'sport',
    };
  }

  engine(rpm01, throttle, speed01, active) {
    if (!this.ready) return;
    const e = this.eng, cfg = this.engCfg || { cyl: 6, idle: 900, redline: 7800, turbo: true };
    const t = this.ctx.currentTime;
    const rpm = lerp(cfg.idle, cfg.redline, clamp(rpm01, 0, 1));
    const fire = (rpm / 60) * (cfg.cyl / 2);     // firing frequency Hz
    const load = 0.25 + throttle * 0.75;
    e.oscs.forEach((o, i) => {
      const f = clamp(fire * o.mult, 20, 900);
      o.o.frequency.setTargetAtTime(f, t, 0.035);
      o.g.gain.setTargetAtTime([0.5, 0.4, 0.14, 0.28][i] * load, t, 0.06);
    });
    e.lp.frequency.setTargetAtTime(lerp(420, 5200, clamp(rpm01 * 0.8 + throttle * 0.4, 0, 1)), t, 0.05);
    e.bp.frequency.setTargetAtTime(lerp(200, 1500, rpm01), t, 0.06);
    e.airF.frequency.setTargetAtTime(lerp(500, 2600, rpm01), t, 0.08);
    e.airG.gain.setTargetAtTime(active ? (0.05 + throttle * 0.16) * (0.4 + rpm01) : 0, t, 0.09);
    e.whine.frequency.setTargetAtTime(900 + rpm01 * 3400, t, 0.05);
    e.whineG.gain.setTargetAtTime(active && cfg.turbo ? throttle * 0.045 * rpm01 : 0, t, 0.1);
    e.gain.gain.setTargetAtTime(active ? 0.5 + throttle * 0.22 : 0, t, 0.08);

    // backfire on lift-off
    if (active && this._lastThr > 0.55 && throttle < 0.15 && rpm01 > 0.45 && Math.random() < 0.5) this.backfire();
    this._lastThr = throttle;
  }
  engineOff() { if (this.ready) { const t = this.ctx.currentTime; this.eng.gain.gain.setTargetAtTime(0, t, 0.1); this.eng.airG.gain.setTargetAtTime(0, t, 0.1); this.eng.whineG.gain.setTargetAtTime(0, t, 0.1); } }

  // ------------------------------------------------------------- tyre/wind
  buildTyreWind() {
    const c = this.ctx;
    this.sq = c.createBufferSource(); this.sq.buffer = this.noiseBuf; this.sq.loop = true;
    this.sqF = c.createBiquadFilter(); this.sqF.type = 'bandpass'; this.sqF.frequency.value = 1500; this.sqF.Q.value = 2.2;
    this.sqG = c.createGain(); this.sqG.gain.value = 0;
    this.sq.connect(this.sqF); this.sqF.connect(this.sqG); this.sqG.connect(this.bus.sfx); this.sq.start();

    this.wind = c.createBufferSource(); this.wind.buffer = this.noiseBuf; this.wind.loop = true;
    this.windF = c.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 500;
    this.windG = c.createGain(); this.windG.gain.value = 0;
    this.wind.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.bus.sfx); this.wind.start();

    this.road = c.createBufferSource(); this.road.buffer = this.noiseBuf; this.road.loop = true;
    this.roadF = c.createBiquadFilter(); this.roadF.type = 'lowpass'; this.roadF.frequency.value = 260;
    this.roadG = c.createGain(); this.roadG.gain.value = 0;
    this.road.connect(this.roadF); this.roadF.connect(this.roadG); this.roadG.connect(this.bus.sfx); this.road.start();
  }
  tyre(slip01) {
    if (!this.ready) return; const t = this.ctx.currentTime;
    this.sqG.gain.setTargetAtTime(clamp(slip01, 0, 1) * 0.34, t, 0.05);
    this.sqF.frequency.setTargetAtTime(1100 + slip01 * 1300, t, 0.08);
  }
  windAndRoad(speed01, offroad) {
    if (!this.ready) return; const t = this.ctx.currentTime;
    const s = clamp(speed01, 0, 1);
    this.windG.gain.setTargetAtTime(s * s * 0.22, t, 0.15);
    this.windF.frequency.setTargetAtTime(300 + s * 1400, t, 0.2);
    this.roadG.gain.setTargetAtTime(s * (offroad ? 0.22 : 0.09), t, 0.12);
    this.roadF.frequency.setTargetAtTime(offroad ? 500 : 240, t, 0.2);
  }

  // ------------------------------------------------------------------ sfx
  impact(v) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const g = c.createGain(); g.connect(this.bus.sfx);
    const a = clamp(v, 0.1, 1);
    g.gain.setValueAtTime(a * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + a * 1600;
    src.connect(f); f.connect(g); src.start(t); src.stop(t + 0.35);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    const g2 = c.createGain(); g2.gain.setValueAtTime(a * 0.7, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g2); g2.connect(this.bus.sfx); o.start(t); o.stop(t + 0.32);
  }
  backfire() {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const n = 1 + (Math.random() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const at = t + i * (0.04 + Math.random() * 0.05);
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 260 + Math.random() * 260; f.Q.value = 1.1;
      const g = c.createGain(); g.gain.setValueAtTime(0.5, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.11);
      src.connect(f); f.connect(g); g.connect(this.bus.sfx); src.start(at); src.stop(at + 0.13);
    }
  }
  shift(up) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = up ? 1800 : 700;
    const g = c.createGain(); g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(f); f.connect(g); g.connect(this.bus.sfx); src.start(t); src.stop(t + 0.1);
  }
  whoosh() {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.6;
    f.frequency.setValueAtTime(320, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.5);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.14); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    src.connect(f); f.connect(g); g.connect(this.bus.sfx); src.start(t); src.stop(t + 0.75);
  }
  chime(good = true) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const notes = good ? [880, 1318.5] : [330, 233];
    notes.forEach((fr, i) => {
      const o = c.createOscillator(); o.type = good ? 'triangle' : 'sawtooth';
      o.frequency.value = fr;
      const g = c.createGain(); const at = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.28, at + 0.02); g.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
      o.connect(g); g.connect(this.bus.sfx); o.start(at); o.stop(at + 0.55);
    });
  }
  ui(kind = 'click') {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); const g = c.createGain();
    const conf = { click: [1400, 0.05, 'square', 0.1], hover: [900, 0.03, 'sine', 0.05], back: [500, 0.07, 'triangle', 0.1], select: [1700, 0.08, 'square', 0.12] }[kind] || [1200, 0.05, 'square', 0.08];
    o.type = conf[2]; o.frequency.setValueAtTime(conf[0], t);
    if (kind === 'select') o.frequency.exponentialRampToValueAtTime(conf[0] * 1.6, t + 0.07);
    g.gain.setValueAtTime(conf[3], t); g.gain.exponentialRampToValueAtTime(0.001, t + conf[1] + 0.05);
    o.connect(g); g.connect(this.bus.ui); o.start(t); o.stop(t + conf[1] + 0.08);
  }
  count(go = false) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = go ? 1046 : 523;
    const g = c.createGain(); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + (go ? 0.6 : 0.22));
    o.connect(g); g.connect(this.bus.sfx); o.start(t); o.stop(t + (go ? 0.65 : 0.25));
  }

  // ---------------------------------------------------------------- music
  startMusic(intensity = 0) {
    if (!this.ready || this.musicOn) return;
    this.musicOn = true; this.musicStep = 0; this.musicNext = this.ctx.currentTime + 0.1;
    this.musicIntensity = intensity;
    this._musicTimer = setInterval(() => this._scheduleMusic(), 60);
  }
  stopMusic() { this.musicOn = false; if (this._musicTimer) clearInterval(this._musicTimer); }
  setMusicIntensity(v) { this.musicIntensity = v; }

  _scheduleMusic() {
    const c = this.ctx;
    const bpm = 126, spb = 60 / bpm, step = spb / 4;
    while (this.musicNext < c.currentTime + 0.25) {
      this._playStep(this.musicStep, this.musicNext, step);
      this.musicNext += step; this.musicStep = (this.musicStep + 1) % 128;
    }
  }
  _playStep(s, t, step) {
    const c = this.ctx, bus = this.bus.music, I = this.musicIntensity ?? 0.6;
    const bar = (s / 16) | 0, beat = (s % 16) | 0;
    const prog = [0, 5, 3, 4][bar % 4];            // A F D E (minor feel)
    const scale = [0, 3, 5, 7, 10];
    const root = 55 * Math.pow(2, prog / 12);
    // drums
    if (beat % 4 === 0) { // kick
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      const g = c.createGain(); g.gain.setValueAtTime(0.5 * I, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.26);
    }
    if (beat === 4 || beat === 12) { // snare
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
      const g = c.createGain(); g.gain.setValueAtTime(0.3 * I, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(f); f.connect(g); g.connect(bus); src.start(t); src.stop(t + 0.18);
    }
    if (beat % 2 === 1) { // hats
      const src = c.createBufferSource(); src.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
      const g = c.createGain(); g.gain.setValueAtTime(0.09 * I, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      src.connect(f); f.connect(g); g.connect(bus); src.start(t); src.stop(t + 0.07);
    }
    // bass 8ths
    if (beat % 2 === 0) {
      const note = root * (beat % 8 === 6 ? 1.5 : 1);
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = note;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320 + I * 500;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * I, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + step * 1.8);
      o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + step * 2);
    }
    // pad chord per bar
    if (beat === 0) {
      [0, 3, 7, 10].forEach((semi, i) => {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = root * 4 * Math.pow(2, semi / 12); o.detune.value = (i % 2 ? 7 : -7);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(1400, t + step * 14);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045 * I, t + step * 3); g.gain.linearRampToValueAtTime(0.0001, t + step * 16);
        o.connect(f); f.connect(g); g.connect(bus); o.start(t); o.stop(t + step * 16.2);
      });
    }
    // arp
    if (I > 0.45 && beat % 2 === 1) {
      const idx = scale[(s * 7) % scale.length];
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.value = root * 8 * Math.pow(2, idx / 12);
      const g = c.createGain(); g.gain.setValueAtTime(0.05 * I, t); g.gain.exponentialRampToValueAtTime(0.001, t + step * 0.9);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + step);
    }
  }
}

export const Audio = new AudioEngine();
export default Audio;
