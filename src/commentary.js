/**
 * What the ship's computer knows how to say.
 *
 * The synthesiser in speech.js is shared with websoccer, webtennis and
 * webracing and knows nothing about any of them; this is this game's half. It
 * is a very small vocabulary on purpose. A shooter is loud, most of what happens
 * happens in a second, and a voice that narrated any of it would be a voice
 * everybody turned off in the menu within a stage and a half.
 *
 * So it speaks four times: when something large arrives, when you are hit, when
 * a stage is over, and when the run is. Everything else the sound effects
 * already said better.
 */

export const WORDS = {
  warning: ['W', 'AO', 'R', 'N', 'IH', 'NG'],
  danger: ['D', 'EY', 'N', 'JH', 'ER'],
  alert: ['AH', 'L', 'ER', 'T'],

  hull: ['HH', 'AH', 'L'],
  breach: ['B', 'R', 'IY', 'CH'],
  critical: ['K', 'R', 'IH', 'T', 'IH', 'K', 'AH', 'L'],
  down: ['D', 'AW', 'N'],
  repair: ['R', 'IY', 'P', 'EH', 'R'],
  repaired: ['R', 'IY', 'P', 'EH', 'R', 'D'],

  stage: ['S', 'T', 'EY', 'JH'],
  clear: ['K', 'L', 'IY', 'R'],
  complete: ['K', 'AH', 'M', 'P', 'L', 'IY', 'T'],

  game: ['G', 'EY', 'M'],
  over: ['OW', 'V', 'ER'],
  mission: ['M', 'IH', 'SH', 'AH', 'N'],
  failed: ['F', 'EY', 'L', 'D'],

  pod: ['P', 'AA', 'D'],
  ready: ['R', 'EH', 'D', 'IY'],
  online: ['AA', 'N', 'L', 'AY', 'N'],
};

/**
 * Lines with nothing variable in them, which here is all of them.
 *
 * Several per event, taken in turn by the synthesiser rather than at random, so
 * that being hit four times in a stage does not produce the same two words four
 * times.
 */
export const LINES = {
  warning: ['warning', 'alert', 'danger'],
  hit: ['hull breach', 'hull critical', 'warning'],
  down: ['mission failed', 'down'],
  repair: ['hull repaired', 'repaired'],
  clear: ['stage clear', 'stage complete'],
  over: ['game over', 'mission failed'],
  pod: ['pod online', 'pod ready'],
};

/** The four lines the game is allowed to say, worked out per frame. */
export function lines() {
  return {
    warning: 'warning',
    repair: 'hull repaired',
    clear: 'stage clear',
    over: 'game over',
  };
}
