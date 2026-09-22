// ============================================================================
// APEX HORIZON — AI rivals: curvature-based speed targets + pure pursuit
// ============================================================================
import { clamp, lerp, damp, wrapAngle } from '../core/math.js';

export class AIDriver {
  constructor(world, skill = 0.8, aggression = 0.5) {
    this.world = world;
    this.skill = skill;
    this.aggression = aggression;
    const pts = world.main.points;
    this.n = pts.length / 2;
    this.spacing = 5;
    this.curv = new Float32Array(this.n);
    this.targetSpeed = new Float32Array(this.n);
    this.s = new Float32Array(this.n);
    // curvature from three consecutive samples
    for (let i = 0; i < this.n; i++) {
      const a = (i - 4 + this.n) % this.n, b = i, c = (i + 4) % this.n;
      const ax = pts[a * 2], az = pts[a * 2 + 1];
      const bx = pts[b * 2], bz = pts[b * 2 + 1];
      const cx = pts[c * 2], cz = pts[c * 2 + 1];
      const la = Math.hypot(bx - ax, bz - az), lb = Math.hypot(cx - bx, cz - bz), lc = Math.hypot(cx - ax, cz - az);
      const area = Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2;
      const R = (la * lb * lc) / (4 * area + 1e-6);
      this.curv[i] = 1 / Math.max(R, 4);
    }
    // smooth curvature
    for (let pass = 0; pass < 3; pass++) {
      const copy = this.curv.slice();
      for (let i = 0; i < this.n; i++) {
        this.curv[i] = (copy[(i - 2 + this.n) % this.n] + copy[(i - 1 + this.n) % this.n] + copy[i] + copy[(i + 1) % this.n] + copy[(i + 2) % this.n]) / 5;
      }
    }
    const latAccel = 11.5 * skill;
    for (let i = 0; i < this.n; i++) {
      this.targetSpeed[i] = clamp(Math.sqrt(latAccel / Math.max(this.curv[i], 1e-4)), 16, 96);
    }
    // lookahead smoothing of target speed (braking distance)
    for (let pass = 0; pass < 2; pass++) {
      const copy = this.targetSpeed.slice();
      for (let i = this.n - 1; i >= 0; i--) {
        const ahead = (i + 6) % this.n;
        const brakeDist = (copy[i] ** 2 - copy[ahead] ** 2) / (2 * 10.5);
        if (brakeDist > 0) this.targetSpeed[i] = Math.min(this.targetSpeed[i], copy[ahead] + 10.5 * (6 * this.spacing) / Math.max(copy[i], 8));
      }
    }
    let acc = 0;
    for (let i = 0; i < this.n; i++) { this.s[i] = acc; acc += this.spacing; }
    this.trackLen = acc;
    this.laneOffset = (Math.random() - 0.5) * 3.2;
    this.hint = 0;
  }

  nearest(x, z) {
    const pts = this.world.main.points;
    let best = this.hint, bestD = Infinity;
    for (let k = -30; k <= 30; k++) {
      const i = ((this.hint + k) % this.n + this.n) % this.n;
      const dx = pts[i * 2] - x, dz = pts[i * 2 + 1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    this.hint = best;
    return best;
  }

  progress(x, z) {
    const i = this.nearest(x, z);
    return this.s[i];
  }

  update(dt, vehicle, playerProgress = null, difficulty = 1) {
    const pts = this.world.main.points;
    const i = this.nearest(vehicle.pos.x, vehicle.pos.z);
    const speed = vehicle.speed || 0;
    // rubber band
    let rb = 1;
    if (playerProgress != null) {
      let gap = playerProgress - this.s[i];
      gap = ((gap % this.trackLen) + this.trackLen * 1.5) % this.trackLen - this.trackLen * 0.5;
      rb = clamp(1 + gap / 900 * 0.16 * difficulty, 0.86, 1.16);
    }
    const tgt = this.targetSpeed[i] * rb * (0.92 + this.skill * 0.14);

    // pure pursuit
    const look = clamp(8 + speed * 0.42, 10, 46);
    const li = (i + Math.round(look / this.spacing)) % this.n;
    const tx = pts[li * 2], tz = pts[li * 2 + 1];
    // lane offset perpendicular
    const li2 = (li + 2) % this.n;
    const dx = pts[li2 * 2] - tx, dz = pts[li2 * 2 + 1] - tz;
    const dl = Math.hypot(dx, dz) || 1;
    const nx = -dz / dl, nz = dx / dl;
    const px = tx + nx * this.laneOffset, pz = tz + nz * this.laneOffset;

    const desired = Math.atan2(px - vehicle.pos.x, pz - vehicle.pos.z);
    let err = wrapAngle(desired - vehicle.yaw);
    const steer = clamp(err * 2.1 - vehicle.yawRate * 0.32, -1, 1);

    const speedErr = tgt - speed;
    let throttle = clamp(speedErr * 0.35, 0, 1);
    let brake = clamp(-speedErr * 0.22, 0, 1);
    // ease off when cornering hard at speed
    if (Math.abs(err) > 0.5) throttle *= 0.4;
    const input = { throttle, brake, steer, handbrake: false, boost: false };
    if (speed > tgt * 1.25 && this.curv[i] > 0.012) input.boost = false;
    else if (speed < tgt * 0.7 && this.curv[i] < 0.004) input.boost = Math.random() < 0.4;
    return input;
  }
}
