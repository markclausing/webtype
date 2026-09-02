/**
 * Drawing. Reads the state, never writes to it.
 *
 * The view is a fixed VIEW_W by VIEW_H of world, on every machine - see the note
 * at the top of constants.js for why a shooter cannot do what the racing game
 * does and fit its camera to the window. So the only thing decided here is how
 * large to draw a world unit, and everything else is laid out in world
 * coordinates as though the screen were always the same size, because as far as
 * the game is concerned it is.
 *
 * Almost everything bright is drawn twice: once wide and dim with `lighter`
 * blending, once narrow and pale on top. That is the whole trick behind the
 * look. A glow is not a filter here, it is a second, fatter copy of the same
 * shape, and it costs nothing.
 */

import {
  CHARGE_FULL, CHARGE_MIN, HULL_MAX, MAX_MISSILES, MAX_SPEEDUPS, MINE_TRIGGER,
  POD_KINDS, POD_R, SHIP_H, SHIP_PRESETS, SHIP_W, VIEW_H, VIEW_W,
} from '../constants.js';
import { STEP } from '../game/terrain.js';
import { chargeLevel } from '../game/weapons.js';
import { coreOpen, formatScore, stageLabel } from '../game/state.js';
import { Fx } from './fx.js';

/** How many stars in each of the three parallax layers. */
const STARS = [90, 60, 34];
/** And how much of the scroll each layer takes. Nearest last. */
const DEPTH = [0.12, 0.3, 0.62];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = new Fx();
    this.bottomInset = 0;
    this.stars = STARS.map((n, layer) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push({
          x: Math.random() * VIEW_W * 2,
          y: Math.random() * VIEW_H,
          r: 0.4 + layer * 0.5 + Math.random() * 0.6,
          t: Math.random(),
        });
      }
      return out;
    });
    this.frame = 0;
    this.message = '';
    this.messageFor = 0;
    this.messageSub = '';
  }

  reset() {
    this.fx.clear();
    this.message = '';
    this.messageFor = 0;
  }

  knock(amount) {
    this.fx.knock(amount);
  }

  say(text, sub = '', ticks = 150) {
    this.message = text;
    this.messageSub = sub;
    this.messageFor = ticks;
  }

  /** Where the fixed playfield sits inside whatever window it has been given. */
  fit() {
    const { width, height } = this.canvas;
    const usable = Math.max(60, height - this.bottomInset);
    const scale = Math.min(width / VIEW_W, usable / VIEW_H);
    return {
      scale,
      ox: (width - VIEW_W * scale) / 2,
      oy: (usable - VIEW_H * scale) / 2,
    };
  }

  // --- Events into pictures ---------------------------------------------------

  /**
   * The one place the simulation's report is turned into things to look at.
   *
   * Called once per simulated tick rather than once per drawn frame, so a
   * machine drawing at 30fps and one drawing at 120 still throw the same number
   * of sparks.
   */
  feed(events, seat = 0) {
    const fx = this.fx;
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          fx.glow(e.x, e.y, 7, SHIP_PRESETS[e.seat]?.shot || '#9ef0ff', 6);
          break;
        case 'beam': {
          const colour = SHIP_PRESETS[e.seat]?.glow || '#7fe6ff';
          fx.glow(e.x, e.y, 16 + e.power * 26, colour, 14);
          fx.ring(e.x, e.y, 22 + e.power * 40, '#ffffff', 16, 2);
          fx.spark(e.x, e.y, colour, 8 + Math.round(e.power * 14), 150, 18);
          fx.knock(1.4 + e.power * 4);
          if (e.pierce) fx.blink(0.16 + e.power * 0.2, colour);
          break;
        }
        case 'podshot':
          fx.glow(e.x, e.y, 7, POD_KINDS[e.kind]?.colour || '#ffffff', 5);
          break;
        case 'spark':
          fx.spark(e.x, e.y, e.colour || '#ffc48a', 4, 70, 14);
          break;
        case 'bounce':
          fx.spark(e.x, e.y, e.colour || '#49b8ff', 6, 110, 16);
          fx.ring(e.x, e.y, 10, e.colour || '#49b8ff', 12, 1.4);
          break;
        case 'hit':
          fx.spark(e.x, e.y, '#ffffff', 3, 80, 10);
          fx.glow(e.x, e.y, 6, e.colour || '#ffffff', 6);
          break;
        case 'kill':
          fx.boom(e.x, e.y, e.r || 8, e.colour || '#ffb469');
          fx.score(e.x, e.y - 8, `${e.points}`);
          break;
        case 'chain':
          fx.boom(e.x, e.y, 6, e.colour || '#4fd898');
          break;
        case 'seeker':
          fx.ring(e.x, e.y, 16, '#ff5ea8', 14, 1.6);
          fx.glow(e.x, e.y, 10, '#ff2f86', 8);
          break;
        case 'seekturn':
          // A puff at the kink, so a correction is something you saw happen
          // rather than something you infer from the new heading.
          fx.spark(e.x, e.y, '#ff9ecb', 4, 70, 14);
          break;
        case 'minelaid':
          fx.ring(e.x, e.y, 12, '#8f7f6a', 14, 1.2);
          break;
        case 'minepop':
          fx.boom(e.x, e.y, 11, '#ff7a3a');
          fx.ring(e.x, e.y, 34, '#ffca4d', 20, 2);
          break;
        case 'minekill':
          fx.boom(e.x, e.y, 8, '#ffb46a');
          fx.score(e.x, e.y - 8, '40');
          break;
        case 'absorb':
          fx.ring(e.x, e.y, 12, '#ffffff', 12, 1.6);
          fx.spark(e.x, e.y, '#cfe6ff', 4, 60, 10);
          break;
        case 'hurt':
          fx.boom(e.x, e.y, 7, '#ff6a6a');
          fx.blink(e.seat === seat ? 0.4 : 0.12, '#ff4d4d');
          fx.knock(e.seat === seat ? 6 : 2);
          break;
        case 'die':
          fx.boom(e.x, e.y, 14, '#ff8a5c', true);
          fx.blink(0.6, '#ffb27a');
          break;
        case 'pickup':
          fx.ring(e.x, e.y, 26, '#ffffff', 22, 2);
          fx.spark(e.x, e.y, e.spare ? '#ffe98a' : '#ffffff', 14, 130, 24);
          break;
        case 'revive':
          fx.blink(0.5, '#9effc4');
          break;
        case 'podlaunch':
          fx.ring(e.x, e.y, 22, '#ffffff', 16, 2);
          break;
        case 'bosshurt':
          fx.spark(e.x, e.y, e.core ? '#ffffff' : (e.colour || '#ffd0a0'),
            e.core ? 5 : 2, e.core ? 120 : 60, 12);
          break;
        case 'bossdie':
          fx.boom(e.x, e.y, 40, '#ffd08a', true);
          fx.blink(0.85, '#ffffff');
          break;
        case 'clear':
          this.say('STAGE CLEAR', `BONUS ${formatScore(e.bonus)}`, 190);
          break;
        case 'bossin':
          this.say('WARNING', e.name, 130);
          fx.blink(0.3, '#ff5a5a');
          break;
        case 'begin':
          this.message = '';
          this.messageFor = 0;
          break;
        case 'over':
          this.say('GAME OVER', '', 600);
          break;
        default:
          break;
      }
    }
  }

  // --- The frame --------------------------------------------------------------

  draw(state, {
    seat = 0, net = null, quiet = false, chrome = true,
  } = {}) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    this.frame++;
    if (this.messageFor > 0) this.messageFor--;

    const theme = state.stage.theme;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#04060c';
    ctx.fillRect(0, 0, width, height);

    const { scale, ox, oy } = this.fit();
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.clip();

    // The whole picture is shaken, the HUD is not: a score that jumps about
    // every time something explodes is a score nobody can read.
    ctx.save();
    if (this.fx.shake > 0.05) {
      ctx.translate(
        (Math.random() - 0.5) * this.fx.shake,
        (Math.random() - 0.5) * this.fx.shake,
      );
    }
    ctx.translate(-state.scroll, 0);

    this.sky(state, theme);
    this.starfield(state, theme);
    this.terrain(state, theme);
    this.drops(state);
    this.foes(state);
    this.boss(state);
    this.flak(state);
    this.shots(state);
    this.ships(state);
    this.fx.draw(ctx);
    ctx.restore();

    this.vignette();
    if (chrome) this.hud(state, seat, net);
    if (!quiet) this.banner(state);
    ctx.restore();

    if (this.fx.flash > 0.01) {
      ctx.globalAlpha = Math.min(0.8, this.fx.flash);
      ctx.fillStyle = this.fx.flashColour;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    this.fx.step(1 / 60);
  }

  // --- Background -------------------------------------------------------------

  sky(state, theme) {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, theme.sky);
    g.addColorStop(0.55, theme.far);
    g.addColorStop(1, theme.sky);
    ctx.fillStyle = g;
    ctx.fillRect(state.scroll, 0, VIEW_W, VIEW_H);
  }

  starfield(state, theme) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let layer = 0; layer < this.stars.length; layer++) {
      const depth = DEPTH[layer];
      const span = VIEW_W * 2;
      // The band repeats, so the whole field is a modulo rather than a list that
      // has to be topped up.
      const shift = (state.scroll * depth) % span;
      ctx.fillStyle = theme.star;
      for (const s of this.stars[layer]) {
        let x = s.x - shift;
        if (x < 0) x += span;
        if (x > VIEW_W) continue;
        // A slow twinkle, out of phase per star, so the sky is not a grid of
        // identical dots.
        const twinkle = 0.5 + 0.5 * Math.sin(this.frame * 0.03 + s.t * 9);
        ctx.globalAlpha = (0.2 + depth) * (0.55 + twinkle * 0.45);
        ctx.fillRect(state.scroll + x, s.y, s.r, s.r);
      }
    }
    ctx.restore();
  }

  /**
   * The corridor, drawn twice: a dim squashed copy at half the scroll speed for
   * depth, then the real thing that everything actually collides with.
   */
  terrain(state, theme) {
    const ctx = this.ctx;
    const t = state.stage.terrain;
    const from = Math.max(0, Math.floor(state.scroll / STEP) - 2);
    const to = Math.min(t.count - 1, Math.ceil((state.scroll + VIEW_W) / STEP) + 2);

    // The far wall. Sampled from further along the same corridor and pulled
    // towards the middle, which is a cheap and surprisingly convincing way to
    // suggest there is more rock behind the rock.
    ctx.fillStyle = theme.near;
    ctx.globalAlpha = 0.5;
    const lag = state.scroll * 0.45;
    ctx.beginPath();
    ctx.moveTo(state.scroll, 0);
    for (let i = from; i <= to; i++) {
      const src = Math.min(t.count - 1, Math.max(0, i - Math.round(lag / STEP)));
      ctx.lineTo(i * STEP, t.ceil[src] * 0.72 + 6);
    }
    ctx.lineTo(state.scroll + VIEW_W, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(state.scroll, VIEW_H);
    for (let i = from; i <= to; i++) {
      const src = Math.min(t.count - 1, Math.max(0, i - Math.round(lag / STEP)));
      ctx.lineTo(i * STEP, VIEW_H - (VIEW_H - t.floor[src]) * 0.72 - 6);
    }
    ctx.lineTo(state.scroll + VIEW_W, VIEW_H);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    for (const side of ['ceil', 'floor']) {
      const surface = t[side];
      ctx.beginPath();
      ctx.moveTo(state.scroll - 8, side === 'ceil' ? -20 : VIEW_H + 20);
      for (let i = from; i <= to; i++) ctx.lineTo(i * STEP, surface[i]);
      ctx.lineTo(state.scroll + VIEW_W + 8, side === 'ceil' ? -20 : VIEW_H + 20);
      ctx.closePath();
      ctx.fillStyle = theme.rock;
      ctx.fill();

      // The lit lip of the rock, which is what actually reads as an edge.
      ctx.beginPath();
      for (let i = from; i <= to; i++) {
        if (i === from) ctx.moveTo(i * STEP, surface[i]);
        else ctx.lineTo(i * STEP, surface[i]);
      }
      ctx.strokeStyle = theme.edge;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      // Ribs down the face of it, so a long stretch of rock is not a flat block.
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = theme.edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = from; i <= to; i += 3) {
        const x = i * STEP;
        const y = surface[i];
        const depth = side === 'ceil' ? 9 + (i % 5) * 3 : -(9 + (i % 5) * 3);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3, y + depth);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- Things -----------------------------------------------------------------

  drops(state) {
    const ctx = this.ctx;
    for (const d of state.drops) {
      const pulse = 0.7 + 0.3 * Math.sin(this.frame * 0.16 + d.id);
      const info = dropLook(d.give);
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(Math.sin(this.frame * 0.03 + d.id) * 0.25);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * pulse;
      ctx.fillStyle = info.colour;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // Crystals are a lozenge and everything else is a box, so which sort of
      // thing is in front of you reads before the letter on it does.
      ctx.beginPath();
      if (info.crystal) {
        ctx.moveTo(0, -8);
        ctx.lineTo(7, 0);
        ctx.lineTo(0, 8);
        ctx.lineTo(-7, 0);
        ctx.closePath();
      } else {
        ctx.rect(-7, -7, 14, 14);
      }
      ctx.fillStyle = info.colour;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#1a1020';
      ctx.font = 'bold 9px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.letter, 0, 0.5);
      ctx.restore();
    }
  }

  foes(state) {
    const ctx = this.ctx;
    for (const foe of state.foes) {
      // A link of a snake waiting its turn in the chain is still there and
      // still worth drawing; anything else that is dying has already gone off.
      if (foe.dying && !foe.dieIn) continue;
      ctx.save();
      ctx.translate(foe.x, foe.y);
      const hurt = foe.flash > 0;
      const colour = hurt ? '#ffffff' : foe.def.colour;

      // Depth, drawn as the two things that actually read as distance: smaller,
      // and fainter. A ring closes in on it while it rises, which is the honest
      // warning - it says both where it is going to arrive and roughly when.
      if (foe.z > 0) {
        ctx.globalAlpha = 1 - foe.z * 0.72;
        ctx.scale(1 - foe.z * 0.55, 1 - foe.z * 0.55);
        ctx.save();
        ctx.globalAlpha = (1 - foe.z) * 0.5 + 0.25;
        ctx.strokeStyle = foe.def.colour;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, foe.r + 6 + foe.z * 34, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // A gradient rather than a flat disc. At a fifth opacity a plain circle
      // is a visible bubble with the enemy sitting inside it, and on something
      // the size of a carrier the bubble is the biggest thing on the screen.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, foe.r * 2.1);
      halo.addColorStop(0, colour);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = (hurt ? 0.6 : 0.3) * (1 - (foe.z || 0) * 0.8);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, foe.r * 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawFoe(ctx, foe, colour, this.frame, state);
      ctx.restore();
    }
  }

  boss(state) {
    const boss = state.boss;
    if (!boss) return;
    const ctx = this.ctx;
    const def = boss.def;

    // The tail, where there is one, is simply where the thing has been.
    if (def.tail && boss.trail.length > 4) {
      ctx.save();
      for (let i = boss.trail.length - 2; i >= 0; i -= 12) {
        const t = i / boss.trail.length;
        ctx.globalAlpha = 0.25 + t * 0.5;
        ctx.fillStyle = def.colour;
        ctx.beginPath();
        ctx.arc(boss.trail[i], boss.trail[i + 1], 8 + t * 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(boss.x, boss.y);
    const flash = boss.flash > 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = def.glow;
    ctx.beginPath();
    ctx.arc(0, 0, def.w, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Plating: a stack of bars down the body, which is enough to say "machine"
    // without drawing a machine. Lit from the top, so the thing has a shape
    // rather than being a flat slab of one colour.
    if (flash) {
      ctx.fillStyle = '#ffffff';
    } else {
      const body = ctx.createLinearGradient(0, -def.h / 2, 0, def.h / 2);
      body.addColorStop(0, def.colour);
      body.addColorStop(0.45, shade(def.colour, 0.62));
      body.addColorStop(1, shade(def.colour, 0.34));
      ctx.fillStyle = body;
    }
    roundRect(ctx, -def.w / 2, -def.h / 2, def.w, def.h, 10);
    ctx.fill();
    ctx.strokeStyle = def.glow;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#000000';
    // Vertical plates with a rivet at each end. Ruled horizontal lines were
    // tried first and made the thing look like a notepad; standing them up and
    // putting a bolt through them is the whole difference.
    for (let x = -def.w / 2 + 9; x < def.w / 2 - 4; x += 13) {
      ctx.fillRect(x, -def.h / 2 + 7, 2, def.h - 14);
      ctx.beginPath();
      ctx.arc(x + 1, -def.h / 2 + 5, 1.6, 0, Math.PI * 2);
      ctx.arc(x + 1, def.h / 2 - 5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // The guns, so it is obvious where the next thing is coming from.
    ctx.fillStyle = '#0d0d16';
    for (const gun of def.guns) {
      roundRect(ctx, gun.dx - 8, gun.dy - 5, 14, 10, 3);
      ctx.fill();
    }

    // And the core, which is the only part that really matters - behind a
    // shutter, on the two bosses that have one. How far open it is has to be
    // legible from across the screen, because it is the whole fight: the plates
    // slide, the glow comes up with them, and a shut core is visibly a lid.
    const c = def.core;
    let slide = 1;
    if (def.shutter) {
      const phase = boss.age % def.shutter.every;
      slide = coreOpen(boss)
        ? Math.min(1, phase / 12, Math.max(0, (def.shutter.open - phase) / 12))
        : 0;
    }
    const pulse = (0.75 + 0.25 * Math.sin(this.frame * 0.14)) * (0.35 + slide * 0.65);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(c.dx, c.dy, 0, c.dx, c.dy, c.r * 3 * pulse);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, def.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.dx, c.dy, c.r * 3 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // An iris rather than a disc. The core is the only part of a boss worth
    // shooting, and it has to look like a place rather than like a highlight.
    ctx.fillStyle = flash ? '#ffffff' : def.glow;
    ctx.beginPath();
    ctx.arc(c.dx, c.dy, c.r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0f1c';
    ctx.beginPath();
    ctx.arc(c.dx, c.dy, c.r * pulse * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c.dx, c.dy, c.r * pulse * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = def.glow;
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(c.dx, c.dy, c.r * 1.5, this.frame * 0.05, this.frame * 0.05 + Math.PI * 1.2);
    ctx.stroke();

    if (def.shutter) {
      ctx.globalAlpha = 1;
      const gap = c.r * 1.9 * slide;
      for (const up of [-1, 1]) {
        ctx.fillStyle = shade(def.colour, 0.72);
        // Kept inside the body: at full width the plates hung off the front of
        // the thing and looked like something that had fallen off it.
        const wide = Math.min(c.r * 2.6, def.w - 12);
        roundRect(ctx, c.dx - wide / 2, c.dy + up * gap - (up > 0 ? 0 : c.r * 1.5),
          wide, c.r * 1.5, 3);
        ctx.fill();
        ctx.strokeStyle = def.glow;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /**
   * Everything coming the other way.
   *
   * Three kinds, and they have to be told apart at a glance in a corridor that
   * is already full of light. A shot is a hot orange bead. A seeker is a dart
   * with a tail, in a colour nothing else uses, carrying one pip for each
   * correction it has left - which is the information the weapon is about. A
   * mine blinks while it is arming and stops blinking when it is not.
   */
  flak(state) {
    const ctx = this.ctx;
    for (const f of state.flak) {
      if (f.kind === 'mine') this.mine(f);
      else if (f.kind === 'seeker') this.seeker(f);
      else this.bead(f);
    }
  }

  bead(f) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff3b1e';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffa83c';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff4e0';
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  seeker(f) {
    const ctx = this.ctx;
    const a = Math.atan2(f.vy, f.vx);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(a);
    ctx.globalCompositeOperation = 'lighter';

    // A tail, so which way it is committed is readable from across the screen.
    const g = ctx.createLinearGradient(-4, 0, -22, 0);
    g.addColorStop(0, '#ff5ea8');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-3, -2.6);
    ctx.lineTo(-20 - Math.random() * 6, 0);
    ctx.lineTo(-3, 2.6);
    ctx.closePath();
    ctx.fill();

    // A soft halo rather than a flat disc: at 45% opacity a plain circle came
    // out as a purple bubble with the missile parked inside it.
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 9);
    halo.addColorStop(0, '#ff2f86');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffd9ec';
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(-3, -3);
    ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fill();

    // One pip per correction it still has. When they are gone it is committed,
    // and stepping aside is free - which is the whole thing you are being asked
    // to learn, so it is drawn rather than left to be guessed at.
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < f.turns; i++) {
      ctx.beginPath();
      ctx.arc(-6 - i * 3, 0, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  mine(f) {
    const ctx = this.ctx;
    const arming = f.arm > 0;
    // While it arms it blinks and is harmless; once armed it holds a steady
    // glow and a ring showing exactly how near is too near.
    const on = !arming || Math.floor(this.frame / 4) % 2 === 0;
    ctx.save();
    ctx.translate(f.x, f.y);
    if (!arming) {
      // An outline rather than a filled disc: it says exactly how near is too
      // near, and eight of them in a row do not add up into one bright smear
      // the way eight filled ones did.
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.2 * Math.sin(this.frame * 0.12 + f.id);
      ctx.strokeStyle = '#ff4d3a';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, MINE_TRIGGER, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = arming ? '#8f7f6a' : '#ff8a4a';
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = on ? 1 : 0.35;
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2 + this.frame * 0.012;
      ctx.beginPath();
      ctx.moveTo(Math.cos(t) * f.r * 0.6, Math.sin(t) * f.r * 0.6);
      ctx.lineTo(Math.cos(t) * f.r * 1.35, Math.sin(t) * f.r * 1.35);
      ctx.stroke();
    }
    ctx.fillStyle = arming ? '#5a4f45' : '#c8542f';
    ctx.beginPath();
    ctx.arc(0, 0, f.r * 0.66, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = arming ? '#a89880' : '#ffe9c0';
    ctx.beginPath();
    ctx.arc(0, 0, f.r * (arming ? 0.2 : 0.3), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Everything the players have fired.
   *
   * Each kind gets its own shape on purpose. Five weapons that were all a dot of
   * a different colour would be five weapons nobody could tell apart in the
   * middle of a wave, and half the pleasure of collecting one is watching it
   * work.
   */
  shots(state) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of state.shots) {
      const preset = SHIP_PRESETS[s.seat] || SHIP_PRESETS[0];
      const colour = s.colour || preset.shot;
      const a = Math.atan2(s.vy, s.vx);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(a);

      if (s.kind === 'beam') {
        const len = 26 + s.power * 74;
        const h = 3 + s.power * 12;
        // Three passes rather than one: a wide dim halo, the beam itself, and a
        // thin white filament down the middle of it. Additive blending does the
        // rest, and it is the difference between a beam and a white pill.
        //
        // The shape tapers to a point at both ends and the fill fades along its
        // length, so the thing has a front and a back. A rounded rectangle was
        // tried and read as a lozenge lying in the corridor rather than as
        // something travelling down it at speed.
        // Five passes rather than three, and the two extra ones are doing real
        // work: with a single wide layer the halo has a hard edge and reads as a
        // grey slab lying behind the beam. Stacking thinner ones is a soft edge
        // that costs four more fills.
        for (const [w, alpha, fill] of [[h * 3.2, 0.05, colour], [h * 2.2, 0.09, colour],
          [h * 1.35, 0.2, colour], [h * 0.8, 0.42, colour],
          [h * 0.3, 0.95, '#ffffff']]) {
          const fade = ctx.createLinearGradient(-len, 0, 14, 0);
          fade.addColorStop(0, 'rgba(0,0,0,0)');
          fade.addColorStop(0.35, fill);
          fade.addColorStop(1, fill);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = fade;
          beamPath(ctx, len, w);
          ctx.fill();
        }
        // A head on the front of it, brighter than the rest.
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(8, 0, h * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // And a couple of streaks inside, which is what says "moving" at a
        // standstill - a screenshot of this game has no motion blur in it.
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.7;
        for (let i = -1; i <= 1; i += 2) {
          const y = i * h * 0.3;
          const off = ((this.frame * 7 + i * 23) % 40) / 40;
          ctx.beginPath();
          ctx.moveTo(-len * (0.2 + off * 0.6), y);
          ctx.lineTo(-len * (0.05 + off * 0.6), y);
          ctx.stroke();
        }
      } else if (s.kind === 'pellet') {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = colour;
        roundRect(ctx, -12, -3.6, 20, 7.2, 3.6);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, -6, -1.5, 12, 3, 1.5);
        ctx.fill();
      } else if (s.kind === 'shard') {
        const t = s.life / 30;
        ctx.globalAlpha = 0.4 + t * 0.5;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-6, 4.5);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, -4.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff3d0';
        ctx.beginPath();
        ctx.arc(3, 0, 1.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.kind === 'bolt') {
        // Drawn as a short piece of lightning: three segments that jitter, which
        // is enough for the eye to fill in the rest.
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-16, 0);
        for (let i = -12; i <= 8; i += 5) {
          ctx.lineTo(i, Math.sin(i * 1.7 + this.frame * 0.9) * 2.6);
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      } else if (s.kind === 'ring') {
        ctx.rotate(this.frame * 0.25);
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 1.6);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 1.6);
        ctx.stroke();
      } else if (s.kind === 'missile') {
        // A flame that tapers away behind it rather than a ball of colour: a
        // circle of orange behind a white capsule came out looking like a
        // conker with a pill stuck to it.
        const flame = 9 + Math.random() * 5;
        const g = ctx.createLinearGradient(-4, 0, -4 - flame, 0);
        g.addColorStop(0, '#ffd9a0');
        g.addColorStop(0.45, '#ff8a3c');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-4, -2.2);
        ctx.lineTo(-4 - flame, 0);
        ctx.lineTo(-4, 2.2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#e8f2ff';
        roundRect(ctx, -5, -1.9, 11, 3.8, 1.9);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  ships(state) {
    const ctx = this.ctx;
    for (const ship of state.ships) {
      if (!ship.alive) continue;
      const preset = SHIP_PRESETS[ship.index] || SHIP_PRESETS[0];
      // Flashing while it cannot be hurt, and dropping a frame in four rather
      // than fading, because a solid blink is what says "not now" at a glance.
      const blink = ship.invuln > 0 && Math.floor(this.frame / 3) % 2 === 0;

      this.pod(state, ship, preset);

      if (!blink) {
        // Drawn from the size in constants.js rather than from numbers typed in
        // here, so that the picture and the collision circle stay two knowingly
        // different sizes rather than two accidentally different ones.
        const L = SHIP_W / 2;
        const H = SHIP_H / 2;
        ctx.save();
        ctx.translate(ship.x, ship.y);
        // The engine, which is longer the faster you have made the ship.
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const flame = 11 + ship.speedups * 4 + Math.random() * 7;
        const g = ctx.createLinearGradient(-L, 0, -L - flame, 0);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, preset.glow);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-L, -4);
        ctx.lineTo(-L - flame, 0);
        ctx.lineTo(-L, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Outlined in the colour of space rather than left to float: by the
        // third stage the corridor is full of light, and a pale ship on a pale
        // background is a ship you lose in your own explosion.
        ctx.strokeStyle = 'rgba(4,7,16,0.85)';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.4;

        ctx.fillStyle = preset.trim;
        ctx.beginPath();
        ctx.moveTo(-L + 2, -H);
        ctx.lineTo(2, -H * 0.43);
        ctx.lineTo(2, H * 0.43);
        ctx.lineTo(-L + 2, H);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        ctx.fillStyle = preset.hull;
        ctx.beginPath();
        ctx.moveTo(L + 2, 0);
        ctx.lineTo(2, -H * 0.61);
        ctx.lineTo(-L + 2, -H * 0.44);
        ctx.lineTo(-L + 2, H * 0.44);
        ctx.lineTo(2, H * 0.61);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();

        ctx.fillStyle = preset.trim;
        ctx.fillRect(-9, -1.2, 9, 2.4);
        ctx.fillStyle = preset.glow;
        ctx.beginPath();
        ctx.ellipse(2, 0, 4.4, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // The rack under the wing, once there is one, so you can see what you
        // are carrying without looking at the readout.
        if (ship.missiles) {
          ctx.fillStyle = '#c8d4e4';
          for (let i = 0; i < ship.missiles; i++) {
            const up = i % 2 === 0 ? -1 : 1;
            roundRect(ctx, -6, up * 6 - 1.4, 8, 2.8, 1.4);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      this.charge(ship, preset);
    }
  }

  /** The wind-up, drawn on the nose. The only readout the gun has. */
  charge(ship, preset) {
    const power = chargeLevel(ship.charge);
    if (ship.charge < 4) return;
    const ctx = this.ctx;
    const full = ship.charge >= CHARGE_FULL;
    const grow = Math.min(1, ship.charge / CHARGE_MIN);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(ship.x + 17, ship.y);

    const r = 3 + grow * 4 + power * 9;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, full ? '#ffffff' : preset.glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5 + power * 0.5;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Two rings turning opposite ways, tightening as the charge fills. It is the
    // clearest way to say "not yet" and then "now" without a number.
    if (power > 0) {
      ctx.strokeStyle = full ? '#ffffff' : preset.glow;
      for (const dir of [1, -1]) {
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, r + 5 - power * 3.4, this.frame * 0.12 * dir,
          this.frame * 0.12 * dir + Math.PI * 1.35);
        ctx.stroke();
      }
      if (full) {
        // At the top it stops growing and starts sparking, which is the signal
        // that waiting any longer buys nothing.
        const a = this.frame * 0.4;
        for (let i = 0; i < 3; i++) {
          const t = a + (i / 3) * Math.PI * 2;
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(Math.cos(t) * (r + 8), Math.sin(t) * (r + 8), 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  pod(state, ship, preset) {
    const p = ship.pod;
    if (!p.has) return;
    const ctx = this.ctx;
    const colour = POD_KINDS[p.kind]?.colour || '#9fb4d4';

    // While it is attached there is a live link back to the ship, which is both
    // pretty and useful: it is how you find your pod in a busy screen.
    if (p.mode === 'nose' || p.mode === 'tail') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ship.x, ship.y);
      const midX = (ship.x + p.x) / 2;
      ctx.lineTo(midX, ship.y + Math.sin(this.frame * 0.6) * 2.5);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, POD_R * 3);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, POD_R * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // A ring per level, turning: how strong the pod is, said without a number.
    ctx.rotate(p.spin);
    for (let i = 0; i < Math.max(1, p.level); i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / 3);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(0, 0, POD_R + i * 2.4, 0, Math.PI * 1.4);
      ctx.stroke();
      ctx.restore();
    }
    ctx.rotate(-p.spin * 2);
    ctx.fillStyle = '#0f1626';
    ctx.beginPath();
    ctx.arc(0, 0, POD_R * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = POD_R * 0.55;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * A dark edge round the picture, and a darker band behind each readout.
   *
   * Both are doing the same job. Everything in this game is drawn additively, so
   * the corridor gets brighter the better you are doing, and the two corners
   * where the score and the hull live were the first things to disappear into
   * it. Laying the numbers on something is cheaper than trying to find a colour
   * that survives being on top of an explosion.
   */
  vignette() {
    const ctx = this.ctx;
    ctx.save();
    const edge = ctx.createRadialGradient(
      VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35,
      VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72,
    );
    edge.addColorStop(0, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    for (const [y, h, from] of [[0, 30, 0], [VIEW_H - 40, 40, 1]]) {
      const band = ctx.createLinearGradient(0, y, 0, y + h);
      band.addColorStop(from, 'rgba(3,6,14,0.62)');
      band.addColorStop(1 - from, 'rgba(3,6,14,0)');
      ctx.fillStyle = band;
      ctx.fillRect(0, y, VIEW_W, h);
    }
    ctx.restore();
  }

  // --- The readouts -----------------------------------------------------------

  hud(state, seat, net) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(formatScore(state.score), 8, 6);
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = '#8fa4c4';
    ctx.fillText('SCORE', 8, 19);

    ctx.textAlign = 'right';
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`STAGE ${stageLabel(state.stageNumber)}`, VIEW_W - 8, 6);
    ctx.font = '8px "Courier New", monospace';
    ctx.fillStyle = state.stage.theme.edge;
    ctx.fillText(state.stage.name, VIEW_W - 8, 19);

    // The hull, one block per point, because a bar you have to estimate is a bar
    // you check too late.
    state.ships.forEach((ship, i) => {
      const preset = SHIP_PRESETS[i] || SHIP_PRESETS[0];
      const left = i === 0;
      const x = left ? 8 : VIEW_W - 8;
      const y = VIEW_H - 22;
      ctx.textAlign = left ? 'left' : 'right';
      ctx.font = '8px "Courier New", monospace';
      ctx.fillStyle = ship.alive ? preset.glow : '#6a7488';
      ctx.fillText(ship.index === seat ? `${preset.name} (YOU)` : preset.name, x, y - 10);

      for (let h = 0; h < HULL_MAX; h++) {
        const bx = left ? x + h * 7 : x - 7 - h * 7;
        const on = h < ship.hull;
        ctx.globalAlpha = on ? 1 : 0.18;
        ctx.fillStyle = on
          ? (ship.hull <= 2 && Math.floor(this.frame / 8) % 2 === 0 ? '#ffffff' : preset.glow)
          : '#7f8ba6';
        ctx.fillRect(bx, y, 5, 9);
      }
      ctx.globalAlpha = 1;

      // What this ship is carrying, in one line.
      const pod = ship.pod;
      const bits = [];
      if (pod.has) bits.push(`${POD_KINDS[pod.kind]?.label || ''} ${pod.level}`);
      if (ship.speedups) bits.push(`SPD ${ship.speedups}/${MAX_SPEEDUPS}`);
      if (ship.missiles) bits.push(`MSL ${ship.missiles}/${MAX_MISSILES}`);
      ctx.fillStyle = '#a9bbd6';
      ctx.font = '7px "Courier New", monospace';
      ctx.fillText(bits.join('  ') || (ship.alive ? 'NO POD' : 'DOWN'), x, y + 11);
    });

    if (state.boss) {
      const boss = state.boss;
      const w = VIEW_W - 120;
      const frac = Math.max(0, boss.hp / boss.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(60, 32, w, 6);
      ctx.fillStyle = boss.def.glow;
      ctx.fillRect(60, 32, w * frac, 6);
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(60, 32, w, 6);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = '7px "Courier New", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(boss.def.name, VIEW_W / 2, 41);
    }

    if (net && net.online) {
      ctx.textAlign = 'center';
      ctx.font = '7px "Courier New", monospace';
      ctx.fillStyle = net.stalling ? '#ffb35a' : '#7f8ba6';
      const line = net.desync ? 'DESYNC'
        : net.gone.length ? 'PARTNER LEFT'
          : net.stalling ? 'WAITING' : `${net.ping} ms`;
      ctx.fillText(line, VIEW_W / 2, 6);
    }
    ctx.restore();
  }

  /** The big words: READY, WARNING, STAGE CLEAR, GAME OVER. */
  banner(state) {
    const ctx = this.ctx;
    let title = this.message;
    let sub = this.messageSub;
    if (state.phase === 'ready') {
      title = `STAGE ${stageLabel(state.stageNumber)}`;
      sub = state.stage.name;
    } else if (this.messageFor <= 0) {
      return;
    }
    if (!title) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = VIEW_H * 0.4;
    ctx.font = 'bold 26px "Courier New", monospace';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = state.stage.theme.edge;
    ctx.fillText(title, VIEW_W / 2, y);
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, VIEW_W / 2, y);
    if (sub) {
      ctx.font = '10px "Courier New", monospace';
      ctx.fillStyle = state.stage.theme.dust;
      ctx.fillText(sub, VIEW_W / 2, y + 22);
    }
    ctx.restore();
  }
}

/** '#5f86b8' darkened by a factor. Used to light one shape from the top. */
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

/** What a pickup looks like, and what is written on it. */
function dropLook(give) {
  switch (give) {
    case 'red': return { colour: POD_KINDS.red.colour, letter: 'R', crystal: true };
    case 'blue': return { colour: POD_KINDS.blue.colour, letter: 'B', crystal: true };
    case 'yellow': return { colour: POD_KINDS.yellow.colour, letter: 'Y', crystal: true };
    case 'speed': return { colour: '#8affc0', letter: 'S', crystal: false };
    case 'missile': return { colour: '#cfd8e8', letter: 'M', crystal: false };
    case 'heal': return { colour: '#ff9ec4', letter: 'H', crystal: false };
    default: return { colour: '#ffffff', letter: '?', crystal: false };
  }
}

/**
 * One enemy, in its own frame of reference.
 *
 * A function rather than a table of sprites because there are no sprites: every
 * shape in this game is a handful of lines, which is what keeps the whole thing
 * a few files with no build step.
 */
function drawFoe(ctx, foe, colour, frame, state) {
  const r = foe.r;
  ctx.fillStyle = colour;
  ctx.strokeStyle = '#0b1020';
  ctx.lineWidth = 1;

  switch (foe.kind) {
    case 'drone':
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(0, -r);
      ctx.lineTo(r * 1.2, 0);
      ctx.lineTo(0, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-r * 0.2, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'swoop':
      ctx.beginPath();
      ctx.moveTo(-r * 1.4, 0);
      ctx.lineTo(r * 0.4, -r * 0.9);
      ctx.lineTo(r, 0);
      ctx.lineTo(r * 0.4, r * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffe6c4';
      ctx.fillRect(-r * 0.2, -1, r * 0.9, 2);
      break;

    case 'mine': {
      const t = 0.6 + 0.4 * Math.sin(frame * 0.2 + foe.id);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + frame * 0.01;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
        ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,90,90,${t})`;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'turret': {
      const up = foe.side === 'ceil' ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(-r, -up * r);
      ctx.lineTo(r, -up * r);
      ctx.lineTo(r * 0.6, up * r * 0.7);
      ctx.lineTo(-r * 0.6, up * r * 0.7);
      ctx.closePath();
      ctx.fill();
      // The barrel points at whoever it is about to shoot, which is the only
      // warning it gives.
      const to = nearest(state, foe);
      const a = to ? Math.atan2(to.y - foe.y, to.x - foe.x) : Math.PI;
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = '#1b2434';
      roundRect(ctx, 0, -2.4, r * 1.5, 4.8, 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd9a8';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'walker': {
      const up = foe.side === 'ceil' ? 1 : -1;
      ctx.save();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.6;
      for (let i = -1; i <= 1; i++) {
        const swing = Math.sin(frame * 0.14 + i * 2) * 3;
        ctx.beginPath();
        ctx.moveTo(i * r * 0.6, 0);
        ctx.lineTo(i * r * 0.6 + swing, -up * r);
        ctx.stroke();
      }
      ctx.restore();
      roundRect(ctx, -r * 0.9, -r * 0.6, r * 1.8, r * 1.2, 3);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-r * 0.35, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'orb': {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.save();
      ctx.rotate(frame * 0.03);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.3, r * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
      // A carrier's cargo shows through it, so it is obvious which one to shoot.
      ctx.fillStyle = foe.give ? dropLook(foe.give).colour : '#1a2130';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'carrier':
      roundRect(ctx, -r * 1.3, -r * 0.7, r * 2.6, r * 1.4, 6);
      ctx.fill();
      ctx.fillStyle = '#2a1220';
      roundRect(ctx, -r * 0.9, -r * 0.35, r * 1.5, r * 0.7, 3);
      ctx.fill();
      ctx.fillStyle = foe.give ? dropLook(foe.give).colour : '#ffffff';
      ctx.beginPath();
      ctx.arc(-r * 0.15, 0, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colour;
      for (const up of [-1, 1]) {
        roundRect(ctx, -r * 0.4, up * r * 0.7 - 2, r * 1.1, 4, 2);
        ctx.fill();
      }
      break;

    case 'diver': {
      // Deliberately unlike everything else in the corridor: three shells
      // turning against each other round an eye. It should read as a thing that
      // does not belong in the plane you are flying in.
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate(frame * 0.02 * (i % 2 ? -1 : 1) + (i * Math.PI * 2) / 3);
        ctx.beginPath();
        ctx.arc(0, 0, r * (1.15 - i * 0.16), 0, Math.PI * 1.1);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16091f';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.34, r * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-r * 0.1, 0, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'snake':
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.9);
      ctx.lineTo(r * 1.5, 0);
      ctx.lineTo(-r, r * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff5c5c';
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'segment':
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#08281d';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;

    default:
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function nearest(state, from) {
  let best = null;
  let bestD = Infinity;
  for (const ship of state.ships) {
    if (!ship.alive) continue;
    const d = (ship.x - from.x) ** 2 + (ship.y - from.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = ship;
    }
  }
  return best;
}

/**
 * The outline of a beam: pointed at the front, tapering away at the back.
 *
 * Written once and traced three times at three widths, which is how the layers
 * stay concentric. `h` is the width at the fattest point, a third of the way
 * back from the head.
 */
function beamPath(ctx, len, h) {
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(4, -h / 2);
  ctx.lineTo(-len * 0.72, -h * 0.42);
  ctx.lineTo(-len, -h * 0.1);
  ctx.lineTo(-len, h * 0.1);
  ctx.lineTo(-len * 0.72, h * 0.42);
  ctx.lineTo(4, h / 2);
  ctx.closePath();
}

/** A rounded rectangle, because the canvas still does not have one everywhere. */
export function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
