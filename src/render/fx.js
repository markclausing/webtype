/**
 * Sparks, smoke and explosions.
 *
 * None of this is in the simulation and none of it may ever be: two machines
 * are allowed to disagree about where a piece of debris went, and if they were
 * not, every explosion would have to be another thing the netcode kept in step
 * for no benefit whatever. So this reads events, makes pictures out of them, and
 * is free to use Math.random as much as it likes.
 *
 * Everything is drawn additively - `lighter` rather than `source-over` - which
 * is the whole reason a game made of flat colours can look like it is glowing.
 * Two overlapping sparks are brighter than one, the way light actually behaves
 * and the way no amount of careful alpha ever quite manages.
 */

/** How many pieces are kept before the oldest are forgotten. */
const MAX = 900;

export class Fx {
  constructor() {
    this.bits = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColour = '#ffffff';
  }

  clear() {
    this.bits.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  push(bit) {
    if (this.bits.length >= MAX) this.bits.shift();
    this.bits.push(bit);
  }

  /** A handful of embers thrown out of a point. */
  spark(x, y, colour = '#ffd9a8', n = 6, speed = 90, life = 24) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.9);
      this.push({
        kind: 'dot',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * (0.6 + Math.random() * 0.8),
        age: 0,
        r: 1 + Math.random() * 1.6,
        drag: 0.94,
        colour,
      });
    }
  }

  /** A ring of light going outwards. The thing that makes a hit feel like a hit. */
  ring(x, y, to, colour = '#ffffff', life = 18, width = 2) {
    this.push({
      kind: 'ring', x, y, r: 2, to, life, age: 0, colour, width,
    });
  }

  /** A soft blob of light that fades. Used under everything bright. */
  glow(x, y, r, colour, life = 12) {
    this.push({
      kind: 'glow', x, y, r, life, age: 0, colour,
    });
  }

  /**
   * Something died. A flash, a ring, embers and a puff of smoke, scaled to how
   * big the thing was - a drone gets a pop and a boss gets a firework.
   */
  boom(x, y, r = 8, colour = '#ffb469', big = false) {
    this.glow(x, y, r * (big ? 4 : 2.2), colour, big ? 24 : 12);
    this.ring(x, y, r * (big ? 5.5 : 2.6), '#ffffff', big ? 26 : 14, big ? 2.4 : 1.6);
    if (big) this.ring(x, y, r * 8, colour, 36, 1.8);
    this.spark(x, y, colour, big ? 26 : 8, big ? 200 : 110, big ? 38 : 22);
    this.spark(x, y, '#ffffff', big ? 10 : 3, big ? 250 : 140, big ? 18 : 10);
    // Smoke stays small on purpose. It is drawn additively, so a puff the size
    // of the explosion does not read as smoke at all - it reads as a hole in the
    // middle of the screen, and four of them at once wash the corridor out.
    for (let i = 0; i < (big ? 10 : 3); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (big ? 52 : 28) * Math.random();
      this.push({
        kind: 'smoke',
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 6,
        r: r * (0.28 + Math.random() * 0.4),
        grow: big ? 0.5 : 0.28,
        life: big ? 40 : 22,
        age: 0,
        drag: 0.95,
        colour,
      });
    }
    this.shake = Math.max(this.shake, big ? 8 : 2.2);
  }

  /** A number floating up off something you shot. */
  score(x, y, text, colour = '#ffe98a') {
    this.push({
      kind: 'text', x, y, text, life: 46, age: 0, colour,
    });
  }

  /** The whole screen goes pale for a moment. Kept for beams and for bosses. */
  blink(amount = 0.5, colour = '#ffffff') {
    this.flash = Math.max(this.flash, amount);
    this.flashColour = colour;
  }

  knock(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  /** One frame. `dt` is in seconds, so this does not change with the frame rate. */
  step(dt) {
    this.shake *= 0.86;
    if (this.shake < 0.05) this.shake = 0;
    this.flash *= 0.82;
    if (this.flash < 0.01) this.flash = 0;

    let write = 0;
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      b.age++;
      if (b.age >= b.life) continue;
      if (b.vx !== undefined) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.drag) {
          b.vx *= b.drag;
          b.vy *= b.drag;
        }
      }
      if (b.kind === 'smoke') b.r += b.grow;
      if (b.kind === 'text') b.y -= 26 * dt;
      this.bits[write++] = b;
    }
    this.bits.length = write;
  }

  /**
   * Draws the lot, in world units. The caller has already put the canvas into
   * world space and subtracted the scroll.
   */
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bits) {
      const t = 1 - b.age / b.life;
      if (b.kind === 'dot') {
        ctx.globalAlpha = t;
        ctx.fillStyle = b.colour;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (0.4 + t * 0.9), 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'ring') {
        const r = b.r + (b.to - b.r) * (1 - t * t);
        ctx.globalAlpha = t * 0.9;
        ctx.strokeStyle = b.colour;
        ctx.lineWidth = b.width * t + 0.4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (b.kind === 'glow') {
        const r = b.r * (0.4 + (1 - t) * 0.9);
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
        g.addColorStop(0, b.colour);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = t * 0.85;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'smoke') {
        ctx.globalAlpha = t * 0.1;
        ctx.fillStyle = b.colour;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Text last and in normal blending: a score that adds itself to whatever is
    // behind it is a score you cannot read.
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px "Courier New", monospace';
    for (const b of this.bits) {
      if (b.kind !== 'text') continue;
      const t = 1 - b.age / b.life;
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.fillStyle = b.colour;
      ctx.fillText(b.text, b.x, b.y);
    }
    ctx.restore();
  }
}
