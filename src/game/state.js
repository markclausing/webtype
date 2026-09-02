/**
 * The run, as data.
 *
 * Same contract as websoccer, webtennis and webracing: one plain object holding
 * everything the game needs, no DOM, no clock, and no randomness that does not
 * come out of `state.rng`. Two machines given the same state and the same
 * buttons must reach the same score, which is what makes the netcode possible
 * and, more usefully day to day, makes the whole thing testable without a
 * browser.
 *
 * The one thing in here that is not a number is `state.stage`, and it is safe:
 * it is built from the stage number by loadStage(), which is pure, cached, and
 * gives every machine the identical corridor.
 */

import {
  HULL_MAX, MAX_SHIPS, READY_TICKS, SHIP_PRESETS, SKILL_LEVELS, VIEW_H,
} from '../constants.js';
import { loadStage, loopOf, stageIndex } from './stages.js';

export function createRun(options = {}) {
  const opts = {
    seed: 12345,
    stage: 0,
    players: 1,
    humans: [true, false],
    skill: 'normal',
    ...options,
  };

  const skill = SKILL_LEVELS[opts.skill] || SKILL_LEVELS.normal;
  const players = Math.max(1, Math.min(MAX_SHIPS, Math.round(opts.players)));

  const state = {
    tick: 0,
    rng: opts.seed | 0,
    seed: opts.seed | 0,
    config: {
      players,
      skill: skill.key,
      // Where the run started. Always zero in a real game; the tests and the
      // screenshot tool start further in, and nothing else may assume it.
      from: Math.max(0, Math.round(opts.stage)),
    },
    // ready | play | boss | clear | over
    phase: 'ready',
    phaseTimer: READY_TICKS,
    stageNumber: Math.max(0, Math.round(opts.stage)),
    stage: loadStage(opts.stage),
    /** How far the corridor has gone past. The only clock the stage script has. */
    scroll: 0,
    /** How much of the script has been spawned. The script is in order of `at`. */
    cursor: 0,
    /** Ids are handed out from here, so two machines name the same thing alike. */
    nextId: 1,
    score: 0,
    stagesCleared: 0,
    /** What just happened. Read by the renderer and the sound, never read back. */
    events: [],
    ships: [],
    foes: [],
    /** Ours going right, theirs coming left, and what is lying about. */
    shots: [],
    flak: [],
    drops: [],
    boss: null,
    /** Set once, when the last hull gives out. */
    finishedAt: 0,
  };

  for (let i = 0; i < players; i++) {
    state.ships.push(makeShip(state, i, !!opts.humans[i], skill));
  }
  return state;
}

/**
 * A ship on the left-hand side, where the arcade always put it.
 *
 * Two of them are stacked rather than side by side, because side by side means
 * the second player spends the first three seconds of every stage flying out
 * from behind the first one.
 */
function makeShip(state, index, human, skill) {
  const preset = SHIP_PRESETS[index];
  return {
    index,
    name: preset.name,
    human: !!human,
    alive: true,
    hull: Math.min(HULL_MAX, skill.hull),
    x: 70,
    y: VIEW_H / 2 + (index === 0 ? -34 : 34) * (state.config.players > 1 ? 1 : 0),
    vx: 0,
    vy: 0,
    /** How long it cannot be hurt for, which is also how long it flashes. */
    invuln: 0,
    /** How long the fire button has been held. Everything about the gun is this. */
    charge: 0,
    firedAt: -99,
    missileAt: -99,
    speedups: 0,
    missiles: 0,
    kills: 0,
    hits: 0,
    prevMask: 0,
    /**
     * The pod, which is part of the ship until the moment it is not.
     *
     * `mode` is where it is: on the nose, on the tail, flying away from you, or
     * on its way back. `kind` is which crystal it last swallowed and `level` is
     * how many of that colour it has had.
     */
    pod: {
      has: false,
      kind: 'none',
      level: 0,
      mode: 'nose',
      x: 70,
      y: VIEW_H / 2,
      vx: 0,
      vy: 0,
      fireAt: -99,
      grindAt: -99,
      spin: 0,
    },
  };
}

/**
 * Moves a run on to the next stage, keeping everything the players are carrying.
 *
 * Hull, weapons and score all survive; the corridor, the script and everything
 * in it do not. That is the whole shape of the game - a run is one long life
 * and the stages are only where it is spent.
 */
export function nextStage(state) {
  state.stageNumber++;
  state.stagesCleared++;
  state.stage = loadStage(state.stageNumber);
  state.scroll = 0;
  state.cursor = 0;
  state.foes.length = 0;
  state.shots.length = 0;
  state.flak.length = 0;
  state.drops.length = 0;
  state.boss = null;
  state.phase = 'ready';
  state.phaseTimer = READY_TICKS;
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    ship.x = 70;
    ship.y = VIEW_H / 2 + (state.ships.length > 1 ? (ship.index === 0 ? -34 : 34) : 0);
    ship.vx = 0;
    ship.vy = 0;
    ship.charge = 0;
    // A few seconds of grace, so nobody is killed by something they could not
    // yet see on a stage they have not yet been shown.
    ship.invuln = Math.max(ship.invuln, READY_TICKS + 60);
    if (ship.pod.has) {
      ship.pod.mode = 'nose';
      ship.pod.x = ship.x;
      ship.pod.y = ship.y;
    }
  }
  return state;
}

/** How the skill setting is doing on this lap of the five stages. */
export function difficultyOf(state) {
  const skill = SKILL_LEVELS[state.config.skill] || SKILL_LEVELS.normal;
  return { skill, loop: loopOf(state.stageNumber), index: stageIndex(state.stageNumber) };
}

/** What the score board calls the stage you got to: one-based, and it loops. */
export function stageLabel(n) {
  const loop = loopOf(n);
  return loop ? `${stageIndex(n) + 1}-${loop + 1}` : `${stageIndex(n) + 1}`;
}

/** "1 204 500". Grouped, because a seven-figure score is unreadable otherwise. */
export function formatScore(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Is the boss's core exposed this tick?
 *
 * A boss with no shutter is always open, which is most of them. The two that
 * have one are the two whose stages are about timing: the gatekeeper opens and
 * shuts because that is what a gate does, and because stage one is where you are
 * meant to learn that holding a charge and letting it go at the right moment is
 * the whole gun. Wind up while it is shut, and spend it the instant it is not.
 */
export function coreOpen(boss) {
  const shutter = boss?.def?.shutter;
  if (!shutter) return true;
  return boss.age % shutter.every < shutter.open;
}

/** Is there anybody left flying? */
export function anyAlive(state) {
  return state.ships.some((s) => s.alive);
}

/** Deterministic hash of everything that matters, for the desync check. */
export function hashState(state) {
  let h = 2166136261;
  const mix = (v) => {
    h ^= Math.round(v * 16) | 0;
    h = Math.imul(h, 16777619);
  };
  mix(state.tick);
  mix(state.scroll);
  mix(state.score);
  mix(state.cursor);
  mix(state.phase === 'play' ? 1 : state.phase === 'boss' ? 2 : state.phase === 'ready' ? 3 : 4);
  for (const ship of state.ships) {
    mix(ship.x);
    mix(ship.y);
    mix(ship.hull);
    mix(ship.charge);
    mix(ship.alive ? 1 : 0);
    mix(ship.pod.x);
    mix(ship.pod.y);
    mix(ship.pod.level * 7 + ship.pod.mode.length);
  }
  // Counts as well as contents: two machines that disagreed about how many
  // things are in the corridor are about to disagree about the run, and this is
  // the cheapest place to find that out.
  mix(state.foes.length);
  for (const foe of state.foes) {
    mix(foe.x);
    mix(foe.y);
    mix(foe.hp);
  }
  mix(state.flak.length);
  for (const f of state.flak) {
    mix(f.x);
    mix(f.y);
  }
  mix(state.shots.length);
  mix(state.drops.length);
  if (state.boss) {
    mix(state.boss.x);
    mix(state.boss.y);
    mix(state.boss.hp);
  }
  return h >>> 0;
}
