// ============================================================================
// APEX HORIZON — in-race HUD: analog cluster, minimap, standings, toasts
// ============================================================================
import { clamp, lerp, fmtTime, fmtGap } from '../core/math.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      root: $('hud'), speedo: $('speedo'), minimap: $('minimap'),
      gear: $('gear-indicator'), odoSpeed: $('odo-speed'), odoUnit: $('odo-unit'),
      rcPos: $('rc-pos'), rcLap: $('rc-lap'), rcCur: $('rc-cur'), rcLast: $('rc-last'),
      rcBest: $('rc-best'), rcTotal: $('rc-total'),
      standings: $('standings'), boostFill: $('boost-fill'),
      countdown: $('countdown'), bigmsg: $('bigmsg'), bigMain: $('bigmsg-main'), bigSub: $('bigmsg-sub'),
      wrongway: $('wrongway'), toasts: $('toast-stack'), driftPop: $('drift-pop'),
      driftScore: $('drift-pop-score'), driftMult: $('drift-pop-mult'),
      eventName: $('hud-event-name'), eventSub: $('hud-event-sub'),
      roamStats: $('roam-stats'), rsTrap: $('rs-trap'), rsDrift: $('rs-drift'), rsAir: $('rs-air'), rsScore: $('rs-score'),
      mmPlace: $('mm-place'), mmDist: $('mm-dist'),
      assistStrip: $('assist-strip'),
      credits: $('hud2-credits'), level: $('hud2-level'),
      speedLines: $('speed-lines'),
    };
    this.sctx = this.el.speedo.getContext('2d');
    this.mctx = this.el.minimap.getContext('2d');
    this.visible = true;
    this.needle = 0;
    this._toastTimers = [];
    this.mapData = null;      // {poly:[x,z...], activities:[], bounds}
    this.units = 'kmh';
  }

  show(on) { this.visible = on; this.el.root.classList.toggle('hidden', !on); }
  setEvent(name, sub) { this.el.eventName.textContent = name; this.el.eventSub.textContent = sub; }
  setRoamMode(on) {
    this.el.roamStats.style.display = on ? 'flex' : 'none';
    this.el.standings.style.display = on ? 'none' : 'flex';
    document.querySelector('.race-clock').style.display = on ? 'none' : 'block';
  }
  setUnits(u) { this.units = u; this.el.odoUnit.textContent = u === 'kmh' ? 'KM/H' : 'MPH'; }

  toast(text, icon = 'i-star', cls = '') {
    const t = document.createElement('div');
    t.className = `toast ${cls}`;
    t.innerHTML = `<img src="assets/icons/${icon}.png" alt=""><span>${text}</span>`;
    this.el.toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 420); }, 3200);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }
  bigMessage(main, sub = '', ms = 1800) {
    this.el.bigMain.textContent = main;
    this.el.bigSub.textContent = sub;
    this.el.bigmsg.classList.remove('hidden');
    clearTimeout(this._bm);
    if (ms > 0) this._bm = setTimeout(() => this.el.bigmsg.classList.add('hidden'), ms);
  }
  countdown(txt, go = false) {
    if (txt == null) { this.el.countdown.classList.add('hidden'); return; }
    this.el.countdown.textContent = txt;
    this.el.countdown.classList.toggle('go', go);
    this.el.countdown.classList.remove('hidden');
    // restart animation
    this.el.countdown.style.animation = 'none';
    void this.el.countdown.offsetWidth;
    this.el.countdown.style.animation = '';
  }
  wrongWay(on) { this.el.wrongway.classList.toggle('hidden', !on); }
  driftPop(score, mult, on) {
    this.el.driftPop.classList.toggle('hidden', !on);
    if (on) { this.el.driftScore.textContent = Math.round(score).toLocaleString('en-US'); this.el.driftMult.textContent = `x${mult.toFixed(1)}`; }
  }
  assists(a) {
    const items = [
      ['ABS', a.abs], ['TCS', a.tcs], ['STM', a.stm], ['LINE', a.racingLine],
    ];
    this.el.assistStrip.innerHTML = items.map(([k, on]) => `<i class="${on ? 'act' : ''}">${k}</i>`).join('');
  }

  // ------------------------------------------------------------------ draw
  update(dt, s) {
    if (!this.visible) return;
    const spd = this.units === 'kmh' ? s.speedKmh : s.speedKmh * 0.621371;
    this.el.odoSpeed.textContent = Math.round(spd);
    this.el.gear.textContent = s.gearLabel;
    this.el.gear.classList.toggle('rev', s.gearLabel === 'R');
    this.el.boostFill.style.width = `${(s.boost * 100).toFixed(1)}%`;
    this.el.boostFill.classList.toggle('empty', s.boost < 0.05);
    if (s.mode === 'race') {
      this.el.rcPos.innerHTML = `${s.position}<em>/${s.totalCars}</em>`;
      this.el.rcLap.innerHTML = `${Math.min(s.lap, s.laps)}<em>/${s.laps}</em>`;
      this.el.rcCur.textContent = fmtTime(s.curLap);
      this.el.rcLast.textContent = fmtTime(s.lastLap);
      this.el.rcBest.textContent = fmtTime(s.bestLap);
      this.el.rcBest.classList.toggle('purple', !!s.bestIsSession);
      this.el.rcTotal.textContent = fmtTime(s.total);
      if (s.standings) this.drawStandings(s.standings);
    }
    if (s.mode === 'roam') {
      this.el.rsTrap.textContent = s.roam.traps;
      this.el.rsDrift.textContent = Math.round(s.roam.drift).toLocaleString('en-US');
      this.el.rsAir.textContent = s.roam.air.toFixed(1) + 's';
      this.el.rsScore.textContent = Math.round(s.roam.score).toLocaleString('en-US');
    }
    // speed lines
    const sl = clamp((s.speedKmh - 190) / 160, 0, 0.85);
    this.el.speedLines.style.opacity = sl.toFixed(2);

    this.drawSpeedo(dt, s);
    this.drawMinimap(s);
  }

  drawStandings(rows) {
    const html = rows.map((r, i) =>
      `<div class="st-row ${r.you ? 'you' : ''}"><b>${i + 1}</b><span>${r.name}</span><i>${r.gap}</i></div>`).join('');
    if (html !== this._stHtml) { this.el.standings.innerHTML = html; this._stHtml = html; }
  }

  drawSpeedo(dt, s) {
    const c = this.sctx, W = 440, H = 440, cx = W / 2, cy = H / 2 + 12;
    c.clearRect(0, 0, W, H);
    const maxV = this.units === 'kmh' ? 360 : 225;
    const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
    const R = 176;

    // outer glass ring
    c.save();
    const rg = c.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.12);
    rg.addColorStop(0, 'rgba(8,14,26,0)');
    rg.addColorStop(0.82, 'rgba(8,14,26,0.55)');
    rg.addColorStop(1, 'rgba(8,14,26,0.0)');
    c.fillStyle = rg;
    c.beginPath(); c.arc(cx, cy, R * 1.12, 0, Math.PI * 2); c.fill();
    c.restore();

    // tacho arc (rpm) — inner band
    const tR = R - 46;
    c.lineWidth = 14;
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath(); c.arc(cx, cy, tR, a0, a1); c.stroke();
    const rpmT = a0 + (a1 - a0) * clamp(s.rpm01, 0, 1);
    const grad = c.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0, '#22e1ff'); grad.addColorStop(0.7, '#9dff3c'); grad.addColorStop(1, '#ff2e93');
    c.strokeStyle = grad;
    c.shadowColor = 'rgba(34,225,255,0.7)'; c.shadowBlur = 14;
    c.beginPath(); c.arc(cx, cy, tR, a0, rpmT); c.stroke();
    c.shadowBlur = 0;
    // redline zone
    c.strokeStyle = 'rgba(255,59,48,0.85)';
    c.lineWidth = 5;
    c.beginPath(); c.arc(cx, cy, tR + 12, a0 + (a1 - a0) * 0.82, a1); c.stroke();

    // speed scale ticks
    const steps = this.units === 'kmh' ? 12 : 11;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, a = a0 + (a1 - a0) * t;
      const major = i % 2 === 0;
      const r0 = R - 8, r1 = R - (major ? 30 : 20);
      c.strokeStyle = major ? 'rgba(230,240,255,0.85)' : 'rgba(230,240,255,0.35)';
      c.lineWidth = major ? 4 : 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.stroke();
      if (major) {
        c.fillStyle = 'rgba(200,220,250,0.75)';
        c.font = '600 21px "DejaVu Sans Mono", monospace';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        const rr = R - 48;
        c.fillText(String(Math.round(maxV * t)), cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
    }

    // needle (smoothed)
    this.needle = lerp(this.needle, clamp(s.speedKmh * (this.units === 'kmh' ? 1 : 0.621371) / maxV, 0, 1), 1 - Math.exp(-14 * dt));
    const na = a0 + (a1 - a0) * this.needle;
    c.save();
    c.translate(cx, cy); c.rotate(na);
    const ng = c.createLinearGradient(0, 0, R - 26, 0);
    ng.addColorStop(0, 'rgba(255,46,147,0.2)'); ng.addColorStop(1, '#ff2e93');
    c.strokeStyle = ng; c.lineWidth = 6; c.lineCap = 'round';
    c.shadowColor = 'rgba(255,46,147,0.8)'; c.shadowBlur = 12;
    c.beginPath(); c.moveTo(-26, 0); c.lineTo(R - 30, 0); c.stroke();
    c.restore();
    c.shadowBlur = 0;
    // hub
    c.fillStyle = '#0b1220';
    c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(34,225,255,0.6)'; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.stroke();

    // boost segments around hub
    for (let i = 0; i < 10; i++) {
      const a = a0 + (a1 - a0) * (i / 10);
      const on = s.boost > i / 10;
      c.strokeStyle = on ? 'rgba(34,225,255,0.9)' : 'rgba(255,255,255,0.1)';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(cx, cy, 34, a + 0.02, a + (a1 - a0) / 10 - 0.04);
      c.stroke();
    }
  }

  setMapData(data) { this.mapData = data; }

  drawMinimap(s) {
    const c = this.mctx, W = 340, H = 340;
    c.clearRect(0, 0, W, H);
    if (!this.mapData) return;
    const { poly, bounds } = this.mapData;
    const cx = W / 2, cy = H / 2;
    const scale = (W * 0.82) / bounds;
    const px = s.px, pz = s.pz, heading = s.heading;

    c.save();
    c.translate(cx, cy);
    c.rotate(-heading);
    c.translate(-px * scale, -pz * scale);

    // track ribbon
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = 'rgba(10,16,28,0.85)'; c.lineWidth = 15;
    c.beginPath();
    for (let i = 0; i < poly.length; i += 2) { const x = poly[i] * scale, z = poly[i + 1] * scale; i ? c.lineTo(x, z) : c.moveTo(x, z); }
    if (this.mapData.closed) c.closePath();
    c.stroke();
    c.strokeStyle = 'rgba(34,225,255,0.85)'; c.lineWidth = 5;
    c.stroke();

    // activities
    if (s.mode === 'roam') {
      for (const a of this.mapData.activities) {
        const col = a.type === 'trap' ? '#ffb020' : a.type === 'drift' ? '#ff2e93' : '#9dff3c';
        c.fillStyle = col;
        c.beginPath(); c.arc(a.x * scale, a.z * scale, 6, 0, Math.PI * 2); c.fill();
      }
    }
    // checkpoints
    if (s.mode === 'race' && this.mapData.checkpoints) {
      this.mapData.checkpoints.forEach((cp, i) => {
        c.fillStyle = i === s.nextCp ? '#9dff3c' : 'rgba(255,255,255,0.5)';
        c.beginPath(); c.arc(cp.x * scale, cp.z * scale, i === s.nextCp ? 7 : 4, 0, Math.PI * 2); c.fill();
      });
    }
    // rivals
    if (s.rivals) {
      for (const r of s.rivals) {
        c.fillStyle = r.color;
        c.beginPath(); c.arc(r.x * scale, r.z * scale, 6.5, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();

    // player arrow (always up)
    c.save();
    c.translate(cx, cy);
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(34,225,255,0.9)'; c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(0, -13); c.lineTo(9, 10); c.lineTo(0, 5); c.lineTo(-9, 10); c.closePath();
    c.fill(); c.stroke();
    c.restore();

    // ring
    c.strokeStyle = 'rgba(34,225,255,0.25)'; c.lineWidth = 2;
    c.beginPath(); c.arc(cx, cy, W * 0.47, 0, Math.PI * 2); c.stroke();
  }
}
