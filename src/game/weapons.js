/**
 * Everything the players can put in the air.
 *
 * Kept apart from sim.js because it is the part of the game that gets fiddled
 * with most: a shooter lives or dies on how its guns feel, and a gun you have to
 * find in the middle of a collision loop is a gun nobody tunes. Each function
 * here only ever pushes onto `state.shots`; what those shots then hit is the
 * simulation's business.
 *
 * A shot is a plain object with a `kind`, and `stepShot` is the one place that
 * knows how each kind moves. Everything about a weapon that is a number lives in
 * constants.js.
 */

import {
  BEAM_DMG_MAX, BEAM_DMG_MIN, BEAM_SPEED, CHARGE_FULL, CHARGE_MIN, CHARGE_PIERCE,
  DT, MISSILE_DMG, MISSILE_LIFE, MISSILE_SPEED, MISSILE_TURN, PELLET_DMG, PELLET_R,
  PELLET_SPEED, POD_KINDS, REFLECT_BOUNCES, REFLECT_DMG, REFLECT_SPEED, SEARCH_COUNT,
  SEARCH_DMG, SEARCH_LIFE, SEARCH_SPEED, SEARCH_TURN, SPREAD_ARC, SPREAD_COUNT,
  SPREAD_DMG, SPREAD_LIFE, SPREAD_SPEED,
} from '../constants.js';
import { inRock, rockNormal } from './terrain.js';
import { target } from './foes.js';

function add(state, shot) {
  state.shots.push({
    id: state.nextId++,
    life: 240,
    r: PELLET_R,
    pierce: false,
    hit: null,
    power: 0,
    ...shot,
  });
}

/** The pea shooter: what the button does when you do not hold it. */
export function firePellet(state, ship, from = null) {
  const at = from || ship;
  add(state, {
    kind: 'pellet',
    seat: ship.index,
    x: at.x + 14,
    y: at.y,
    vx: PELLET_SPEED,
    vy: 0,
    dmg: PELLET_DMG,
    r: PELLET_R,
  });
  state.events.push({ type: 'shot', seat: ship.index, x: at.x + 14, y: at.y });
}

/**
 * What a released charge is worth.
 *
 * Below CHARGE_MIN it is not a beam at all, which is what makes tapping safe:
 * you cannot accidentally spend a charge you never had. Above it the damage
 * climbs to BEAM_DMG_MAX at a full wind-up, and past CHARGE_PIERCE the beam
 * stops being stopped by whatever it kills - which is the moment it is worth
 * having stopped shooting for.
 */
export function chargeLevel(charge) {
  if (charge < CHARGE_MIN) return 0;
  return Math.min(1, (charge - CHARGE_MIN) / (CHARGE_FULL - CHARGE_MIN));
}

export function fireBeam(state, ship) {
  const power = chargeLevel(ship.charge);
  if (power <= 0) {
    firePellet(state, ship);
    return;
  }
  const pierce = ship.charge >= CHARGE_PIERCE;
  add(state, {
    kind: 'beam',
    seat: ship.index,
    x: ship.x + 16,
    y: ship.y,
    vx: BEAM_SPEED,
    vy: 0,
    dmg: Math.round(BEAM_DMG_MIN + (BEAM_DMG_MAX - BEAM_DMG_MIN) * power),
    r: 6 + power * 12,
    power,
    pierce,
    // Only a piercing beam needs to remember: one that stops at the first thing
    // it hits can never meet the same thing twice.
    hit: pierce ? [] : null,
    life: 180,
  });
  state.events.push({
    type: 'beam', seat: ship.index, power, pierce, x: ship.x + 16, y: ship.y,
  });
}

/** The rack under the wing, once you have found one. Fired alongside everything. */
export function fireMissiles(state, ship) {
  for (let i = 0; i < ship.missiles; i++) {
    const up = i % 2 === 0 ? -1 : 1;
    add(state, {
      kind: 'missile',
      seat: ship.index,
      x: ship.x + 2,
      y: ship.y + up * 5,
      vx: MISSILE_SPEED * 0.4,
      vy: up * 120,
      dmg: MISSILE_DMG,
      r: 4,
      life: MISSILE_LIFE,
      lock: 0,
    });
  }
  if (ship.missiles) state.events.push({ type: 'missile', seat: ship.index });
}

/**
 * The pod's own gun, which is three completely different guns depending on what
 * it last swallowed.
 *
 * They are meant to be choices rather than an upgrade ladder: the spread is
 * murderous at the range where being that close is a bad idea, the reflector
 * turns the corridor itself into the weapon, and the search rings hit whatever
 * you cannot see but do not hit it hard.
 */
export function firePod(state, ship) {
  const pod = ship.pod;
  const level = Math.max(0, Math.min(2, pod.level - 1));
  const colour = POD_KINDS[pod.kind]?.colour;

  if (pod.kind === 'red') {
    const n = SPREAD_COUNT[level];
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * SPREAD_ARC * 2;
      add(state, {
        kind: 'shard',
        seat: ship.index,
        x: pod.x,
        y: pod.y,
        vx: Math.cos(a) * SPREAD_SPEED,
        vy: Math.sin(a) * SPREAD_SPEED,
        dmg: SPREAD_DMG,
        r: 4,
        life: SPREAD_LIFE,
        colour,
      });
    }
  } else if (pod.kind === 'blue') {
    for (const up of [-1, 1]) {
      add(state, {
        kind: 'bolt',
        seat: ship.index,
        x: pod.x,
        y: pod.y,
        vx: REFLECT_SPEED,
        vy: up * REFLECT_SPEED * 0.42,
        dmg: REFLECT_DMG,
        r: 4,
        life: 200,
        bounces: REFLECT_BOUNCES[level],
        colour,
      });
    }
  } else if (pod.kind === 'yellow') {
    const n = SEARCH_COUNT[level];
    for (let i = 0; i < n; i++) {
      add(state, {
        kind: 'ring',
        seat: ship.index,
        x: pod.x,
        y: pod.y,
        vx: SEARCH_SPEED,
        vy: (i - (n - 1) / 2) * 60,
        dmg: SEARCH_DMG,
        r: 6,
        life: SEARCH_LIFE,
        colour,
      });
    }
  }
  state.events.push({
    type: 'podshot', seat: ship.index, kind: pod.kind, x: pod.x, y: pod.y,
  });
}

/** Turns a heading towards something, at a limited rate. The whole of homing. */
function steer(shot, toX, toY, rate) {
  const want = Math.atan2(toY - shot.y, toX - shot.x);
  const have = Math.atan2(shot.vy, shot.vx);
  let d = want - have;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const turn = Math.max(-rate * DT, Math.min(rate * DT, d));
  const speed = Math.hypot(shot.vx, shot.vy);
  const a = have + turn;
  shot.vx = Math.cos(a) * speed;
  shot.vy = Math.sin(a) * speed;
}

/**
 * One tick of one shot. Returns false when it is finished with.
 *
 * The rock is checked here rather than in the collision pass because what
 * hitting it means is a property of the weapon: a pellet stops, a bolt bounces,
 * and a fully charged beam does not care.
 */
export function stepShot(state, shot) {
  shot.life--;
  if (shot.life <= 0) return false;

  if (shot.kind === 'missile') {
    // A missile flies out sideways before it turns, so a pair of them leaves
    // the wing rather than the nose and you can see where they went.
    shot.lock++;
    if (shot.lock > 12) {
      const to = nearestFoe(state, shot);
      if (to) steer(shot, to.x, to.y, MISSILE_TURN);
      else steer(shot, shot.x + 200, shot.y, MISSILE_TURN);
      const speed = Math.hypot(shot.vx, shot.vy);
      const want = MISSILE_SPEED;
      if (speed < want) {
        shot.vx *= want / Math.max(1, speed);
        shot.vy *= want / Math.max(1, speed);
      }
    }
  } else if (shot.kind === 'ring') {
    const to = nearestFoe(state, shot);
    if (to) steer(shot, to.x, to.y, SEARCH_TURN);
  }

  shot.x += shot.vx * DT;
  shot.y += shot.vy * DT;

  const terrain = state.stage.terrain;
  if (shot.kind === 'bolt') {
    if (inRock(terrain, shot.x, shot.y, shot.r * 0.4)) {
      if (shot.bounces <= 0) {
        state.events.push({ type: 'spark', x: shot.x, y: shot.y, colour: shot.colour });
        return false;
      }
      shot.bounces--;
      // Straight up or straight down: the surfaces are functions of x, so there
      // is no sideways for a bolt to come off.
      shot.vy = Math.abs(shot.vy) * rockNormal(terrain, shot.x, shot.y);
      shot.y += shot.vy * DT * 2;
      state.events.push({ type: 'bounce', x: shot.x, y: shot.y, colour: shot.colour });
    }
  } else if (shot.kind !== 'beam' || !shot.pierce) {
    if (inRock(terrain, shot.x, shot.y, 0)) {
      state.events.push({ type: 'spark', x: shot.x, y: shot.y, colour: shot.colour });
      return false;
    }
  }

  return true;
}

function nearestFoe(state, from) {
  let best = null;
  let bestD = Infinity;
  const list = state.boss ? [...state.foes, state.boss] : state.foes;
  for (const foe of list) {
    if (foe.dying) continue;
    // Only forwards. A ring that turned round and went home would spend its
    // life orbiting something behind you.
    if (foe.x < from.x - 40) continue;
    const d = (foe.x - from.x) ** 2 + (foe.y - from.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = foe;
    }
  }
  return best;
}
