// ============================================================================
// APEX HORIZON — persistent career save (localStorage)
// ============================================================================
const KEY = 'apex-horizon-save-v1';

const DEFAULTS = () => ({
  version: 1,
  credits: 25000,
  xp: 0,
  level: 1,
  owned: ['kurogane-r'],
  active: 'kurogane-r',
  cars: {},                       // id -> { color, finish, upgrades: {k:lvl} }
  stats: { races: 0, wins: 0, podiums: 0, topSpeed: 0, driftScore: 0, distance: 0, jumps: 0, traps: 0, zones: 0, playtime: 0 },
  events: {},                     // id -> { best: ms, wins, medal, completed }
  activities: {},                 // key -> best value
  unlockedEvents: ['city-1', 'city-2', 'coast-1'],
  settings: {
    quality: 'high',
    resolution: 1.0,
    fov: 72,
    units: 'kmh',
    camera: 'chase',
    shake: 0.7,
    master: 0.9, engine: 0.85, sfx: 0.8, music: 0.55,
    musicOn: true,
    assists: { abs: true, tcs: true, stm: true, racingLine: true, autoGear: true },
    hideHints: false,
    photoFilter: 0,
  },
});

class Save {
  constructor() {
    this.data = this.load();
  }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const base = DEFAULTS();
        return { ...base, ...parsed, stats: { ...base.stats, ...(parsed.stats || {}) }, settings: { ...base.settings, ...(parsed.settings || {}), assists: { ...base.settings.assists, ...((parsed.settings || {}).assists || {}) } } };
      }
    } catch (e) { console.warn('save load failed', e); }
    return DEFAULTS();
  }
  persist() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ } }
  reset() { this.data = DEFAULTS(); this.persist(); }

  get s() { return this.data.settings; }
  carState(id) {
    if (!this.data.cars[id]) this.data.cars[id] = { color: 0, finish: 'gloss', upgrades: {} };
    return this.data.cars[id];
  }
  addCredits(n) { this.data.credits = Math.max(0, this.data.credits + n); this.persist(); }
  addXP(n) {
    this.data.xp += n;
    let lvl = this.data.level, need = this.xpFor(lvl);
    const ups = [];
    while (this.data.xp >= need) { this.data.xp -= need; lvl++; ups.push(lvl); need = this.xpFor(lvl); }
    this.data.level = lvl; this.persist();
    return ups;
  }
  xpFor(level) { return Math.round(900 * Math.pow(level, 1.35)); }
  owns(id) { return this.data.owned.includes(id); }
  buy(id, price) {
    if (this.owns(id) || this.data.credits < price) return false;
    this.data.credits -= price; this.data.owned.push(id); this.persist(); return true;
  }
  recordEvent(id, res) {
    const e = this.data.events[id] || (this.data.events[id] = { best: null, wins: 0, medal: 0, completed: false });
    e.completed = true;
    if (res.time != null && (e.best == null || res.time < e.best)) e.best = res.time;
    if (res.position === 1) { e.wins++; e.medal = Math.max(e.medal, 3); }
    else if (res.position <= 2) e.medal = Math.max(e.medal, 2);
    else if (res.position <= 3) e.medal = Math.max(e.medal, 1);
    this.persist();
    return e;
  }
  recordActivity(key, value, better = 'max') {
    const cur = this.data.activities[key];
    const isBetter = cur == null || (better === 'max' ? value > cur : value < cur);
    if (isBetter) this.data.activities[key] = value;
    this.persist();
    return isBetter;
  }
  bump(stat, n = 1) { this.data.stats[stat] = (this.data.stats[stat] || 0) + n; this.persist(); }
  max(stat, n) { if (n > (this.data.stats[stat] || 0)) { this.data.stats[stat] = n; this.persist(); } }
}

export const SaveData = new Save();
export default SaveData;
