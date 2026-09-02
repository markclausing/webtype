/**
 * The corridor itself: a ceiling and a floor, sampled every few units along the
 * stage.
 *
 * Everything about it is worked out from the stage's own list of keyframes by a
 * pure function, cached by key. That matters for the same reason the racing
 * game's track does: two machines playing the same stage have to agree about
 * exactly where the wall is, and the cheapest way to guarantee that is for the
 * wall never to have been random in the first place.
 *
 * A keyframe is `{ at, ceil, floor }` - a world x, and where the two surfaces
 * are at that point. Between keyframes the surfaces are eased rather than
 * straight-lined, because a corridor made of straight ramps reads as a
 * cardboard cutout, and a little ripple is laid over the top so that a long flat
 * stretch still looks like rock.
 */

import { VIEW_H } from '../constants.js';

/** How far apart the samples are, in world units. */
export const STEP = 8;

/** Smoothstep: flat at both ends, so keyframes join without a crease. */
function ease(t) {
  return t * t * (3 - 2 * t);
}

/**
 * A deterministic ripple, from the sample index alone.
 *
 * Three sines that do not share a period, which is the oldest trick there is
 * for making something look unplanned without asking for a random number. It
 * has to be a function of the index and nothing else: the terrain is compared
 * between machines by being identical, not by being hashed.
 */
function ripple(i, phase) {
  return Math.sin(i * 0.7 + phase) * 1.7
    + Math.sin(i * 0.23 + phase * 2.1) * 3.1
    + Math.sin(i * 0.11 + phase * 0.7) * 2.2;
}

/**
 * Builds the two surfaces for one stage.
 *
 * @param frames {{at:number, ceil:number, floor:number}[]} in order of `at`
 * @param length how long the stage is, in world units
 */
export function buildTerrain(frames, length, rough = 1) {
  const count = Math.ceil(length / STEP) + 2;
  const ceil = new Float64Array(count);
  const floor = new Float64Array(count);

  let at = 0;
  for (let i = 0; i < count; i++) {
    const x = i * STEP;
    // Which pair of keyframes this sample sits between. Walked forward rather
    // than searched: the samples are in order, so this is one comparison each.
    while (at < frames.length - 2 && x >= frames[at + 1].at) at++;
    const a = frames[at];
    const b = frames[Math.min(at + 1, frames.length - 1)];
    const span = Math.max(1, b.at - a.at);
    const t = ease(Math.min(1, Math.max(0, (x - a.at) / span)));

    const c = a.ceil + (b.ceil - a.ceil) * t;
    const f = a.floor + (b.floor - a.floor) * t;
    // The ripple is pushed away from the gap rather than into it: a bump that
    // narrows the corridor can close a gap the stage was designed around, and a
    // stage that is impossible on some machines' arithmetic is worse than a
    // stage that looks slightly flatter than it might have.
    ceil[i] = Math.max(0, c - Math.abs(ripple(i, 0.3)) * rough);
    floor[i] = Math.min(VIEW_H, f + Math.abs(ripple(i, 2.4)) * rough);
  }
  return { ceil, floor, count, length };
}

/** Where the two surfaces are at a given world x, interpolated between samples. */
export function surfaceAt(terrain, x) {
  const t = x / STEP;
  const i = Math.floor(t);
  if (i < 0) return { ceil: terrain.ceil[0], floor: terrain.floor[0] };
  if (i >= terrain.count - 1) {
    const last = terrain.count - 1;
    return { ceil: terrain.ceil[last], floor: terrain.floor[last] };
  }
  const f = t - i;
  return {
    ceil: terrain.ceil[i] + (terrain.ceil[i + 1] - terrain.ceil[i]) * f,
    floor: terrain.floor[i] + (terrain.floor[i + 1] - terrain.floor[i]) * f,
  };
}

/** Is a circle of this size at this point inside rock? */
export function inRock(terrain, x, y, r = 0) {
  const { ceil, floor } = surfaceAt(terrain, x);
  return y - r < ceil || y + r > floor;
}

/**
 * Which way out of the rock is nearest, as a unit vector.
 *
 * Only ever up or down: the surfaces are functions of x, so there is no
 * sideways to be pushed. It is used to bounce a reflected bolt and to shove a
 * ship back out of a wall it has flown into.
 */
export function rockNormal(terrain, x, y) {
  const { ceil, floor } = surfaceAt(terrain, x);
  return y - ceil < floor - y ? 1 : -1;
}

/** How much room there is between the two surfaces. Used to place things fairly. */
export function gapAt(terrain, x) {
  const { ceil, floor } = surfaceAt(terrain, x);
  return floor - ceil;
}
