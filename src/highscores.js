/**
 * The score board.
 *
 * Ten per list, kept in localStorage so a browser on its own needs nothing at
 * all. Every entry carries an id and the time it was set, which is what lets two
 * boards from two devices be merged later without either winning by being loaded
 * second.
 *
 * This is one of the few pieces of plumbing webtype does not share with the
 * other three games, and the reason is the shape of a score. The football and
 * tennis boards hold a result - a scoreline, where a defeat is not news. The
 * racing board holds a lap time, where smaller wins. Here it is a run: a number
 * that only goes up, and beside it how far into the game it was set, which is
 * the more interesting half. Everything else about the board - merging,
 * clearing, the three letters, the Worker that holds it - is word for word the
 * same file the other three run.
 *
 * A run of one and a run of two are not comparable and never will be, so there
 * is a list for each. There is also a list per skill setting, because the
 * setting changes how much hull you start with, and hull is how far you get.
 *
 * Nothing in here touches the simulation, and the store is injectable so the
 * tests can run it without a browser.
 */

/**
 * Where the board is kept, unless the game says otherwise.
 *
 * It has to be said otherwise when several games share an origin, which these
 * four do: all of them live on the same github.io domain, and one key would mean
 * tennis results landing in a shooter's table.
 */
export const KEY = 'webtype.highscores.v1';

/** One player or two. They are different games and they get different lists. */
export const MODES = ['solo', 'pair'];
export const TIERS = ['easy', 'normal', 'hard'];

/**
 * The lists, keyed `solo:hard`.
 *
 * `pair:online` is one of them because it has to be. Two people at one keyboard
 * and two people on two continents are the same game as far as the simulation is
 * concerned, but they are not the same game to play - one of them has a
 * connection in the middle of it - and filing them together would be writing
 * down something not quite true.
 */
export const LEVELS = [
  ...MODES.flatMap((m) => TIERS.map((t) => `${m}:${t}`)),
  'pair:online',
];
export const TABLE_SIZE = 10;
export const NAME_LENGTH = 3;

/** The letters you can pick from, in the order the stick cycles through them. */
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';

/** Nobody gets on the board with nothing, and nobody has ever scored this much. */
const LEAST = 1;
const MOST = 99999999;
/** Stages are counted from zero, and thirty laps of five is not a real run. */
const MAX_STAGE = 200;

const empty = () => Object.fromEntries(LEVELS.map((l) => [l, []]));

function cleanName(name) {
  const up = String(name ?? '').toUpperCase();
  let out = '';
  for (const ch of up) {
    if (ALPHABET.includes(ch) && out.length < NAME_LENGTH) out += ch;
  }
  return out.padEnd(NAME_LENGTH, '-');
}

/**
 * One row, from anywhere: our own storage, another device, or a shared board.
 * Anything unusable comes back null rather than throwing - a corrupt board
 * should cost you a row, not the page.
 */
export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const score = Math.round(Number(raw.score));
  if (!Number.isFinite(score) || score < LEAST || score > MOST) return null;
  const stage = Math.round(Number(raw.stage));
  const at = Number(raw.at);
  return {
    id: String(raw.id || '').slice(0, 40) || makeId(),
    name: cleanName(raw.name),
    score,
    stage: Number.isFinite(stage) ? Math.max(0, Math.min(MAX_STAGE, stage)) : 0,
    at: Number.isFinite(at) && at > 0 ? at : Date.now(),
  };
}

/** Unique enough to tell two entries apart when boards are merged. */
export function makeId() {
  const rand = Math.floor(Math.random() * 0xffffff).toString(36);
  return `${Date.now().toString(36)}-${rand}`;
}

/**
 * Biggest score first.
 *
 * A tie goes to whoever got further, which is almost never used and is there for
 * a reason: two runs on the same number mean the shorter one was the more
 * efficient, and the board should not pretend it cannot tell. After that it goes
 * to whoever got there first.
 */
export function compare(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  if (a.stage !== b.stage) return b.stage - a.stage;
  return a.at - b.at;
}

export function sortTable(entries) {
  return [...entries].sort(compare).slice(0, TABLE_SIZE);
}

/** Would this run get on the board? */
export function qualifies(table, entry) {
  const clean = cleanEntry(entry);
  if (!clean) return false;
  // Sorted here rather than trusted: a board that arrived from somewhere else
  // may be in any order, and asking the wrong row would let a worse run in.
  const rows = sortTable(table || []);
  if (rows.length < TABLE_SIZE) return true;
  return compare(clean, rows[rows.length - 1]) < 0;
}

/** Where a run would land, counting from 1, or 0 if it would not. */
export function placeOf(table, entry) {
  const clean = cleanEntry(entry);
  if (!clean) return 0;
  const rows = sortTable([...(table || []), clean]);
  const at = rows.findIndex((r) => r.id === clean.id);
  return at < 0 ? 0 : at + 1;
}

/**
 * Two boards into one. Same id means the same run, however many times it has
 * travelled: a board that has been round three devices must not grow three
 * copies of everything.
 */
export function merge(mine, theirs) {
  const out = empty();
  const a = normalise(mine);
  const b = normalise(theirs);
  for (const level of LEVELS) {
    const seen = new Map();
    for (const raw of [...(a[level] || []), ...(b[level] || [])]) {
      const entry = cleanEntry(raw);
      if (entry && !seen.has(entry.id)) seen.set(entry.id, entry);
    }
    out[level] = sortTable([...seen.values()]);
  }
  return out;
}

/**
 * A board with everything set before `since` dropped.
 *
 * This is what makes emptying the shared board stick. Wiping the server does not
 * wipe anybody's browser, and the next time one of them syncs it posts its own
 * copy straight back. So a cleared board remembers when it was cleared, and
 * refuses anything older.
 */
export function since(board, when) {
  if (!when) return merge({}, board);
  const from = normalise(board);
  const out = {};
  for (const level of LEVELS) {
    out[level] = (from[level] || []).filter((row) => Number(row?.at) >= when);
  }
  return merge({}, out);
}

/** A board with these ids taken out, wherever they sit. */
export function without(board, ids) {
  const drop = new Set(ids || []);
  const from = normalise(board);
  const out = {};
  for (const level of LEVELS) {
    out[level] = (from[level] || []).filter((row) => !drop.has(row?.id));
  }
  return merge({}, out);
}

/** `('pair', 'hard')` -> `'pair:hard'`, and anything unrecognised -> the first list. */
export function levelOf(mode, tier = 'normal') {
  const key = String(mode).includes(':') ? String(mode) : `${mode}:${tier}`;
  return LEVELS.includes(key) ? key : LEVELS[0];
}

/** How many people and what setting a list is for, for putting on screen. */
export function partsOf(key) {
  const [mode, tier] = String(key).split(':');
  return {
    mode: MODES.includes(mode) ? mode : 'solo',
    tier: tier === 'online' || TIERS.includes(tier) ? tier : 'normal',
  };
}

/** Which list a run belongs on, from how it was played. */
export function levelFor({ players = 1, skill = 'normal', online = false } = {}) {
  if (online) return 'pair:online';
  return levelOf(players > 1 ? 'pair' : 'solo', skill);
}

/**
 * Any board, in the shape this version expects.
 *
 * Runs on the way in rather than as a one-off migration, because there is no
 * moment when every copy of the board has been converted: a browser that has not
 * been opened for a month will post whatever shape it was last left with.
 */
function normalise(board) {
  const out = {};
  for (const [key, rows] of Object.entries(board || {})) {
    if (!Array.isArray(rows)) continue;
    if (!LEVELS.includes(key)) continue;
    (out[key] ||= []).push(...rows);
  }
  return out;
}

export class Highscores {
  constructor(store = globalThis.localStorage, key = KEY) {
    this.store = store;
    this.key = key;
    this.tables = this.read();
  }

  read() {
    try {
      const raw = this.store?.getItem(this.key);
      if (!raw) return empty();
      return merge(empty(), JSON.parse(raw));
    } catch {
      // Unreadable, or storage turned off. An empty board is the right answer:
      // losing the board is a shame, refusing to start the game is worse.
      return empty();
    }
  }

  write() {
    try {
      this.store?.setItem(this.key, JSON.stringify(this.tables));
    } catch { /* private mode: the board just will not stick */ }
  }

  table(mode, tier) {
    return this.tables[levelOf(mode, tier)] || [];
  }

  qualifies(mode, tier, entry) {
    return qualifies(this.table(mode, tier), entry);
  }

  /** Adds a run and returns where it landed, or 0 if it missed the board. */
  add(mode, tier, entry) {
    const clean = cleanEntry(entry);
    if (!clean) return 0;
    const level = levelOf(mode, tier);
    this.tables[level] = sortTable([...this.table(level), clean]);
    this.write();
    return this.tables[level].findIndex((r) => r.id === clean.id) + 1;
  }

  /** The best anybody has done on a list, for showing in the menu. */
  best(mode, tier) {
    return this.table(mode, tier)[0] || null;
  }

  /** Folds in a board from somewhere else and keeps the result. */
  absorb(theirs) {
    this.tables = merge(this.tables, theirs);
    this.write();
    return this.tables;
  }

  all() {
    return this.tables;
  }
}
