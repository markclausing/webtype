/**
 * The page: menu, game loop, and the wiring between the two.
 *
 * The loop is the same fixed-timestep arrangement as websoccer, webtennis and
 * webracing, talking to a transport that is either local or online, and the
 * simulation never knows which. That part is shared code; what is here is this
 * game's own.
 */

import { CHARGE_FULL, FRAME_TIME, MAX_SHIPS, SKILL_LEVELS } from './constants.js';
import {
  ACTIONS, InputDevices, PRESETS, findConflicts, keyLabel, loadBindings, saveBindings,
} from './input.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { createRun, formatScore, stageLabel } from './game/state.js';
import { step } from './game/sim.js';
import { chargeLevel } from './game/weapons.js';
import { Renderer } from './render/renderer.js';
import { AudioEngine, Charger, Chiptune, Sfx } from './audio.js';
import { Speech } from './speech.js';
import * as commentary from './commentary.js';
import { Highscores, NAME_LENGTH, makeId, placeOf } from './highscores.js';
import { NameEntry } from './nameEntry.js';
import { boardFor, relayFor } from './config.js';
import { Signal } from './net/signal.js';
import { LocalTransport, OnlineTransport } from './net/transport.js';
import { demoMask } from './demo.js';

const canvas = document.getElementById('screen');
const menu = document.getElementById('menu');
const pauseBox = document.getElementById('pause');
const overBox = document.getElementById('gameover');
const netendBox = document.getElementById('netend');
const hiscoreBox = document.getElementById('hiscore');
const onlineStatus = document.getElementById('onlineStatus');
const roomCode = document.getElementById('roomCode');
const lobbyBox = document.getElementById('lobby');
const goButton = document.getElementById('go');

const audio = new AudioEngine();
const music = new Chiptune(audio);
const charger = new Charger(audio);
const speech = new Speech(audio, commentary);
const sfx = new Sfx(audio, speech);
// Its own key, like the score board: the other three games are on this domain
// too, and they do not even mean the same thing by the same buttons.
const KEYS_STORAGE = 'webtype.bindings';
const bindings = loadBindings(KEYS_STORAGE);
const devices = new InputDevices(bindings);
// Without this nothing is listening to the keyboard at all - the stage starts,
// and then a ship sits there and is slowly pushed into the wall behind it.
devices.attach();
const touch = new TouchControls();
const renderer = new Renderer(canvas);
const highscores = new Highscores(globalThis.localStorage);

let soundOn = globalThis.localStorage?.getItem('webtype.sound') !== 'off';
sfx.talking = globalThis.localStorage?.getItem('webtype.talk') !== 'off';
audio.enabled = soundOn;

const onTouchDevice = isTouchDevice();
if (onTouchDevice) {
  touch.attach({
    root: document.getElementById('touch'),
    stick: document.getElementById('stick'),
    knob: document.getElementById('knob'),
    kick: document.getElementById('btnFire'),
    swap: document.getElementById('btnPod'),
  });
  devices.touch = touch;
}

const game = {
  state: null,
  transport: null,
  signal: null,
  seat: 0,
  /** Which list a run belongs on: solo or pair, and the setting it was played on. */
  boardMode: 'solo',
  tier: 'normal',
  humans: [],
  paused: false,
  acc: 0,
  last: performance.now(),
  ended: false,
};
window.__game = game;

// --- Who is flying what ------------------------------------------------------

/**
 * Which seats a person is sitting in on this machine.
 *
 * The first two come off the keyboard, and a gamepad plugged in takes the seat
 * of the same number. That falls out of how InputDevices works rather than
 * being arranged here: slot 0 and slot 1 each read their own key bindings and
 * their own pad, so one pad shares a ship with the keyboard and a second pad is
 * simply player two.
 */
function localSeats(players) {
  const seats = [];
  for (let i = 0; i < Math.min(MAX_SHIPS, players); i++) seats.push(i);
  return seats;
}

const SHIP_NAMES = ['ONE', 'TWO'];

// --- Starting and stopping ---------------------------------------------------

function beginRun(state, transport, seat) {
  game.state = state;
  game.transport = transport;
  game.seat = seat;
  game.paused = false;
  game.ended = false;
  game.acc = 0;
  game.last = performance.now();
  menu.classList.add('hidden');
  pauseBox.classList.add('hidden');
  overBox.classList.add('hidden');
  netendBox.classList.add('hidden');
  canvas.focus();
  renderer.reset();
  if (onTouchDevice) touch.show(true);
  music.stop();
  if (soundOn) charger.start();
  sizeCanvas();
}

function startLocal({ players }) {
  const seats = localSeats(players);
  const humans = new Array(MAX_SHIPS).fill(false);
  for (const seat of seats) humans[seat] = true;
  const state = createRun({
    seed: (Date.now() & 0x7fffffff) || 1,
    players,
    humans,
    skill,
  });
  game.humans = seats;
  game.boardMode = players > 1 ? 'pair' : 'solo';
  game.tier = skill;
  beginRun(state, new LocalTransport(devices, seats), seats[0] ?? 0);
}

function startOnline(opts) {
  const state = createRun({
    seed: opts.seed,
    players: 2,
    humans: [true, true],
    skill: opts.skill,
  });
  game.humans = [opts.seat];
  game.boardMode = 'pair';
  game.tier = 'online';
  beginRun(state, new OnlineTransport({
    signal: opts.signal, devices, seats: 2, localSeat: opts.seat,
  }), opts.seat);
}

function toMenu() {
  if (game.transport) game.transport.dispose();
  else if (game.signal) game.signal.close();
  charger.stop();
  game.state = null;
  game.transport = null;
  game.signal = null;
  menu.classList.remove('hidden');
  pauseBox.classList.add('hidden');
  overBox.classList.add('hidden');
  netendBox.classList.add('hidden');
  touch.show(false);
  renderer.bottomInset = 0;
  if (soundOn) music.start();
  setOnlineStatus('');
  roomCode.classList.add('hidden');
  lobbyBox.classList.add('hidden');
  goButton.classList.add('hidden');
  document.getElementById('host').disabled = false;
}

// --- The loop ----------------------------------------------------------------

function sizeCanvas() {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  fitControls(dpr);
}
addEventListener('resize', sizeCanvas);

/**
 * How much of the bottom of the screen the on-screen controls are given.
 *
 * Only in portrait, and that is the whole subtlety. The playfield is a fixed
 * shape, so on a phone held sideways it is already the height of the window that
 * decides how big everything is drawn - taking a strip off the bottom for the
 * thumbs shrinks the picture without gaining anybody anything, and the first
 * version of this did exactly that: it threw away half the width of the screen
 * to leave room under a game that had already run out of room above it. Held
 * upright there is height going spare, and then the strip is free.
 */
function fitControls(dpr) {
  renderer.bottomInset = onTouchDevice && game.state
    && canvas.clientHeight > canvas.clientWidth ? 150 * dpr : 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.25, (now - game.last) / 1000);
  game.last = now;

  if (!game.state) {
    attract(elapsed);
    return;
  }

  if (pending.open) {
    nameEntry.step(devices.mask(0));
    renderer.draw(game.state, { seat: game.seat, net: netInfo(), quiet: true });
    return;
  }

  if (!game.paused) {
    game.acc += elapsed;
    let guard = 0;
    while (game.acc >= FRAME_TIME / 1000 && guard < 8) {
      const tick = game.state.tick;
      game.transport.sample(tick);
      if (!game.transport.ready(tick)) break;
      const inputs = game.transport.poll(tick);
      step(game.state, inputs);
      game.transport.afterStep(game.state);
      renderer.feed(game.state.events, game.seat);
      sfx.play(game.state.events, { seat: game.seat, lines: commentary.lines() });
      game.acc -= FRAME_TIME / 1000;
      guard++;
    }
    if (guard >= 8 || game.acc > (FRAME_TIME / 1000) * 8) {
      game.acc = Math.min(game.acc, (FRAME_TIME / 1000) * 8);
    }
  }

  hum();
  renderer.draw(game.state, { seat: game.seat, net: netInfo() });
  checkNetEnd();

  if (game.state.phase === 'over' && !game.transport.online && !game.ended) {
    endRun();
  }
}

/** The charge, which is your gun and nobody else's, and the boss underneath it. */
function hum() {
  const ship = game.state.ships[game.seat];
  const boss = game.state.boss;
  // Below CHARGE_MIN there is no beam yet, and the tone says so by not being
  // there: the sound starts at the moment the release would be worth making,
  // which is the only reason it is any use as a readout.
  const wound = ship && ship.alive && chargeLevel(ship.charge) > 0
    ? Math.min(1, ship.charge / CHARGE_FULL) : 0;
  charger.update(wound, !!ship && ship.charge >= CHARGE_FULL,
    boss ? Math.max(0.2, boss.hp / boss.maxHp) : 0);
}

function netInfo() {
  const t = game.transport;
  if (!t || !t.online) return null;
  return {
    online: true, ping: t.ping, stalling: t.stalling, desync: t.desync, gone: t.gone,
  };
}

function checkNetEnd() {
  const t = game.transport;
  if (!t || !t.online || game.ended) return;
  const finished = game.state.phase === 'over';
  const everybodyLeft = t.gone.length >= t.seats - 1;
  if (!everybodyLeft && !t.desync && !finished) return;
  game.ended = true;
  document.getElementById('netendTitle').textContent = t.desync ? 'DESYNC'
    : everybodyLeft ? 'YOUR PARTNER LEFT' : 'RUN OVER';
  document.getElementById('netendText').textContent = t.desync
    ? 'The two machines computed a different run. It has been stopped.'
    : everybodyLeft ? 'There is nobody else left in the room.'
      : resultLine(game.state);
  netendBox.classList.remove('hidden');
  // A score set online is still your score, and the board should have it.
  offerRecord();
}

function resultLine(state) {
  return `${formatScore(state.score)} points, stage ${stageLabel(state.stageNumber)}.`;
}

/** The end of a local run: the board first, and the result card if it declines. */
function endRun() {
  game.ended = true;
  if (offerRecord()) return;
  document.getElementById('overTitle').textContent = 'GAME OVER';
  document.getElementById('overText').textContent = resultLine(game.state);
  overBox.classList.remove('hidden');
}

// --- The attract mode --------------------------------------------------------
//
// The menu stands in front of a real run of the real game, flown by a very
// ordinary autopilot. It costs almost nothing - the canvas has to be drawn
// anyway - and it is the only honest way to show somebody what they are about
// to play. When it dies, it starts again.

let demo = null;
let demoAcc = 0;

function attract(elapsed) {
  sizeCanvas();
  if (!demo || demo.phase === 'over' || demo.stagesCleared > 2) {
    demo = createRun({
      seed: (Date.now() & 0x7fffffff) || 1, players: 1, humans: [true, false], skill: 'easy',
    });
    demoAcc = 0;
  }
  demoAcc += elapsed;
  let guard = 0;
  while (demoAcc >= FRAME_TIME / 1000 && guard < 6) {
    step(demo, [demoMask(demo, 0), 0]);
    renderer.feed(demo.events, -1);
    demoAcc -= FRAME_TIME / 1000;
    guard++;
  }
  demoAcc = Math.min(demoAcc, (FRAME_TIME / 1000) * 6);
  // No readouts on the title screen. A score of zero and an untouched hull bar
  // showing round the edges of the menu panel look like the game has already
  // started and is going badly.
  renderer.draw(demo, { seat: -1, quiet: true, chrome: false });
}

// --- The score board ---------------------------------------------------------

const pending = {
  open: false, entry: null, mode: 'solo', tier: 'normal',
};

const nameEntry = new NameEntry(document.getElementById('hiscoreLetters'), (name) => {
  try {
    globalThis.localStorage?.setItem('webtype.name', name);
  } catch { /* private mode */ }
  const place = highscores.add(pending.mode, pending.tier, { ...pending.entry, name });
  pending.open = false;
  hiscoreBox.classList.add('hidden');
  renderScores(pending.mode, pending.tier, place);
  document.getElementById('scoresBox').open = true;
  toMenu();
  syncScores();
});

window.addEventListener('keydown', (e) => {
  if (!pending.open) return;
  if (nameEntry.type(e.key)) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

/**
 * The same picker, with something to press.
 *
 * The three letters are driven by the game's own stick and fire button, which is
 * right on a cabinet and on a keyboard and is nothing at all on a phone: those
 * controls live at the bottom of the screen, this panel is laid over the top of
 * them, and a tap lands on the panel. A run that had earned a score arrived at a
 * screen with no way off it.
 *
 * So the picker gets arrows and an OK of its own. They drive the same object the
 * stick does rather than a second copy of the logic - nameEntry is one of the
 * files shared with the other three games and is not this game's to change - and
 * they are shown everywhere, because clicking an arrow beats finding the arrow
 * keys on a laptop too.
 */
for (let slot = 0; slot < NAME_LENGTH; slot++) {
  for (const [row, by, label] of [
    ['hiscoreUp', -1, '\u25B2'],
    ['hiscoreDown', 1, '\u25BC'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      nameEntry.slot = slot;
      nameEntry.cycle(by);
      nameEntry.render();
      // Otherwise the button keeps focus and the next Space - which is fire on
      // the default bindings - presses it again instead of confirming.
      button.blur();
    });
    document.getElementById(row).appendChild(button);
  }
}

// Tapping a letter moves to it, which is what everybody tries first.
document.getElementById('hiscoreLetters').addEventListener('click', (e) => {
  const at = [...e.currentTarget.children].indexOf(e.target);
  if (at < 0) return;
  nameEntry.slot = at;
  nameEntry.render();
});

document.getElementById('hiscoreOk').addEventListener('click', () => {
  nameEntry.confirm();
});

/**
 * One entry per run, whoever was flying.
 *
 * Two people at one keyboard share a score, so there is one name to ask for. Who
 * did more of the shooting is not a thing this board has an opinion about, and
 * asking twice would only produce two identical rows.
 */
function offerRecord() {
  if (pending.open) return true;

  const state = game.state;
  if (!state || state.score <= 0) return false;

  const entry = {
    id: makeId(),
    name: lastName(),
    score: state.score,
    stage: state.stageNumber,
    at: Date.now(),
  };
  if (!highscores.qualifies(game.boardMode, game.tier, entry)) return false;

  pending.entry = entry;
  pending.mode = game.boardMode;
  pending.tier = game.tier;
  pending.open = true;
  document.getElementById('hiscoreLine').textContent
    = `${formatScore(entry.score)} to stage ${stageLabel(entry.stage)}: `
    + `number ${placeOf(highscores.table(game.boardMode, game.tier), entry)} `
    + `of the ${boardName(game.boardMode, game.tier)} board`;
  hiscoreBox.classList.remove('hidden');
  // Out of the way while the picker is up. They sit under this panel and cannot
  // be reached anyway, and a control showing through an overlay that swallows
  // every tap is worse than no control at all.
  touch.show(false);
  nameEntry.start(lastName());
  return true;
}

function lastName() {
  try {
    return globalThis.localStorage?.getItem('webtype.name') || 'AAA';
  } catch {
    return 'AAA';
  }
}

async function syncScores() {
  const url = boardFor(location);
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ board: highscores.all() }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.board) return false;
    highscores.absorb(data.board);
    renderScores(boardMode(), boardTier());
    return true;
  } catch {
    return false;
  }
}

/** Which list the menu is showing, which is always the one you would be playing for. */
function boardMode() {
  return mode === '1' ? 'solo' : 'pair';
}

function boardTier() {
  return mode === 'online' ? 'online' : skill;
}

function boardName(m, tier) {
  return `${m === 'pair' ? 'TWO PLAYER' : 'ONE PLAYER'} ${tier.toUpperCase()}`;
}

function renderScores(m, tier, freshPlace = 0) {
  const body = document.getElementById('scoresBody');
  document.getElementById('scoresLevel').textContent = boardName(m, tier);
  body.innerHTML = '';
  const rows = highscores.table(m, tier);
  for (let i = 0; i < rows.length; i++) {
    const tr = document.createElement('tr');
    if (i + 1 === freshPlace) tr.className = 'fresh';
    for (const [cls, text] of [
      ['place', `${i + 1}`],
      ['name', rows[i].name],
      ['result', formatScore(rows[i].score)],
      // Labelled rather than bare. A column of "2"s next to a column of scores
      // is a column nobody can read without being told what it is.
      ['stage', `ST ${stageLabel(rows[i].stage)}`],
      ['when', new Date(rows[i].at).toLocaleDateString()],
    ]) {
      const td = document.createElement('td');
      td.className = cls;
      td.textContent = text;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  document.getElementById('scoresNote').textContent = rows.length
    ? 'Points for everything you destroy, and a bonus for every stage you finish '
      + 'with hull to spare. The setting changes how much hull you start with, so '
      + 'each one keeps its own list, and so does playing with somebody.'
    : 'Nothing here yet. Get to the end of a stage on this setting and the list '
      + 'is yours.';
}

// --- Changing the keys -------------------------------------------------------
//
// The same arrangement as the other three games, on the same shared input
// module. The labels are this game's own, because "kick or slide" means nothing
// here.

const KEY_LABELS = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  fire: 'Fire / hold to charge',
  switch: 'Pod out / back',
};

const keysBody = document.getElementById('keysBody');
const bindHint = document.getElementById('bindHint');
let listeningFor = null;

function setBindHint(text, warn = false) {
  bindHint.textContent = text;
  bindHint.classList.toggle('warn', warn);
}

function renderBindings() {
  const clashing = new Set();
  for (const clash of findConflicts(bindings)) {
    clashing.add(`${clash.a.slot}:${clash.a.action}`);
    clashing.add(`${clash.b.slot}:${clash.b.action}`);
  }

  keysBody.innerHTML = '';
  for (const action of ACTIONS) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = KEY_LABELS[action];
    row.appendChild(name);

    for (let slot = 0; slot < 2; slot++) {
      const cell = document.createElement('td');
      const button = document.createElement('button');
      const id = `${slot}:${action}`;
      const waiting = listeningFor && listeningFor.slot === slot && listeningFor.action === action;
      button.className = 'bind';
      button.dataset.bind = id;
      button.textContent = waiting ? 'press a key' : keyLabel(bindings[slot][action]);
      if (waiting) button.classList.add('listening');
      if (clashing.has(id)) button.classList.add('clash');
      button.addEventListener('click', () => {
        listeningFor = { slot, action };
        setBindHint('Press the key you want to use, or Escape to cancel.');
        renderBindings();
      });
      cell.appendChild(button);
      row.appendChild(cell);
    }
    keysBody.appendChild(row);
  }

  for (const select of document.querySelectorAll('[data-preset]')) {
    const slot = Number(select.dataset.preset);
    const current = PRESETS.find((p) => ACTIONS.every((a) => p.bindings[a] === bindings[slot][a]));
    select.innerHTML = '';
    for (const preset of PRESETS) {
      const option = document.createElement('option');
      option.value = preset.key;
      option.textContent = preset.label;
      if (current && current.key === preset.key) option.selected = true;
      select.appendChild(option);
    }
    if (!current) {
      const option = document.createElement('option');
      option.value = 'custom';
      option.textContent = 'Custom';
      option.selected = true;
      select.appendChild(option);
    }
  }

  if (clashing.size) {
    setBindHint('Those keys overlap. Fine on your own, but two players need separate keys.', true);
  } else if (!listeningFor) {
    setBindHint('Click a key to change it.');
  }
}

// Capture phase and always prevented: otherwise pressing Space would activate
// the button that still has focus and immediately ask for another key.
window.addEventListener('keydown', (e) => {
  if (!listeningFor) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.code === 'Escape') {
    listeningFor = null;
    renderBindings();
    return;
  }
  const { slot, action } = listeningFor;
  listeningFor = null;
  bindings[slot][action] = e.code;
  devices.setBindings(bindings);
  devices.down.clear(); // the key we just captured never gets a keyup we care about
  saveBindings(bindings, KEYS_STORAGE);
  renderBindings();
}, true);

for (const select of document.querySelectorAll('[data-preset]')) {
  select.addEventListener('change', () => {
    const preset = PRESETS.find((p) => p.key === select.value);
    if (!preset) return;
    bindings[Number(select.dataset.preset)] = { ...preset.bindings };
    devices.setBindings(bindings);
    saveBindings(bindings, KEYS_STORAGE);
    renderBindings();
  });
}

renderBindings();

// --- Menu --------------------------------------------------------------------

let mode = '1';
let skill = globalThis.localStorage?.getItem('webtype.skill') || 'normal';

const SKILL_BLURB = {
  easy: 'Ten points of hull, and the corridor takes its time. The stages are '
    + 'the same ones; you simply get more chances to learn them.',
  normal: 'Seven points of hull. What the game was built around.',
  hard: 'Five points of hull, and everything shoots sooner, faster and harder. '
    + 'Two mistakes is most of the allowance.',
};

function setOnlineStatus(text) {
  onlineStatus.textContent = text;
}

document.querySelectorAll('[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    mode = btn.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === btn));
    document.getElementById('skillRow').classList.toggle('hidden', mode === 'online');
    document.getElementById('onlineSetup').classList.toggle('hidden', mode !== 'online');
    document.getElementById('start').classList.toggle('hidden', mode === 'online');
    document.getElementById('host').classList.toggle('hidden', mode !== 'online');
    if (mode !== 'online') {
      goButton.classList.add('hidden');
      setOnlineStatus('');
    }
    showLocalSeats();
    renderScores(boardMode(), boardTier());
  });
});

function setSkill(key) {
  skill = SKILL_LEVELS[key] ? key : 'normal';
  document.querySelectorAll('[data-skill]').forEach((b) => {
    b.classList.toggle('active', b.dataset.skill === skill);
  });
  document.getElementById('skillBlurb').textContent = SKILL_BLURB[skill];
  try {
    globalThis.localStorage?.setItem('webtype.skill', skill);
  } catch { /* private mode */ }
  renderScores(boardMode(), boardTier());
}

document.querySelectorAll('[data-skill]').forEach((btn) => {
  btn.addEventListener('click', () => setSkill(btn.dataset.skill));
});

document.querySelectorAll('[data-sound]').forEach((btn) => {
  btn.classList.toggle('active', (btn.dataset.sound === 'on') === soundOn);
  btn.addEventListener('click', () => {
    soundOn = btn.dataset.sound === 'on';
    document.querySelectorAll('[data-sound]').forEach((b) => b.classList.toggle('active', b === btn));
    try {
      globalThis.localStorage?.setItem('webtype.sound', soundOn ? 'on' : 'off');
    } catch { /* private mode */ }
    audio.enabled = soundOn;
    if (soundOn) audio.wake();
    music.toggle(soundOn && !game.state);
  });
});

document.querySelectorAll('[data-talk]').forEach((btn) => {
  btn.classList.toggle('active', (btn.dataset.talk === 'on') === sfx.talking);
  btn.addEventListener('click', () => {
    sfx.talking = btn.dataset.talk === 'on';
    document.querySelectorAll('[data-talk]').forEach((b) => b.classList.toggle('active', b === btn));
    try {
      globalThis.localStorage?.setItem('webtype.talk', sfx.talking ? 'on' : 'off');
    } catch { /* private mode */ }
    if (sfx.talking) {
      audio.wake();
      sfx.call('stage clear', { force: true });
    }
  });
});

document.getElementById('start').addEventListener('click', () => {
  audio.wake();
  startLocal({ players: mode === '2' ? 2 : 1 });
});

/** Says which ships have a person in them, and what the second one is for. */
function showLocalSeats() {
  const line = document.getElementById('localSeats');
  if (mode === 'online') {
    line.textContent = '';
    return;
  }
  line.textContent = mode === '2'
    ? 'Two ships, one score, one hull each. A repair brings a lost partner back '
      + 'before it patches anybody up.'
    : 'One ship. The hull is all you have and there are no continues.';
}
addEventListener('gamepadconnected', showLocalSeats);
addEventListener('gamepaddisconnected', showLocalSeats);

// --- Online ------------------------------------------------------------------

let room = { seat: 0, host: false, seats: [] };

function connect() {
  if (game.signal) game.signal.close();
  const signal = new Signal(relayFor(location));
  game.signal = signal;
  signal.on('error', (m) => setOnlineStatus(m.msg || 'Connection error'));
  return signal;
}

/** Two boxes, filling up. Whoever opened the room decides when to go. */
function renderLobby() {
  lobbyBox.innerHTML = '';
  lobbyBox.classList.remove('hidden');
  room.seats.forEach((taken, i) => {
    const box = document.createElement('div');
    box.className = 'seat';
    box.textContent = taken ? `SHIP ${SHIP_NAMES[i]}` : '- - -';
    if (taken) {
      box.classList.add('taken');
      box.style.background = ['#58e6ff', '#ffca4d'][i];
    }
    if (i === room.seat) box.classList.add('you');
    lobbyBox.appendChild(box);
  });
  const here = room.seats.filter(Boolean).length;
  if (room.host) {
    goButton.classList.remove('hidden');
    goButton.disabled = here < 2;
    goButton.textContent = here < 2 ? 'WAITING FOR SOMEBODY' : 'START THE RUN';
  }
}

document.getElementById('host').addEventListener('click', () => {
  audio.wake();
  const signal = connect();
  signal.on('room', (m) => {
    room = { seat: m.seat, host: true, seats: m.seats };
    roomCode.textContent = m.code;
    roomCode.classList.remove('hidden');
    setOnlineStatus('Share this code. You can start as soon as the second seat fills.');
    renderLobby();
  });
  signal.on('peer', (m) => {
    if (game.state) return;
    room.seats = m.seats;
    renderLobby();
  });
  signal.on('peerleft', (m) => {
    if (game.state) return;
    room.seats = m.seats;
    renderLobby();
  });
  document.getElementById('host').disabled = true;
  signal.create();
});

goButton.addEventListener('click', () => {
  const signal = game.signal;
  if (!signal) return;
  const seed = (Date.now() & 0x7fffffff) || 1;
  const opts = { seed, skill };
  signal.send({ t: 'start', ...opts });
  startOnline({ ...opts, seat: room.seat, signal });
});

document.getElementById('join').addEventListener('click', () => {
  audio.wake();
  const code = document.getElementById('joinCode').value.toUpperCase().trim();
  if (code.length < 4) {
    setOnlineStatus('Enter the four-character code.');
    return;
  }
  const signal = connect();
  signal.on('room', (m) => {
    room = { seat: m.seat, host: false, seats: m.seats };
    setOnlineStatus(`You are ship ${SHIP_NAMES[m.seat]}. Waiting for the launch...`);
    renderLobby();
  });
  signal.on('peer', (m) => {
    if (game.state) return;
    room.seats = m.seats;
    renderLobby();
  });
  signal.on('peerleft', (m) => {
    if (game.state) return;
    room.seats = m.seats;
    renderLobby();
  });
  signal.on('start', (m) => {
    startOnline({
      seed: m.seed, skill: m.skill || 'normal', seat: room.seat, signal,
    });
  });
  setOnlineStatus('Connecting...');
  signal.join(code);
});

document.getElementById('joinCode').addEventListener('keydown', (e) => e.stopPropagation());

// --- Odds and ends -----------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game.state && !game.transport.online) {
    game.paused = !game.paused;
    pauseBox.classList.toggle('hidden', !game.paused);
    if (game.paused) charger.stop();
    else if (soundOn) charger.start();
  }
});

document.getElementById('quit').addEventListener('click', toMenu);
document.getElementById('overBack').addEventListener('click', toMenu);
document.getElementById('netendBack').addEventListener('click', toMenu);

const startMusicOnFirstGesture = () => {
  audio.wake();
  if (soundOn && !game.state) music.start();
  removeEventListener('pointerdown', startMusicOnFirstGesture);
  removeEventListener('keydown', startMusicOnFirstGesture);
};
addEventListener('pointerdown', startMusicOnFirstGesture);
addEventListener('keydown', startMusicOnFirstGesture);

setSkill(skill);
showLocalSeats();
renderScores(boardMode(), boardTier());
syncScores();
sizeCanvas();
requestAnimationFrame(frame);

// Handy from the console, and used by tools/screenshot.js, which has no other
// way to make the game do something particular on purpose.
window.__webtype = { game, highscores, renderer, startLocal };
