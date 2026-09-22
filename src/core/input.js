// ============================================================================
// APEX HORIZON — input: keyboard, mouse wheel, gamepad
// ============================================================================
import { clamp, damp } from './math.js';

const KEYMAP = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight'],
  camera: ['KeyC'],
  reset: ['KeyR'],
  pause: ['Escape', 'KeyP'],
  photo: ['F1'],
  hidehud: ['KeyH'],
  horn: ['KeyF'],
  lookback: ['KeyV'],
  handbrake2: ['KeyE'],
};

class InputManager {
  constructor(dom) {
    this.dom = dom;
    this.down = new Set();
    this.pressed = new Set();      // edge-triggered, consumed each frame
    this.steerRaw = 0;
    this.steer = 0;                // smoothed
    this.throttle = 0;
    this.brake = 0;
    this.gamepadIndex = -1;
    this._padPrev = {};
    this.padName = '';
    this.wheel = 0;                // accumulated wheel delta (photo mode zoom)
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, down: false };
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); return; }
      this.down.add(e.code); this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); });
    addEventListener('wheel', (e) => { this.wheel += e.deltaY; }, { passive: true });
    dom.addEventListener('mousemove', (e) => {
      this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0;
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    dom.addEventListener('mousedown', () => (this.mouse.down = true));
    addEventListener('mouseup', () => (this.mouse.down = false));
    addEventListener('gamepadconnected', (e) => { this.gamepadIndex = e.gamepad.index; this.toastPad && this.toastPad(true); });
    addEventListener('gamepaddisconnected', () => { this.gamepadIndex = -1; });
  }

  held(action) {
    if (!this.enabled) return false;
    const codes = KEYMAP[action];
    if (!codes) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }
  tapped(action) {
    const codes = KEYMAP[action];
    if (!codes) return false;
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }
  consumeTaps() { this.pressed.clear(); }

  pollGamepad() {
    this.pad = null;
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
    if (pads && pads.length) {
      // pick the first connected pad (prefer last known index)
      const cand = this.gamepadIndex >= 0 ? pads[this.gamepadIndex] : null;
      const p = cand && cand.connected ? cand : [...pads].find((x) => x && x.connected);
      if (p) { this.gamepadIndex = p.index; this.pad = p; }
    }
    const connected = !!this.pad;
    if (connected !== this._padWas) {
      this._padWas = connected;
      if (this.onPadChange) this.onPadChange(connected, this.pad ? this.pad.id : '');
    }
    return connected;
  }
  _edge(bit, code) {
    if (bit && !this._padPrev[code]) this.pressed.add(code);
    this._padPrev[code] = bit;
  }

// returns smoothed control state for the vehicle
  update(dt) {
    this.pollGamepad();
    const p = this.pad;
    let thr = 0, brk = 0, steer = 0, hb = false, boost = false;

    if (this.enabled) {
      if (this.held('throttle')) thr += 1;
      if (this.held('brake')) brk += 1;
      if (this.held('left')) steer -= 1;
      if (this.held('right')) steer += 1;
      if (this.held('handbrake') || this.held('handbrake2')) hb = true;
      if (this.held('boost')) boost = true;
    }
    if (p) {
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const bv = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const ax = (i) => { const v = p.axes[i] || 0; return Math.abs(v) > 0.14 ? v : 0; };
      // throttle: right trigger (or A)
      thr = Math.max(thr, bv(7), b(0) ? 1 : 0);
      // brake / reverse: left trigger (or B)
      brk = Math.max(brk, bv(6), b(1) ? 1 : 0);
      // steer: left stick + d-pad
      steer += ax(0);
      if (b(14)) steer -= 1;
      if (b(15)) steer += 1;
      // X = handbrake / drift
      if (b(2)) hb = true;
      // RB = nitro
      if (b(5)) boost = true;
      // edges: Start=pause, Select=photo, Y / R3 = camera
      this._padPrev = this._padPrev || {};
      this._edge(b(9), 'Escape');
      this._edge(b(8), 'F1');
      this._edge(b(3), 'KeyC');
      this._edge(b(11), 'KeyC');
    }
    this.steerRaw = clamp(steer, -1, 1);
    const rate = this.steerRaw === 0 ? 9 : 6.5;
    this.steer = damp(this.steer, this.steerRaw, rate, dt);
    if (Math.abs(this.steer) < 0.002) this.steer = 0;
    this.throttle = damp(this.throttle, clamp(thr, 0, 1), 14, dt);
    this.brake = damp(this.brake, clamp(brk, 0, 1), 14, dt);
    this.handbrake = hb;
    this.boost = boost;
    const w = this.wheel; this.wheel = 0;
    const mdx = this.mouse.dx, mdy = this.mouse.dy;
    this.mouse.dx = 0; this.mouse.dy = 0;
    return { wheelDelta: w, mouseDX: mdx, mouseDY: mdy };
  }
}

export const Input = new InputManager(document.getElementById('app') || document.body);
export default Input;
