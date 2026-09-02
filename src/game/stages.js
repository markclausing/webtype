/**
 * The five stages, written down rather than generated.
 *
 * Every wave, every turret and every pickup sits at a fixed world x, and that is
 * a design decision rather than a shortcut. A shooter of this kind is learned:
 * you die at the same place three times and the fourth time you are ready for
 * it, and none of that works if the corridor is different every run. It is also
 * the only way the score board can mean anything - two people racing a number
 * have to have been given the same problem.
 *
 * It matters twice over for the repairs. Hull is the currency of this game, so a
 * repair that turned up when the dice felt like it would decide runs. These are
 * at named points: the same ones, in the same places, for everybody, every time.
 *
 * Past the fifth stage the run does not stop; it comes round again harder. See
 * LOOP_HP and friends in constants.js for what "harder" is allowed to mean.
 */

import {
  LOOP_CROWD, LOOP_QUIET, QUIET_FLOOR, QUIET_RUN, SCROLL_SPEED, VIEW_H, VIEW_W,
} from '../constants.js';
import { buildTerrain } from './terrain.js';

/** How far off the right-hand edge something is created. */
export const SPAWN_MARGIN = 26;

/**
 * One entry in a stage script.
 *
 * `at` is where in the corridor it belongs, and everything else is the foe or
 * the pickup itself. Groups are written as one line and expanded at load time
 * into as many entries as they hold - spaced in world units rather than in
 * ticks, which comes to the same thing because the corridor scrolls at a
 * constant speed, and is much easier to read on a page.
 */
function wave(at, kind, opts = {}) {
  const { n = 1, spacing = 46, ...rest } = opts;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ at: at + i * spacing, kind, ...rest });
  return out;
}

/** A pickup lying in the corridor. */
function gift(at, give, y = VIEW_H / 2) {
  return [{ at, kind: 'gift', give, y }];
}

const s1 = [
  ...wave(300, 'drone', { y: 90, n: 4, spacing: 40 }),
  ...wave(520, 'drone', { y: 180, n: 4, spacing: 40 }),
  ...wave(760, 'orb', { y: 135, give: 'red' }),
  ...wave(900, 'drone', { y: 60, n: 3, spacing: 36 }),
  ...wave(900, 'drone', { y: 210, n: 3, spacing: 36 }),
  ...wave(1180, 'turret', { y: 'floor' }),
  ...wave(1320, 'turret', { y: 'ceil' }),
  ...gift(1400, 'speed', 120),
  ...wave(1520, 'swoop', { y: 70, n: 3, spacing: 54 }),
  ...wave(1760, 'mine', { y: 100, n: 5, spacing: 44 }),
  ...wave(1980, 'turret', { y: 'floor' }),
  ...wave(2040, 'turret', { y: 'floor' }),
  ...wave(2180, 'swoop', { y: 200, n: 4, spacing: 48 }),
  ...gift(2320, 'missile', 150),
  ...wave(2460, 'walker', { y: 'floor' }),
  ...wave(2600, 'drone', { y: 135, n: 6, spacing: 34 }),
  ...wave(2820, 'carrier', { y: 110, give: 'speed' }),
  ...wave(3060, 'turret', { y: 'ceil' }),
  ...wave(3120, 'turret', { y: 'floor' }),
  ...wave(3260, 'swoop', { y: 135, n: 5, spacing: 40 }),
  // Past the opening the approach stops being a demonstration and starts being
  // a stage. Everything below sits in the back two thirds on purpose.
  ...wave(1240, 'drone', { y: 190, n: 4, spacing: 32 }),
  ...wave(1600, 'drone', { y: 150, n: 4, spacing: 30 }),
  ...wave(1860, 'swoop', { y: 180, n: 3, spacing: 44 }),
  ...wave(2100, 'mine', { y: 150, n: 4, spacing: 40 }),
  ...wave(2380, 'drone', { y: 100, n: 5, spacing: 28 }),
  ...wave(2560, 'swoop', { y: 70, n: 4, spacing: 36 }),
  ...wave(2700, 'drone', { y: 185, n: 5, spacing: 28 }),
  ...wave(2960, 'mine', { y: 120, n: 5, spacing: 34 }),
  ...wave(3160, 'swoop', { y: 100, n: 4, spacing: 32 }),
  ...wave(3340, 'drone', { y: 170, n: 6, spacing: 26 }),
  ...wave(3420, 'drone', { y: 95, n: 6, spacing: 26 }),
];

const s2 = [
  ...wave(280, 'mine', { y: 80, n: 4, spacing: 40 }),
  ...wave(300, 'mine', { y: 190, n: 4, spacing: 40 }),
  ...wave(560, 'turret', { y: 'ceil' }),
  ...wave(620, 'turret', { y: 'floor' }),
  ...wave(780, 'snake', { y: 110, len: 7 }),
  ...gift(1020, 'blue', 140),
  ...wave(1160, 'walker', { y: 'floor' }),
  ...wave(1240, 'walker', { y: 'ceil' }),
  ...wave(1420, 'drone', { y: 70, n: 5, spacing: 32 }),
  ...wave(1440, 'drone', { y: 200, n: 5, spacing: 32 }),
  ...wave(1700, 'orb', { y: 135, give: 'missile' }),
  ...wave(1860, 'turret', { y: 'floor' }),
  ...wave(1920, 'turret', { y: 'ceil' }),
  ...wave(1980, 'turret', { y: 'floor' }),
  ...wave(2160, 'swoop', { y: 90, n: 6, spacing: 38 }),
  // The first repair in the run, and it is here on purpose: the spine is where
  // most people first find out what the hull is for.
  ...gift(2400, 'heal', 135),
  ...wave(2560, 'snake', { y: 180, len: 9 }),
  ...wave(2900, 'carrier', { y: 120, give: 'blue' }),
  ...wave(3080, 'mine', { y: 135, n: 7, spacing: 36 }),
  ...wave(3320, 'walker', { y: 'floor' }),
  ...wave(3400, 'turret', { y: 'ceil' }),
  ...wave(1100, 'mine', { y: 150, n: 4, spacing: 36 }),
  ...wave(1560, 'swoop', { y: 160, n: 4, spacing: 38 }),
  ...wave(1780, 'drone', { y: 110, n: 5, spacing: 28 }),
  ...wave(2060, 'mine', { y: 170, n: 5, spacing: 34 }),
  ...wave(2280, 'drone', { y: 120, n: 6, spacing: 26 }),
  ...wave(2700, 'swoop', { y: 150, n: 5, spacing: 34 }),
  ...wave(2980, 'drone', { y: 100, n: 6, spacing: 26 }),
  ...wave(3200, 'swoop', { y: 180, n: 5, spacing: 30 }),
  ...wave(3440, 'mine', { y: 130, n: 6, spacing: 30 }),
];

const s3 = [
  ...wave(260, 'turret', { y: 'floor' }),
  ...wave(320, 'turret', { y: 'ceil' }),
  ...wave(380, 'turret', { y: 'floor' }),
  ...wave(560, 'swoop', { y: 100, n: 5, spacing: 36 }),
  ...gift(760, 'yellow', 150),
  ...wave(900, 'walker', { y: 'floor' }),
  ...wave(960, 'walker', { y: 'floor' }),
  ...wave(1140, 'drone', { y: 60, n: 7, spacing: 30 }),
  ...wave(1380, 'carrier', { y: 190, give: 'speed' }),
  ...wave(1580, 'turret', { y: 'ceil' }),
  ...wave(1640, 'turret', { y: 'ceil' }),
  ...wave(1700, 'turret', { y: 'floor' }),
  ...wave(1880, 'mine', { y: 110, n: 8, spacing: 32 }),
  ...wave(2140, 'snake', { y: 135, len: 9 }),
  ...gift(2380, 'missile', 100),
  ...wave(2500, 'swoop', { y: 210, n: 6, spacing: 34 }),
  ...wave(2740, 'orb', { y: 90, give: 'yellow' }),
  ...wave(2760, 'orb', { y: 190, give: 'red' }),
  ...wave(3000, 'walker', { y: 'ceil' }),
  ...wave(3060, 'walker', { y: 'floor' }),
  ...wave(3240, 'drone', { y: 135, n: 8, spacing: 28 }),
  ...wave(3460, 'turret', { y: 'floor' }),
  ...wave(3520, 'turret', { y: 'ceil' }),
  ...wave(1040, 'swoop', { y: 150, n: 4, spacing: 34 }),
  ...wave(1280, 'mine', { y: 100, n: 4, spacing: 34 }),
  ...wave(1500, 'drone', { y: 180, n: 5, spacing: 28 }),
  ...wave(1780, 'swoop', { y: 120, n: 5, spacing: 32 }),
  ...wave(2000, 'drone', { y: 170, n: 6, spacing: 26 }),
  ...wave(2260, 'mine', { y: 110, n: 5, spacing: 32 }),
  ...wave(2620, 'drone', { y: 150, n: 7, spacing: 24 }),
  ...wave(2880, 'swoop', { y: 90, n: 5, spacing: 30 }),
  ...wave(3140, 'mine', { y: 140, n: 6, spacing: 30 }),
  ...wave(3380, 'drone', { y: 110, n: 7, spacing: 24 }),
  ...wave(3560, 'swoop', { y: 160, n: 6, spacing: 28 }),
];

const s4 = [
  ...wave(300, 'drone', { y: 80, n: 6, spacing: 30 }),
  ...wave(320, 'drone', { y: 190, n: 6, spacing: 30 }),
  ...wave(620, 'snake', { y: 100, len: 11 }),
  ...gift(880, 'red', 135),
  ...wave(1020, 'swoop', { y: 70, n: 4, spacing: 40 }),
  ...wave(1060, 'swoop', { y: 200, n: 4, spacing: 40 }),
  ...wave(1320, 'carrier', { y: 135, give: 'missile' }),
  ...wave(1500, 'turret', { y: 'floor' }),
  ...wave(1560, 'turret', { y: 'ceil' }),
  ...wave(1720, 'mine', { y: 90, n: 6, spacing: 34 }),
  ...wave(1740, 'mine', { y: 180, n: 6, spacing: 34 }),
  ...gift(2200, 'heal', 135),
  ...wave(2320, 'snake', { y: 170, len: 11 }),
  ...wave(2620, 'walker', { y: 'floor' }),
  ...wave(2680, 'walker', { y: 'ceil' }),
  ...wave(2860, 'orb', { y: 110, give: 'blue' }),
  ...wave(3040, 'drone', { y: 135, n: 10, spacing: 24 }),
  ...wave(3300, 'swoop', { y: 135, n: 8, spacing: 30 }),
  ...wave(3560, 'carrier', { y: 90, give: 'speed' }),
  ...wave(1180, 'drone', { y: 150, n: 6, spacing: 26 }),
  ...wave(1420, 'swoop', { y: 110, n: 5, spacing: 32 }),
  ...wave(1900, 'drone', { y: 130, n: 7, spacing: 24 }),
  ...wave(2060, 'swoop', { y: 190, n: 5, spacing: 30 }),
  ...wave(2460, 'mine', { y: 120, n: 6, spacing: 30 }),
  ...wave(2760, 'drone', { y: 170, n: 7, spacing: 24 }),
  ...wave(2980, 'swoop', { y: 100, n: 6, spacing: 28 }),
  ...wave(3180, 'mine', { y: 140, n: 7, spacing: 28 }),
  ...wave(3420, 'drone', { y: 110, n: 8, spacing: 22 }),
  ...wave(3640, 'swoop', { y: 160, n: 6, spacing: 26 }),
];

const s5 = [
  ...wave(260, 'turret', { y: 'floor' }),
  ...wave(300, 'turret', { y: 'ceil' }),
  ...wave(420, 'swoop', { y: 100, n: 6, spacing: 30 }),
  ...wave(660, 'walker', { y: 'floor' }),
  ...wave(720, 'walker', { y: 'ceil' }),
  ...wave(880, 'snake', { y: 120, len: 13 }),
  ...wave(1180, 'mine', { y: 135, n: 10, spacing: 28 }),
  ...gift(1420, 'yellow', 135),
  ...wave(1560, 'carrier', { y: 80, give: 'red' }),
  ...wave(1600, 'carrier', { y: 190, give: 'blue' }),
  // The last repair before the core, and there is not another one.
  ...gift(1800, 'heal', 135),
  ...wave(1960, 'drone', { y: 60, n: 9, spacing: 24 }),
  ...wave(1980, 'drone', { y: 210, n: 9, spacing: 24 }),
  ...wave(2280, 'turret', { y: 'floor' }),
  ...wave(2320, 'turret', { y: 'ceil' }),
  ...wave(2380, 'turret', { y: 'floor' }),
  ...wave(2540, 'snake', { y: 150, len: 13 }),
  ...gift(2820, 'missile', 110),
  ...wave(2960, 'orb', { y: 100, give: 'yellow' }),
  ...wave(3000, 'orb', { y: 180, give: 'red' }),
  ...wave(3220, 'swoop', { y: 135, n: 10, spacing: 26 }),
  ...wave(3480, 'walker', { y: 'floor' }),
  ...wave(3540, 'walker', { y: 'ceil' }),
  ...wave(1060, 'swoop', { y: 150, n: 5, spacing: 30 }),
  ...wave(1300, 'drone', { y: 110, n: 6, spacing: 24 }),
  ...wave(1680, 'mine', { y: 140, n: 6, spacing: 28 }),
  ...wave(2100, 'swoop', { y: 120, n: 6, spacing: 28 }),
  ...wave(2200, 'drone', { y: 180, n: 7, spacing: 24 }),
  ...wave(2460, 'mine', { y: 150, n: 7, spacing: 26 }),
  ...wave(2680, 'swoop', { y: 100, n: 6, spacing: 26 }),
  ...wave(2880, 'drone', { y: 160, n: 8, spacing: 22 }),
  ...wave(3100, 'mine', { y: 130, n: 7, spacing: 26 }),
  ...wave(3340, 'drone', { y: 110, n: 8, spacing: 22 }),
  ...wave(3600, 'swoop', { y: 150, n: 7, spacing: 24 }),
  ...wave(3700, 'drone', { y: 180, n: 8, spacing: 20 }),
];

/**
 * The stages themselves.
 *
 * `frames` is the corridor, `script` is what is in it, `boss` is what is waiting
 * at the end of it. `theme` is the only part of this the simulation never looks
 * at - two machines may draw it differently and nothing breaks, though of course
 * they will not.
 */
export const STAGES = [
  {
    key: 'approach',
    name: 'THE APPROACH',
    blurb: 'Open sky and a long look at what is coming. Learn the charge here; '
      + 'you will not get another quiet stage.',
    length: 3560,
    speed: 1,
    rough: 1,
    frames: [
      { at: 0, ceil: 16, floor: 254 },
      { at: 700, ceil: 30, floor: 240 },
      { at: 1200, ceil: 62, floor: 224 },
      { at: 1800, ceil: 74, floor: 196 },
      { at: 2200, ceil: 44, floor: 232 },
      { at: 2700, ceil: 66, floor: 210 },
      { at: 3100, ceil: 26, floor: 246 },
      { at: 3560, ceil: 14, floor: 256 },
    ],
    script: s1,
    theme: {
      sky: '#050a16',
      far: '#101c33',
      near: '#1b2d4d',
      rock: '#24384f',
      edge: '#4d7fa8',
      dust: '#7fb2d8',
      star: '#bcd8f0',
    },
    boss: {
      name: 'GATEKEEPER',
      hp: 150,
      w: 74,
      h: 96,
      core: { dx: -22, dy: 0, r: 15 },
      pattern: 'hover',
      speed: 44,
      colour: '#5f86b8',
      glow: '#9fd4ff',
      guns: [
        { dx: -30, dy: -34, every: 74, mode: 'aimed', n: 1 },
        { dx: -30, dy: 34, every: 74, mode: 'aimed', n: 1 },
        { dx: -34, dy: 0, every: 150, mode: 'fan', n: 5, spread: 0.9 },
      ],
    },
  },
  {
    key: 'spine',
    name: 'THE SPINE',
    blurb: 'The corridor closes. Half of what kills you here is the rock, and the '
      + 'pod is a shield if you put it in front of you.',
    length: 3520,
    speed: 1.06,
    rough: 1.5,
    frames: [
      { at: 0, ceil: 18, floor: 252 },
      { at: 500, ceil: 58, floor: 208 },
      { at: 900, ceil: 96, floor: 176 },
      { at: 1300, ceil: 62, floor: 220 },
      { at: 1700, ceil: 104, floor: 168 },
      { at: 2100, ceil: 40, floor: 236 },
      { at: 2500, ceil: 92, floor: 182 },
      { at: 2900, ceil: 110, floor: 160 },
      { at: 3200, ceil: 40, floor: 230 },
      { at: 3520, ceil: 14, floor: 256 },
    ],
    script: s2,
    theme: {
      sky: '#0a0616',
      far: '#1d1233',
      near: '#2e1d4d',
      rock: '#3a2650',
      edge: '#8f5fd0',
      dust: '#c79bf0',
      star: '#e0c8ff',
    },
    boss: {
      name: 'VERTEBRA',
      hp: 190,
      w: 60,
      h: 60,
      core: { dx: 0, dy: 0, r: 17 },
      pattern: 'weave',
      speed: 62,
      tail: 8,
      colour: '#7a4fb5',
      glow: '#d3a6ff',
      guns: [
        { dx: -24, dy: 0, every: 58, mode: 'aimed', n: 3, spread: 0.34 },
        { dx: 0, dy: 0, every: 180, mode: 'ring', n: 12 },
      ],
    },
  },
  {
    key: 'foundry',
    name: 'THE FOUNDRY',
    blurb: 'Gun emplacements in the walls, and the walls are most of the stage. '
      + 'Something has to be pointed at them, and it is not always you.',
    length: 3620,
    speed: 1.12,
    rough: 1.2,
    frames: [
      { at: 0, ceil: 16, floor: 254 },
      { at: 400, ceil: 74, floor: 196 },
      { at: 800, ceil: 46, floor: 234 },
      { at: 1300, ceil: 88, floor: 184 },
      { at: 1700, ceil: 36, floor: 240 },
      { at: 2100, ceil: 96, floor: 172 },
      { at: 2600, ceil: 52, floor: 226 },
      { at: 3000, ceil: 84, floor: 190 },
      { at: 3300, ceil: 30, floor: 242 },
      { at: 3620, ceil: 14, floor: 256 },
    ],
    script: s3,
    theme: {
      sky: '#160803',
      far: '#341409',
      near: '#4f2010',
      rock: '#552713',
      edge: '#d1712a',
      dust: '#ffab5e',
      star: '#ffd9a8',
    },
    boss: {
      name: 'CRUCIBLE',
      hp: 240,
      w: 88,
      h: 108,
      core: { dx: -30, dy: 0, r: 14 },
      pattern: 'charge',
      speed: 78,
      colour: '#b5622a',
      glow: '#ffbb66',
      guns: [
        { dx: -40, dy: -44, every: 46, mode: 'aimed', n: 1 },
        { dx: -40, dy: 44, every: 46, mode: 'aimed', n: 1 },
        { dx: -44, dy: 0, every: 128, mode: 'burst', n: 4, spread: 0.5 },
      ],
    },
  },
  {
    key: 'shoal',
    name: 'THE SHOAL',
    blurb: 'Everything moves at once and none of it is in a straight line. The '
      + 'search rings were made for this stage.',
    length: 3760,
    speed: 1.16,
    rough: 0.9,
    frames: [
      { at: 0, ceil: 16, floor: 254 },
      { at: 600, ceil: 40, floor: 230 },
      { at: 1100, ceil: 24, floor: 246 },
      { at: 1600, ceil: 68, floor: 202 },
      { at: 2100, ceil: 32, floor: 238 },
      { at: 2600, ceil: 58, floor: 212 },
      { at: 3100, ceil: 26, floor: 244 },
      { at: 3760, ceil: 14, floor: 256 },
    ],
    script: s4,
    theme: {
      sky: '#02100f',
      far: '#0a2b2a',
      near: '#0f423f',
      rock: '#124a44',
      edge: '#2fbfa8',
      dust: '#7cf0d8',
      star: '#c2fff0',
    },
    boss: {
      name: 'SHOALMOTHER',
      hp: 280,
      w: 78,
      h: 100,
      core: { dx: -18, dy: 0, r: 16 },
      pattern: 'hover',
      speed: 58,
      colour: '#1f8f80',
      glow: '#8affe4',
      spawns: { kind: 'drone', every: 92, n: 2 },
      guns: [
        { dx: -34, dy: 0, every: 84, mode: 'fan', n: 7, spread: 1.3 },
        { dx: -34, dy: -30, every: 120, mode: 'aimed', n: 2, spread: 0.24 },
        { dx: -34, dy: 30, every: 120, mode: 'aimed', n: 2, spread: 0.24 },
      ],
    },
  },
  {
    key: 'core',
    name: 'THE CORE',
    blurb: 'All of it, at once, in the dark. Nothing here is new; there is just '
      + 'more of it and less room.',
    length: 3820,
    speed: 1.22,
    rough: 1.4,
    frames: [
      { at: 0, ceil: 16, floor: 254 },
      { at: 450, ceil: 84, floor: 188 },
      { at: 900, ceil: 44, floor: 232 },
      { at: 1350, ceil: 100, floor: 172 },
      { at: 1750, ceil: 58, floor: 214 },
      { at: 2200, ceil: 112, floor: 158 },
      { at: 2650, ceil: 48, floor: 226 },
      { at: 3050, ceil: 96, floor: 176 },
      { at: 3400, ceil: 30, floor: 242 },
      { at: 3820, ceil: 14, floor: 256 },
    ],
    script: s5,
    theme: {
      sky: '#0d0208',
      far: '#2e0713',
      near: '#4a0d1e',
      rock: '#511024',
      edge: '#e03c5a',
      dust: '#ff8098',
      star: '#ffc6d2',
    },
    boss: {
      name: 'THE CORE',
      hp: 340,
      w: 96,
      h: 120,
      core: { dx: 0, dy: 0, r: 20 },
      pattern: 'charge',
      speed: 66,
      colour: '#a81f3c',
      glow: '#ff7f96',
      spawns: { kind: 'mine', every: 130, n: 3 },
      guns: [
        { dx: -40, dy: 0, every: 70, mode: 'ring', n: 14 },
        { dx: -44, dy: -40, every: 54, mode: 'aimed', n: 1 },
        { dx: -44, dy: 40, every: 54, mode: 'aimed', n: 1 },
        { dx: -46, dy: 0, every: 190, mode: 'burst', n: 6, spread: 0.7 },
      ],
    },
  },
];

export const STAGE_KEYS = STAGES.map((s) => s.key);

/** Which of the five a stage number is, and how many times round it is. */
export function stageIndex(n) {
  return ((n % STAGES.length) + STAGES.length) % STAGES.length;
}

export function loopOf(n) {
  return Math.floor(n / STAGES.length);
}

/**
 * Turns a script into the order it will actually be spawned in.
 *
 * Two kinds of entry, and they are triggered at different moments. Something
 * that flies is created just off the right-hand edge, so it is triggered when
 * the corridor has scrolled as far as the mark it was written at. Something
 * bolted to the rock - a turret, a walker, a pickup lying in the corridor -
 * belongs at a particular place in the stage, so it is created a screen's width
 * early, at that place, and arrives on its own.
 *
 * Sorting by the mark rather than by the trigger would stall the second kind
 * behind the first: a turret at 1180 has to exist by the time the corridor
 * reaches 674, and a cursor still waiting on a flyer written at 900 would pop it
 * into the middle of the screen instead. So the triggers are worked out first
 * and the list is sorted by those.
 */
function schedule(script) {
  return script
    .map((e) => {
      const fixed = e.kind === 'gift' || e.y === 'floor' || e.y === 'ceil';
      return fixed
        ? { ...e, trigger: e.at - VIEW_W - SPAWN_MARGIN, fixed: true }
        : { ...e, trigger: e.at, fixed: false };
    })
    .sort((a, b) => a.trigger - b.trigger);
}

/**
 * The same wave, on the other side of the corridor and a little later.
 *
 * Used to build the extra copies a later lap flies through. Mirroring rather
 * than simply repeating matters: the same six drones coming along the ceiling
 * instead of the floor is a different problem to solve, where a second identical
 * wave is the same problem twice and reads as padding.
 */
function mirror(wave, offset) {
  const y = wave.y === 'floor' ? 'ceil'
    : wave.y === 'ceil' ? 'floor'
      : VIEW_H - wave.y;
  return { ...wave, at: wave.at + offset, y };
}

/**
 * A stage's script with the extra waves a later lap gets.
 *
 * Two rules do all the work. Nothing before the quiet mark is touched, so every
 * stage still opens with something you can read - though the quiet mark itself
 * shrinks each lap, because the tenth time through the approach nobody needs
 * showing round. And pickups are never copied: they are the one scarce thing in
 * the game, and a lap that handed out two of every repair would be an easier
 * lap rather than a harder one.
 *
 * Which waves get copied is spread evenly through what is left rather than
 * taken from the front - the same trick a line-drawing algorithm uses to put a
 * fraction of one thing evenly along another - so a lap and a third of a script
 * is a third more everywhere, not a doubled first act and an untouched second.
 */
export function reinforce(script, loop) {
  if (loop <= 0) return script;
  const quiet = Math.max(QUIET_FLOOR, QUIET_RUN - loop * LOOP_QUIET);
  const extra = loop * LOOP_CROWD;
  const out = [...script];
  let eligible = 0;
  for (const wave of script) {
    if (wave.kind === 'gift' || wave.at < quiet) continue;
    const copies = Math.floor((eligible + 1) * extra) - Math.floor(eligible * extra);
    for (let c = 0; c < copies; c++) out.push(mirror(wave, 20 + c * 26));
    eligible++;
  }
  return out;
}

const cache = new Map();
const rock = new Map();

/**
 * A stage, ready to play: its corridor sampled, its script sorted.
 *
 * Pure and cached, so every machine gets the identical stage and no machine
 * builds it twice. Cached per lap as well as per stage, because the script is
 * not the same on the second time round - see reinforce(). The corridor is,
 * which is why the terrain has a cache of its own: the rock never changes, only
 * what is flying about in front of it.
 *
 * Nothing in here touches the run's state or its random numbers.
 */
export function loadStage(n) {
  const index = stageIndex(n);
  const loop = loopOf(n);
  const name = STAGE_KEYS[index];
  const key = `${name}:${loop}`;
  let found = cache.get(key);
  if (!found) {
    const def = STAGES[index];
    if (!rock.has(name)) {
      rock.set(name, buildTerrain(def.frames, def.length + 900, def.rough));
    }
    found = {
      ...def,
      loop,
      terrain: rock.get(name),
      // The boss arena is the last stretch, past everything in the script. The
      // corridor keeps scrolling until the boss is dead, so this is where it
      // stops rather than where the stage ends.
      bossAt: def.length,
      script: schedule(reinforce(def.script, loop)),
      scroll: SCROLL_SPEED * def.speed,
    };
    cache.set(key, found);
  }
  return found;
}
