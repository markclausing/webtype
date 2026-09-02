// End-to-end network test without a browser.
//
//   node tools/netcheck.js
//
// Starts the real relay, connects two real clients, has them play a real run
// against the same corridor with scripted input, and then checks that both
// machines simulated the exact same run. That is what lockstep stands or falls
// on.
//
// The two things it is really looking for are the ones a single-process test can
// never see: that a message is delivered to the other person at all, and that
// the seat a message came from is the seat the relay says it came from rather
// than the seat the sender claims.

import http from 'node:http';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRun, hashState } from '../src/game/state.js';
import { step } from '../src/game/sim.js';
import { Signal } from '../src/net/signal.js';
import { OnlineTransport } from '../src/net/transport.js';
import { demoMask } from '../src/demo.js';
import { MAX_SHIPS } from '../src/constants.js';

const PORT = 5199;
const HOOK_PORT = 5198;
const TICKS = 60 * 90; // a minute and a half, which is most of a stage
const SCORES_FILE = join(tmpdir(), `webtype-scores-${process.pid}.json`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = false;
function check(ok, message) {
  if (ok) {
    console.log(`OK: ${message}`);
  } else {
    console.error(`FAIL: ${message}`);
    failed = true;
  }
}

/**
 * The device the transport reads, wired to the game's own attract-mode pilot.
 *
 * It is safe to use the real one here, and that is worth saying: demo.js reads
 * the state and never draws on `state.rng`, which is precisely the property this
 * test would otherwise be destroyed by. A pilot that consumed a random number
 * for its own seat alone would pull the two machines apart, and the test would
 * blame the network for it.
 */
function scriptedDevice(peer) {
  return {
    mask() {
      return demoMask(peer.state, peer.seat, peer.seat);
    },
  };
}

async function waitFor(condition, what, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await condition()) return; // await: an async check returns a Promise, always truthy
    await sleep(10);
  }
  throw new Error(`Timed out: ${what}`);
}

function makePeer(signal, seat, opts) {
  const peer = {
    seat,
    state: createRun({ ...opts, players: 2, humans: [true, true] }),
  };
  peer.devices = scriptedDevice(peer);
  peer.transport = new OnlineTransport({
    signal, devices: peer.devices, seats: MAX_SHIPS, localSeat: seat,
  });
  return peer;
}

async function runPeer(peer) {
  let spins = 0;
  while (peer.state.tick < TICKS && peer.state.phase !== 'over') {
    const tick = peer.state.tick;
    peer.transport.sample(tick);

    if (!peer.transport.ready(tick)) {
      if (++spins > 6000) throw new Error(`Seat ${peer.seat} stuck on tick ${tick}`);
      await sleep(1); // wait for whoever has not sent yet
      continue;
    }
    spins = 0;
    step(peer.state, peer.transport.poll(tick));
    peer.transport.afterStep(peer.state);

    // The real loop waits on the display; here we just give the network some air.
    if (tick % 16 === 0) await sleep(0);
  }
}

async function main() {
  // Discord, for the length of this test: a server that writes down what it was
  // told. The relay should post here the moment a score lands.
  const announced = [];
  const hook = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        announced.push(JSON.parse(body));
      } catch { /* not our message */ }
      res.writeHead(204).end();
    });
  });
  await new Promise((r) => hook.listen(HOOK_PORT, r));

  const server = spawn(process.execPath, ['server/relay.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      QUIET: '1',
      SCORES_FILE,
      DISCORD_WEBHOOK: `http://localhost:${HOOK_PORT}/hook`,
      GAME_URL: 'http://example.invalid/webtype',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  server.stdout.resume();

  try {
    await waitFor(async () => {
      try {
        const res = await fetch(`http://localhost:${PORT}/index.html`);
        return res.ok;
      } catch {
        return false;
      }
    }, 'server did not start');
    console.log(`OK: relay is up on port ${PORT} and serving the page`);

    const url = `ws://localhost:${PORT}`;
    const opts = { seed: 4242, skill: 'easy' };

    // --- The room fills up --------------------------------------------------

    const hostSignal = new Signal(url);
    let code = null;
    let hostSeat = -1;
    let roster = [];
    hostSignal.on('room', (m) => {
      code = m.code;
      hostSeat = m.seat;
      roster = m.seats;
    });
    hostSignal.on('peer', (m) => { roster = m.seats; });
    hostSignal.create();

    await waitFor(() => code !== null, 'the host never received a room code');
    check(hostSeat === 0, `whoever opens the room takes the first seat (code ${code})`);

    const guestSignal = new Signal(url);
    const guest = { seat: -1, started: null };
    guestSignal.on('room', (m) => { guest.seat = m.seat; });
    guestSignal.on('start', (m) => { guest.started = m; });
    guestSignal.join(code);
    await waitFor(() => guest.seat >= 0, 'the guest never got a seat');
    check(guest.seat === 1, 'and whoever joins takes the second');
    await waitFor(() => roster.filter(Boolean).length === 2,
      'the host was never told the room was full');
    check(roster.every(Boolean), 'both people in the room are told who else is in it');

    // A third is turned away rather than quietly given somebody else's ship.
    const spare = new Signal(url);
    let refused = null;
    spare.on('error', (m) => { refused = m.msg; });
    spare.join(code);
    await waitFor(() => refused !== null, 'a third player was not turned away');
    check(/full/i.test(refused), `a third player is refused ("${refused}")`);
    spare.close();

    // --- Launch -------------------------------------------------------------

    hostSignal.send({ t: 'start', ...opts });
    const peers = [];
    peers[hostSeat] = makePeer(hostSignal, hostSeat, opts);
    await waitFor(() => guest.started, 'the guest was never told to start');
    check(guest.started.seed === opts.seed && guest.started.skill === opts.skill,
      'the start carries the seed and the setting, so both build the same run');
    check(guest.started.seat === 0,
      'and it is stamped with the seat it came from, not one the sender chose');
    peers[guest.seat] = makePeer(guestSignal, guest.seat, opts);

    // --- The run ------------------------------------------------------------

    const t0 = Date.now();
    await Promise.all(peers.map(runPeer));
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    const ticks = peers.map((p) => p.state.tick);
    const hashes = peers.map((p) => hashState(p.state));
    console.log(`     ${Math.min(...ticks)} ticks played by two people in ${secs}s of real time`);
    console.log(`     score      : ${peers.map((p) => p.state.score).join(', ')}`);
    console.log(`     hull       : ${peers.map((p) => p.state.ships.map((s) => s.hull).join('/')).join('  ')}`);
    console.log(`     stalls     : ${peers.map((p) => p.transport.stalls).join(', ')} `
      + '(high is expected: this test runs flat out, a browser runs at 60 fps)');
    console.log(`     input delay: ${peers.map((p) => p.transport.delay).join(', ')} ticks`);
    console.log(`     pongs      : ${peers.map((p) => p.transport.pongs).join(', ')}`);

    check(new Set(hashes).size === 1,
      `both players computed the same run (hash ${hashes[0]})`);
    check(peers.every((p) => !p.transport.desync),
      'and the built-in desync check never fired');
    check(peers.every((p) => p.transport.pongs > 0),
      'ping and pong get through in both directions');
    check(new Set(peers.map((p) => p.state.score)).size === 1,
      `both agree on the score (${peers[0].state.score})`);
    check(new Set(peers.map((p) => p.state.scroll.toFixed(3))).size === 1,
      'and on exactly how far down the corridor they have got');
    check(peers.every((p) => p.state.tick > 60), 'the run actually got going');

    // --- Somebody closes their tab ------------------------------------------
    //
    // One person must not lose a good run because the other had to answer the
    // door. Their ship carries on with nothing pressed, which both machines do
    // identically, so the run stays in step.
    guestSignal.close();
    await waitFor(() => peers[0].transport.gone.includes(1),
      'the host was never told seat 1 had gone');
    check(peers[0].transport.gone.includes(1), 'a player leaving is reported by seat');
    const before = peers[0].state.tick;
    for (let i = 0; i < 120; i++) {
      const tick = peers[0].state.tick;
      peers[0].transport.sample(tick);
      if (!peers[0].transport.ready(tick)) break;
      step(peers[0].state, peers[0].transport.poll(tick));
      peers[0].transport.afterStep(peers[0].state);
    }
    check(peers[0].state.tick > before,
      'and the run carries on without waiting for them');

    for (const peer of peers) peer.transport.dispose();

    // --- The shared board ---------------------------------------------------
    //
    // Two devices, neither of which has seen the other's runs. Both post their
    // own board; both must come away with the same one.
    const boardUrl = `http://localhost:${PORT}/highscores`;
    const post = async (board) => {
      const res = await fetch(boardUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ board }),
      });
      return (await res.json()).board;
    };
    const row = (id, name, score, stage, at) => ({
      id, name, score, stage, at,
    });

    const LIST = 'solo:hard';
    const afterPhone = await post({ [LIST]: [row('p1', 'AAA', 42000, 2, 1000)] });
    const afterLaptop = await post({ [LIST]: [row('l1', 'BBB', 91500, 6, 2000)] });

    check(afterPhone[LIST].length === 1,
      'the first device is not sent runs it should not have seen yet');
    check(afterLaptop[LIST].length === 2,
      'two devices post their own boards and end up with one');
    check(afterLaptop[LIST][0].name === 'BBB',
      'and the bigger score is at the top of it');

    const junk = await post({
      [LIST]: [row('bad1', 'ZZZ', 0, 1, 3000), { id: 'bad2', name: 'X' }, 'nonsense'],
      'made:up': [row('bad3', 'QQQ', 5000, 1, 3000)],
    });
    check(junk[LIST].length === 2,
      'the server refuses impossible scores and nonsense rows');
    check(junk['made:up'] === undefined, 'and a list it has never heard of');

    // Two scores landed. Waiting for one and then asserting two is a race the
    // test loses about half the time.
    await waitFor(() => announced.length >= 2, 'the relay never posted to the webhook', 4000);
    const said = announced.map((a) => a.embeds?.[0]?.description || '').join(' ');
    check(/AAA/.test(said) && /BBB/.test(said), 'both new scores are announced, by name');
    check(/91 500/.test(said), 'with the score written the way the game writes it');
    check(/stage 2-2/.test(said), 'and how far it got, in the arcade\'s own numbering');
    check(announced.every((a) => a.username === 'WebType' && a.embeds?.[0]?.url),
      'each post names the game and links to it, because four games share a channel');
    check(announced.length === 2, `once each, not more (${announced.length} posts)`);

    const stored = await (await fetch(boardUrl)).json();
    check(stored.board[LIST].length === 2,
      'and the board is kept on disk and readable');

    process.exitCode = failed ? 1 : 0;
    console.log('');
    console.log(failed ? 'NETCHECK FAILED' : 'NETCHECK PASSED');
  } finally {
    server.kill();
    hook.close();
    try {
      rmSync(SCORES_FILE, { force: true });
    } catch { /* nothing to clean up */ }
  }
}

main().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
