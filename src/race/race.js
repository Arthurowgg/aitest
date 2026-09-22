// ============================================================================
// APEX HORIZON — race session & free-roam session logic
// ============================================================================
import * as THREE from 'three';
import { clamp, lerp, damp, fmtTime, fmtGap, wrapAngle } from '../core/math.js';
import Save from '../core/save.js';

const ZERO_INPUT = { throttle: 0, brake: 0.9, steer: 0, handbrake: false, boost: false };

export class RaceSession {
  constructor(opts) {
    const { world, event, cars, difficulty = 1, laps = 3, assists, wet } = opts;
    this.world = world;
    this.event = event;
    this.laps = laps;
    this.difficulty = difficulty;
    this.assists = assists;
    this.wet = wet;
    this.cars = cars;                 // [{vehicle, model, driver, name, color, you}]
    this.state = 'countdown';
    this.countdown = 3.999;
    this.time = 0;
    this.finished = false;
    this.results = null;
    cars.forEach((c, i) => {
      c.lap = 1; c.cp = 0; c.progress = 0; c.lastCpS = 0;
      c.lapStart = 0; c.lastLap = null; c.bestLap = null; c.total = 0;
      c.finished = false; c.finishTime = null; c.hint = 0; c.wrong = 0;
    });
    this.cps = world.checkpoints;
  }

  get playerCar() { return this.cars.find((c) => c.you); }

  update(dt, playerInput, hud) {
    this.time += dt;
    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (n !== this._lastCd && n > 0) { hud.countdown(String(n)); this._cdSnd && this._cdSnd(false); }
      if (this.countdown <= 0 && this.state === 'countdown') {
        this.state = 'racing';
        hud.countdown('GO', true);
        this._cdSnd && this._cdSnd(true);
        hud.bigMessage('GO!', '', 900);
        setTimeout(() => hud.countdown(null), 900);
      }
      this._lastCd = n;
    }
    const racing = this.state === 'racing';

    for (const c of this.cars) {
      const input = c.you ? (racing ? playerInput : ZERO_INPUT) : (racing ? c.driver.update(dt, c.vehicle, this.playerCar.progress, this.difficulty) : ZERO_INPUT);
      c.vehicle.step(dt, input, { ...this.assists, wet: this.wet, autoGear: c.you ? this.assists.autoGear : true });
      c.model.position.copy(c.vehicle.pos);
      c.model.rotation.y = c.vehicle.yaw;
      c.model.userData.update(dt, c.vehicle.stateForModel);
      this.trackProgress(c, dt);
      if (c.lap > this.laps && !c.finished) { c.finished = true; c.finishTime = this.time; }
    }

    // collisions
    for (let i = 0; i < this.cars.length; i++)
      for (let j = i + 1; j < this.cars.length; j++) {
        const hit = this.cars[i].vehicle.collide(this.cars[j].vehicle);
        if (hit > 4 && (this.cars[i].you || this.cars[j].you)) this.onImpact && this.onImpact(hit * 0.1);
      }

    // player finish
    const p = this.playerCar;
    if (racing && !this.finished && p.lap > this.laps) {
      this.finished = true;
      this.state = 'finished';
      p.finishTime = this.time;
      // let AI finish or snapshot
      const rows = this.standings().map((c, i) => c);
      this.results = this.buildResults();
    }
    return this;
  }

  trackProgress(c, dt) {
    const w = this.world;
    const near = w.trackProgress(c.vehicle.pos.x, c.vehicle.pos.z, c.hint);
    c.hint = near.index;
    const prevS = c.progress;
    c.progress = near.s;
    c.distToTrack = near.dist;

    // checkpoint gate pass
    const cp = this.cps[c.cp];
    if (cp) {
      const d = Math.hypot(c.vehicle.pos.x - cp.x, c.vehicle.pos.z - cp.z);
      if (d < w.main.halfWidth + 8 && near.s > cp.s - 12 && near.s < cp.s + 30) {
        c.cp++;
        if (c.cp >= this.cps.length) {
          c.cp = 0;
          const lapTime = (this.time - c.lapStart) * 1000;
          c.lapStart = this.time;
          if (c.lap >= 1) {
            c.lastLap = lapTime;
            if (c.bestLap == null || lapTime < c.bestLap) c.bestLap = lapTime;
          }
          c.lap++;
          if (c.you) this.onLap && this.onLap(c.lap, lapTime);
        } else if (c.you) {
          this.onCheckpoint && this.onCheckpoint(c.cp);
        }
      }
    }
    // wrong way (player only)
    if (c.you) {
      const pts = w.main.points, n = pts.length / 2;
      const i = near.index, b = (i + 2) % n;
      const tx = pts[b * 2] - pts[i * 2], tz = pts[b * 2 + 1] - pts[i * 2 + 1];
      const dot = c.vehicle.vel.x * tx + c.vehicle.vel.z * tz;
      if (dot < -40 && c.vehicle.speed > 8) c.wrong += dt; else c.wrong = Math.max(0, c.wrong - dt * 2);
      c.wrongWay = c.wrong > 1.2;
    }
  }

  standings() {
    const arr = this.cars.slice();
    arr.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      const la = (a.lap - 1) * 100000 + a.progress + a.cp * 0.001;
      const lb = (b.lap - 1) * 100000 + b.progress + b.cp * 0.001;
      return lb - la;
    });
    return arr;
  }

  standingsRows() {
    const st = this.standings();
    const leader = st[0];
    return st.map((c, i) => {
      let gap = '—';
      if (i > 0) {
        const d = (leader.lap - c.lap) * this.world.main.length + (leader.progress - c.progress);
        gap = c.finished ? fmtTime(c.finishTime * 1000 - leader.finishTime * 1000) : `${Math.round(Math.abs(d))}m`;
      }
      return { name: c.name, you: !!c.you, gap, car: c };
    });
  }

  buildResults() {
    const st = this.standings();
    const p = this.playerCar;
    const pos = st.indexOf(p) + 1;
    const rows = st.map((c, i) => ({
      pos: i + 1, name: c.name, you: !!c.you,
      time: c.finished ? c.finishTime * 1000 : null,
      best: c.bestLap,
      gap: i === 0 ? null : (st[0].finishTime != null && c.finishTime != null ? (c.finishTime - st[0].finishTime) * 1000 : null),
    }));
    const evReward = this.event?.reward ?? 8000;
    const posFactor = [1, 0.7, 0.52, 0.4, 0.32, 0.26, 0.2, 0.15][Math.min(pos - 1, 7)];
    const credits = Math.round(evReward * posFactor);
    const xp = Math.round((evReward / 12) * posFactor + (pos === 1 ? 250 : 0));
    return { position: pos, rows, credits, xp, time: p.bestLap, playerTotal: p.finishTime ? p.finishTime * 1000 : null };
  }

  hudState() {
    const p = this.playerCar;
    const st = this.standings();
    return {
      mode: 'race',
      position: st.indexOf(p) + 1,
      totalCars: this.cars.length,
      lap: p.lap, laps: this.laps,
      curLap: (this.time - p.lapStart) * 1000,
      lastLap: p.lastLap, bestLap: p.bestLap,
      total: this.time * 1000,
      standings: this.standingsRows(),
      nextCp: p.cp,
    };
  }
}

// ============================================================================
export class RoamSession {
  constructor(world, vehicle, model) {
    this.world = world;
    this.vehicle = vehicle;
    this.model = model;
    this.score = 0;
    this.traps = 0; this.zones = 0; this.jumps = 0;
    this.drift = 0; this.driftBank = 0; this.driftMult = 1;
    this.air = 0; this.airTime = 0; this.airStart = null;
    this.activeTrap = null; this.trapMax = 0;
    this.activeZone = null; this.zoneIdle = 0;
    this.sessionBest = { trap: 0, drift: 0, air: 0 };
  }

  update(dt, hud) {
    const v = this.vehicle, p = v.pos;
    // ---- speed traps
    for (const a of this.world.activities) {
      if (a.type !== 'trap') continue;
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (d < 55) {
        if (this.activeTrap !== a) { this.activeTrap = a; this.trapMax = 0; }
        this.trapMax = Math.max(this.trapMax, v.speedKmh);
      } else if (this.activeTrap === a && d > 70) {
        const val = Math.round(this.trapMax);
        const better = Save.recordActivity(a.id, val, 'max');
        this.traps++;
        Save.bump('traps');
        Save.max('topSpeed', val);
        hud.toast(`${a.name}: ${val} km/h ${better ? '· NEW RECORD!' : ''}`, 'i-speed-c', better ? 'gold' : '');
        hud.chime && hud.chime(better);
        this.score += val * (better ? 3 : 1);
        this.activeTrap = null;
      }
    }
    // ---- drift zones
    let inZone = null;
    for (const a of this.world.activities) {
      if (a.type !== 'drift') continue;
      if (Math.hypot(p.x - a.x, p.z - a.z) < a.r) { inZone = a; break; }
    }
    if (inZone) {
      if (v.drifting) {
        this.drift += v.speed * v.slip * dt * 14 * this.driftMult;
        this.driftMult = Math.min(5, this.driftMult + dt * 0.35);
        this.zoneIdle = 0;
      } else {
        this.zoneIdle += dt;
        this.driftMult = Math.max(1, this.driftMult - dt * 1.4);
      }
      hud.driftPop(this.drift, this.driftMult, this.drift > 40);
      if (this.zoneIdle > 1.4 && this.drift > 60) {
        const val = Math.round(this.drift);
        const better = Save.recordActivity(inZone.id, val, 'max');
        this.zones++;
        Save.bump('zones');
        Save.data.stats.driftScore = (Save.data.stats.driftScore || 0) + val;
        Save.persist();
        this.score += val * (better ? 2 : 1);
        hud.toast(`${inZone.name}: ${val.toLocaleString('en-US')} pts ${better ? '· NEW RECORD!' : ''}`, 'i-drift-m', better ? 'gold' : 'pink');
        this.drift = 0; this.driftMult = 1;
        hud.driftPop(0, 1, false);
      }
    } else {
      if (this.drift > 60) { this.drift = 0; this.driftMult = 1; }
      hud.driftPop(0, 1, false);
    }
    // ---- jumps / airtime
    if (v.airborne > 0.45) {
      if (this.airStart == null) { this.airStart = { t: performance.now(), x: p.x, z: p.z }; this.airTime = 0; }
      this.airTime += dt;
      this.air = Math.max(this.air, this.airTime);
    } else if (this.airStart) {
      const dist = Math.hypot(p.x - this.airStart.x, p.z - this.airStart.z);
      if (this.airTime > 0.55) {
        this.jumps++;
        Save.bump('jumps');
        const better = Save.recordActivity(`${this.world.key}-air`, this.airTime, 'max');
        this.score += Math.round(this.airTime * 400 + dist * 6);
        hud.toast(`AIRTIME ${this.airTime.toFixed(2)}s · ${Math.round(dist)}m ${better ? '· NEW RECORD!' : ''}`, 'i-jump-l', better ? 'gold' : '');
      }
      this.airStart = null;
    }
    // passive score by speed
    this.score += v.speed * dt * 0.6;
    return this;
  }

  hudState() {
    return {
      mode: 'roam',
      roam: { traps: this.traps, drift: this.drift + this.driftBank, air: this.air, score: this.score },
    };
  }
}
