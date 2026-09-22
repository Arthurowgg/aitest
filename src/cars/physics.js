// ============================================================================
// APEX HORIZON — arcade-simulation vehicle dynamics
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, damp, wrapAngle } from '../core/math.js';

const G = 9.81;

export class Vehicle {
  constructor(carSpec, stats, world) {
    this.car = carSpec;
    this.stats = stats;
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.yawRate = 0;
    this.pitch = 0; this.roll = 0;
    this.wheelSpeed = 0;
    this.gear = 1;
    this.rpm = carSpec.engine.idle || 800;
    this.rpm01 = 0.1;
    this.boostMeter = 1;
    this.boosting = false;
    this.airborne = 0;
    this.grounded = true;
    this.slip = 0;
    this.offroad = false;
    this.steerVisual = 0;
    this.suspendY = 0;
    this.braking = false;
    this.drifting = false;
    this.wrongWay = false;
    this.collideCooldown = 0;
    this.groundY = 0;
    this.speed = 0;
    this.speedKmh = 0;
    this._f = new THREE.Vector3(); this._r = new THREE.Vector3();
    this.ratios = this.buildRatios(carSpec.engine.gears || 6);
  }

  buildRatios(n) {
    if (this.car.engine.electric) return [0.11];
    const top = 0.72, first = 3.4 + n * 0.12;
    const r = [];
    for (let i = 0; i < n; i++) r.push(lerp(first, top, Math.pow(i / (n - 1), 1.15)));
    return r;
  }

  reset(x, z, angle, y) {
    this.pos.set(x, (y ?? this.world.heightAt(x, z)) + 0.3, z);
    this.vel.set(0, 0, 0);
    this.yaw = angle;
    this.yawRate = 0;
    this.gear = 1; this.wheelSpeed = 0;
    this.pitch = this.roll = 0;
    this.boostMeter = 1;
  }

  forward(out) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  right(out) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  step(dt, input, opts = {}) {
    const st = this.stats, car = this.car;
    const f = this.forward(this._f), r = this.right(this._r);
    let vF = this.vel.dot(f), vR = this.vel.dot(r), vY = this.vel.y;

    // ---------- ground sampling ----------
    const wl = car.body.wheelbase / 2, wt = car.body.width / 2;
    const corners = [
      [f.x * wl + r.x * wt, f.z * wl + r.z * wt], [f.x * wl - r.x * wt, f.z * wl - r.z * wt],
      [-f.x * wl + r.x * wt, -f.z * wl + r.z * wt], [-f.x * wl - r.x * wt, -f.z * wl - r.z * wt],
    ];
    let hSum = 0, hs = [];
    for (const c of corners) {
      const h = this.world.heightAt(this.pos.x + c[0], this.pos.z + c[1]);
      hs.push(h); hSum += h;
    }
    const groundH = hSum / 4 + 0.28;
    const ride = this.pos.y - groundH;
    this.grounded = ride < 0.32 && vY <= 6;
    this.airborne = damp(this.airborne, this.grounded ? 0 : clamp(ride / 2.2, 0, 1), 6, dt);

    const info = this.world.roadInfoAt(this.pos.x, this.pos.z);
    this.offroad = !info.onRoad && !info.shoulder;
    const surfaceGrip = this.offroad ? 0.72 : (opts.wet ? 0.9 : 1.0);

    // ---------- engine / drivetrain ----------
    const wheelR = 0.36;
    const speedAbs = Math.abs(vF);
    // rpm & gears
    if (car.engine.electric) {
      this.gear = 1;
      this.rpm = 800 + speedAbs * 260;
    } else {
      if (opts.autoGear !== false) {
        const rw = speedAbs / wheelR;
        let rpmCur = rw * this.ratios[this.gear - 1] * 9.5 * 60 / (2 * Math.PI);
        if (this.gear < this.ratios.length && rpmCur > car.engine.redline * 0.94) this.gear++;
        else if (this.gear > 1 && rpmCur < car.engine.redline * 0.42) this.gear--;
      }
      const rw2 = speedAbs / wheelR;
      this.rpm = clamp(rw2 * this.ratios[this.gear - 1] * 9.5 * 60 / (2 * Math.PI), car.engine.idle, car.engine.redline * 1.04);
      if (input.throttle > 0.5 && speedAbs < 3) this.rpm = lerp(this.rpm, car.engine.redline * 0.55, 0.4);
    }
    this.rpm01 = clamp((this.rpm - (car.engine.idle || 600)) / ((car.engine.redline || 8000) - (car.engine.idle || 600)), 0, 1);

    // torque curve
    const x = this.rpm01;
    const tq = car.engine.electric ? 1.0 : clamp(0.62 + 0.85 * x - 0.5 * x * x, 0.35, 1.05);
    let throttle = input.throttle;
    // traction control
    if (opts.tcs && this.slip > 0.55 && throttle > 0.3) throttle *= 0.55;

    const powerW = st.power * 745.7;
    let engineF = (powerW * tq * throttle) / Math.max(speedAbs, 6);
    const tractionLimit = st.grip * surfaceGrip * st.mass * G * (car.drivetrain === 'awd' ? 1.05 : 0.92);
    engineF = Math.min(engineF, tractionLimit);

    // nitro
    this.boosting = false;
    if (input.boost && this.boostMeter > 0.02 && throttle > 0.2) {
      this.boosting = true;
      engineF += st.mass * 6.5;
      this.boostMeter = clamp(this.boostMeter - dt * 0.34, 0, 1);
    } else {
      this.boostMeter = clamp(this.boostMeter + dt * 0.055, 0, 1);
    }

    // braking / reverse
    let brakeF = 0;
    this.braking = input.brake > 0.05;
    this._brakeHold = input.brake > 0.5 ? (this._brakeHold || 0) + dt : 0;
    if (input.brake > 0.05) {
      if (vF > 0.6) {
        brakeF = st.brake * st.mass * G * 1.05 * input.brake;
        if (opts.abs) brakeF *= 0.92 + 0.08 * Math.sin(performance.now() * 0.04);  // ABS pulse
      } else if (this._brakeHold > 0.55 && vF > -8.5) {
        engineF = -st.power * 745.7 * 0.30 * input.brake / Math.max(speedAbs, 6);  // reverse
        engineF = Math.max(engineF, -tractionLimit * 0.35);
      }
    }

    // resistances
    const dragC = powerW / Math.pow(st.top / 3.6, 3);
    const drag = dragC * vF * Math.abs(vF);
    const roll = st.mass * G * (this.offroad ? 0.055 : 0.016);
    const airBrake = this.airborne > 0.4 ? 0 : 1;

    let aF = (engineF - Math.sign(vF) * brakeF - drag - Math.sign(vF) * roll * airBrake) / st.mass;
    if (this.airborne > 0.5) aF = (engineF * 0.25 - drag) / st.mass;
    vF += aF * dt;

    // ---------- lateral / yaw ----------
    const maxSteer = 0.52 * (1 - clamp(speedAbs / 260, 0, 0.62));
    let steer = input.steer;
    if (opts.stm && Math.abs(this.slip) > 0.75 && !input.handbrake) steer *= 0.7;
    this.steerVisual = damp(this.steerVisual, steer * maxSteer, 9, dt);

    const gripLat = st.grip * surfaceGrip * (input.handbrake ? 0.42 : 1.0);
    const slipAngle = Math.atan2(vR, Math.abs(vF) + 3);
    const maxLat = gripLat * G * 1.06;
    const latF = -maxLat * Math.tanh(slipAngle * 2.9);
    let aR = latF;
    if (this.airborne > 0.5) aR = -vR * 1.2;
    vR += aR * dt;
    vR *= Math.exp(-(input.handbrake ? 1.1 : gripLat * 3.4) * dt);

    // yaw dynamics
    const desiredYaw = (vF / car.body.wheelbase) * Math.tan(this.steerVisual) / (1 + Math.pow(speedAbs / 46, 2));
    let yawTarget = desiredYaw;
    if (input.handbrake && speedAbs > 6) yawTarget = desiredYaw * 1.9 + Math.sign(steer || 0.001) * 0.5;
    if (this.airborne > 0.5) yawTarget = this.yawRate;
    this.yawRate = damp(this.yawRate, yawTarget, input.handbrake ? 3.4 : 7.5, dt);
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);

    this.slip = clamp(Math.abs(slipAngle) * 2.4 + (input.handbrake && speedAbs > 8 ? 0.5 : 0), 0, 1.4);
    this.drifting = this.slip > 0.42 && speedAbs > 9;

    // ---------- vertical ----------
    if (this.grounded) {
      vY = damp(vY, 0, 14, dt);
      this.pos.y = damp(this.pos.y, groundH, 16, dt);
    } else {
      vY -= G * dt;
      this.pos.y += vY * dt;
      if (this.pos.y < groundH) { this.pos.y = groundH; vY = Math.max(0, -vY * 0.18); this.grounded = true; }
    }
    // pitch/roll visuals from corner heights
    const pitchT = Math.atan2((hs[0] + hs[1]) / 2 - (hs[2] + hs[3]) / 2, car.body.wheelbase);
    const rollT = Math.atan2((hs[1] + hs[3]) / 2 - (hs[0] + hs[2]) / 2, car.body.width);
    const rollDyn = clamp(-this.yawRate * speedAbs * 0.0016, -0.16, 0.16);
    const pitchDyn = clamp(-aF * 0.0035, -0.06, 0.075);
    this.pitch = damp(this.pitch, pitchT + pitchDyn, 7, dt);
    this.roll = damp(this.roll, rollT + rollDyn, 7, dt);
    this.suspendY = damp(this.suspendY, (this.grounded ? 0 : -0.05), 8, dt);

    // ---------- integrate ----------
    this.vel.copy(f).multiplyScalar(vF).addScaledVector(r, vR);
    this.vel.y = vY;
    this.pos.addScaledVector(this.vel, dt);
    this.wheelSpeed = damp(this.wheelSpeed, vF + (input.throttle > 0.6 && this.slip > 0.5 ? 3 : 0), 12, dt);

    // ---------- world bounds ----------
    const lim = this.world.fields.size / 2 - 24;
    if (Math.abs(this.pos.x) > lim) { this.pos.x = Math.sign(this.pos.x) * lim; this.vel.x *= -0.25; }
    if (Math.abs(this.pos.z) > lim) { this.pos.z = Math.sign(this.pos.z) * lim; this.vel.z *= -0.25; }
    // water: keep out of the sea
    if (this.pos.y < this.world.fields.sea + 0.4) {
      this.pos.y = this.world.fields.sea + 0.4;
      this.vel.multiplyScalar(0.86);
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.speedKmh = this.speed * 3.6;
    return this;
  }

  // simple sphere collision resolution against another vehicle
  collide(other) {
    const dx = this.pos.x - other.pos.x, dz = this.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    const min = 2.35;
    if (d > min || d < 1e-4) return 0;
    const nx = dx / d, nz = dz / d;
    const push = (min - d) * 0.5;
    this.pos.x += nx * push; this.pos.z += nz * push;
    other.pos.x -= nx * push; other.pos.z -= nz * push;
    const rel = (this.vel.x - other.vel.x) * nx + (this.vel.z - other.vel.z) * nz;
    if (rel < 0) {
      const j = -rel * 0.7;
      this.vel.x += nx * j; this.vel.z += nz * j;
      other.vel.x -= nx * j; other.vel.z -= nz * j;
      return Math.abs(rel);
    }
    return 0;
  }

  get stateForModel() {
    return {
      wheelSpeed: this.wheelSpeed, steerVisual: this.steerVisual,
      pitch: this.pitch, roll: this.roll, suspendY: this.suspendY,
      airborne: this.airborne, braking: this.braking,
    };
  }
}
