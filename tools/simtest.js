// Headless: plays whole runs with no browser, and checks the rules.
//
//   node tools/simtest.js
//
// Four things matter here. That the simulation is deterministic, because the
// online game depends on it. That the corridor every rule is measured against is
// sane, because a stage whose walls meet in the middle is a stage nobody can
// finish. That the hull behaves exactly as advertised, because the hull is the
// entire economy of this game and a leak in it would make the score board
// meaningless. And that the repairs really are where the stage script says they
// are, on every run, for everybody.

import { readFileSync } from 'node:fs';
import { createRun, formatScore, hashState, stageLabel } from '../src/game/state.js';
import { step } from '../src/game/sim.js';
import { STAGES, STAGE_KEYS, loadStage, loopOf, stageIndex } from '../src/game/stages.js';
import { STEP, gapAt, inRock, surfaceAt } from '../src/game/terrain.js';
import { FOES, FOE_KEYS } from '../src/game/foes.js';
import { chargeLevel, stepShot } from '../src/game/weapons.js';
import { demoMask } from '../src/demo.js';
import {
  BTN, CHARGE_FULL, CHARGE_MIN, CHARGE_PIERCE, DROP_R, HULL_MAX, INVULN_TICKS,
  MAX_MISSILES, MAX_SPEEDUPS, POD_MAX_LEVEL, SHIP_R, SKILL_LEVELS, TICK_RATE,
  VIEW_H, VIEW_W,
} from '../src/constants.js';
import {
  Highscores, LEVELS, cleanEntry, levelFor, levelOf, merge, partsOf, placeOf, qualifies,
  sortTable,
} from '../src/highscores.js';
import * as commentary from '../src/commentary.js';
import { announcement, newRows } from '../worker/announce.js';
import { phrase } from '../src/speech.js';
import { neighbours, compare as compareShared } from './sync-shared.js';

let failed = false;
function check(ok, message) {
  if (ok) {
    console.log(`OK: ${message}`);
  } else {
    console.error(`FAIL: ${message}`);
    failed = true;
  }
}

const MAX = TICK_RATE * 60 * 12; // no run in here should take twelve minutes

/** Plays a run with a given hand on the controls and reports what happened. */
function play(options = {}, pilot = demoMask, ticks = MAX) {
  const state = createRun({
    seed: 7, players: 1, humans: [true, false], skill: 'normal', ...options,
  });
  const seen = {};
  let t = 0;
  while (state.phase !== 'over' && t < ticks) {
    const inputs = [pilot(state, 0), state.ships.length > 1 ? pilot(state, 1, 1) : 0];
    step(state, inputs);
    for (const e of state.events) seen[e.type] = (seen[e.type] || 0) + 1;
    for (const ship of state.ships) {
      if (!Number.isFinite(ship.x) || !Number.isFinite(ship.y)) {
        throw new Error(`ship ${ship.index} went NaN on tick ${state.tick}`);
      }
    }
    t++;
  }
  return { state, seen, ticks: t };
}

const idle = () => 0;

// --- The corridor ------------------------------------------------------------

console.log('Stages:');
for (let n = 0; n < STAGES.length; n++) {
  const stage = loadStage(n);
  const t = stage.terrain;

  // The two surfaces must never meet, and must always leave enough room for a
  // ship to fly between them with something to spare. A stage that pinched shut
  // would be unfinishable, and the only way to find that out is to measure it.
  let tightest = Infinity;
  let inverted = 0;
  for (let i = 0; i < t.count; i++) {
    const gap = t.floor[i] - t.ceil[i];
    if (gap < tightest) tightest = gap;
    if (gap <= 0) inverted++;
  }
  check(inverted === 0, `${stage.name}: the walls never cross`);
  check(tightest > SHIP_R * 8,
    `${stage.name}: the narrowest point is ${tightest.toFixed(0)} units, `
    + `which is ${(tightest / (SHIP_R * 2)).toFixed(1)} ships wide`);

  // The boss arena is the last stretch, and it has to be open: a boss the size
  // of a third of the screen inside a narrow passage is a boss you cannot get
  // past, whatever you are carrying.
  const arena = gapAt(t, stage.bossAt + 200);
  check(arena > VIEW_H * 0.75,
    `${stage.name}: the boss arena is ${arena.toFixed(0)} units of the ${VIEW_H} tall`);

  // Everything in the script has to be a thing this game knows how to make, and
  // it has to be somewhere a player can reach.
  let bad = 0;
  let unreachable = 0;
  for (const entry of stage.script) {
    if (entry.kind === 'gift') {
      if (!['red', 'blue', 'yellow', 'speed', 'missile', 'heal'].includes(entry.give)) bad++;
      const at = surfaceAt(t, entry.at);
      // A pickup starts inside the rock at a pinch point and bounces out of it -
      // stepDrops sees to that - so what matters is that there was room for it
      // at all.
      if (at.floor - at.ceil < DROP_R * 3) unreachable++;
    } else if (!FOES[entry.kind]) {
      bad++;
    }
  }
  check(bad === 0, `${stage.name}: every line of the script names something real`);
  check(unreachable === 0, `${stage.name}: every pickup has room to sit in`);

  // Sorted by when they are triggered rather than by where they sit, which is
  // the whole reason schedule() exists.
  let out = 0;
  for (let i = 1; i < stage.script.length; i++) {
    if (stage.script[i].trigger < stage.script[i - 1].trigger) out++;
  }
  check(out === 0, `${stage.name}: the script is in the order it will be spawned`);
}

check(STAGE_KEYS.length === 5, 'there are five stages');
check(stageIndex(7) === 2 && loopOf(7) === 1, 'stage 7 is the third stage, second time round');
check(stageLabel(0) === '1' && stageLabel(7) === '3-2', 'stages are labelled the arcade way');

// A stage is built once and handed out, so two machines get the identical rock.
check(loadStage(0) === loadStage(5), 'a stage is cached, not rebuilt per lap');

// --- Determinism -------------------------------------------------------------

console.log('\nDeterminism:');
{
  const hashes = [];
  for (let go = 0; go < 2; go++) {
    const state = createRun({ seed: 4242, players: 2, humans: [true, true] });
    const marks = [];
    for (let t = 0; t < TICK_RATE * 120 && state.phase !== 'over'; t++) {
      step(state, [demoMask(state, 0), demoMask(state, 1, 1)]);
      if (t % 240 === 0) marks.push(hashState(state));
    }
    hashes.push(marks.join(','));
  }
  check(hashes[0] === hashes[1] && hashes[0].length > 10,
    'two runs of the same seed and the same buttons are the same run');
}
{
  const a = createRun({ seed: 1 });
  const b = createRun({ seed: 2 });
  for (let t = 0; t < 400; t++) {
    step(a, [demoMask(a, 0), 0]);
    step(b, [demoMask(b, 0), 0]);
  }
  // Different seeds must not produce different games. Nothing in this game is
  // random except the drift on a pickup, so two seeds should agree about almost
  // everything - which is the point of writing the stages down.
  check(a.cursor === b.cursor, 'the script does not depend on the seed');
}

// --- The gun -----------------------------------------------------------------

console.log('\nThe gun:');
check(chargeLevel(CHARGE_MIN - 1) === 0, 'a tap is not a beam');
check(chargeLevel(CHARGE_MIN) === 0 || chargeLevel(CHARGE_MIN + 1) > 0,
  'a beam starts the moment the wind-up passes the minimum');
check(chargeLevel(CHARGE_FULL) === 1 && chargeLevel(CHARGE_FULL * 3) === 1,
  'holding past the top buys nothing more');
check(CHARGE_PIERCE > CHARGE_MIN && CHARGE_PIERCE < CHARGE_FULL,
  'piercing is somewhere between a tap and a full charge');

{
  // Pressing fires immediately; holding produces a beam on release and nothing
  // before it. That is the contract the whole game rests on.
  const state = createRun({ seed: 9 });
  step(state, [0, 0]);
  step(state, [BTN.FIRE, 0]);
  check(state.shots.length === 1, 'pressing fire fires at once');
  const before = state.shots.length;
  for (let t = 0; t < CHARGE_FULL; t++) step(state, [BTN.FIRE, 0]);
  const held = state.shots.filter((s) => s.kind === 'beam').length;
  check(held === 0, 'holding the button produces no beam while it is held');
  step(state, [0, 0]);
  const beams = state.shots.filter((s) => s.kind === 'beam');
  check(beams.length === 1, 'letting go produces exactly one beam');
  check(beams[0].pierce && beams[0].dmg > 10,
    `a full charge pierces and hits for ${beams[0].dmg}`);
  check(state.shots.length > before, 'the pellets fired during the wind-up are real');
}

{
  // A tapped button must never accumulate a charge across taps.
  const state = createRun({ seed: 9 });
  for (let t = 0; t < 200; t++) step(state, [t % 2 ? BTN.FIRE : 0, 0]);
  check(state.shots.every((s) => s.kind !== 'beam'), 'tapping never fires a beam');
}

{
  // The rock is part of two weapons and the end of the rest. A reflected bolt
  // has to come off it; everything else has to stop dead in it, or a stage would
  // be winnable by shooting through the scenery.
  const state = createRun({ seed: 9 });
  const t = state.stage.terrain;
  check(t.count * STEP >= state.stage.length,
    'the corridor is sampled all the way to the end of the stage');

  const { floor } = surfaceAt(t, 200);
  const bolt = {
    kind: 'bolt', x: 200, y: floor - 1, vx: 100, vy: 300, r: 4, life: 60, bounces: 2,
  };
  check(inRock(t, bolt.x, floor + 4, 0), 'the floor is where the terrain says it is');
  const alive = stepShot(state, bolt);
  check(alive && bolt.bounces === 1 && bolt.vy < 0,
    'a reflected bolt comes back off the floor and spends a bounce');

  const spent = {
    kind: 'bolt', x: 200, y: floor - 1, vx: 100, vy: 300, r: 4, life: 60, bounces: 0,
  };
  check(!stepShot(state, spent), 'and stops when it has none left');

  const pellet = {
    kind: 'pellet', x: 200, y: floor - 1, vx: 0, vy: 400, r: 3, life: 60,
  };
  check(!stepShot(state, pellet), 'a pellet does not go through rock');
}

// --- The pod -----------------------------------------------------------------

console.log('\nThe pod:');
{
  const state = createRun({ seed: 9 });
  const ship = state.ships[0];
  ship.pod.has = true;
  ship.pod.kind = 'blue';
  ship.pod.level = 1;
  ship.pod.mode = 'nose';
  step(state, [0, 0]);

  // A shot aimed at the pod is eaten by it and never reaches the ship.
  const hull = ship.hull;
  state.flak.push({
    id: 1, x: ship.pod.x + 6, y: ship.pod.y, vx: -200, vy: 0, r: 3, life: 60,
  });
  for (let t = 0; t < 6; t++) step(state, [0, 0]);
  check(ship.hull === hull, 'the pod eats a shot that would have hit the ship');
  check(state.flak.length === 0, 'and the shot is gone rather than passing through');

  // It cannot be destroyed: there is no code path that removes it except losing
  // the ship, and this is the assertion that keeps it that way.
  check(ship.pod.has, 'the pod survives everything that touches it');
}

{
  // Pushed off, it stops at the far edge of what anybody can see, and comes back
  // when it is called.
  const state = createRun({ seed: 9 });
  const ship = state.ships[0];
  ship.pod.has = true;
  ship.pod.kind = 'red';
  ship.pod.level = 1;
  step(state, [0, 0]);
  step(state, [BTN.SWITCH, 0]);
  check(ship.pod.mode === 'out', 'the second button pushes the pod off');
  for (let t = 0; t < 120; t++) step(state, [0, 0]);
  check(ship.pod.x <= state.scroll + VIEW_W,
    'a launched pod stops where it can still be seen');
  step(state, [BTN.SWITCH, 0]);
  check(ship.pod.mode === 'back', 'and pressing it again calls the pod home');
  for (let t = 0; t < 240; t++) step(state, [0, 0]);
  check(ship.pod.mode === 'nose' || ship.pod.mode === 'tail',
    `the pod comes back and attaches (${ship.pod.mode})`);
}

{
  // Every colour has to fire something, at every level, or a crystal somebody
  // went out of their way for does nothing at all.
  for (const kind of ['red', 'blue', 'yellow']) {
    for (let level = 1; level <= POD_MAX_LEVEL; level++) {
      const state = createRun({ seed: 9 });
      const ship = state.ships[0];
      ship.pod.has = true;
      ship.pod.kind = kind;
      ship.pod.level = level;
      let fired = 0;
      for (let t = 0; t < 90; t++) {
        step(state, [BTN.FIRE, 0]);
        fired += state.events.filter((e) => e.type === 'podshot').length;
      }
      check(fired > 0, `the ${kind} pod at level ${level} fires ${fired} times in a second and a half`);
    }
  }
}

// --- The hull ----------------------------------------------------------------

console.log('\nThe hull:');
for (const key of Object.keys(SKILL_LEVELS)) {
  const state = createRun({ skill: key });
  check(state.ships[0].hull === SKILL_LEVELS[key].hull,
    `${key.toUpperCase()} starts with ${SKILL_LEVELS[key].hull} of hull`);
}
check(Object.values(SKILL_LEVELS).every((s) => s.hull <= HULL_MAX),
  'nobody starts with more hull than the readout can show');

{
  // One hit, then a spell of grace. Two shots arriving together must cost one
  // point of hull rather than two, or a spread would end a run on its own.
  const state = createRun({ seed: 9, skill: 'easy' });
  const ship = state.ships[0];
  step(state, [0, 0]);
  const hull = ship.hull;
  for (let i = 0; i < 4; i++) {
    state.flak.push({
      id: 100 + i, x: ship.x + 4 + i, y: ship.y, vx: -20, vy: 0, r: 3, life: 60,
    });
  }
  step(state, [0, 0]);
  check(ship.hull === hull - 1, 'four shots at once cost one point of hull');
  check(ship.invuln > 0, 'and buy a moment of grace');
  for (let t = 0; t < INVULN_TICKS + 2; t++) step(state, [0, 0]);
  check(ship.invuln === 0, 'which runs out on its own');
}

{
  // Losing the ship loses everything it was carrying. That is what makes the
  // hull worth protecting rather than merely worth watching.
  const state = createRun({ seed: 9, skill: 'hard' });
  const ship = state.ships[0];
  ship.pod.has = true;
  ship.pod.kind = 'yellow';
  ship.pod.level = 3;
  ship.speedups = 3;
  ship.missiles = 2;
  ship.hull = 1;
  ship.invuln = 0;
  // The pod is sent away first, on purpose. Left where it starts it is sitting
  // on top of the ship and would eat the shot, which is exactly what it is for
  // and exactly not what is being tested here.
  ship.pod.mode = 'out';
  ship.pod.x = ship.x + 240;
  state.flak.push({ id: 1, x: ship.x, y: ship.y, vx: -1, vy: 0, r: 3, life: 60 });
  step(state, [0, 0]);
  check(!ship.alive, 'the last point of hull is the end of the ship');
  check(!ship.pod.has && ship.speedups === 0 && ship.missiles === 0,
    'and everything it was carrying goes with it');
  for (let t = 0; t < TICK_RATE * 4; t++) step(state, [0, 0]);
  check(state.phase === 'over', 'a run with nobody left flying is over');
  check(!state.ships[0].alive, 'and there is no continue');
}

{
  // A repair, in two players, brings a partner back before it patches anybody
  // up. The alternative is one person watching the other for ten minutes.
  const state = createRun({ seed: 9, players: 2, humans: [true, true], skill: 'easy' });
  const [a, b] = state.ships;
  b.alive = false;
  b.hull = 0;
  a.hull = 3;
  state.drops.push({
    id: 1, x: a.x, y: a.y, give: 'heal', vy: 0, life: 200,
  });
  step(state, [0, 0]);
  check(b.alive && b.hull > 0, 'a repair brings a lost partner back');
  check(a.hull === 3, 'and spends itself doing it rather than also healing');

  state.drops.push({
    id: 2, x: a.x, y: a.y, give: 'heal', vy: 0, life: 200,
  });
  step(state, [0, 0]);
  check(a.hull > 3, 'the next one repairs the hull');
}

{
  // Nothing may take you past the top of the readout.
  const state = createRun({ seed: 9, skill: 'easy' });
  const ship = state.ships[0];
  for (let i = 0; i < 8; i++) {
    state.drops.push({
      id: 200 + i, x: ship.x, y: ship.y, give: 'heal', vy: 0, life: 200,
    });
    step(state, [0, 0]);
  }
  check(ship.hull <= HULL_MAX, `the hull stops at ${HULL_MAX}`);

  const before = state.score;
  state.drops.push({ id: 300, x: ship.x, y: ship.y, give: 'heal', vy: 0, life: 200 });
  step(state, [0, 0]);
  check(state.score > before, 'a repair you cannot use is worth points instead');
}

{
  // The same for the other two, which have their own ceilings.
  const state = createRun({ seed: 9 });
  const ship = state.ships[0];
  for (let i = 0; i < 6; i++) {
    state.drops.push({ id: 400 + i, x: ship.x, y: ship.y, give: 'speed', vy: 0, life: 200 });
    state.drops.push({ id: 500 + i, x: ship.x, y: ship.y, give: 'missile', vy: 0, life: 200 });
    step(state, [0, 0]);
  }
  check(ship.speedups === MAX_SPEEDUPS && ship.missiles === MAX_MISSILES,
    'speed and missiles stop where the readout does');
}

{
  // Crystals: the same colour twice is stronger, a different colour is a
  // different weapon starting again from the bottom.
  const state = createRun({ seed: 9 });
  const ship = state.ships[0];
  const feed = (give) => {
    state.drops.push({ id: state.nextId++, x: ship.x, y: ship.y, give, vy: 0, life: 200 });
    step(state, [0, 0]);
  };
  feed('red');
  check(ship.pod.has && ship.pod.kind === 'red' && ship.pod.level === 1,
    'the first crystal is where the pod comes from');
  feed('red');
  check(ship.pod.level === 2, 'a second of the same colour makes it stronger');
  feed('blue');
  check(ship.pod.kind === 'blue' && ship.pod.level === 1,
    'a different colour is a different weapon, from the bottom');
  feed('blue');
  feed('blue');
  feed('blue');
  check(ship.pod.level === POD_MAX_LEVEL, `and it stops at ${POD_MAX_LEVEL}`);
}

// --- Repairs are where the stage says they are -------------------------------

console.log('\nRepairs:');
{
  // Every repair in the game is written into a stage script at a fixed mark, or
  // dropped by a boss that has just died. Nothing about where they are may
  // depend on the seed, on the skill, or on how the run has gone.
  const marks = [];
  for (const seed of [1, 999, 123456]) {
    const state = createRun({ seed });
    const found = [];
    while (state.scroll < state.stage.bossAt && state.tick < MAX) {
      step(state, [0, 0]);
      for (const d of state.drops) {
        if (d.give === 'heal' && !found.includes(Math.round(d.x))) found.push(Math.round(d.x));
      }
    }
    marks.push(found.slice(0, 4).join(','));
  }
  check(new Set(marks).size === 1, 'the repairs are in the same places whatever the seed');

  const heals = STAGES.flatMap((s, i) => s.script
    .filter((e) => e.kind === 'gift' && e.give === 'heal')
    .map(() => i));
  check(heals.length <= STAGES.length,
    `there are ${heals.length} repairs written into ${STAGES.length} stages, plus one per boss`);
}

// --- A whole stage -----------------------------------------------------------

console.log('\nPlaying:');
{
  const { state, seen, ticks } = play({ skill: 'easy', seed: 33 }, demoMask, TICK_RATE * 60 * 8);
  check(seen.kill > 30, `the autopilot destroyed ${seen.kill || 0} things`);
  check(state.stagesCleared >= 1 || state.phase === 'over',
    `it got to stage ${stageLabel(state.stageNumber)} in ${(ticks / TICK_RATE).toFixed(0)}s`);
  check((seen.bossin || 0) >= 1 && (seen.bossdie || 0) >= 1,
    'a boss arrived and a boss died');
  check((seen.clear || 0) >= 1, 'and the stage after it started');
  check(state.score > 0 && state.score === Math.round(state.score),
    `the score is a whole number: ${formatScore(state.score)}`);
}

{
  // Nothing may be left lying about. A shooter that never forgets a bullet is a
  // shooter that gets slower for as long as you are good at it.
  const state = createRun({ seed: 5, skill: 'easy' });
  let mostShots = 0;
  let mostFoes = 0;
  let mostFlak = 0;
  for (let t = 0; t < TICK_RATE * 180 && state.phase !== 'over'; t++) {
    step(state, [demoMask(state, 0), 0]);
    mostShots = Math.max(mostShots, state.shots.length);
    mostFoes = Math.max(mostFoes, state.foes.length);
    mostFlak = Math.max(mostFlak, state.flak.length);
  }
  check(mostShots < 300, `at most ${mostShots} of our bullets were alive at once`);
  check(mostFlak < 300, `at most ${mostFlak} of theirs`);
  check(mostFoes < 120, `at most ${mostFoes} things in the corridor`);
}

{
  // Sitting still is not a strategy. The window a ship may fly in moves with the
  // corridor, so doing nothing carries you into the wall behind you.
  const { state } = play({ skill: 'hard' }, idle, TICK_RATE * 300);
  check(state.phase === 'over', 'a run where nobody touches anything ends');
  check(state.stagesCleared === 0, 'and it does not clear a stage by accident');
}

// --- Every kind of enemy -----------------------------------------------------

console.log('\nEnemies:');
for (const key of FOE_KEYS) {
  const def = FOES[key];
  check(typeof def.move === 'function' && def.hp > 0 && def.r > 0,
    `${key}: has health, a size and a way of moving`);
}
{
  // Every kind in the game has to appear somewhere in the five stages, or it is
  // code nobody will ever see.
  const used = new Set(STAGES.flatMap((s) => s.script.map((e) => e.kind)));
  used.add('segment'); // never scripted directly; a snake brings its own
  const unused = FOE_KEYS.filter((k) => !used.has(k));
  check(unused.length === 0, `every kind of enemy is used somewhere${unused.length ? `: ${unused}` : ''}`);
}
{
  // A snake's body goes up a link at a time rather than all at once, and every
  // link is worth points. Both halves matter: the rolling explosion is the
  // reward for finishing the job, and the points are the reason to.
  const state = createRun({ seed: 3, skill: 'easy' });
  step(state, [0, 0]);
  const head = { ...FOES.snake };
  // Built by hand rather than waited for: the snakes are two stages in, and this
  // is a test about what happens when one dies, not about getting to one.
  const spawnSnake = () => {
    const parts = [];
    for (let i = 0; i <= 6; i++) {
      parts.push({
        id: state.nextId++,
        kind: i ? 'segment' : 'snake',
        def: i ? FOES.segment : FOES.snake,
        x: 200 + i * 10,
        y: 140,
        baseY: 140,
        r: 7,
        hp: i ? 5 : 1,
        age: 0,
        fireAt: 0,
        side: 'floor',
        give: null,
        head: i ? parts[0].id : 0,
        lag: i * 5,
        trail: i ? null : [],
        flash: 0,
        chain: false,
        dieIn: 0,
        dying: false,
      });
    }
    state.foes.push(...parts);
    return parts;
  };
  const parts = spawnSnake();
  const before = state.score;
  state.shots.push({
    id: state.nextId++,
    kind: 'pellet',
    seat: 0,
    x: parts[0].x,
    y: parts[0].y,
    vx: 0,
    vy: 0,
    // Deliberately fat and stationary. A snake head weaves by twenty units a
    // tick, and a pellet-sized shot placed where it was last frame misses it -
    // which is a fine property of the game and a hopeless one in a test about
    // what happens afterwards.
    r: 30,
    dmg: 9,
    life: 30,
    pierce: false,
    hit: null,
  });
  step(state, [0, 0]);
  check(state.score > before + FOES.snake.points,
    'killing the head is worth the head and the whole body');
  let chains = 0;
  let spread = 0;
  for (let t = 0; t < 60; t++) {
    step(state, [0, 0]);
    const now = state.events.filter((e) => e.type === 'chain').length;
    if (now) {
      chains += now;
      spread++;
    }
  }
  check(chains === 6, `every link of the body goes up (${chains} of 6)`);
  check(spread > 3, `and they go up ${spread} ticks apart rather than all at once`);
  check(!state.foes.some((f) => f.kind === 'segment'), 'and none of it is left behind');
  check(head.hp === FOES.snake.hp, 'the table itself was not modified by any of that');
}

{
  // Nothing fires from off the right-hand edge. Being killed by something you
  // have not been shown is the one thing a shooter must never do.
  const state = createRun({ seed: 11, skill: 'hard' });
  let early = 0;
  for (let t = 0; t < TICK_RATE * 180 && state.phase !== 'over'; t++) {
    step(state, [demoMask(state, 0), 0]);
    for (const e of state.events) {
      if (e.type === 'foefire' && e.x > state.scroll + VIEW_W) early++;
    }
  }
  check(early === 0, 'nothing shoots at you from off the screen');
}

// --- The score board ---------------------------------------------------------

console.log('\nThe score board:');
check(LEVELS.length === 7, 'there are seven lists: one and two players, three settings, plus online');
check(levelFor({ players: 1, skill: 'hard' }) === 'solo:hard', 'a solo run goes on the solo list');
check(levelFor({ players: 2, online: true }) === 'pair:online', 'an online run goes on its own list');
check(levelOf('nonsense', 'nonsense') === LEVELS[0], 'anything unrecognised lands on the first list');
check(partsOf('pair:online').mode === 'pair' && partsOf('pair:online').tier === 'online',
  'a list key can be read back apart');

check(cleanEntry({ score: 0 }) === null, 'a run worth nothing is not a score');
check(cleanEntry({ score: -5 }) === null, 'and neither is a negative one');
check(cleanEntry({ score: 1e12 }) === null, 'nor one nobody could have scored');
check(cleanEntry({ score: 100, name: 'mjc!!' })?.name === 'MJC',
  'a name is three characters of the alphabet the picker offers');
check(cleanEntry({ score: 100, name: 'a' })?.name === 'A--', 'and it is padded rather than refused');

{
  const rows = sortTable([
    { id: 'a', name: 'AAA', score: 100, stage: 1, at: 5 },
    { id: 'b', name: 'BBB', score: 900, stage: 0, at: 5 },
    { id: 'c', name: 'CCC', score: 900, stage: 3, at: 9 },
  ]);
  check(rows[0].id === 'c' && rows[1].id === 'b',
    'the biggest score wins, and a tie goes to whoever got further');
}
{
  const table = [];
  for (let i = 0; i < 10; i++) {
    table.push({ id: `x${i}`, name: 'AAA', score: 1000 + i, stage: 0, at: 1 });
  }
  check(!qualifies(table, { score: 500 }), 'a full board turns away a worse run');
  check(qualifies(table, { score: 99999 }), 'and lets a better one in');
  check(placeOf(table, { score: 99999 }) === 1, 'which lands at the top');
}
{
  const a = { 'solo:normal': [{ id: 'z', name: 'AAA', score: 500, stage: 1, at: 1 }] };
  const both = merge(merge(a, a), a);
  check(both['solo:normal'].length === 1, 'a board merged with itself does not grow');
  const store = new Map();
  const board = new Highscores({
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  });
  board.add('solo', 'normal', { name: 'MJC', score: 1234, stage: 2, at: Date.now() });
  const again = new Highscores({
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  });
  check(again.table('solo', 'normal')[0]?.name === 'MJC', 'the board survives being reloaded');
  check(again.best('solo', 'normal')?.score === 1234, 'and knows its own best');
}

// --- What gets announced -----------------------------------------------------

console.log('\nDiscord:');
{
  const before = { 'solo:hard': [{ id: 'old', name: 'AAA', score: 900, stage: 1, at: 1 }] };
  const after = merge(before, {
    'solo:hard': [{ id: 'new', name: 'MJC', score: 5000, stage: 6, at: 2 }],
  });
  const rows = newRows(before, after);
  check(rows.length === 1 && rows[0].entry.id === 'new', 'only the new row is news');
  const post = announcement(rows, 'https://example.test/webtype/');
  check(post.embeds[0].description.includes('MJC') && post.embeds[0].description.includes('5 000'),
    'the post says who and how much');
  check(post.embeds[0].description.includes('2-2'),
    'and how far, in the arcade\'s own numbering');
  check(post.allowed_mentions.parse.length === 0, 'and it cannot ping anybody');
  check(newRows(after, after).length === 0, 'the same board twice is not news');
}

// --- The voice ---------------------------------------------------------------

console.log('\nThe voice:');
{
  let missing = [];
  for (const [event, lines] of Object.entries(commentary.LINES)) {
    for (const line of lines) {
      for (const word of line.split(' ')) {
        if (!commentary.WORDS[word]) missing.push(`${event}: ${word}`);
      }
    }
  }
  check(missing.length === 0, `every line is built from words it knows${missing.length ? `: ${missing}` : ''}`);
  const spoken = phrase('hull breach', commentary.WORDS);
  check(spoken.length > 4, `a line comes out as ${spoken.length} sounds`);
  const named = Object.values(commentary.lines());
  check(named.every((l) => phrase(l, commentary.WORDS).length > 0),
    'and every line the game actually says can be said');
}

// --- The shared plumbing -----------------------------------------------------

console.log('\nShared with the others:');
{
  const found = neighbours();
  if (!found.length) {
    console.log('SKIP: none of the other three games are beside this one');
  } else {
    for (const [name, at] of found) {
      const { differs, missing } = compareShared(at);
      check(differs.length === 0 && missing.length === 0,
        `the shared files still match ${name}`);
    }
  }
}

// --- The page itself ---------------------------------------------------------

console.log('\nThe page:');
{
  // Cheap, and it has caught a renamed element more than once: every id main.js
  // reaches for has to exist in index.html.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const wanted = [...main.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  const absent = [...new Set(wanted)].filter((id) => !html.includes(`id="${id}"`));
  check(absent.length === 0, `every element main.js asks for exists${absent.length ? `: ${absent}` : ''}`);
}

console.log('');
if (failed) {
  console.error('FAILED');
  process.exit(1);
}
console.log('All good.');
