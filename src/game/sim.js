/**
 * The simulation. One tick of a run, and nothing else.
 *
 * No DOM, no clock, no Math.random: give it the same state and the same two
 * button masks and it produces the same next state on every machine, which is
 * the whole basis of the netcode. Everything the outside world needs to know
 * about what happened is pushed onto `state.events` and read by the renderer and
 * the sound; the simulation never reads them back.
 *
 * The order of a tick matters and is worth saying out loud, because most of the
 * bugs a game like this ever has are two things disagreeing about when they
 * happened:
 *
 *   1. the corridor scrolls, and the script spawns whatever is now due
 *   2. the ships move and shoot
 *   3. everything else moves and shoots
 *   4. everything is compared against everything else, once
 *   5. the dead are cleared away and the phase is reconsidered
 *
 * Nothing is removed from a list in the middle of a pass over it. Things are
 * marked and swept in step 5, because a foe that vanished halfway through the
 * collision pass is a foe that two machines can disagree about.
 */

import {
  BTN, CLEAR_TICKS, CULL_LEFT, CULL_RIGHT, DEATH_TICKS, DMG_BEAM, DMG_FLAK, DMG_FOE,
  DMG_WALL, DROP_DRIFT, DROP_LIFE, DROP_POINTS, DROP_R, DT, EDGE_TOP, EDGE_X,
  FIRE_EVERY, FLAK_R, FLAK_SPEED, HEAL_AMOUNT, HULL_BONUS, HULL_MAX, INVULN_TICKS,
  LOOP_HP, LOOP_RATE, LOOP_SCORE, MAX_MISSILES, MAX_SPEEDUPS, MISSILE_EVERY,
  POD_CONTACT_DMG, POD_CONTACT_EVERY, POD_FIRE_EVERY, POD_LAUNCH_SPEED, POD_MAX_LEVEL,
  POD_FOLLOW, POD_NOSE, POD_R, POD_RECALL_SPEED, POD_TAIL, SHIP_R, SHIP_SPEED,
  SPEED_STEP, STAGE_BONUS, VIEW_H, VIEW_W, WALL_KICK,
} from '../constants.js';
import { nextRandom } from '../util.js';
import { FOES, placeY, target } from './foes.js';
import { SPAWN_MARGIN } from './stages.js';
import { inRock, rockNormal, surfaceAt } from './terrain.js';
import { anyAlive, difficultyOf, nextStage } from './state.js';
import {
  chargeLevel, fireBeam, fireMissiles, firePellet, firePod, stepShot,
} from './weapons.js';

export function step(state, inputs = []) {
  state.events.length = 0;
  state.tick++;

  if (state.phase === 'over') return state;

  if (state.phase === 'clear') {
    state.phaseTimer--;
    // The survivors fly out to the right, which is the only moment in the game
    // the ships are not under anybody's control.
    for (const ship of state.ships) {
      if (!ship.alive) continue;
      ship.x += 96 * DT;
      followPod(state, ship);
    }
    stepDrops(state);
    // Still collectable while the stage is ending, and it has to be: the repair
    // a boss leaves behind is dropped into exactly this moment, and a reward
    // you are physically unable to pick up is not a reward.
    collectDrops(state);
    if (state.phaseTimer <= 0) {
      nextStage(state);
      state.events.push({ type: 'stage', n: state.stageNumber });
    }
    return state;
  }

  if (state.phase === 'dying') {
    state.phaseTimer--;
    stepShots(state);
    stepFlak(state);
    if (state.phaseTimer <= 0) {
      state.phase = 'over';
      state.finishedAt = state.tick;
      state.events.push({ type: 'over', score: state.score });
    }
    return state;
  }

  if (state.phase === 'ready') {
    state.phaseTimer--;
    if (state.phaseTimer <= 0) {
      state.phase = 'play';
      state.events.push({ type: 'begin', n: state.stageNumber });
    }
  }

  // 1. The corridor. It stops dead once the boss is out, because a boss you can
  //    outrun is not a boss.
  if (state.phase === 'play') {
    state.scroll += state.stage.scroll * DT;
    spawnDue(state);
    if (state.scroll >= state.stage.bossAt) summonBoss(state);
  }

  // 2, 3. Everybody moves.
  for (const ship of state.ships) flyShip(state, ship, inputs[ship.index] | 0);
  for (const foe of state.foes) moveFoe(state, foe);
  moveBoss(state);
  stepShots(state);
  stepFlak(state);
  stepDrops(state);

  // 4. Everything meets everything, once.
  shotsHitFoes(state);
  flakHitsShips(state);
  shipsHitThings(state);
  collectDrops(state);

  // 5. Sweep, and decide whether the run is still going.
  sweep(state);
  settle(state);
  return state;
}

// --- Spawning ----------------------------------------------------------------

/**
 * Whatever the script says is due.
 *
 * The cursor only ever goes forwards. Entries were sorted by the moment they
 * are triggered rather than by where they sit in the corridor, so one that is
 * bolted to the rock a screen ahead is created before a flyer written closer -
 * see schedule() in stages.js.
 */
function spawnDue(state) {
  const script = state.stage.script;
  while (state.cursor < script.length && script[state.cursor].trigger <= state.scroll) {
    spawn(state, script[state.cursor]);
    state.cursor++;
  }
}

function spawn(state, entry) {
  const x = entry.fixed ? entry.at : state.scroll + VIEW_W + SPAWN_MARGIN;

  if (entry.kind === 'gift') {
    drop(state, x, placeY(state, entry), entry.give);
    return;
  }

  const def = FOES[entry.kind];
  if (!def) return;
  const head = makeFoe(state, def, x, placeY(state, entry), entry);
  state.foes.push(head);

  // A snake is a head and a queue of links, all created at once so that no
  // machine has to decide later how long it was.
  if (def.head) {
    const len = Math.max(2, Math.round(entry.len || 6));
    for (let i = 1; i <= len; i++) {
      const seg = makeFoe(state, FOES.segment, x, head.y, entry);
      seg.head = head.id;
      seg.lag = i * 5;
      state.foes.push(seg);
    }
  }
}

function makeFoe(state, def, x, y, entry = {}) {
  const { skill, loop } = difficultyOf(state);
  const crowd = state.config.players > 1 ? 1.4 : 1;
  return {
    id: state.nextId++,
    kind: def.key,
    def,
    x,
    y,
    baseY: y,
    vx: 0,
    vy: 0,
    r: def.r,
    hp: Math.max(1, Math.round(def.hp * skill.foeHp * crowd * (1 + loop * LOOP_HP))),
    maxHp: 1,
    age: 0,
    fireAt: state.tick,
    side: entry.y === 'ceil' ? 'ceil' : 'floor',
    give: entry.give || null,
    head: 0,
    lag: 0,
    chain: false,
    dieIn: 0,
    trail: def.head ? [] : null,
    flash: 0,
    dying: false,
  };
}

/** A pickup, lying in the corridor and drifting gently backwards out of it. */
function drop(state, x, y, give) {
  state.drops.push({
    id: state.nextId++,
    x,
    y,
    give,
    vy: (nextRandom(state) - 0.5) * 24,
    life: DROP_LIFE,
  });
}

// --- The ships ---------------------------------------------------------------

function flyShip(state, ship, mask) {
  if (!ship.alive) return;
  if (ship.invuln > 0) ship.invuln--;

  const speed = SHIP_SPEED + ship.speedups * SPEED_STEP;
  let dx = 0;
  let dy = 0;
  if (mask & BTN.LEFT) dx -= 1;
  if (mask & BTN.RIGHT) dx += 1;
  if (mask & BTN.UP) dy -= 1;
  if (mask & BTN.DOWN) dy += 1;
  if (dx && dy) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  ship.vx = dx * speed;
  ship.vy = dy * speed;
  ship.x += ship.vx * DT;
  ship.y += ship.vy * DT;

  // The window you may fly in. It moves with the corridor, so standing still is
  // not an option: doing nothing carries you into the left-hand wall.
  ship.x = Math.max(state.scroll + EDGE_X, Math.min(state.scroll + VIEW_W - EDGE_X, ship.x));
  ship.y = Math.max(EDGE_TOP, Math.min(VIEW_H - EDGE_TOP, ship.y));

  const terrain = state.stage.terrain;
  if (inRock(terrain, ship.x, ship.y, SHIP_R)) {
    const up = rockNormal(terrain, ship.x, ship.y);
    ship.y += up * WALL_KICK * DT;
    hurt(state, ship, DMG_WALL, 'wall');
  }

  gun(state, ship, mask);
  pod(state, ship, mask);
  ship.prevMask = mask;
}

/**
 * One button, two guns.
 *
 * Pressing it fires a pellet immediately, so a tapped button is a pea shooter
 * and nothing is ever swallowed. Holding it winds up a beam - and for the first
 * moment of the wind-up it keeps producing pellets, so that starting to charge
 * is never a silent second where the wave in front of you is untouched.
 * Releasing it lets go of whatever has been built, which below CHARGE_MIN is
 * nothing at all, because the press already fired.
 */
function gun(state, ship, mask) {
  const down = !!(mask & BTN.FIRE);
  const was = !!(ship.prevMask & BTN.FIRE);

  if (down && !was) {
    ship.charge = 0;
    ship.firedAt = state.tick;
    firePellet(state, ship);
    if (ship.missiles && state.tick - ship.missileAt >= MISSILE_EVERY) {
      ship.missileAt = state.tick;
      fireMissiles(state, ship);
    }
  } else if (down) {
    ship.charge++;
    if (chargeLevel(ship.charge) <= 0 && state.tick - ship.firedAt >= FIRE_EVERY) {
      ship.firedAt = state.tick;
      firePellet(state, ship);
    }
  } else if (was) {
    if (chargeLevel(ship.charge) > 0) fireBeam(state, ship);
    ship.charge = 0;
  } else {
    ship.charge = 0;
  }

  // The pod fires while the button is down, whatever the gun is doing. It is
  // the reason holding a charge is survivable at all.
  if (down && ship.pod.has && ship.pod.kind !== 'none') {
    const every = POD_FIRE_EVERY[Math.max(0, Math.min(2, ship.pod.level - 1))];
    if (state.tick - ship.pod.fireAt >= every) {
      ship.pod.fireAt = state.tick;
      firePod(state, ship);
    }
  }
}

/**
 * Where the pod is, which is the only thing the second button decides.
 *
 * Attached, it sits on the nose or the tail and eats everything that hits it.
 * Pushed off, it flies forward until something stops it and then holds station
 * with the corridor, still firing. Called back, it comes home and attaches to
 * whichever end it arrives at - which is how it gets onto the tail at all: fly
 * past it while it is out there and it will come back behind you.
 */
function pod(state, ship, mask) {
  const p = ship.pod;
  p.spin += 0.14;
  if (!p.has) {
    p.x = ship.x;
    p.y = ship.y;
    return;
  }

  const pressed = (mask & BTN.SWITCH) && !(ship.prevMask & BTN.SWITCH);
  if (pressed) {
    if (p.mode === 'nose' || p.mode === 'tail') {
      p.mode = 'out';
      p.vx = POD_LAUNCH_SPEED;
      p.vy = 0;
      state.events.push({ type: 'podlaunch', seat: ship.index, x: p.x, y: p.y });
    } else {
      p.mode = 'back';
      state.events.push({ type: 'podcall', seat: ship.index });
    }
  }

  if (p.mode === 'out') {
    p.x += p.vx * DT;
    p.vx = Math.max(0, p.vx - 320 * DT);
    // Stopped by the rock, and by the far edge of what anybody can see. A pod
    // parked off screen would be a turret nobody can aim.
    if (inRock(state.stage.terrain, p.x, p.y, POD_R * 0.6)
      || p.x > state.scroll + VIEW_W - 24) {
      p.vx = 0;
      p.x = Math.min(p.x, state.scroll + VIEW_W - 24);
    }
    if (p.vx <= 0) p.x += state.phase === 'play' ? state.stage.scroll * DT : 0;
  } else if (p.mode === 'back') {
    const dx = ship.x - p.x;
    const dy = ship.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) {
      p.mode = dx < 0 ? 'nose' : 'tail';
      state.events.push({ type: 'podattach', seat: ship.index, mode: p.mode });
    } else {
      p.x += (dx / d) * POD_RECALL_SPEED * DT;
      p.y += (dy / d) * POD_RECALL_SPEED * DT;
    }
  } else {
    followPod(state, ship);
  }
}

function followPod(state, ship) {
  const p = ship.pod;
  if (!p.has || p.mode === 'out' || p.mode === 'back') return;
  const want = ship.x + (p.mode === 'nose' ? POD_NOSE : POD_TAIL);
  p.x += (want - p.x) * POD_FOLLOW;
  p.y += (ship.y - p.y) * POD_FOLLOW;
}

// --- What is coming the other way --------------------------------------------

function moveFoe(state, foe) {
  if (foe.dying) return;
  if (foe.flash > 0) foe.flash--;
  foe.def.move(state, foe);

  const aim = foe.def.aim;
  if (!aim) return;
  // Nothing fires from off the right-hand edge. Being shot by something you
  // have not been shown is the one thing a shooter must never do.
  if (foe.x > state.scroll + VIEW_W - 6) return;
  const { skill, loop } = difficultyOf(state);
  const every = Math.max(14, aim.every * skill.rate / (1 + loop * LOOP_RATE));
  if (state.tick - foe.fireAt < every) return;
  foe.fireAt = state.tick;
  volley(state, foe, aim);
}

/**
 * A burst of enemy fire, in whichever shape the thing that fired it uses.
 *
 * The aim itself is never fudged: an aimed shot goes exactly where the ship was
 * when it was fired, on every setting. What the skill level changes is how often
 * this is called and how fast what comes out of it travels, both of which you
 * can see happening.
 */
function volley(state, from, aim) {
  const { skill } = difficultyOf(state);
  const speed = FLAK_SPEED * skill.flak;
  const to = target(state, from);
  const base = to ? Math.atan2(to.y - from.y, to.x - from.x) : Math.PI;
  const n = Math.max(1, aim.n || 1);

  if (aim.mode === 'ring') {
    for (let i = 0; i < n; i++) {
      shootFlak(state, from, (i / n) * Math.PI * 2, speed);
    }
  } else if (aim.mode === 'fan') {
    for (let i = 0; i < n; i++) {
      const a = Math.PI + ((n === 1 ? 0 : i / (n - 1) - 0.5) * (aim.spread || 0.8) * 2);
      shootFlak(state, from, a, speed);
    }
  } else if (aim.mode === 'burst') {
    // Same heading, different speeds: a wall arriving in pieces, which is much
    // harder to sit still in front of than a wall arriving all at once.
    for (let i = 0; i < n; i++) {
      shootFlak(state, from, base + (i - (n - 1) / 2) * (aim.spread || 0.3) * 0.4,
        speed * (0.7 + i * 0.22));
    }
  } else {
    for (let i = 0; i < n; i++) {
      shootFlak(state, from, base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * (aim.spread || 0.3) * 2),
        speed);
    }
  }
  state.events.push({ type: 'foefire', x: from.x, y: from.y });
}

function shootFlak(state, from, angle, speed) {
  state.flak.push({
    id: state.nextId++,
    x: from.x,
    y: from.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: FLAK_R,
    life: 420,
  });
}

// --- The boss ----------------------------------------------------------------

function summonBoss(state) {
  if (state.boss) return;
  const def = state.stage.boss;
  const { skill, loop } = difficultyOf(state);
  const crowd = state.config.players > 1 ? 1.5 : 1;
  const hp = Math.round(def.hp * skill.foeHp * crowd * (1 + loop * LOOP_HP));
  state.boss = {
    id: state.nextId++,
    kind: 'boss',
    def,
    x: state.scroll + VIEW_W + 90,
    y: VIEW_H / 2,
    hp,
    maxHp: hp,
    age: 0,
    r: Math.max(def.w, def.h) / 2,
    flash: 0,
    guns: def.guns.map(() => state.tick),
    spawnAt: state.tick,
    trail: [],
    dying: false,
  };
  state.phase = 'boss';
  state.events.push({ type: 'bossin', name: def.name });
}

function moveBoss(state) {
  const boss = state.boss;
  if (!boss || boss.dying) return;
  boss.age++;
  if (boss.flash > 0) boss.flash--;
  const def = boss.def;
  const mid = VIEW_H / 2;

  if (def.pattern === 'charge') {
    // In and out, and it tracks whoever is nearest while it does it. The point
    // is that the safe part of the screen keeps moving.
    const cycle = Math.sin(boss.age * 0.014);
    const want = state.scroll + VIEW_W - 74 - Math.max(0, cycle) * VIEW_W * 0.3;
    boss.x += (want - boss.x) * 0.05;
    const to = target(state, boss);
    if (to) boss.y += Math.max(-def.speed * DT, Math.min(def.speed * DT, (to.y - boss.y) * 0.05));
  } else if (def.pattern === 'weave') {
    const want = state.scroll + VIEW_W - 96;
    boss.x += (want - boss.x) * 0.05;
    boss.y = mid + Math.sin(boss.age * 0.026) * 88;
  } else {
    const want = state.scroll + VIEW_W - 82;
    boss.x += (want - boss.x) * 0.05;
    boss.y = mid + Math.sin(boss.age * 0.019) * 74;
  }

  const half = def.h / 2 + 6;
  boss.y = Math.max(half, Math.min(VIEW_H - half, boss.y));
  if (def.tail) {
    boss.trail.push(boss.x, boss.y);
    if (boss.trail.length > def.tail * 12) boss.trail.splice(0, 2);
  }

  // It does not open fire until it is actually on the screen, for the same
  // reason nothing else does.
  if (boss.x > state.scroll + VIEW_W + 10) return;

  const { skill, loop } = difficultyOf(state);
  def.guns.forEach((gunDef, i) => {
    const every = Math.max(16, gunDef.every * skill.rate / (1 + loop * LOOP_RATE));
    if (state.tick - boss.guns[i] < every) return;
    boss.guns[i] = state.tick;
    volley(state, { x: boss.x + gunDef.dx, y: boss.y + gunDef.dy }, gunDef);
  });

  if (def.spawns && state.tick - boss.spawnAt >= def.spawns.every) {
    boss.spawnAt = state.tick;
    const kind = FOES[def.spawns.kind];
    for (let i = 0; i < def.spawns.n; i++) {
      const y = boss.y + (i - (def.spawns.n - 1) / 2) * 30;
      state.foes.push(makeFoe(state, kind, boss.x - 20, Math.max(16, Math.min(VIEW_H - 16, y))));
    }
  }
}

// --- Bullets -----------------------------------------------------------------

function stepShots(state) {
  for (const shot of state.shots) {
    if (!stepShot(state, shot)) shot.dead = true;
    else if (shot.x < state.scroll - CULL_LEFT || shot.x > state.scroll + VIEW_W + CULL_RIGHT
      || shot.y < -30 || shot.y > VIEW_H + 30) shot.dead = true;
  }
}

function stepFlak(state) {
  const terrain = state.stage.terrain;
  for (const f of state.flak) {
    f.life--;
    f.x += f.vx * DT;
    f.y += f.vy * DT;
    if (f.life <= 0 || f.x < state.scroll - CULL_LEFT || f.x > state.scroll + VIEW_W + 30
      || f.y < -20 || f.y > VIEW_H + 20) {
      f.dead = true;
    } else if (inRock(terrain, f.x, f.y, 0)) {
      f.dead = true;
      state.events.push({ type: 'spark', x: f.x, y: f.y });
    }
  }
}

function stepDrops(state) {
  for (const d of state.drops) {
    d.life--;
    d.x += DROP_DRIFT * DT;
    d.y += d.vy * DT;
    const { ceil, floor } = surfaceAt(state.stage.terrain, d.x);
    // A pickup bounces off the rock rather than sinking into it. Losing a
    // repair to the scenery would be the single most annoying thing this game
    // could possibly do.
    if (d.y < ceil + 8) {
      d.y = ceil + 8;
      d.vy = Math.abs(d.vy);
    }
    if (d.y > floor - 8) {
      d.y = floor - 8;
      d.vy = -Math.abs(d.vy);
    }
    if (d.life <= 0 || d.x < state.scroll - CULL_LEFT) d.dead = true;
  }
}

// --- Everything meets everything ---------------------------------------------

function hits(a, b, extra = 0) {
  const r = a.r + b.r + extra;
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r;
}

/**
 * Our bullets against their bodies.
 *
 * The boss is checked twice: once against the box it is drawn as, which takes a
 * third of the damage, and once against the small bright core, which takes all
 * of it. That difference is the whole fight - it is the reason there is a place
 * to be rather than merely an amount of shooting to do.
 */
function shotsHitFoes(state) {
  for (const shot of state.shots) {
    if (shot.dead) continue;
    for (const foe of state.foes) {
      if (foe.dying) continue;
      if (!hits(shot, foe)) continue;
      if (shot.hit) {
        if (shot.hit.includes(foe.id)) continue;
        shot.hit.push(foe.id);
      }
      damage(state, foe, shot.dmg, shot);
      if (!shot.pierce) {
        shot.dead = true;
        break;
      }
    }
    if (shot.dead || !state.boss || state.boss.dying) continue;

    const boss = state.boss;
    const def = boss.def;
    const core = {
      x: boss.x + def.core.dx, y: boss.y + def.core.dy, r: def.core.r,
    };
    const onCore = hits(shot, core);
    const onBody = Math.abs(shot.x - boss.x) <= def.w / 2 + shot.r
      && Math.abs(shot.y - boss.y) <= def.h / 2 + shot.r;
    if (!onCore && !onBody) continue;
    if (shot.hit) {
      if (shot.hit.includes(boss.id)) continue;
      shot.hit.push(boss.id);
    }
    hurtBoss(state, onCore ? shot.dmg : Math.max(1, Math.round(shot.dmg / 3)), shot, onCore);
    if (!shot.pierce) shot.dead = true;
  }
}

function damage(state, foe, amount, from = null) {
  foe.hp -= amount;
  foe.flash = 5;
  state.events.push({
    type: 'hit', x: foe.x, y: foe.y, amount, colour: foe.def.colour,
  });
  if (foe.hp > 0) return;
  kill(state, foe, from);
}

function kill(state, foe, from = null) {
  foe.dying = true;
  const { loop } = difficultyOf(state);
  const points = Math.round(foe.def.points * (1 + loop * LOOP_SCORE));
  state.score += points;
  if (from && from.seat !== undefined) {
    const ship = state.ships[from.seat];
    if (ship) ship.kills++;
  }
  state.events.push({
    type: 'kill',
    x: foe.x,
    y: foe.y,
    r: foe.r,
    kind: foe.kind,
    points,
    colour: foe.def.colour,
  });

  if (foe.def.burst) {
    for (let i = 0; i < foe.def.burst; i++) {
      shootFlak(state, foe, (i / foe.def.burst) * Math.PI * 2, FLAK_SPEED * 0.72);
    }
  }
  if (foe.give) drop(state, foe.x, foe.y, foe.give);
  // A head takes its body with it, one link at a time, which is both the right
  // amount of spectacle and a small pile of extra points for finishing the job.
  //
  // The links are marked here and go off in sweep(), a few ticks apart, rather
  // than all being announced at this moment. Announced together they arrived as
  // one enormous simultaneous bang with nothing rolling about it, which is the
  // opposite of the effect.
  if (foe.def.head) {
    let delay = 0;
    for (const seg of state.foes) {
      if (seg.head !== foe.id || seg.dying) continue;
      seg.hp = 0;
      seg.dying = true;
      seg.chain = true;
      seg.dieIn = (delay += 3);
      state.score += Math.round(seg.def.points * (1 + loop * LOOP_SCORE));
    }
  }
}

function hurtBoss(state, amount, from, onCore) {
  const boss = state.boss;
  boss.hp -= amount;
  boss.flash = onCore ? 6 : 3;
  state.events.push({
    type: 'bosshurt',
    x: from.x,
    y: from.y,
    core: onCore,
    colour: boss.def.glow,
  });
  if (boss.hp > 0) return;

  boss.dying = true;
  boss.hp = 0;
  const { loop } = difficultyOf(state);
  state.score += Math.round(4000 * (1 + loop * LOOP_SCORE) * (state.stageNumber % 5 + 1) / 3);
  state.events.push({ type: 'bossdie', x: boss.x, y: boss.y, name: boss.def.name });
  // The one repair you are certain to be offered, and you have to have got here
  // to be offered it. Dropped a little back from where the boss was, because
  // the ships are about to fly forwards through that spot and a pickup behind
  // them is a pickup nobody gets.
  drop(state, boss.x - 60, boss.y, 'heal');
  clearStage(state);
}

/**
 * Their bullets against us, and the pod against their bullets.
 *
 * The pod is checked first and on purpose: it is the reason to have it in front
 * of you, and a shot that the pod ate must never also be a shot that hit the
 * ship behind it.
 */
function flakHitsShips(state) {
  for (const f of state.flak) {
    if (f.dead) continue;
    for (const ship of state.ships) {
      if (!ship.alive) continue;
      const p = ship.pod;
      if (p.has && (p.x - f.x) ** 2 + (p.y - f.y) ** 2 <= (POD_R + f.r) ** 2) {
        f.dead = true;
        state.events.push({ type: 'absorb', x: f.x, y: f.y, seat: ship.index });
        break;
      }
      if (ship.invuln > 0) continue;
      if ((ship.x - f.x) ** 2 + (ship.y - f.y) ** 2 > (SHIP_R + f.r) ** 2) continue;
      f.dead = true;
      hurt(state, ship, DMG_FLAK, 'flak');
      break;
    }
  }
}

/** Flying into things, and the pod grinding through them. */
function shipsHitThings(state) {
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    const p = ship.pod;

    for (const foe of state.foes) {
      if (foe.dying) continue;
      if (p.has && (p.x - foe.x) ** 2 + (p.y - foe.y) ** 2 <= (POD_R + foe.r) ** 2
        && state.tick - p.grindAt >= POD_CONTACT_EVERY) {
        p.grindAt = state.tick;
        damage(state, foe, POD_CONTACT_DMG, { seat: ship.index, x: p.x, y: p.y });
        if (foe.dying) continue;
      }
      if (ship.invuln > 0) continue;
      if ((ship.x - foe.x) ** 2 + (ship.y - foe.y) ** 2 > (SHIP_R + foe.r) ** 2) continue;
      hurt(state, ship, DMG_FOE, 'foe');
      damage(state, foe, 4, { seat: ship.index, x: ship.x, y: ship.y });
      break;
    }

    const boss = state.boss;
    if (!boss || boss.dying || ship.invuln > 0 || !ship.alive) continue;
    if (Math.abs(ship.x - boss.x) <= boss.def.w / 2 + SHIP_R
      && Math.abs(ship.y - boss.y) <= boss.def.h / 2 + SHIP_R) {
      hurt(state, ship, DMG_BEAM, 'boss');
    }
  }
}

function collectDrops(state) {
  for (const d of state.drops) {
    if (d.dead) continue;
    for (const ship of state.ships) {
      if (!ship.alive) continue;
      const near = Math.min(
        (ship.x - d.x) ** 2 + (ship.y - d.y) ** 2,
        ship.pod.has ? (ship.pod.x - d.x) ** 2 + (ship.pod.y - d.y) ** 2 : Infinity,
      );
      if (near > DROP_R * DROP_R) continue;
      d.dead = true;
      give(state, ship, d.give, d);
      break;
    }
  }
}

/**
 * What a pickup does.
 *
 * Anything you cannot use is worth points instead, which matters more than it
 * sounds: a maxed-out speed pickup that did nothing at all would make the last
 * stage of a good run feel like the game had stopped paying attention.
 */
function give(state, ship, what, at) {
  const p = ship.pod;
  let took = true;

  if (what === 'red' || what === 'blue' || what === 'yellow') {
    if (!p.has) {
      p.has = true;
      p.kind = what;
      p.level = 1;
      p.mode = 'nose';
      p.x = ship.x + POD_NOSE;
      p.y = ship.y;
    } else if (p.kind === what) {
      if (p.level >= POD_MAX_LEVEL) took = false;
      else p.level++;
    } else {
      // A different colour is a different weapon rather than a better one, so
      // it starts again at the bottom. Every crystal is on a fixed mark, so
      // this is a decision you can make in advance rather than an accident.
      p.kind = what;
      p.level = 1;
    }
  } else if (what === 'speed') {
    if (ship.speedups >= MAX_SPEEDUPS) took = false;
    else ship.speedups++;
  } else if (what === 'missile') {
    if (ship.missiles >= MAX_MISSILES) took = false;
    else ship.missiles++;
  } else if (what === 'heal') {
    // A repair brings a partner back before it patches anybody up. Two people
    // playing and one of them watching is not the game either of them started.
    const down = state.ships.find((s) => !s.alive);
    if (down) {
      down.alive = true;
      down.hull = 2;
      down.invuln = INVULN_TICKS * 2;
      down.x = state.scroll + EDGE_X + 20;
      down.y = VIEW_H / 2;
      down.pod.has = false;
      down.pod.kind = 'none';
      down.pod.level = 0;
      state.events.push({ type: 'revive', seat: down.index });
    } else if (ship.hull >= HULL_MAX) {
      took = false;
    } else {
      ship.hull = Math.min(HULL_MAX, ship.hull + HEAL_AMOUNT);
    }
  }

  if (!took) state.score += DROP_POINTS;
  state.events.push({
    type: 'pickup', seat: ship.index, give: what, spare: !took, x: at.x, y: at.y,
  });
}

// --- Damage, and the end of it -----------------------------------------------

function hurt(state, ship, amount, what) {
  if (ship.invuln > 0 || !ship.alive) return;
  ship.hull -= amount;
  ship.hits++;
  ship.invuln = INVULN_TICKS;
  state.events.push({
    type: 'hurt', seat: ship.index, x: ship.x, y: ship.y, amount, what,
  });
  if (ship.hull > 0) return;

  ship.hull = 0;
  ship.alive = false;
  // The pod goes with it. Losing everything you were carrying is what makes the
  // hull worth protecting rather than merely worth watching.
  ship.pod.has = false;
  ship.pod.kind = 'none';
  ship.pod.level = 0;
  ship.speedups = 0;
  ship.missiles = 0;
  state.events.push({ type: 'die', seat: ship.index, x: ship.x, y: ship.y });
}

function clearStage(state) {
  const hull = state.ships.reduce((sum, s) => sum + (s.alive ? s.hull : 0), 0);
  const { loop } = difficultyOf(state);
  const bonus = Math.round((STAGE_BONUS + hull * HULL_BONUS) * (1 + loop * LOOP_SCORE));
  state.score += bonus;
  state.phase = 'clear';
  state.phaseTimer = CLEAR_TICKS;
  state.events.push({ type: 'clear', n: state.stageNumber, bonus, hull });
}

function sweep(state) {
  for (const foe of state.foes) {
    if (foe.dying && foe.dieIn > 0) {
      foe.dieIn--;
      continue;
    }
    if (foe.dying) {
      if (foe.chain) {
        state.events.push({ type: 'chain', x: foe.x, y: foe.y, colour: foe.def.colour });
      }
      foe.gone = true;
    }
    else if (foe.x < state.scroll - CULL_LEFT) foe.gone = true;
    else if (foe.y < -60 || foe.y > VIEW_H + 60) foe.gone = true;
  }
  if (state.foes.some((f) => f.gone)) state.foes = state.foes.filter((f) => !f.gone);
  if (state.shots.some((s) => s.dead)) state.shots = state.shots.filter((s) => !s.dead);
  if (state.flak.some((f) => f.dead)) state.flak = state.flak.filter((f) => !f.dead);
  if (state.drops.some((d) => d.dead)) state.drops = state.drops.filter((d) => !d.dead);
  if (state.boss && state.boss.dying) state.boss = null;
}

function settle(state) {
  if (state.phase === 'clear' || state.phase === 'over') return;
  if (anyAlive(state)) return;
  state.phase = 'dying';
  state.phaseTimer = DEATH_TICKS;
}
