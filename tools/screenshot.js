// Screenshots for the README, taken by a browser rather than by hand.
//
//   node tools/screenshot.js
//
// Starts the relay, drives a headless Chrome over the DevTools protocol, plays a
// real run in it and photographs the interesting moments. No dependencies: the
// protocol is JSON over a WebSocket, and Node has had one of those for a while.
//
// It is a tool rather than a test, but it is worth keeping in the repository for
// the same reason the tests are - a screenshot taken by hand is out of date the
// day after somebody changes the colour of the rock, and one that can be retaken
// with a single command tends actually to be retaken.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
// Out of the way of the repository: a browser profile is a few thousand files
// and none of them belong next to the game.
const PROFILE = path.join(tmpdir(), `webtype-shots-${process.pid}`);
const PORT = 5177;
const CDP_PORT = 9333;
// A board of its own. Without this the tool posts its runs into whatever
// highscores.json is sitting next to a real server, and photographs them.
const SCORES = path.join(tmpdir(), `webtype-shots-scores-${process.pid}.json`);

const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The DevTools protocol, which is a WebSocket you send numbered messages down. */
class Devtools {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.waiting = new Map();
    socket.onmessage = (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
      const pending = this.waiting.get(msg.id);
      if (!pending) return;
      this.waiting.delete(msg.id);
      if (msg.error) pending.reject(new Error(msg.error.message));
      else pending.resolve(msg.result);
    };
  }

  static async open(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error('could not open the DevTools socket'));
    });
    return new Devtools(socket);
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Runs an expression in the page and hands back its value. */
  async run(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description
        || res.exceptionDetails.text || 'the page threw');
    }
    return res.result.value;
  }

  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
    console.log(`  docs/screenshots/${name}.png`);
  }

  async size(width, height, mobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 2, mobile,
    });
    // The game reads `(pointer: coarse)` to decide whether to put the on-screen
    // controls up. The device metrics override alone does not set that, and
    // neither does setEmitTouchEventsForMouse - it takes real touch emulation.
    await this.send('Emulation.setTouchEmulationEnabled', {
      enabled: mobile, maxTouchPoints: mobile ? 5 : 1,
    });
    await this.send('Emulation.setEmitTouchEventsForMouse', {
      enabled: mobile, configuration: mobile ? 'mobile' : 'desktop',
    });
  }
}

/**
 * Runs the game forward without waiting for it in real time.
 *
 * The page's own loop is driven by requestAnimationFrame, which in a headless
 * browser runs when it feels like it. Stepping the simulation by hand and
 * letting the loop draw whatever it finds is both quicker and repeatable - and
 * it is only possible because the simulation is a pure function of its state,
 * which is the same property the netcode is built on.
 *
 * The hand on the controls is the game's own attract-mode pilot, which is safe
 * here for the same reason it is safe in the network test: it reads the state
 * and never draws on its random numbers.
 */
function advance(ticks, override = null) {
  return `(async () => {
    const g = window.__game;
    const { step } = await import('/src/game/sim.js');
    const { demoMask } = await import('/src/demo.js');
    const { BTN } = await import('/src/constants.js');
    const forced = ${JSON.stringify(override)};
    for (let i = 0; i < ${ticks} && g.state && g.state.phase !== 'over'; i++) {
      const inputs = [0, 0];
      inputs[g.seat] = forced
        ? forced.reduce((m, b) => m | BTN[b], 0)
        : demoMask(g.state, g.seat);
      step(g.state, inputs);
      // The effects are advanced by hand too. Left to the drawing loop they
      // would all be created in the same frame and then aged together, and the
      // picture would be one enormous simultaneous explosion rather than a
      // stage being played.
      window.__webtype.renderer.feed(g.state.events, g.seat);
      window.__webtype.renderer.fx.step(1 / 60);
    }
    return g.state ? g.state.phase : 'menu';
  })()`;
}

/**
 * Stops the page's own loop from advancing the game, without stopping it
 * drawing.
 *
 * Everything here steps the simulation by hand, and the loop was quietly doing
 * it as well during the pauses between an instruction and the photograph - which
 * is why the first attempt at a picture of a beam kept coming out as an empty
 * corridor: the beam had been fired, and then twenty-four frames of somebody
 * else's clock had carried it off the right-hand edge before the shutter opened.
 */
const HOLD = 'window.__game.paused = true';

/** Runs until the run reaches a phase, or gives up. */
function until(phase, cap = 60 * 400) {
  return `(async () => {
    const g = window.__game;
    const { step } = await import('/src/game/sim.js');
    const { demoMask } = await import('/src/demo.js');
    let guard = 0;
    while (g.state && g.state.phase !== '${phase}' && guard++ < ${cap}) {
      const inputs = [0, 0];
      inputs[g.seat] = demoMask(g.state, g.seat);
      step(g.state, inputs);
      window.__webtype.renderer.feed(g.state.events, g.seat);
      window.__webtype.renderer.fx.step(1 / 60);
    }
    return g.state ? g.state.phase : 'menu';
  })()`;
}

/** Hands the player something, so a picture shows the game with its kit on. */
function equip(give) {
  return `(() => {
    const g = window.__game;
    const ship = g.state.ships[g.seat];
    for (const what of ${JSON.stringify(give)}) {
      g.state.drops.push({
        id: g.state.nextId++, x: ship.x, y: ship.y, give: what, vy: 0, life: 60,
      });
    }
    return true;
  })()`;
}

/** Types into the three-letter name entry the way a person would. */
function type(keys) {
  return `(() => {
    for (const key of ${JSON.stringify(keys)}) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    return true;
  })()`;
}

async function main() {
  if (!CHROME) throw new Error('no Chrome found; set CHROME=/path/to/chrome');
  mkdirSync(OUT, { recursive: true });
  rmSync(PROFILE, { recursive: true, force: true });

  const relay = spawn(process.execPath, ['server/relay.js'], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(PORT), QUIET: '1', SCORES_FILE: SCORES,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${PROFILE}`,
    // Without these two it starts and then quietly never opens the debugging
    // port, which looks exactly like it never started at all.
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let dev = null;
  try {
    let target = null;
    for (let i = 0; i < 120 && !target; i++) {
      await sleep(100);
      try {
        const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch { /* not up yet */ }
    }
    if (!target) throw new Error('headless Chrome never answered');
    await fetch(`http://localhost:${PORT}/index.html`);

    dev = await Devtools.open(target.webSocketDebuggerUrl);
    await dev.send('Page.enable');
    await dev.send('Runtime.enable');

    // --- The menu, in front of the attract mode -----------------------------
    console.log('menu');
    await dev.size(1280, 800);
    await dev.send('Page.navigate', { url: `http://localhost:${PORT}/` });
    await sleep(2400);
    await dev.shot('menu');

    // --- A stage, at three moments ------------------------------------------
    console.log('a stage');
    await dev.run("document.getElementById('start').click()");
    await sleep(400);
    await dev.run(HOLD);
    await dev.run(advance(240));
    await dev.run(equip(['blue', 'blue', 'speed', 'missile']));
    await dev.run(advance(300));
    await sleep(500);
    await dev.shot('gameplay');

    // A charge, held to the top and then let go: the two frames the whole game
    // is about. Held with the nose pointed up the corridor rather than parked
    // against the left-hand wall, which is where the autopilot leaves it and is
    // no place to photograph a ship from.
    await dev.run(advance(40, ['RIGHT', 'FIRE']));
    await dev.run(advance(80, ['FIRE']));
    await sleep(400);
    await dev.shot('charge');
    // Released, and then just far enough for the beam to have left the nose and
    // still be on the screen.
    await dev.run(advance(14, []));
    await sleep(400);
    await dev.shot('beam');

    // --- The boss -----------------------------------------------------------
    console.log('the boss');
    await dev.run(until('boss'));
    await dev.run(advance(220));
    await sleep(500);
    await dev.shot('boss');

    // --- And on into the next stage -----------------------------------------
    //
    // Not a separate run: this is the same ship, still carrying what it picked
    // up in the first stage, which is the point being photographed.
    console.log('the second stage');
    await dev.run(until('play', 60 * 60));
    await dev.run(advance(420));
    await sleep(500);
    await dev.shot('spine');

    // --- Scores, and the board they land on ---------------------------------
    //
    // Three runs rather than one, so the board in the picture is a board rather
    // than a single row. They are runs this tool actually played: nothing is
    // written onto the board that was not earned.
    console.log('setting scores');
    for (const [i, name] of [['M', 'J', 'C'], ['A', 'C', 'E'], ['B', 'O', 'T']].entries()) {
      if (i > 0) {
        await dev.run("document.getElementById('start').click()");
        await sleep(400);
        await dev.run(HOLD);
      }
      await dev.run(until('over'));
      await sleep(900); // the page's own loop notices and puts the picker up
      const picking = await dev.run(
        "!document.getElementById('hiscore').classList.contains('hidden')",
      );
      if (!picking) {
        console.log(`  (no score offered on run ${i + 1})`);
        await dev.run("document.getElementById('overBack').click()");
        await sleep(300);
        continue;
      }
      await dev.run(type(name));
      await sleep(250);
      await dev.run(type(['Enter']));
      await sleep(1100);
    }
    await dev.run("document.getElementById('scoresBox').open = true;"
      + "document.getElementById('controlsBox').open = false;"
      + "document.getElementById('scoresBox').scrollIntoView();");
    await sleep(700);
    await dev.shot('scores');

    // --- A phone ------------------------------------------------------------
    console.log('a phone');
    await dev.size(844, 390, true);
    await dev.send('Page.navigate', { url: `http://localhost:${PORT}/` });
    await sleep(2000);
    await dev.run("document.getElementById('start').click()");
    await sleep(400);
    await dev.run(HOLD);
    await dev.run(advance(320));
    await dev.run(equip(['red', 'red', 'speed']));
    await dev.run(advance(260));
    await sleep(500);
    await dev.shot('mobile');

    console.log('done');
  } finally {
    dev?.socket.close();
    chrome.kill();
    relay.kill();
    rmSync(PROFILE, { recursive: true, force: true });
    rmSync(SCORES, { force: true });
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
