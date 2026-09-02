/**
 * The autopilot that flies the menu.
 *
 * The title screen stands in front of a real run of the real game rather than a
 * picture of one, and this is what is holding the stick. It is nobody's idea of
 * a good player - it dodges the nearest thing and shoots forwards - but it is
 * enough to show what the game looks like when it is being played, which is the
 * only thing an attract mode has to do.
 *
 * Two rules, and both matter:
 *
 * It reads the state and never writes to it, and in particular it never draws
 * on `state.rng`. Anything that consumed a random number here would be a thing
 * one machine did and another did not, and although the demo is never played
 * online, the same function is used by the tests, where it very much is. What
 * looks like wandering is a function of the tick instead.
 *
 * And it produces a button mask, exactly as a keyboard does. It is a hand on
 * the controls, not a special case inside the simulation; the game it plays is
 * bit for bit the game you play.
 */

import { BTN, VIEW_H, VIEW_W } from './constants.js';
import { surfaceAt } from './game/terrain.js';

/** How long it holds the trigger before letting a beam go, and for how long. */
const HOLD = 78;
const REST = 8;

export function demoMask(state, seat = 0, style = 0) {
  const ship = state.ships[seat];
  if (!ship || !ship.alive) return 0;

  let mask = 0;
  // Held, then released: which is the only way to fire a beam at all, and the
  // one thing a hand on the button does that a naive bot never thinks of.
  if ((state.tick + seat * 37 + style * 11) % (HOLD + REST) < HOLD) mask |= BTN.FIRE;

  // What to be away from: whichever bullet or body is nearest, weighted so that
  // something behind you is not a reason to panic.
  let threat = null;
  let near = Infinity;
  for (const f of state.flak) {
    if (f.x < ship.x - 30) continue;
    const d = (f.x - ship.x) ** 2 + (f.y - ship.y) ** 2;
    if (d < near) {
      near = d;
      threat = f;
    }
  }
  for (const f of state.foes) {
    if (f.x < ship.x - 20) continue;
    const d = (f.x - ship.x) ** 2 + (f.y - ship.y) ** 2;
    if (d < near) {
      near = d;
      threat = f;
    }
  }

  // What to be near: a pickup, always, because collecting things is most of
  // what there is to look at.
  let want = null;
  let wantD = Infinity;
  for (const d of state.drops) {
    const dd = (d.x - ship.x) ** 2 + (d.y - ship.y) ** 2;
    if (dd < wantD) {
      wantD = dd;
      want = d;
    }
  }

  let toY = VIEW_H / 2 + Math.sin(state.tick * 0.011 + seat * 2) * 46;
  let toX = state.scroll + VIEW_W * (0.26 + seat * 0.06);
  if (want) {
    toY = want.y;
    toX = want.x;
  }
  if (threat && near < 76 * 76) {
    toY = threat.y > ship.y ? ship.y - 60 : ship.y + 60;
    toX = state.scroll + VIEW_W * 0.22;
  }

  // And never into the rock, which is what actually kills a bot that is only
  // watching the bullets.
  const { ceil, floor } = surfaceAt(state.stage.terrain, ship.x + 24);
  toY = Math.max(ceil + 16, Math.min(floor - 16, toY));

  if (toY < ship.y - 3) mask |= BTN.UP;
  else if (toY > ship.y + 3) mask |= BTN.DOWN;
  if (toX < ship.x - 5) mask |= BTN.LEFT;
  else if (toX > ship.x + 5) mask |= BTN.RIGHT;

  return mask;
}
