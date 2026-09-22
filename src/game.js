// ============================================================================
// APEX HORIZON — game orchestrator
// ============================================================================
import * as THREE from 'three';
import { GameRenderer } from './core/renderer.js';
import Assets from './core/assets.js';
import Input from './core/input.js';
import Audio from './core/audio.js';
import Save from './core/save.js';
import { clamp, lerp, damp, wrapAngle, fmtTime } from './core/math.js';
import { HUD } from './ui/hud.js';
import { buildWorld, MAP_DEFS, EVENT_LIST } from './world/maps.js';
import { buildSky } from './core/sky.js';
import { CARS, CAR_BY_ID, carStats } from './cars/catalog.js';
import { buildCar } from './cars/model.js';
import { Vehicle } from './cars/physics.js';
import { AIDriver } from './cars/ai.js';
import { RaceSession, RoamSession } from './race/race.js';
import { SkidTrail, Emitter, trackPoint } from './core/fx.js';

const CORE_TEX = ['asphalt', 'asphaltN', 'asphaltR', 'asphaltWet', 'asphaltWetR', 'concrete', 'concreteN', 'grass', 'grassN',
  'rock', 'rockN', 'carbon', 'carbonN', 'metal', 'metalN', 'leather', 'leatherN', 'tire', 'tireN', 'facade', 'waterN',
  'blossom', 'skid', 'petal', 'puff', 'glow', 'flare', 'contact', 'checker', 'neonA', 'neonB', 'neonC',
  'envNight', 'envSunset', 'envDawn', 'envDay', 'keyart', 'posterCity', 'posterTouge', 'posterCoast', 'posterIsland'];

const CAM_MODES = ['chase', 'hood', 'cockpit', 'cinematic'];

export class Game {
  constructor(canvas) {
    this.renderer = new GameRenderer(canvas);
    this.hud = new HUD();
    this.state = 'boot';
    this.world = null;
    this.session = null;
    this.mode = null;              // 'race' | 'roam'
    this.paused = false;
    this.photo = false;
    this.cameraMode = Save.s.camera || 'chase';
    this.camPos = new THREE.Vector3(0, 6, -14);
    this.camLook = new THREE.Vector3();
    this.shake = 0;
    this.clock = new THREE.Clock();
    this.time = 0;
    this._skid = null;
    this._smoke = null;
    this._sparks = null;
    this.photoCam = { theta: 0.6, phi: 1.15, dist: 8, target: new THREE.Vector3() };
    addEventListener('blur', () => { if (this.state === 'playing' && !this.paused && this.onAutoPause) this.onAutoPause(); });
    this.photoFilter = 0;
  }

  // ------------------------------------------------------------------ boot
  async boot(onProgress) {
    Assets.aniso = this.renderer.renderer.capabilities.getMaxAnisotropy();
    await Assets.load(CORE_TEX, (f) => onProgress && onProgress(f * 0.85, 'Loading textures…'));
    onProgress && onProgress(0.9, 'Building showroom…');
    this.buildShowroom();
    this.applySettings();
    onProgress && onProgress(1, 'Ready');
  }

  buildShowroom() {
    const sc = new THREE.Scene();
    sc.name = 'showroom';
    this.menuSky = buildSky('night', { cloudCover: 0.2 });
    sc.add(this.menuSky.mesh, this.menuSky.sun, this.menuSky.sun.target, this.menuSky.hemi);
    const env = Assets.tex.envNight;
    if (env) {
      env.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(this.renderer.renderer);
      this.menuEnv = pm.fromEquirectangular(env).texture;
      sc.environment = this.menuEnv;
      sc.environmentIntensity = 0.85;
      pm.dispose();
    }
    sc.fog = new THREE.Fog(0x0a1020, 40, 260);
    // floor
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a0e16, metalness: 0.72, roughness: 0.32, envMapIntensity: 1.1 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    sc.add(floor);
    // neon ring
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.2, 1.1) });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.06, 8, 90), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05;
    sc.add(ring);
    const ring2Mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 1.7) });
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(13, 0.04, 8, 90), ring2Mat);
    ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.04;
    sc.add(ring2);
    // grid lights
    const pts = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push(Math.cos(a) * 22, 0.1, Math.sin(a) * 22);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    sc.add(new THREE.Points(pg, new THREE.PointsMaterial({ map: Assets.tex.glow, size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 0.5, 1.6) })));
    // key lights
    const key = new THREE.SpotLight(0xbfe4ff, 300, 60, Math.PI / 5, 0.5, 1.2);
    key.position.set(10, 14, 8); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    sc.add(key, key.target);
    const rim = new THREE.SpotLight(0xff2e93, 220, 60, Math.PI / 4.5, 0.6, 1.2);
    rim.position.set(-12, 10, -10); sc.add(rim, rim.target);
    const fill = new THREE.SpotLight(0x22e1ff, 160, 60, Math.PI / 4, 0.7, 1.2);
    fill.position.set(6, 8, -14); sc.add(fill, fill.target);
    this.showroom = { scene: sc, key, rim, fill, turntable: 0 };
  }

  // ------------------------------------------------------------- settings
  applySettings() {
    const s = Save.s;
    this.renderer.setQuality(s.quality, s.resolution);
    this.renderer.camera.fov = s.fov || 72;
    this.renderer.camera.updateProjectionMatrix();
    this.hud.setUnits(s.units);
    this.hud.assists(s.assists);
    Audio.setVolume('master', s.master); Audio.setVolume('engine', s.engine);
    Audio.setVolume('sfx', s.sfx); Audio.setVolume('music', s.music);
    if (s.musicOn && Audio.ready && !Audio.musicOn) Audio.startMusic(this.mode ? 0.9 : 0.55);
    if (!s.musicOn && Audio.musicOn) Audio.stopMusic();
    if (this.world) this.renderer.setFog(new THREE.Color(this.world.sky.preset.fog), 60, this.renderer.q.fogFar);
  }

  // ------------------------------------------------------------- showroom car
  setShowroomCar(carId) {
    const car = CAR_BY_ID[carId];
    if (!car) return;
    if (this.showroom.car) { this.showroom.scene.remove(this.showroom.car); }
    const cs = Save.carState(carId);
    const model = buildCar(car, Assets, { color: car.colors[cs.color] ?? car.colors[0], finish: cs.finish, detail: 'full' });
    model.position.y = 0.02;
    this.showroom.scene.add(model);
    this.showroom.car = model;
    this.showroom.carId = carId;
  }
  repaintShowroom(carId) { this.setShowroomCar(carId); }

  // ------------------------------------------------------------- world load
  async loadWorld(key, onStep) {
    if (this.world) {
      this.renderer.scene.remove(this.world.group);
      this.world.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      this.world = null;
    }
    const world = await buildWorld(key, Assets, this.renderer, onStep);
    this.world = world;
    this.renderer.scene.add(world.group);
    this.renderer.scene.fog = new THREE.Fog(new THREE.Color(world.sky.preset.fog), 60, this.renderer.q.fogFar);
    // fx systems
    this._skid = new SkidTrail(Assets.tex.skid, 1200, 0.3);
    world.group.add(this._skid.mesh);
    this._smoke = new Emitter(Assets.tex.puff, 260, { gravity: 1.1, grow: 3.2, drag: 1.4, opacity: 0.85 });
    world.group.add(this._smoke.cloud.points);
    this._sparks = new Emitter(Assets.tex.glow, 120, { gravity: -9, grow: -0.2, drag: 0.6, blending: THREE.AdditiveBlending, opacity: 1 });
    world.group.add(this._sparks.cloud.points);
    // minimap data
    const poly = [];
    const pts = world.main.points;
    const step = Math.max(1, Math.floor(pts.length / 2 / 220));
    for (let i = 0; i < pts.length; i += step * 2) poly.push(pts[i], pts[i + 1]);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < poly.length; i += 2) {
      minX = Math.min(minX, poly[i]); maxX = Math.max(maxX, poly[i]);
      minZ = Math.min(minZ, poly[i + 1]); maxZ = Math.max(maxZ, poly[i + 1]);
    }
    const bounds = Math.max(maxX - minX, maxZ - minZ) * 1.25;
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    this.hud.setMapData({
      poly: poly.map((v, i) => (i % 2 ? v - cz : v - cx)),
      offset: [cx, cz], bounds, closed: true,
      activities: world.activities.map((a) => ({ ...a, x: a.x - cx, z: a.z - cz })),
      checkpoints: world.checkpoints.map((c) => ({ ...c, x: c.x - cx, z: c.z - cz })),
    });
    this.mapCenter = [cx, cz];
    return world;
  }

  // ------------------------------------------------------------- sessions
  makeVehicle(carId, detail = 'full') {
    const car = CAR_BY_ID[carId];
    const cs = Save.carState(carId);
    const stats = carStats(car, cs.upgrades);
    const vehicle = new Vehicle(car, stats, this.world);
    const model = buildCar(car, Assets, { color: car.colors[cs.color] ?? car.colors[0], finish: cs.finish, detail });
    this.world.group.add(model);
    return { car, vehicle, model, stats };
  }

  async startEvent(eventId, opts = {}) {
    const ev = EVENT_LIST.find((e) => e.id === eventId);
    const world = await this.loadWorld(ev.map, opts.onStep);
    const cars = [];
    const player = this.makeVehicle(opts.carId || Save.data.active, 'full');
    player.you = true; player.name = 'YOU';
    player.color = '#22e1ff';
    cars.push(player);
    const rivalCount = opts.rivals ?? ev.rivals;
    const pool = CARS.filter((c) => c.id !== player.car.id);
    const names = ['K. Sato', 'M. Voss', 'A. Reyes', 'T. Lindqvist', 'R. Okafor', 'J. Park', 'L. Moreau', 'D. Kovac', 'S. Ito', 'N. Berg'];
    const cols = ['#ff2e93', '#ffb020', '#9dff3c', '#8b5cff', '#ff6b35', '#3ce0c0', '#f2f4f8', '#ff5252', '#7ec8ff', '#d4af37'];
    const diff = opts.difficulty ?? 1;
    for (let i = 0; i < rivalCount; i++) {
      const spec = pool[(i * 3 + 1) % pool.length];
      const v = this.makeVehicle(spec.id, 'ai');
      v.you = false; v.name = names[i % names.length]; v.color = cols[i % cols.length];
      v.driver = new AIDriver(world, clamp(0.62 + diff * 0.1 + i * 0.012, 0.5, 1.0), 0.5);
      cars.push(v);
    }
    // grid
    cars.forEach((c, i) => {
      const sp = world.spawns[world.spawns.length - 1 - i] || world.spawns[0];
      c.vehicle.reset(sp.x, sp.z, sp.angle, sp.y);
    });
    this.session = new RaceSession({
      world, event: ev, cars, difficulty: diff, laps: opts.laps ?? ev.laps,
      assists: Save.s.assists, wet: !!MAP_DEFS[ev.map].rain,
    });
    this.session.onImpact = (v) => { Audio.impact(v); this.shake = Math.min(1.4, this.shake + v * 0.5); };
    this.session.onLap = (lap, ms) => { Audio.chime(true); this.hud.toast(`LAP ${lap - 1} — ${fmtTime(ms)}`, 'i-clock', ''); };
    this.session.onCheckpoint = () => { Audio.ui('hover'); };
    this.session._cdSnd = (go) => Audio.count(go);
    this.mode = 'race';
    this.enterGameplay(ev.name, `${MAP_DEFS[ev.map].region} · ${opts.laps ?? ev.laps} laps`);
    return this.session;
  }

  async startRoam(mapKey, spot, opts = {}) {
    const world = this.world && this.world.key === mapKey ? this.world : await this.loadWorld(mapKey, opts.onStep);
    const player = this.makeVehicle(Save.data.active, 'full');
    player.you = true;
    const sp = spot || world.spots[0];
    const h = world.heightAt(sp.x, sp.z);
    player.vehicle.reset(sp.x, sp.z + 6, 0, h);
    this.session = new RoamSession(world, player.vehicle, player.model);
    this.playerRoam = player;
    this.mode = 'roam';
    this.enterGameplay('Free Roam', MAP_DEFS[mapKey].name);
    return this.session;
  }

  enterGameplay(name, sub) {
    this.renderer.setScene(this.renderer.scene);
    this.state = 'playing';
    this.paused = false;
    this.hud.show(true);
    this.hud.setEvent(name, sub);
    this.hud.setRoamMode(this.mode === 'roam');
    const pc = this.session.playerCar || { vehicle: this.session.vehicle };
    Audio.configureEngine((pc.car || CAR_BY_ID[Save.data.active]).engine);
    if (Save.s.musicOn && Audio.ready) { Audio.stopMusic(); Audio.startMusic(0.9); }
  }

  quitToMenu() {
    this.state = 'menu';
    this.mode = null;
    this.session = null;
    this.hud.show(false);
    this.hud.wrongWay(false);
    this.hud.driftPop(0, 1, false);
    this.hud.countdown(null);
    Audio.engineOff();
    if (Save.s.musicOn && Audio.ready) { Audio.stopMusic(); Audio.startMusic(0.5); }
    if (this.world) {
      this.renderer.scene.remove(this.world.group);
      this.world = null;
    }
    this.renderer.setScene(this.showroom.scene);
  }

  swapActiveCar() {
    if (!this.session || !this.world) return;
    const old = this.session.playerCar || this.playerRoam;
    if (!old) return;
    const pos = old.vehicle.pos.clone(), yaw = old.vehicle.yaw, spd = old.vehicle.vel.clone();
    this.world.group.remove(old.model);
    const fresh = this.makeVehicle(Save.data.active, 'full');
    fresh.you = true; fresh.name = 'YOU'; fresh.color = '#22e1ff';
    fresh.vehicle.reset(pos.x, pos.z, yaw, pos.y - 0.3);
    fresh.vehicle.vel.copy(spd);
    if (this.session.cars) {
      const i = this.session.cars.indexOf(old);
      if (i >= 0) this.session.cars[i] = fresh;
      // carry progress
      fresh.lap = old.lap; fresh.cp = old.cp; fresh.progress = old.progress;
      fresh.lapStart = old.lapStart; fresh.lastLap = old.lastLap; fresh.bestLap = old.bestLap;
      fresh.hint = old.hint;
    } else {
      this.session.vehicle = fresh.vehicle; this.session.model = fresh.model;
      this.playerRoam = fresh;
    }
    Audio.configureEngine(fresh.car.engine);
  }

  teleport(x, z) {
    const p = this.session && (this.session.playerCar || this.session.vehicle);
    if (!p) return;
    const v = p.vehicle || p;
    v.reset(x, z, 0, this.world.heightAt(x, z));
    this.shake = 0;
  }

  // ------------------------------------------------------------- frame
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const t = this.time;
    Input.update(dt);

    if (this.state === 'menu' || this.state === 'title') this.frameMenu(dt, t);
    else if (this.state === 'playing') this.frameGame(dt, t);
    else if (this.state === 'photo') this.framePhoto(dt, t);

    // edge-triggered keys
    if (Input.tapped('pause')) this.onPauseKey && this.onPauseKey();
    if (Input.tapped('photo')) this.onPhotoKey && this.onPhotoKey();
    Input.consumeTaps();

    this.renderer.beginFrame(dt, t);
    this.renderer.render(dt);
  }

  frameMenu(dt, t) {
    const s = this.showroom;
    s.turntable += dt * (this.menuSpin ?? 0.25);
    if (s.car) {
      s.car.rotation.y = s.turntable + (this.menuCarYaw || 0);
      s.car.userData.update(dt, { wheelSpeed: 0, steerVisual: 0, pitch: 0, roll: 0, airborne: 0, braking: false });
    }
    const cam = this.renderer.camera;
    const orbitR = this.menuZoom ?? 11;
    const a = t * 0.07 + (this.menuCamYaw || 0);
    cam.position.set(Math.sin(a) * orbitR, 2.4 + Math.sin(t * 0.2) * 0.5 + (this.menuCamY || 0), Math.cos(a) * orbitR);
    cam.lookAt(0, 1.05 + (this.menuLookY || 0), 0);
    this.menuSky.update(t, cam.position);
    this.menuSky.key.target.position.set(0, 1, 0);
    this.renderer.scene = this.showroom.scene;
    this.renderer.renderPass.scene = this.showroom.scene;
  }

  frameGame(dt, t) {
    const sess = this.session;
    if (!sess) return;
    const player = sess.playerCar || { vehicle: sess.vehicle, model: sess.model };
    const v = player.vehicle;

    if (!this.paused) {
      if (this.mode === 'race') sess.update(dt, this.playerInput(), this.hud);
      else {
        v.step(dt, this.playerInput(), { ...Save.s.assists, wet: !!MAP_DEFS[this.world.key].rain });
        player.model.position.copy(v.pos);
        player.model.rotation.y = v.yaw;
        player.model.userData.update(dt, v.stateForModel);
        sess.update(dt, this.hud);
      }
      this.updateFX(dt, v);
      this.updateAudio(dt, v);
      this.world.update(dt, t, this.renderer.camera.position, v.pos);
    }

    // camera
    if (!this.paused) this.updateCamera(dt, v);
    this.renderer.renderPass.scene = this.renderer.scene;

    // HUD state
    const base = {
      speedKmh: v.speedKmh, rpm01: v.rpm01, boost: v.boostMeter,
      gearLabel: v.rpm < 300 && v.wheelSpeed < -0.5 ? 'R' : (Math.abs(v.wheelSpeed) < 0.6 && v.rpm01 < 0.2 ? 'N' : String(v.gear)),
      px: v.pos.x - (this.mapCenter?.[0] ?? 0), pz: v.pos.z - (this.mapCenter?.[1] ?? 0),
      heading: v.yaw,
      rivals: this.mode === 'race' ? sess.cars.filter((c) => !c.you).map((c) => ({
        x: c.vehicle.pos.x - (this.mapCenter?.[0] ?? 0), z: c.vehicle.pos.z - (this.mapCenter?.[1] ?? 0), color: c.color,
      })) : null,
    };
    const hs = sess.hudState ? sess.hudState() : {};
    this.hud.update(dt, { ...base, ...hs });
    this.hud.wrongWay(this.mode === 'race' ? player.wrongWay : false);

    // race end handoff
    if (this.mode === 'race' && sess.finished && !this._resSent) {
      this._resSent = true;
      setTimeout(() => { this.onRaceEnd && this.onRaceEnd(sess.results); }, 1400);
    }
    if (this.mode !== 'race') this._resSent = false;

    // career accumulation (throttled)
    this._statAcc = (this._statAcc || 0) + dt;
    if (this._statAcc > 4) {
      Save.data.stats.distance = (Save.data.stats.distance || 0) + v.speed * this._statAcc;
      Save.data.stats.playtime = (Save.data.stats.playtime || 0) + this._statAcc;
      Save.persist();
      this._statAcc = 0;
    }

    // grade uniforms
    const g = this.renderer.grade.uniforms;
    g.uSpeed.value = damp(g.uSpeed.value, clamp((v.speedKmh - 90) / 260, 0, 1), 4, dt);
    g.uFlash.value = Math.max(0, g.uFlash.value - dt * 2.2);
    this.shake = Math.max(0, this.shake - dt * 2.4);
  }

  playerInput() {
    return {
      throttle: Input.throttle, brake: Input.brake, steer: Input.steer,
      handbrake: Input.handbrake, boost: Input.boost,
    };
  }

  updateFX(dt, v) {
    if (!this._skid) return;
    this._skid.fade(dt, 0.05);
    const wb = v.car.body.wheelbase / 2, wo = v.car.body.width / 2 - 0.2;
    const f = { x: Math.sin(v.yaw), z: Math.cos(v.yaw) }, r = { x: Math.cos(v.yaw), z: -Math.sin(v.yaw) };
    const slipping = v.slip > 0.42 && v.grounded && v.speed > 6;
    for (const side of [-1, 1]) {
      const x = v.pos.x - f.x * wb + r.x * side * wo;
      const z = v.pos.z - f.z * wb + r.z * side * wo;
      const y = this.world.heightAt(x, z) + 0.05;
      const key = side < 0 ? '_skL' : '_skR';
      const prev = this[key];
      if (slipping && prev) {
        this._skid.addSegment(prev[0], prev[1], prev[2], x, y, z, clamp(v.slip, 0, 1) * 0.8);
      }
      this[key] = slipping ? [x, y, z] : null;
      if (slipping && Math.random() < 0.55) {
        const offroad = v.offroad;
        this._smoke.spawn(x, y + 0.15, z,
          -f.x * 1.2 + (Math.random() - 0.5) * 1.4, 0.8 + Math.random(), -f.z * 1.2 + (Math.random() - 0.5) * 1.4,
          0.7 + Math.random() * 0.5, 0.9 + Math.random() * 0.6,
          offroad ? new THREE.Color(0.55, 0.45, 0.33) : new THREE.Color(0.82, 0.84, 0.88));
      }
    }
    this._skid.rebuild();
    this._smoke.update(dt);
    this._sparks.update(dt);
  }

  updateAudio(dt, v) {
    Audio.engine(v.rpm01, Input.throttle, clamp(v.speedKmh / 300, 0, 1), true);
    Audio.tyre(clamp(v.slip - 0.25, 0, 1) * (v.grounded ? 1 : 0));
    Audio.windAndRoad(clamp(v.speedKmh / 280, 0, 1), v.offroad);
  }

  updateCamera(dt, v) {
    const cam = this.renderer.camera;
    const s = Save.s;
    const f = { x: Math.sin(v.yaw), z: Math.cos(v.yaw) };
    const speed01 = clamp(v.speedKmh / 260, 0, 1);
    let target = this.camPos, look = this.camLook;
    const mode = this.cameraMode;
    if (mode === 'chase') {
      const dist = 6.6 + speed01 * 3.4, h = 2.5 + speed01 * 0.7;
      const tx = v.pos.x - f.x * dist, tz = v.pos.z - f.z * dist;
      const ty = v.pos.y + h;
      target.set(
        damp(target.x, tx, 6.5, dt),
        damp(target.y, ty, 6.0, dt),
        damp(target.z, tz, 6.5, dt));
      // keep above ground
      const gh = this.world.heightAt(target.x, target.z) + 1.1;
      if (target.y < gh) target.y = damp(target.y, gh, 12, dt);
      look.set(v.pos.x + f.x * 6, v.pos.y + 1.25, v.pos.z + f.z * 6);
    } else if (mode === 'hood') {
      target.set(v.pos.x + f.x * 0.4, v.pos.y + v.car.body.height * 0.82, v.pos.z + f.z * 0.4);
      look.set(v.pos.x + f.x * 30, v.pos.y + 1.1, v.pos.z + f.z * 30);
    } else if (mode === 'cockpit') {
      target.set(v.pos.x - f.x * 0.25 + Math.cos(v.yaw) * -0.36, v.pos.y + v.car.body.height * 0.78, v.pos.z - f.z * 0.25 + -Math.sin(v.yaw) * -0.36);
      look.set(v.pos.x + f.x * 26, v.pos.y + v.car.body.height * 0.72, v.pos.z + f.z * 26);
    } else { // cinematic
      const a = this.time * 0.5;
      target.set(v.pos.x + Math.sin(a) * 8.5, v.pos.y + 2.2 + Math.sin(this.time * 0.7) * 0.6, v.pos.z + Math.cos(a) * 8.5);
      look.set(v.pos.x, v.pos.y + 0.9, v.pos.z);
    }
    // shake
    const sh = (this.shake * 0.5 + speed01 * 0.12 + (v.offroad ? 0.16 : 0)) * (s.shake ?? 0.7);
    cam.position.copy(target);
    cam.position.x += (Math.random() - 0.5) * sh * 0.35;
    cam.position.y += (Math.random() - 0.5) * sh * 0.3;
    cam.position.z += (Math.random() - 0.5) * sh * 0.35;
    cam.lookAt(look);
    // fov kick
    const fov = (s.fov || 72) + speed01 * 14 + (v.boosting ? 5 : 0);
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = damp(cam.fov, fov, 5, dt); cam.updateProjectionMatrix(); }
  }

  cycleCamera() {
    const i = CAM_MODES.indexOf(this.cameraMode);
    this.cameraMode = CAM_MODES[(i + 1) % CAM_MODES.length];
    Save.s.camera = this.cameraMode; Save.persist();
    this.hud.toast(`CAMERA · ${this.cameraMode.toUpperCase()}`, 'i-camera', '');
    Audio.ui('select');
  }

  // ------------------------------------------------------------- photo mode
  enterPhoto() {
    if (!this.session) return;
    this._prePhotoState = this.state;
    this.state = 'photo';
    this.hud.show(false);
    const p = this.session.playerCar || { vehicle: this.session.vehicle };
    this.photoCam.target.copy(p.vehicle.pos).add(new THREE.Vector3(0, 1, 0));
    this.photoCam.theta = p.vehicle.yaw + Math.PI;
    this.photoCam.phi = 1.2; this.photoCam.dist = 9;
    document.getElementById('photo-ui').classList.remove('hidden');
    Audio.ui('select');
  }
  exitPhoto() {
    this.state = 'playing';
    const g = this.renderer.grade.uniforms;
    g.uSat.value = 1.08; g.uContrast.value = 1.06; g.uTint.value.setRGB(1, 1, 1);
    this.hud.show(true);
    document.getElementById('photo-ui').classList.add('hidden');
  }
  framePhoto(dt, t) {
    const pc = this.photoCam;
    const p = this.session && (this.session.playerCar || { vehicle: this.session.vehicle });
    if (!p) { this.exitPhoto(); return; }
    const v = p.vehicle;
    // idle engine
    v.step(dt, { throttle: 0, brake: 1, steer: 0, handbrake: false, boost: false }, {});
    p.model.position.copy(v.pos); p.model.rotation.y = v.yaw;
    p.model.userData.update(dt, v.stateForModel);
    this.world.update(dt, t, this.renderer.camera.position, v.pos);
    Audio.engine(v.rpm01, 0, 0, true);

    const mdx = Input.mouse.dx, mdy = Input.mouse.dy;
    if (Input.mouse.down) { pc.theta -= mdx * 0.005; pc.phi = clamp(pc.phi - mdy * 0.005, 0.25, 1.52); }
    pc.dist = clamp(pc.dist + Input.wheel * 0.01, 2.2, 40);
    const mv = { f: [Math.sin(pc.theta), Math.cos(pc.theta)], r: [Math.cos(pc.theta), -Math.sin(pc.theta)] };
    const spd = 8 * dt;
    if (Input.held('throttle')) pc.target.addScaledVector(new THREE.Vector3(mv.f[0], 0, mv.f[1]), spd);
    if (Input.held('brake')) pc.target.addScaledVector(new THREE.Vector3(mv.f[0], 0, mv.f[1]), -spd);
    if (Input.held('left')) pc.target.addScaledVector(new THREE.Vector3(mv.r[0], 0, mv.r[1]), -spd);
    if (Input.held('right')) pc.target.addScaledVector(new THREE.Vector3(mv.r[0], 0, mv.r[1]), spd);
    if (Input.held('handbrake')) pc.target.y += spd;
    if (Input.held('boost')) pc.target.y = Math.max(0.5, pc.target.y - spd);
    const cam = this.renderer.camera;
    cam.position.set(
      pc.target.x + Math.sin(pc.theta) * Math.sin(pc.phi) * pc.dist,
      pc.target.y + Math.cos(pc.phi) * pc.dist,
      pc.target.z + Math.cos(pc.theta) * Math.sin(pc.phi) * pc.dist);
    cam.lookAt(pc.target);
    // filters
    const g = this.renderer.grade.uniforms;
    const F = [
      { sat: 1.08, con: 1.06, tint: [1, 1, 1] },
      { sat: 0.05, con: 1.2, tint: [1, 1, 1] },
      { sat: 1.5, con: 1.15, tint: [1.08, 0.92, 0.85] },
      { sat: 1.2, con: 1.3, tint: [0.85, 0.95, 1.15] },
      { sat: 1.3, con: 0.95, tint: [1.1, 0.85, 1.05] },
    ][this.photoFilter % 5];
    g.uSat.value = F.sat; g.uContrast.value = F.con; g.uTint.value.setRGB(...F.tint);
    g.uSpeed.value = 0;
  }

  snapPhoto() {
    const c = this.renderer.renderer.domElement;
    try {
      const url = c.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url; a.download = `apex-horizon-${Date.now()}.png`;
      a.click();
      this.hud.toast('PHOTO SAVED', 'i-camera', 'gold');
    } catch (e) { /* tainted */ }
    this.renderer.grade.uniforms.uFlash.value = 0.9;
    this.renderer.grade.uniforms.uFlashColor.value.setRGB(1, 1, 1);
    Audio.ui('select');
  }

  dispose() { }
}
