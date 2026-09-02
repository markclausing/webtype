/**
 * What is in the corridor, and how each of it moves.
 *
 * One table, one entry per kind. Each entry says how much it can take, how big
 * it is to hit, what it is worth, and two behaviours: `move`, which is allowed
 * to change where the thing is, and `aim`, which is only a description of when
 * and how it shoots. The shooting itself is done in sim.js, because bullets
 * belong to the simulation and a table of enemies should not be reaching into
 * it.
 *
 * Nothing in here calls Math.random. Where something needs to look unplanned it
 * is a function of the tick and of the thing's own id, which comes to the same
 * thing on screen and to something very different on two machines trying to
 * agree about a run.
 */

import { DT, VIEW_H, VIEW_W } from '../constants.js';
import { surfaceAt } from './terrain.js';

/** The nearest ship still flying, or null if there is nobody left to chase. */
export function target(state, from) {
  let best = null;
  let bestD = Infinity;
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    const d = (ship.x - from.x) ** 2 + (ship.y - from.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = ship;
    }
  }
  return best;
}

/** Keeps a thing the right way up against whichever surface it is stuck to. */
function cling(state, foe) {
  const { ceil, floor } = surfaceAt(state.stage.terrain, foe.x);
  foe.y = foe.side === 'ceil' ? ceil + foe.r : floor - foe.r;
}

export const FOES = {
  /**
   * The one that is always there. Straight down the corridor with a lazy sway,
   * no gun, worth nothing much - it is a moving obstacle whose job is to be in
   * the way of where you were about to be.
   */
  drone: {
    key: 'drone',
    hp: 3,
    r: 7,
    w: 16,
    h: 12,
    points: 100,
    colour: '#79d0ff',
    move(state, foe) {
      foe.x -= 94 * DT;
      foe.y = foe.baseY + Math.sin((state.tick + foe.id * 17) * 0.075) * 24;
    },
  },

  /**
   * Comes in fast, bends once towards whoever is nearest, and then commits.
   *
   * The bend is deliberately over in about a second. A swooper that kept
   * following you would be a homing missile with wings, and the whole point of
   * it is that it makes a decision early and you get to make it wrong.
   */
  swoop: {
    key: 'swoop',
    hp: 4,
    r: 7,
    w: 18,
    h: 11,
    points: 150,
    colour: '#ff9d5e',
    aim: { mode: 'ship', every: 150, n: 1 },
    move(state, foe) {
      foe.age++;
      if (foe.age < 62) {
        const to = target(state, foe);
        if (to) foe.vy += Math.sign(to.y - foe.y) * 260 * DT;
        foe.vy = Math.max(-150, Math.min(150, foe.vy));
        foe.x -= 118 * DT;
      } else {
        foe.x -= (118 + (foe.age - 62) * 2.4) * DT;
      }
      foe.y += foe.vy * DT;
    },
  },

  /**
   * A drifting bomb. Almost no health and almost no speed, and it takes a piece
   * of you with it whichever way it goes: shoot it and it throws a ring of
   * shrapnel, fly into it and you have paid the same price for less.
   */
  mine: {
    key: 'mine',
    hp: 2,
    r: 8,
    w: 14,
    h: 14,
    points: 60,
    colour: '#c9b3ff',
    burst: 6,
    move(state, foe) {
      foe.x -= 36 * DT;
      foe.y = foe.baseY + Math.sin((state.tick + foe.id * 29) * 0.032) * 14;
    },
  },

  /**
   * Bolted to the rock and therefore never in a hurry. It does not move at all
   * in world terms, which means it comes past at exactly the speed of the
   * corridor, which in turn means the only question it ever asks is whether you
   * dealt with it before it arrived.
   */
  turret: {
    key: 'turret',
    hp: 9,
    r: 9,
    w: 20,
    h: 16,
    points: 250,
    colour: '#8fa4c4',
    clings: true,
    aim: { mode: 'ship', every: 96, n: 1 },
    move(state, foe) {
      cling(state, foe);
    },
  },

  /**
   * Walks up the corridor against the scroll, so it stays on screen roughly
   * twice as long as a turret does and gets roughly twice as many shots away.
   * It is the reason the floor is worth looking at.
   */
  walker: {
    key: 'walker',
    hp: 13,
    r: 10,
    w: 24,
    h: 18,
    points: 300,
    colour: '#b6c46a',
    clings: true,
    aim: { mode: 'ship', every: 74, n: 2, spread: 0.3 },
    move(state, foe) {
      foe.x += 19 * DT;
      cling(state, foe);
    },
  },

  /**
   * The one that is carrying something. Slow, tough, and worth stopping for -
   * every crystal in the game that is not lying in the corridor comes out of
   * one of these, and it is on a fixed mark, so missing it is a decision.
   */
  orb: {
    key: 'orb',
    hp: 17,
    r: 11,
    w: 24,
    h: 24,
    points: 400,
    colour: '#ffd76a',
    aim: { mode: 'ship', every: 112, n: 1 },
    move(state, foe) {
      foe.x -= 42 * DT;
      foe.y = foe.baseY + Math.sin((state.tick + foe.id * 11) * 0.045) * 18;
    },
  },

  /**
   * Comes in, parks in the right-hand third for a few seconds while it empties
   * a magazine at you, and then leaves. Parking means holding station with the
   * corridor rather than standing still, which is why it does its own scrolling.
   */
  carrier: {
    key: 'carrier',
    hp: 24,
    r: 14,
    w: 40,
    h: 28,
    points: 500,
    colour: '#ff7f9c',
    aim: { mode: 'fan', every: 82, n: 3, spread: 0.52 },
    move(state, foe) {
      foe.age++;
      const hold = state.scroll + VIEW_W * 0.72;
      if (foe.age < 250) {
        foe.x += (hold - foe.x) * 0.035;
        foe.y = foe.baseY + Math.sin((state.tick + foe.id * 7) * 0.03) * 26;
      } else {
        foe.x -= (60 + (foe.age - 250) * 2.6) * DT;
      }
    },
  },

  /**
   * The head of a snake. Weaves down the corridor pulling its body behind it,
   * and the body is the part you have to eat through first unless you have
   * something that goes round corners.
   */
  snake: {
    key: 'snake',
    hp: 22,
    r: 8,
    w: 18,
    h: 16,
    points: 700,
    colour: '#8affc0',
    head: true,
    aim: { mode: 'ship', every: 120, n: 1 },
    move(state, foe) {
      foe.age++;
      foe.x -= 76 * DT;
      foe.y = foe.baseY
        + Math.sin(foe.age * 0.055) * 52
        + Math.sin(foe.age * 0.017 + foe.id) * 16;
      const { ceil, floor } = surfaceAt(state.stage.terrain, foe.x);
      foe.y = Math.max(ceil + foe.r, Math.min(floor - foe.r, foe.y));
      // The trail is what the body follows. One entry per tick, capped at
      // however long the longest snake in the game is.
      foe.trail.push(foe.x, foe.y);
      if (foe.trail.length > 240) foe.trail.splice(0, 2);
    },
  },

  /**
   * One link of a body. It has no opinions: it is wherever the head was a
   * certain number of ticks ago, and when the head dies it goes up with it.
   */
  segment: {
    key: 'segment',
    hp: 5,
    r: 6,
    w: 13,
    h: 13,
    points: 60,
    colour: '#4fd898',
    move(state, foe) {
      const head = state.foes.find((f) => f.id === foe.head);
      if (!head) {
        // Orphaned: the head went before the chain reaction reached this link.
        foe.x -= 76 * DT;
        return;
      }
      const at = head.trail.length - foe.lag * 2;
      if (at >= 0) {
        foe.x = head.trail[at];
        foe.y = head.trail[at + 1];
      }
    },
  },
};

/** Every kind, for the tests to walk. */
export const FOE_KEYS = Object.keys(FOES);

/** How far off the right-hand edge a spawn appears, and how far down. */
export function placeY(state, entry) {
  if (entry.y === 'floor' || entry.y === 'ceil') {
    const at = surfaceAt(state.stage.terrain, entry.at);
    return entry.y === 'ceil' ? at.ceil : at.floor;
  }
  return Math.max(10, Math.min(VIEW_H - 10, entry.y));
}
