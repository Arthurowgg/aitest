// ============================================================================
// APEX HORIZON — screens, menus & UI wiring
// ============================================================================
import { CARS, CAR_BY_ID, carStats, UPGRADES, PAINT_FINISHES } from '../cars/catalog.js';
import { MAP_DEFS, EVENT_LIST } from '../world/maps.js';
import Save from '../core/save.js';
import Audio from '../core/audio.js';
import Input from '../core/input.js';
import { catmull, clamp, fmtTime, fmtInt } from '../core/math.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => { const d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; };

export class Screens {
  constructor(game) {
    this.g = game;
    this.currentMap = 'city';
    this.currentEvent = EVENT_LIST[0];
    this.roamMap = 'island';
    this.roamSpot = null;
    this.setup = { difficulty: 1, laps: 3, rivals: 5, assists: 'full' };
    this.garageSel = Save.data.active;
    this._polyCache = {};
  }

  // ---------------------------------------------------------------- helpers
  screen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    if (id) $(id).classList.add('active');
  }
  page(id) {
    document.querySelectorAll('.menu-page').forEach((p) => p.classList.remove('active'));
    $(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('is-active', n.dataset.goto === id));
  }
  notify(msg, cls = '') {
    let n = document.getElementById('snack');
    if (!n) {
      n = el('div', `toast ${cls}`);
      n.id = 'snack';
      n.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:1500;pointer-events:none';
      document.getElementById('app').appendChild(n);
    }
    const isErr = cls === 'pink';
    n.className = `toast ${cls}`;
    n.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:1500;pointer-events:auto';
    n.innerHTML = `<img src="assets/icons/${isErr ? 'i-warn' : 'i-gamepad'}.png" alt=""><span>${msg}</span>` +
      (isErr ? `<button class="btn btn--ghost" data-copy-report data-copy-extra="${String(msg).replace(/"/g, '&quot;')}">COPY</button>` : '');
    if (isErr && window.__AH_ERR) { window.__AH_ERR.push('notify', msg); window.__AH_ERR.bindAll(n); }
    clearTimeout(this._snackT);
    this._snackT = setTimeout(() => n.remove(), isErr ? 14000 : 4200);
  }

  async withLoading(fn) {
    const boot = $('screen-boot');
    boot.classList.add('active');
    $('boot-logo').style.display = 'none';
    const t0 = Date.now();
    const watch = setInterval(() => {
      const secs = Math.round((Date.now() - t0) / 1000);
      const st = $('boot-status');
      if (secs > 15) st.textContent = st.textContent.replace(/ · \d+s.*/, '') + ` · ${secs}s`;
      if (secs === 90) this.notify('Still loading — large world. If it never finishes, reload once.', 'pink');
    }, 1000);
    try {
      await fn((f, label) => {
        $('boot-bar-fill').style.width = `${Math.round(f * 100)}%`;
        $('boot-pct').textContent = `${Math.round(f * 100)}%`;
        if (label) $('boot-status').textContent = label;
      });
    } catch (err) {
      console.error('[loading] failed:', err);
      this.notify(`Could not start: ${err && err.message ? err.message : err}`, 'pink');
      this.screen('screen-menu');
      if (this.g.state === 'playing') this.g.state = 'menu';
    } finally {
      clearInterval(watch);
      boot.classList.remove('active');
      $('boot-logo').style.display = '';
    }
  }
  refreshChips() {
    const d = Save.data;
    $('hud-level').textContent = d.level; $('hud2-level').textContent = d.level;
    $('hud-credits').textContent = fmtInt(d.credits); $('hud2-credits').textContent = fmtInt(d.credits);
    const need = Save.xpFor(d.level);
    $('hud-xp-fill').style.width = `${clamp(d.xp / need * 100, 0, 100)}%`;
    $('hud-xp-txt').textContent = `${fmtInt(d.xp)} / ${fmtInt(need)} XP`;
  }

  // ------------------------------------------------------------------ bind
  bind() {
    const g = this.g;
    // title
    $('btn-press').onclick = () => {
      Audio.init(); Audio.resume(); Audio.ui('select');
      if (Save.s.musicOn) Audio.startMusic(0.55);
      this.screen('screen-menu');
      g.state = 'menu';
      this.refreshChips();
      this.page('menu-home');
      this.buildHome();
    };
    // nav
    document.querySelectorAll('.nav-item').forEach((n) => {
      n.onclick = () => {
        Audio.ui('click');
        const id = n.dataset.goto;
        this.page(id);
        if (id === 'menu-garage') { this.buildGarage(); g.setShowroomCar(this.garageSel); }
        if (id === 'menu-events') this.buildEvents();
        if (id === 'menu-freeroam') this.buildRoam();
        if (id === 'menu-career') this.buildCareer();
        if (id === 'menu-settings') this.buildSettings('settings-cols');
        if (id === 'menu-home') this.buildHome();
      };
    });
    $('btn-settings-top').onclick = () => { Audio.ui('click'); this.page('menu-settings'); this.buildSettings('settings-cols'); };

    // home quick actions
    document.querySelectorAll('[data-quick]').forEach((b) => {
      b.onclick = () => {
        Audio.ui('select');
        if (b.dataset.quick === 'freeroam') { this.page('menu-freeroam'); this.buildRoam(); }
        else { this.page('menu-events'); this.buildEvents(); }
      };
    });

    // events setup segs
    this.seg('seg-difficulty', (v) => this.setup.difficulty = +v);
    this.seg('seg-laps', (v) => this.setup.laps = +v);
    this.seg('seg-rivals', (v) => this.setup.rivals = +v);
    this.seg('seg-assists', (v) => {
      this.setup.assists = v;
      Save.s.assists = v === 'full'
        ? { abs: true, tcs: true, stm: true, racingLine: true, autoGear: true }
        : { abs: false, tcs: false, stm: false, racingLine: false, autoGear: true };
      Save.persist(); g.hud.assists(Save.s.assists);
    });
    $('btn-change-car').onclick = () => { Audio.ui('click'); this.page('menu-garage'); this.buildGarage(); g.setShowroomCar(this.garageSel); };
    $('btn-start-race').onclick = () => this.startRace();

    // garage actions
    $('g-buy').onclick = () => {
      const car = CAR_BY_ID[this.garageSel];
      if (Save.owns(car.id)) return;
      if (Save.buy(car.id, car.price)) {
        Audio.chime(true); this.g.hud.toast(`PURCHASED · ${car.name}`, 'i-credits', 'gold');
        this.buildGarage(); this.refreshChips();
      } else { Audio.chime(false); this.g.hud.toast('NOT ENOUGH CREDITS', 'i-warn', 'pink'); }
    };
    $('g-paint').onclick = () => { Audio.ui('click'); this.toggleSub('paint'); };
    $('g-upgrade').onclick = () => { Audio.ui('click'); this.toggleSub('upgrade'); };
    $('g-select').onclick = () => {
      Save.data.active = this.garageSel; Save.persist();
      Audio.ui('select'); this.g.hud.toast(`ACTIVE CAR · ${CAR_BY_ID[this.garageSel].name}`, 'i-car', '');
      this.buildGarage(); this.updateSetupCar();
    };

    // roam
    $('btn-start-roam').onclick = () => this.startRoam();

    // pause
    $('p-resume').onclick = () => this.setPause(false);
    $('p-restart').onclick = () => { this.setPause(false); this.restart(); };
    $('p-photo').onclick = () => { this.setPause(false); this.g.enterPhoto(); };
    $('p-settings').onclick = () => { Audio.ui('click'); $('screen-settings-modal').classList.add('active'); this.buildSettings('settings-cols-modal'); };
    $('p-garage').onclick = () => { Audio.ui('click'); $('screen-garage-modal').classList.add('active'); this.buildQuickGarage(); };
    $('p-quit').onclick = () => { this.setPause(false); this.quit(); };
    $('sm-close').onclick = () => { $('screen-settings-modal').classList.remove('active'); Audio.ui('back'); };
    $('gm-close').onclick = () => { $('screen-garage-modal').classList.remove('active'); Audio.ui('back'); };

    // results
    $('r-retry').onclick = () => { $('screen-results').classList.remove('active'); this.restart(); };
    $('r-next').onclick = () => { $('screen-results').classList.remove('active'); this.quit(true); };
    $('r-roam').onclick = () => { $('screen-results').classList.remove('active'); this.g.quitToMenu(); this.screen('screen-menu'); this.page('menu-freeroam'); this.buildRoam(); };
    $('r-menu').onclick = () => { $('screen-results').classList.remove('active'); this.quit(true); };

    // photo ui
    this.buildPhotoUI();

    // game callbacks
    g.onPauseKey = () => {
      if (g.state === 'photo') { g.exitPhoto(); return; }
      if (g.state !== 'playing') return;
      this.setPause(!g.paused);
    };
    g.onPhotoKey = () => {
      if (g.state === 'playing') g.enterPhoto();
      else if (g.state === 'photo') g.exitPhoto();
    };
    g.onRaceEnd = (res) => this.showResults(res);
    g.onAutoPause = () => this.setPause(true);
    Input.onPadChange = (on, name) => {
      const msg = on ? `CONTROLLER CONNECTED · ${(name || '').slice(0, 28) || 'GAMEPAD'}` : 'CONTROLLER DISCONNECTED';
      if (g.state === 'playing' || g.state === 'photo') g.hud.toast(msg, 'i-gamepad', on ? '' : 'pink');
      else this.notify(msg, on ? '' : 'pink');
      Audio.ready && Audio.ui(on ? 'select' : 'back');
    };

    // hover sfx
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest && e.target.closest('button')) Audio.ready && Audio.ui('hover');
    });
    // menu camera drag (garage)
    const gl = $('gl');
    gl.addEventListener('pointerdown', () => { if (this.g.state === 'menu') this.g.menuSpin = 0; });
    gl.addEventListener('pointermove', (e) => {
      if (this.g.state === 'menu' && e.buttons) this.g.menuCarYaw = (this.g.menuCarYaw || 0) + e.movementX * 0.008;
    });
    gl.addEventListener('pointerup', () => { if (this.g.state === 'menu') this.g.menuSpin = 0.25; });
    gl.addEventListener('wheel', (e) => {
      if (this.g.state === 'menu') this.g.menuZoom = clamp((this.g.menuZoom ?? 11) + e.deltaY * 0.01, 6, 20);
    }, { passive: true });
  }

  seg(id, cb) {
    $(id).querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        $(id).querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        Audio.ui('click');
        cb(b.dataset.v);
      };
    });
  }

  // ------------------------------------------------------------------ home
  buildHome() {
    const d = Save.data;
    $('home-wins').textContent = d.stats.wins || 0;
    $('home-top').textContent = Math.round(d.stats.topSpeed || 0);
    $('home-drift').textContent = fmtInt(d.stats.driftScore || 0);
    $('home-cars').textContent = d.owned.length;
    const next = EVENT_LIST.find((e) => !d.events[e.id]?.completed) || EVENT_LIST[0];
    $('home-featured').textContent = next.name;
    $('home-featured-sub').textContent = `${MAP_DEFS[next.map].name} · ${next.laps} laps · ${next.rivals} rivals`;
    this.currentEvent = next;
    this.refreshChips();
  }

  // ------------------------------------------------------------------ events
  buildEvents() {
    const tabs = $('map-tabs'); tabs.innerHTML = '';
    Object.entries(MAP_DEFS).forEach(([key, m]) => {
      const b = el('button', `map-tab ${key === this.currentMap ? 'on' : ''}`, m.name.split(' ').slice(-2).join(' '));
      b.title = m.name;
      b.onclick = () => { this.currentMap = key; Audio.ui('click'); this.buildEvents(); };
      tabs.appendChild(b);
    });
    const m = MAP_DEFS[this.currentMap];
    $('map-poster').src = `assets/art/${{ city: 'poster_city', touge: 'poster_touge', coast: 'poster_coast', island: 'poster_island' }[this.currentMap]}.jpg`;
    $('map-name').textContent = m.name;
    $('map-desc').textContent = m.desc;
    $('map-facts').innerHTML = `
      <li>${m.region}</li><li>${(m.roads[0].length / 1000).toFixed(1)} KM LAP</li>
      <li>${m.rain ? 'WET' : 'DRY'}</li><li>${EVENT_LIST.filter((e) => e.map === this.currentMap).length} EVENTS</li>`;
    const list = $('event-list'); list.innerHTML = '';
    EVENT_LIST.filter((e) => e.map === this.currentMap).forEach((ev) => {
      const rec = Save.data.events[ev.id];
      const unlocked = Save.data.unlockedEvents.includes(ev.id);
      const row = el('button', `event-row ${ev.id === this.currentEvent?.id ? 'on' : ''} ${unlocked ? '' : 'locked'}`);
      row.innerHTML = `
        <span class="ev-ico"><img src="assets/icons/${unlocked ? (ev.type === 'Time' ? 'i-clock' : ev.type === 'Drift' ? 'i-drift' : 'i-flag') : 'i-lock'}.png" alt=""></span>
        <span><span class="ev-name">${ev.name}</span><span class="ev-sub">${ev.type} · ${ev.laps} laps · ${ev.rivals} rivals · ${ev.pi} PI</span></span>
        <span class="ev-best">${rec?.best ? fmtTime(rec.best) : '--:--.--'}<span>BEST</span></span>
        <img class="ev-medal" src="assets/icons/i-medal-${rec?.medal || 0}.png" alt="">`;
      row.onclick = () => {
        if (!unlocked) { Audio.chime(false); this.g.hud.toast('WIN THE PREVIOUS EVENT TO UNLOCK', 'i-lock', 'pink'); return; }
        Audio.ui('select'); this.currentEvent = ev; this.buildEvents();
      };
      list.appendChild(row);
    });
    this.updateSetupCar();
  }
  updateSetupCar() {
    const car = CAR_BY_ID[Save.data.active];
    const st = carStats(car, Save.carState(car.id).upgrades);
    $('setup-car-name').textContent = `${car.maker} ${car.name}`;
    $('setup-car-class').textContent = `Class ${car.cls} · ${st.pi} PI`;
  }

  async startRace() {
    if (!this.currentEvent) return;
    Audio.ui('select');
    this.screen(null);
    await this.withLoading(async (prog) => {
      await this.g.startEvent(this.currentEvent.id, {
        difficulty: this.setup.difficulty, laps: this.setup.laps, rivals: this.setup.rivals,
        carId: Save.data.active, onStep: (l, f) => prog(0.15 + f * 0.8, l),
      });
    });
    this.g.state = 'playing';
  }

  // ------------------------------------------------------------------ garage
  buildGarage() {
    const list = $('garage-list'); list.innerHTML = '';
    CARS.forEach((car) => {
      const owned = Save.owns(car.id);
      const st = carStats(car, Save.carState(car.id).upgrades);
      const b = el('button', `g-car ${car.id === this.garageSel ? 'on' : ''} ${owned ? 'owned' : ''}`);
      b.innerHTML = `
        <span class="g-car-thumb"><img src="assets/icons/i-car.png" style="width:26px;opacity:.8" alt=""></span>
        <span><span class="gc-name">${car.name}</span><span class="gc-maker">${car.maker} · ${car.year}</span></span>
        <span class="gc-right"><span class="gc-class">${car.cls}</span><span class="gc-price">${owned ? `${st.pi} PI` : fmtInt(car.price)}</span><i class="gc-dot"></i></span>`;
      b.onclick = () => { Audio.ui('click'); this.garageSel = car.id; this.buildGarage(); this.g.setShowroomCar(car.id); $('garage-sub').classList.remove('open'); };
      list.appendChild(b);
    });
    const car = CAR_BY_ID[this.garageSel];
    const cs = Save.carState(car.id);
    const st = carStats(car, cs.upgrades);
    const owned = Save.owns(car.id);
    $('g-class').textContent = `CLASS ${car.cls}`;
    $('g-name').textContent = car.name;
    $('g-maker').textContent = `${car.maker} · ${car.year} · ${car.origin}`;
    $('g-pi').textContent = st.pi;
    const stats = [
      ['POWER', st.power / 11, `${Math.round(st.power)} HP`],
      ['WEIGHT', 10 - st.mass / 200, `${Math.round(st.mass)} KG`],
      ['GRIP', st.grip * 5, `${st.grip.toFixed(2)} G`],
      ['BRAKES', st.brake * 5.4, `${(st.brake * 1.1).toFixed(1)}`],
      ['TOP SPEED', st.top / 36, `${Math.round(st.top)} KM/H`],
      ['ACCEL', car.perf.accel, `${(2.6 + (10 - car.perf.accel) * 0.24).toFixed(1)}s`],
    ];
    $('g-stats').innerHTML = stats.map(([k, v, label]) =>
      `<div class="gstat"><span>${k}</span><span class="gstat-bar"><span class="gstat-fill" style="width:${clamp(v, 0, 10) * 10}%"></span></span><b>${label}</b></div>`).join('');
    const buy = $('g-buy');
    buy.disabled = owned;
    buy.innerHTML = owned ? '<img src="assets/icons/i-check.png" onerror="this.remove()" alt=""> OWNED' : `<img src="assets/icons/i-credits.png" alt=""> BUY · ${fmtInt(car.price)}`;
    $('g-select').disabled = !owned;
    $('g-paint').disabled = !owned;
    $('g-upgrade').disabled = !owned;
    this.refreshChips();
  }
  toggleSub(which) {
    const sub = $('garage-sub');
    const open = sub.classList.contains('open') && sub.dataset.which === which;
    sub.classList.toggle('open', !open);
    sub.dataset.which = which;
    if (open) return;
    const car = CAR_BY_ID[this.garageSel];
    const cs = Save.carState(car.id);
    if (which === 'paint') {
      sub.innerHTML = `<h4>PAINT &amp; FINISH</h4><div class="paint-grid">${car.colors.map((c, i) =>
        `<button class="swatch ${i === cs.color ? 'on' : ''}" data-c="${i}" style="background:#${c.toString(16).padStart(6, '0')}"></button>`).join('')}</div>
        <div class="finish-grid">${PAINT_FINISHES.map((f) => `<button class="finish-btn ${f === cs.finish ? 'on' : ''}" data-f="${f}">${f.toUpperCase()}</button>`).join('')}</div>`;
      sub.querySelectorAll('.swatch').forEach((s) => s.onclick = () => {
        cs.color = +s.dataset.c; Save.persist(); Audio.ui('click'); this.g.repaintShowroom(car.id); this.toggleSub('paint'); sub.classList.add('open');
      });
      sub.querySelectorAll('.finish-btn').forEach((s) => s.onclick = () => {
        cs.finish = s.dataset.f; Save.persist(); Audio.ui('click'); this.g.repaintShowroom(car.id); this.toggleSub('paint'); sub.classList.add('open');
      });
    } else {
      sub.innerHTML = `<h4>PERFORMANCE UPGRADES</h4><div class="upg-list">${UPGRADES.map((u) => {
        const lvl = cs.upgrades[u.k] || 0;
        const maxed = lvl >= u.max;
        const cost = maxed ? null : u.cost[lvl];
        return `<div class="upg"><span><span class="upg-name">${u.name}</span><span class="upg-desc">${u.desc}</span></span>
          <span class="upg-lvl">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</span>
          <button class="btn btn--sm ${maxed ? 'btn--ghost' : 'btn--primary'}" data-u="${u.k}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAX' : fmtInt(cost) + ' CR'}</button></div>`;
      }).join('')}</div>`;
      sub.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => {
        const u = UPGRADES.find((x) => x.k === b.dataset.u);
        const lvl = cs.upgrades[u.k] || 0;
        const cost = u.cost[lvl];
        if (Save.data.credits >= cost) {
          Save.addCredits(-cost); cs.upgrades[u.k] = lvl + 1; Save.persist();
          Audio.chime(true); this.g.repaintShowroom(car.id); this.buildGarage(); this.toggleSub('upgrade'); sub.classList.add('open');
          this.refreshChips();
        } else { Audio.chime(false); this.g.hud.toast('NOT ENOUGH CREDITS', 'i-warn', 'pink'); }
      });
    }
  }
  buildQuickGarage() {
    const q = $('quick-garage'); q.innerHTML = '';
    CARS.filter((c) => Save.owns(c.id)).forEach((car) => {
      const b = el('button', `qg ${car.id === Save.data.active ? 'on' : ''}`);
      b.innerHTML = `<b>${car.name}</b><span>CLASS ${car.cls} · ${carStats(car, Save.carState(car.id).upgrades).pi} PI</span>`;
      b.onclick = () => {
        Save.data.active = car.id; Save.persist(); Audio.ui('select');
        // swap live vehicle if roaming/racing
        this.g.swapActiveCar && this.g.swapActiveCar();
        this.buildQuickGarage();
      };
      q.appendChild(b);
    });
  }

  // ------------------------------------------------------------------ roam
  mapPoly(key) {
    if (this._polyCache[key]) return this._polyCache[key];
    const def = MAP_DEFS[key];
    const polys = def.roads.map((r) => catmull(new Float64Array(r.control.flat()), r.closed, 10));
    this._polyCache[key] = polys;
    return polys;
  }
  buildRoam() {
    // map seg
    const side = $('roam-spots'); side.innerHTML = '';
    const c = $('roam-canvas'), ctx = c.getContext('2d');
    const def = MAP_DEFS[this.roamMap];
    const polys = this.mapPoly(this.roamMap);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    polys.forEach((p) => { for (let i = 0; i < p.length; i += 2) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minZ = Math.min(minZ, p[i + 1]); maxZ = Math.max(maxZ, p[i + 1]); } });
    const pad = 120; minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
    const S = 720, sc = S / Math.max(maxX - minX, maxZ - minZ);
    const X = (x) => (x - minX) * sc, Z = (z) => (z - minZ) * sc;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#081120'; ctx.fillRect(0, 0, S, S);
    // terrain hint
    ctx.fillStyle = 'rgba(34,225,255,0.05)';
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * S, z = Math.random() * S;
      ctx.fillRect(x, z, 2, 2);
    }
    polys.forEach((p, pi) => {
      ctx.strokeStyle = pi === 0 ? 'rgba(34,225,255,0.9)' : 'rgba(34,225,255,0.45)';
      ctx.lineWidth = pi === 0 ? 7 : 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < p.length; i += 2) { const x = X(p[i]), z = Z(p[i + 1]); i ? ctx.lineTo(x, z) : ctx.moveTo(x, z); }
      if (def.roads[pi]?.closed) ctx.closePath();
      ctx.stroke();
    });
    def.activities.forEach((a) => {
      ctx.fillStyle = a.type === 'trap' ? '#ffb020' : a.type === 'drift' ? '#ff2e93' : '#9dff3c';
      ctx.beginPath(); ctx.arc(X(a.x), Z(a.z), 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2; ctx.stroke();
    });
    def.spots.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#8b5cff' : '#e8ecf2';
      ctx.beginPath(); ctx.arc(X(s.x), Z(s.z), 7, 0, Math.PI * 2); ctx.fill();
    });
    // spots list
    def.spots.forEach((s, i) => {
      const b = el('button', `spot ${this.roamSpot === i ? 'on' : ''}`);
      b.innerHTML = `<img src="assets/icons/${s.icon}.png" alt=""><span><strong>${s.name}</strong><span>FAST TRAVEL POINT</span></span>`;
      b.onclick = () => { Audio.ui('click'); this.roamSpot = i; this.buildRoam(); };
      side.appendChild(b);
    });
    // activities progress
    const acts = def.activities;
    const done = (t) => acts.filter((a) => a.type === t && Save.data.activities[a.id] != null).length;
    $('ract-traps').textContent = `${done('trap')}/${acts.filter((a) => a.type === 'trap').length}`;
    $('ract-zones').textContent = `${done('drift')}/${acts.filter((a) => a.type === 'drift').length}`;
    $('ract-jumps').textContent = `${Save.data.stats.jumps || 0}`;
    // map seg for choosing roam map (reuse tabs row)
    let seg = $('roam-mapseg');
    if (!seg) {
      seg = el('div', 'seg'); seg.id = 'roam-mapseg';
      seg.style.marginBottom = '10px';
      $('roam-spots').parentNode.insertBefore(seg, $('roam-spots'));
      Object.keys(MAP_DEFS).forEach((k) => {
        const b = el('button', '', MAP_DEFS[k].name.split(' ')[0].toUpperCase());
        b.dataset.v = k;
        b.onclick = () => { this.roamMap = k; this.roamSpot = 0; Audio.ui('click'); this.buildRoam(); };
        seg.appendChild(b);
      });
    }
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === this.roamMap));
    this.refreshChips();
  }
  async startRoam() {
    Audio.ui('select');
    this.screen(null);
    const def = MAP_DEFS[this.roamMap];
    const spot = def.spots[this.roamSpot ?? 0];
    await this.withLoading(async (prog) => {
      await this.g.startRoam(this.roamMap, spot, { onStep: (l, f) => prog(0.15 + f * 0.8, l) });
    });
    this.g.state = 'playing';
  }

  // ------------------------------------------------------------------ career
  buildCareer() {
    const d = Save.data;
    const items = [
      ['i-trophy', d.stats.wins || 0, 'Race wins'],
      ['i-flag', d.stats.races || 0, 'Races entered'],
      ['i-speed', Math.round(d.stats.topSpeed || 0), 'Top speed km/h'],
      ['i-drift', fmtInt(d.stats.driftScore || 0), 'Drift points'],
      ['i-jump', d.stats.jumps || 0, 'Jumps caught'],
      ['i-road', Math.round((d.stats.distance || 0) / 1000), 'KM driven'],
      ['i-car', d.owned.length, 'Cars owned'],
      ['i-clock', fmtInt(d.stats.playtime || 0) + 's', 'Play time'],
    ];
    $('career-grid').innerHTML = items.map(([ic, v, k]) =>
      `<div class="cstat"><img src="assets/icons/${ic}.png" alt=""><b>${v}</b><span>${k}</span></div>`).join('');
    const awards = [
      ['i-medal-1', 'First Blood', 'Win any event'],
      ['i-medal-3', 'Festival Champion', 'Win 5 events'],
      ['i-speed-c', 'Speed Demon', 'Reach 300 km/h'],
      ['i-drift-m', 'Slide King', 'Score 50k drift points'],
      ['i-jump-l', 'Airborne', '2s+ airtime'],
      ['i-car', 'Collector', 'Own 4 cars'],
      ['i-star-a', 'Island Legend', 'Complete every event'],
      ['i-festival', 'Showstopper', 'Reach level 10'],
    ];
    const won = [
      (d.stats.wins || 0) >= 1, (d.stats.wins || 0) >= 5, (d.stats.topSpeed || 0) >= 300,
      (d.stats.driftScore || 0) >= 50000, (d.activities['island-air'] || 0) >= 2 || (d.stats.jumps || 0) > 0,
      d.owned.length >= 4, EVENT_LIST.every((e) => d.events[e.id]?.completed), d.level >= 10,
    ];
    $('awards').innerHTML = awards.map(([ic, n, s], i) =>
      `<div class="award ${won[i] ? 'won' : ''}"><img src="assets/icons/${ic}.png" alt=""><b>${n}</b><span>${s}</span></div>`).join('');
  }

  // ------------------------------------------------------------------ settings
  buildSettings(containerId) {
    const s = Save.s;
    const c = $(containerId);
    const row = (label, hint, ctrl) => `<div class="srow"><label>${label}${hint ? `<small>${hint}</small>` : ''}</label>${ctrl}</div>`;
    const segb = (id, opts, cur) => `<div class="seg" data-seg="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const slider = (id, min, max, stepv, val, fmt) => `<input type="range" data-range="${id}" min="${min}" max="${max}" step="${stepv}" value="${val}"><span class="sval" data-sval="${id}">${fmt(val)}</span>`;
    const toggle = (id, on) => `<button class="toggle ${on ? 'on' : ''}" data-toggle="${id}"></button>`;
    c.innerHTML = `
      <div class="sgroup"><h3>GRAPHICS</h3>
        ${row('Quality preset', 'Shadows, bloom, AA, draw distance', segb('quality', [['low', 'LOW'], ['medium', 'MED'], ['high', 'HIGH'], ['ultra', 'ULTRA']], s.quality))}
        ${row('Resolution scale', 'Internal render scale', slider('resolution', 0.6, 1.5, 0.05, s.resolution, (v) => `${Math.round(v * 100)}%`))}
        ${row('Field of view', '', slider('fov', 60, 100, 1, s.fov, (v) => `${v}°`))}
        ${row('Camera shake', '', slider('shake', 0, 1.5, 0.05, s.shake, (v) => `${Math.round(v * 100)}%`))}
      </div>
      <div class="sgroup"><h3>GAMEPLAY</h3>
        ${row('Speed units', '', segb('units', [['kmh', 'KM/H'], ['mph', 'MPH']], s.units))}
        ${row('Camera', 'In-race view (C cycles)', segb('camera', [['chase', 'CHASE'], ['hood', 'HOOD'], ['cockpit', 'COCKPIT'], ['cinematic', 'CINE']], s.camera))}
        ${row('ABS', 'Anti-lock braking', toggle('abs', s.assists.abs))}
        ${row('Traction control', '', toggle('tcs', s.assists.tcs))}
        ${row('Stability control', '', toggle('stm', s.assists.stm))}
        ${row('Racing line hints', 'Minimap checkpoint highlight', toggle('racingLine', s.assists.racingLine))}
        ${row('Hide HUD hints', '', toggle('hideHints', s.hideHints))}
      </div>
      <div class="sgroup"><h3>AUDIO</h3>
        ${row('Master', '', slider('master', 0, 1, 0.05, s.master, (v) => `${Math.round(v * 100)}%`))}
        ${row('Engine', '', slider('engine', 0, 1, 0.05, s.engine, (v) => `${Math.round(v * 100)}%`))}
        ${row('Effects', '', slider('sfx', 0, 1, 0.05, s.sfx, (v) => `${Math.round(v * 100)}%`))}
        ${row('Music', 'Festival synthwave', slider('music', 0, 1, 0.05, s.music, (v) => `${Math.round(v * 100)}%`))}
        ${row('Music on/off', '', toggle('musicOn', s.musicOn))}
      </div>`;
    // wire
    c.querySelectorAll('[data-seg]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.onclick = () => {
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on'); Audio.ui('click');
        const k = seg.dataset.seg;
        s[k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
        Save.persist(); this.g.applySettings();
        if (k === 'camera') this.g.cameraMode = s.camera;
        this.buildSettings(containerId);
      });
    });
    c.querySelectorAll('[data-range]').forEach((r) => r.oninput = () => {
      const k = r.dataset.range;
      s[k] = +r.value; Save.persist();
      c.querySelector(`[data-sval="${k}"]`).textContent = r.dataset.range === 'fov' ? `${r.value}°` : `${Math.round(r.value * 100)}%`;
      this.g.applySettings();
    });
    c.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = () => {
      const k = b.dataset.toggle; Audio.ui('click');
      if (k === 'musicOn') s.musicOn = !s.musicOn;
      else if (k === 'hideHints') s.hideHints = !s.hideHints;
      else s.assists[k] = !s.assists[k];
      Save.persist(); this.g.applySettings(); this.g.hud.assists(s.assists);
      document.getElementById('hud').classList.toggle('no-hints', s.hideHints);
      this.buildSettings(containerId);
    });
  }

  // ------------------------------------------------------------------ pause
  setPause(on) {
    const g = this.g;
    if (g.state !== 'playing') return;
    g.paused = on;
    Audio.ui(on ? 'back' : 'click');
    if (on) {
      $('screen-pause').classList.add('active');
      const p = g.session && (g.session.playerCar || { vehicle: g.session.vehicle });
      $('pause-mini').innerHTML = p ? `
        <span>SPEED <b>${Math.round(p.vehicle.speedKmh)}</b> KM/H</span>
        <span>GEAR <b>${p.vehicle.gear}</b></span>
        <span>BOOST <b>${Math.round(p.vehicle.boostMeter * 100)}%</b></span>
        <span>MODE <b>${g.mode.toUpperCase()}</b></span>` : '';
      Audio.engineOff();
    } else {
      $('screen-pause').classList.remove('active');
    }
  }
  restart() {
    const g = this.g;
    g.paused = false;
    if (g.mode === 'race') {
      const ev = g.session.event;
      this.withLoading(async (prog) => {
        await g.startEvent(ev.id, { difficulty: this.setup.difficulty, laps: this.setup.laps, rivals: this.setup.rivals, carId: Save.data.active, onStep: (l, f) => prog(f, l) });
      });
    } else {
      this.withLoading(async (prog) => {
        await g.startRoam(g.world.key, MAP_DEFS[g.world.key].spots[this.roamSpot ?? 0], { onStep: (l, f) => prog(f, l) });
      });
    }
  }
  quit(silent = false) {
    const g = this.g;
    g.paused = false;
    g.quitToMenu();
    this.screen('screen-menu');
    this.page('menu-home');
    this.buildHome();
    if (!silent) Audio.ui('back');
  }

  // ------------------------------------------------------------------ results
  showResults(res) {
    const g = this.g;
    const ev = g.session.event;
    // apply rewards
    Save.addCredits(res.credits);
    const ups = Save.addXP(res.xp);
    Save.bump('races');
    if (res.position === 1) Save.bump('wins');
    if (res.position <= 3) Save.bump('podiums');
    if (ev) {
      Save.recordEvent(ev.id, { position: res.position, time: res.playerTotal });
      const idx = EVENT_LIST.findIndex((e) => e.id === ev.id);
      const next = EVENT_LIST[idx + 1];
      if (next && !Save.data.unlockedEvents.includes(next.id)) {
        Save.data.unlockedEvents.push(next.id); Save.persist();
        res.unlock = next.name;
      }
    }
    this.refreshChips();
    $('res-badge').textContent = ['1ST', '2ND', '3RD'][res.position - 1] || `${res.position}TH`;
    $('res-badge').className = `res-badge ${['', 'p2', 'p3'][res.position - 1] || 'pn'}`;
    $('res-title').textContent = res.position === 1 ? 'EVENT WON!' : 'EVENT COMPLETE';
    $('res-sub').textContent = `${ev ? ev.name : ''} · ${g.session.laps} laps · ${['Rookie', 'Pro', 'Expert', 'Unbeatable'][this.setup.difficulty]}`;
    $('res-table').innerHTML = `<tr><th>Pos</th><th>Driver</th><th>Best lap</th><th style="text-align:right">Total / Gap</th></tr>` +
      res.rows.map((r) => `<tr class="${r.you ? 'you' : ''}"><td class="pos">${r.pos}</td><td>${r.name}</td><td class="t">${fmtTime(r.best)}</td><td class="t">${r.pos === 1 ? fmtTime(r.time) : (r.gap != null ? '+' + (r.gap / 1000).toFixed(2) + 's' : 'DNF')}</td></tr>`).join('');
    $('res-rewards').innerHTML = `
      <div class="rw"><img src="assets/icons/i-credits.png" alt=""><b>+${fmtInt(res.credits)}</b><span>Credits</span></div>
      <div class="rw xp"><img src="assets/icons/i-star.png" alt=""><b>+${fmtInt(res.xp)}</b><span>XP</span></div>
      ${ups.length ? `<div class="rw xp"><img src="assets/icons/i-trophy.png" alt=""><b>LVL ${Save.data.level}</b><span>Level up!</span></div>` : ''}
      ${res.unlock ? `<div class="rw unlock"><img src="assets/icons/i-lock.png" alt=""><b>UNLOCKED</b><span>${res.unlock}</span></div>` : ''}`;
    $('screen-results').classList.add('active');
    g.paused = true;
    Audio.engineOff();
    Audio.chime(res.position === 1);
    if (res.position === 1) Audio.whoosh();
  }

  // ------------------------------------------------------------------ photo
  buildPhotoUI() {
    const b = $('photo-bottom');
    b.innerHTML = `
      <button class="btn btn--primary" id="ph-snap"><img src="assets/icons/i-camera.png" alt=""> CAPTURE</button>
      <button class="btn btn--ghost" id="ph-filter"><img src="assets/icons/i-paint.png" alt=""> FILTER</button>
      <button class="btn btn--ghost" id="ph-hide"><img src="assets/icons/i-eye.png" alt=""> HIDE UI</button>
      <button class="btn btn--ghost" id="ph-reset"><img src="assets/icons/i-restart.png" alt=""> RECENTER</button>
      <button class="btn btn--danger" id="ph-exit"><img src="assets/icons/i-exit.png" alt=""> EXIT (F1)</button>`;
    $('ph-snap').onclick = () => this.g.snapPhoto();
    $('ph-filter').onclick = () => { this.g.photoFilter = (this.g.photoFilter + 1) % 5; Audio.ui('click'); this.g.hud.toast(`FILTER ${this.g.photoFilter + 1}/5`, 'i-paint', ''); };
    $('ph-hide').onclick = () => { const ui = $('photo-ui'); ui.classList.toggle('hidden'); setTimeout(() => ui.classList.remove('hidden'), 4000); };
    $('ph-reset').onclick = () => { const p = this.g.session.playerCar || { vehicle: this.g.session.vehicle }; this.g.photoCam.target.set(p.vehicle.pos.x, p.vehicle.pos.y + 1, p.vehicle.pos.z); this.g.photoCam.dist = 9; Audio.ui('click'); };
    $('ph-exit').onclick = () => this.g.exitPhoto();
  }
}
