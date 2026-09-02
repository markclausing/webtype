/**
 * What gets said in Discord when somebody puts a run on the board.
 *
 * Kept apart from the Worker so both servers can use it and so the wording can
 * be tested without a network anywhere near it. Nothing in here talks to
 * Discord; it only decides what is news and what the message should say.
 *
 * It says which game is talking, and that is not decoration. All four games post
 * into the same channel - the webhook is only an address and does not care who
 * is using it - so a bare "MJC 142 300" would be indistinguishable from a
 * football result to anybody who was not already playing.
 */

import { LEVELS, partsOf } from '../src/highscores.js';

/** How many scores one post will mention before it just counts the rest. */
const MAX_LINES = 3;

/** What each list is called in a sentence. */
const WHO = {
  solo: 'on their own',
  pair: 'with somebody',
};

const AGAINST = {
  easy: ' on EASY',
  normal: ' on NORMAL',
  hard: ' on HARD',
  online: ', online',
};

/** "142 300". The same format the game shows. */
export function score(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** "3-2": the third stage, on the second lap of the five. */
export function stage(n) {
  const at = Math.max(0, Math.round(Number(n) || 0));
  const loop = Math.floor(at / 5);
  return loop ? `${(at % 5) + 1}-${loop + 1}` : `${(at % 5) + 1}`;
}

/**
 * Which rows are new, and where they landed.
 *
 * Worked out by comparing the board before and after rather than trusting what
 * was sent: a run that did not make the top ten is not news, and the same run
 * arriving from a second device is not news either, because merging matches it
 * by id.
 */
export function newRows(before, after) {
  const rows = [];
  for (const level of LEVELS) {
    const had = new Set((before?.[level] || []).map((r) => r.id));
    const now = after?.[level] || [];
    for (let i = 0; i < now.length; i++) {
      if (!had.has(now[i].id)) rows.push({ entry: now[i], level, place: i + 1 });
    }
  }
  // Best placings first, so a post that has to cut something cuts the least
  // interesting line.
  return rows.sort((a, b) => a.place - b.place);
}

function ordinal(n) {
  if (n === 1) return '**top of the board**';
  if (n === 2) return 'second';
  if (n === 3) return 'third';
  return `number ${n}`;
}

function line({ entry, level, place }) {
  const parts = partsOf(level);
  return `🚀 **${entry.name}** scored **${score(entry.score)}** `
    + `${WHO[parts.mode] || ''}${AGAINST[parts.tier] ?? ''}, `
    + `as far as stage ${stage(entry.stage)} — ${ordinal(place)}`;
}

/**
 * Where the game lives. Overridden with a GAME_URL variable if you host it
 * somewhere else, because the whole point of the message is that people can
 * click it and go and beat the score.
 */
export const GAME_URL = 'https://markclausing.github.io/webtype/';

/** The cyan the first ship is drawn in. */
const COLOUR = 0x58e6ff;

/**
 * The body of the Discord post.
 *
 * An embed rather than a line of text: it gives the message a clickable title,
 * so nobody has to copy an address out of a chat window, and it says which game
 * this is. The name is set on the message as well, so it reads as WebType
 * talking whatever the webhook itself was called when it was made.
 */
export function announcement(rows, gameUrl = GAME_URL) {
  const shown = rows.slice(0, MAX_LINES).map(line);
  if (rows.length > MAX_LINES) {
    shown.push(`…and ${rows.length - MAX_LINES} more.`);
  }
  const url = gameUrl || GAME_URL;
  const plural = rows.length > 1 ? 'New scores' : 'A new score';
  return {
    username: 'WebType',
    embeds: [{
      title: `👾 ${plural} in WebType`,
      url,
      description: shown.join('\n'),
      color: COLOUR,
      footer: { text: `Play at ${url.replace(/^https?:\/\//, '').replace(/\/$/, '')}` },
    }],
    // Names are three characters of A-Z, 0-9 and a dash, so they cannot spell a
    // mention - but a board this open should not be one webhook away from
    // pinging a whole server, whatever anybody changes later.
    allowed_mentions: { parse: [] },
  };
}
