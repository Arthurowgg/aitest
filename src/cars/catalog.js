// ============================================================================
// APEX HORIZON — car catalogue (fictional marques, real character)
// ============================================================================
// body profile arrays: [x (0 front .. 1 rear), widthFactor, topHeight]
export const CARS = [
  {
    id: 'kurogane-r', name: 'R-Spec GT', maker: 'Kurogane', year: 1998, origin: 'Japan',
    cls: 'B', pi: 612, price: 0,
    blurb: 'The legend. Twin-turbo straight six, attessa-style AWD, and a soundtrack that raised a generation.',
    body: { length: 4.66, width: 1.86, height: 1.32, wheelbase: 2.68, clearance: 0.16, nose: 0.62, tail: 0.7, cabin: 0.78, wing: 1 },
    perf: { power: 520, mass: 1480, grip: 1.62, brake: 1.5, top: 312, accel: 8.6, handling: 8.2, launch: 8.8 },
    engine: { cyl: 6, idle: 850, redline: 8000, turbo: true, gears: 6 },
    drivetrain: 'awd',
    colors: [0x1d4fd7, 0xb8122a, 0x0e0f12, 0xe8ecf2, 0x0f7a4a, 0x6b2ea8],
  },
  {
    id: 'vindicator-gt', name: 'Vindicator GT 5.0', maker: 'Halverson Motors', year: 2024, origin: 'USA',
    cls: 'A', pi: 705, price: 96000,
    blurb: 'Eight cylinders of naturally-aspirated argument. Rear-wheel drive and zero apologies.',
    body: { length: 4.92, width: 1.98, height: 1.36, wheelbase: 2.82, clearance: 0.15, nose: 0.55, tail: 0.78, cabin: 0.74, wing: 0 },
    perf: { power: 760, mass: 1680, grip: 1.55, brake: 1.55, top: 322, accel: 8.4, handling: 7.4, launch: 7.8 },
    engine: { cyl: 8, idle: 750, redline: 7200, turbo: false, gears: 6 },
    drivetrain: 'rwd',
    colors: [0xd7263d, 0x101418, 0xf2f4f8, 0x1b6ef3, 0xff8c1a, 0x24303c],
  },
  {
    id: 'velocita-f12', name: 'F12 Tempesta', maker: 'Velocità', year: 2025, origin: 'Italy',
    cls: 'S', pi: 828, price: 268000,
    blurb: 'Mid-mounted V12, active aero, and a redline that sounds like the end of the world.',
    body: { length: 4.72, width: 2.02, height: 1.18, wheelbase: 2.72, clearance: 0.11, nose: 0.42, tail: 0.6, cabin: 0.62, wing: 2 },
    perf: { power: 950, mass: 1420, grip: 1.85, brake: 1.8, top: 352, accel: 9.4, handling: 9.1, launch: 9.3 },
    engine: { cyl: 12, idle: 950, redline: 9500, turbo: false, gears: 8 },
    drivetrain: 'awd',
    colors: [0xc8102e, 0xffd100, 0x0c0d10, 0x2c8c46, 0xe8e8e8, 0x143a6b],
  },
  {
    id: 'ashford-vulcan', name: 'Vulcan GT', maker: 'Ashford', year: 2023, origin: 'Britain',
    cls: 'A', pi: 742, price: 152000,
    blurb: 'Hand-stitched grand tourer with a supercharged V8. Crosses continents, corners anyway.',
    body: { length: 4.86, width: 1.96, height: 1.28, wheelbase: 2.86, clearance: 0.13, nose: 0.5, tail: 0.72, cabin: 0.7, wing: 0 },
    perf: { power: 720, mass: 1620, grip: 1.66, brake: 1.62, top: 334, accel: 8.7, handling: 8.0, launch: 8.2 },
    engine: { cyl: 8, idle: 800, redline: 7400, turbo: true, gears: 8 },
    drivetrain: 'awd',
    colors: [0x0f5132, 0x1a1d24, 0x7a8494, 0x5c1a2e, 0xd9d9d9, 0x274b8f],
  },
  {
    id: 'kaze-86', name: 'Kaze 86 Sprint', maker: 'Kaze', year: 1986, origin: 'Japan',
    cls: 'D', pi: 420, price: 24000,
    blurb: 'Light, slow, and completely hilarious. The drift-school headmaster.',
    body: { length: 4.24, width: 1.7, height: 1.3, wheelbase: 2.42, clearance: 0.18, nose: 0.66, tail: 0.8, cabin: 0.82, wing: 0 },
    perf: { power: 235, mass: 980, grip: 1.28, brake: 1.1, top: 226, accel: 6.4, handling: 7.8, launch: 6.0 },
    engine: { cyl: 4, idle: 900, redline: 7800, turbo: false, gears: 5 },
    drivetrain: 'rwd',
    colors: [0xf4f6f8, 0x111318, 0xd7263d, 0x1b6ef3, 0xffc23c, 0x2b2f36],
  },
  {
    id: 'kaiser-k9', name: 'K9 Turbo', maker: 'Kaiserwerk', year: 2024, origin: 'Germany',
    cls: 'B', pi: 664, price: 118000,
    blurb: 'Rear-engine precision instrument. Flat-six howl, surgical steering, legendary balance.',
    body: { length: 4.58, width: 1.9, height: 1.29, wheelbase: 2.46, clearance: 0.13, nose: 0.5, tail: 0.85, cabin: 0.72, wing: 1 },
    perf: { power: 640, mass: 1520, grip: 1.74, brake: 1.7, top: 330, accel: 8.9, handling: 8.9, launch: 8.6 },
    engine: { cyl: 6, idle: 900, redline: 8400, turbo: true, gears: 8 },
    drivetrain: 'rwd',
    colors: [0x2e3a46, 0xd9d9d9, 0x0c0d10, 0x8c1c2c, 0x1f6b3a, 0xd78a1e],
  },
  {
    id: 'tundra-raid', name: 'Raid Baja', maker: 'Tundra', year: 2022, origin: 'Sweden',
    cls: 'C', pi: 540, price: 62000,
    blurb: 'Long-travel suspension, five cylinders of gravel-gobbling torque. Jumps are roads here.',
    body: { length: 4.7, width: 2.04, height: 1.78, wheelbase: 2.9, clearance: 0.42, nose: 0.72, tail: 0.82, cabin: 0.86, wing: 0, truck: true },
    perf: { power: 460, mass: 1850, grip: 1.35, brake: 1.25, top: 214, accel: 7.4, handling: 6.6, launch: 7.6 },
    engine: { cyl: 5, idle: 800, redline: 6800, turbo: true, gears: 6 },
    drivetrain: 'awd',
    colors: [0xd78a1e, 0x1a1d24, 0x2c6e49, 0xb8c0c8, 0x7a1f2b, 0x27354a],
  },
  {
    id: 'shirai-ev', name: 'Shirai EV-X', maker: 'Shirai Dynamics', year: 2026, origin: 'Japan',
    cls: 'S', pi: 802, price: 214000,
    blurb: 'Quad-motor electric hypercar. Instant torque, silent violence, torque-vectoring sorcery.',
    body: { length: 4.68, width: 2.0, height: 1.2, wheelbase: 2.8, clearance: 0.12, nose: 0.4, tail: 0.55, cabin: 0.6, wing: 2 },
    perf: { power: 1020, mass: 1780, grip: 1.88, brake: 1.85, top: 322, accel: 9.7, handling: 8.8, launch: 9.8 },
    engine: { cyl: 0, idle: 0, redline: 12000, turbo: false, gears: 1, electric: true },
    drivetrain: 'awd',
    colors: [0x12b8c9, 0x0c0d10, 0xe8e8e8, 0x6b2ea8, 0x1b6ef3, 0x9dff3c],
  },
];

export const CAR_BY_ID = Object.fromEntries(CARS.map((c) => [c.id, c]));

export const PAINT_FINISHES = ['gloss', 'metallic', 'matte', 'satin', 'pearl', 'chrome'];

export function carStats(car, upgrades = {}) {
  const u = (k) => (upgrades[k] || 0);
  const p = car.perf;
  const power = p.power * (1 + u('engine') * 0.07);
  const mass = p.mass * (1 - u('weight') * 0.035);
  const grip = p.grip * (1 + u('tires') * 0.045);
  const brake = p.brake * (1 + u('brakes') * 0.06);
  const top = p.top * (1 + u('aero') * 0.015 + u('engine') * 0.01);
  const pi = Math.round(car.pi * (1 + (u('engine') + u('tires') + u('brakes') + u('weight') + u('aero') + u('turbo')) * 0.022));
  return { power, mass, grip, brake, top, pi };
}

export const UPGRADES = [
  { k: 'engine', name: 'Engine & ECU', desc: '+7% power per stage', max: 4, cost: [6000, 12000, 22000, 38000] },
  { k: 'turbo', name: 'Forced Induction', desc: 'Faster spool, more top-end', max: 3, cost: [9000, 18000, 30000] },
  { k: 'tires', name: 'Compound Tyres', desc: '+4.5% grip per stage', max: 4, cost: [4000, 8000, 15000, 26000] },
  { k: 'brakes', name: 'Carbon Brakes', desc: '+6% braking per stage', max: 3, cost: [5000, 10000, 19000] },
  { k: 'weight', name: 'Lightweighting', desc: '-3.5% mass per stage', max: 4, cost: [5000, 11000, 20000, 34000] },
  { k: 'aero', name: 'Aero Package', desc: 'Downforce & top speed', max: 3, cost: [7000, 14000, 25000] },
];
