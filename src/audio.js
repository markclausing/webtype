/**
 * The sound: an original chiptune, a charging gun, and the noises a corridor
 * full of ordnance makes - all synthesised in the browser.
 *
 * Nothing is loaded; there is no audio file. A pulse wave carries the melody, a
 * second one runs a fast arpeggio underneath it, a triangle plays the bass and
 * filtered noise does the drums. That is how the sound chips of the era worked,
 * and it keeps the whole thing at a few kilobytes of source with no dependency
 * and no build step, in keeping with the rest of the project.
 *
 * The one sound here that is not an event but a state is the charge. It is a
 * tone whose pitch and brightness are how long you have been holding the button,
 * running from the moment you press it to the moment you let go, and it is
 * doing a job: it is how you know the beam is ready without taking your eyes off
 * the corridor to look at the nose of your own ship.
 */

const STEPS_PER_BAR = 16;

const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'A4' -> 440. Sharps as in 'F#4'; there are no flats in here, only sharps. */
export function noteFreq(name) {
  const m = /^([A-G])(#?)(-?\d)$/.exec(name);
  if (!m) return 0;
  const midi = SEMITONES[m[1]] + (m[2] ? 1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * What the drums do on a given sixteenth.
 *
 * Techno rather than the walking-bass arrangement the other three games use, and
 * the difference is almost entirely here: a kick on every beat, a clap on two
 * and four, and an open hat on the offbeat eighths. That last one is the whole
 * genre in one line - it is the sound that makes a bar feel like it is being
 * pushed rather than counted.
 */
const DRUMS = {
  four(step) {
    const out = [];
    if (step % 4 === 0) out.push('kick');
    if (step === 4 || step === 12) out.push('clap');
    if (step % 4 === 2) out.push('open');
    else if (step % 2 === 1) out.push('hat');
    return out;
  },
  // Same skeleton with a sixteenth pushed in front of the bar line, which is
  // what makes a track sound like it is accelerating when it is not.
  drive(step) {
    const out = DRUMS.four(step);
    if (step === 15 || step === 7) out.push('kick');
    return out;
  },
  // The kick moves off the grid. Used where the stage itself is not on a grid.
  broken(step) {
    const out = [];
    if (step === 0 || step === 6 || step === 10) out.push('kick');
    if (step === 4 || step === 12) out.push('clap');
    if (step % 4 === 2) out.push('open');
    else if (step % 2 === 1) out.push('hat');
    return out;
  },
  // Everything at once, for the last stage.
  hammer(step) {
    const out = DRUMS.four(step);
    if (step % 2 === 0) out.push('kick');
    if (step === 14) out.push('clap');
    return out;
  },
};

/**
 * The soundtrack: one track per stage, and one for the menu.
 *
 * A track is four or eight bars of chords, a melody in eighth notes over them,
 * and the name of a drum pattern. Everything else - the arpeggio that runs
 * underneath, the bass, the shape of each note - is worked out from those by
 * buildSong(), because a chip track is mostly arrangement rather than
 * composition and the arrangement is the same every time.
 *
 * They are meant to be recognisable from about two bars in. You will hear each
 * of them a great many times, and knowing which stage you are in from the music
 * alone is worth more than any amount of variation.
 */
export const SONGS = {
  // The menu. The only one that is not in a hurry.
  title: {
    bpm: 150,
    drums: 'four',
    duty: 0.25,
    chords: [
      { bass: 'D2', notes: ['D3', 'F3', 'A3'] },
      { bass: 'A#1', notes: ['A#2', 'D3', 'F3'] },
      { bass: 'F2', notes: ['F3', 'A3', 'C4'] },
      { bass: 'C2', notes: ['C3', 'E3', 'G3'] },
    ],
    melody: [
      ['D5', 'A4', 'D5', 'F5', 'E5', 'D5', 'A4', '-'],
      ['A#4', 'D5', 'F5', 'D5', 'C5', 'A#4', 'F4', '-'],
      ['C5', 'F5', 'A5', 'G5', 'F5', 'C5', 'A4', '-'],
      ['G4', 'C5', 'E5', 'G5', 'E5', 'C5', 'G4', '-'],
    ],
  },

  // Stage one. Open, hopeful, and the slowest of the five: it is the stage you
  // are given room to look at, and the music says so.
  approach: {
    bpm: 148,
    drums: 'four',
    duty: 0.25,
    chords: [
      { bass: 'A1', notes: ['A2', 'C3', 'E3'] },
      { bass: 'F1', notes: ['F2', 'A2', 'C3'] },
      { bass: 'C2', notes: ['C3', 'E3', 'G3'] },
      { bass: 'G1', notes: ['G2', 'B2', 'D3'] },
      { bass: 'A1', notes: ['A2', 'C3', 'E3'] },
      { bass: 'F1', notes: ['F2', 'A2', 'C3'] },
      { bass: 'D2', notes: ['D3', 'F3', 'A3'] },
      { bass: 'E2', notes: ['E3', 'G#3', 'B3'] },
    ],
    melody: [
      ['A4', 'E5', 'A5', 'E5', 'C5', 'E5', 'A4', '-'],
      ['F4', 'C5', 'F5', 'C5', 'A4', 'C5', 'F4', '-'],
      ['C5', 'G5', 'C6', 'G5', 'E5', 'G5', 'C5', '-'],
      ['B4', 'D5', 'G5', 'D5', 'B4', 'G4', 'D4', '-'],
      ['A4', 'E5', 'A5', 'C6', 'B5', 'A5', 'E5', '-'],
      ['F4', 'C5', 'F5', 'A5', 'G5', 'F5', 'C5', '-'],
      ['D5', 'A5', 'D6', 'A5', 'F5', 'D5', 'A4', '-'],
      ['E5', 'B5', 'E6', 'D6', 'B5', 'G#5', 'E5', '-'],
    ],
  },

  // Stage two, where the corridor closes in. A semitone that will not resolve,
  // and the kick pushed in front of the bar.
  spine: {
    bpm: 156,
    drums: 'drive',
    duty: 0.16,
    chords: [
      { bass: 'D2', notes: ['D3', 'F3', 'A3'] },
      { bass: 'D#2', notes: ['D#3', 'G3', 'A#3'] },
      { bass: 'D2', notes: ['D3', 'F3', 'A3'] },
      { bass: 'A1', notes: ['A2', 'C#3', 'E3'] },
      { bass: 'G1', notes: ['G2', 'A#2', 'D3'] },
      { bass: 'D#2', notes: ['D#3', 'G3', 'A#3'] },
      { bass: 'D2', notes: ['D3', 'F3', 'A3'] },
      { bass: 'A1', notes: ['A2', 'C#3', 'E3'] },
    ],
    melody: [
      ['D5', 'F5', 'A5', 'F5', 'D5', 'A4', 'D5', '-'],
      ['D#5', 'G5', 'A#5', 'G5', 'D#5', 'A#4', 'D#5', '-'],
      ['A5', 'F5', 'D5', 'F5', 'A5', 'D6', 'A5', '-'],
      ['C#5', 'E5', 'A5', 'E5', 'C#5', 'A4', 'E5', '-'],
      ['D5', 'A#5', 'A5', 'G5', 'F5', 'D5', 'A4', '-'],
      ['D#5', 'A#5', 'G5', 'D#5', 'A#4', 'G4', 'D#4', '-'],
      ['F5', 'A5', 'D6', 'A5', 'F5', 'D5', 'A4', '-'],
      ['E5', 'A5', 'C#6', 'A5', 'E5', 'C#5', 'A4', '-'],
    ],
  },

  // Stage three. Machinery: everything on the grid, nothing decorative, and the
  // narrowest pulse in the game, which is where the buzz comes from.
  foundry: {
    bpm: 162,
    drums: 'drive',
    duty: 0.125,
    chords: [
      { bass: 'C2', notes: ['C3', 'D#3', 'G3'] },
      { bass: 'C2', notes: ['C3', 'D#3', 'G3'] },
      { bass: 'G#1', notes: ['G#2', 'C3', 'D#3'] },
      { bass: 'A#1', notes: ['A#2', 'D3', 'F3'] },
      { bass: 'C2', notes: ['C3', 'D#3', 'G3'] },
      { bass: 'F1', notes: ['F2', 'G#2', 'C3'] },
      { bass: 'G#1', notes: ['G#2', 'C3', 'D#3'] },
      { bass: 'G1', notes: ['G2', 'B2', 'D3'] },
    ],
    melody: [
      ['C5', 'C5', 'D#5', 'C5', 'G5', 'C5', 'D#5', '-'],
      ['C5', 'G4', 'C5', 'D#5', 'F5', 'D#5', 'C5', '-'],
      ['G#4', 'C5', 'D#5', 'C5', 'G#4', 'D#4', 'G#4', '-'],
      ['A#4', 'D5', 'F5', 'D5', 'A#4', 'F4', 'A#4', '-'],
      ['C5', 'D#5', 'G5', 'A#5', 'G5', 'D#5', 'C5', '-'],
      ['F5', 'G#5', 'C6', 'G#5', 'F5', 'C5', 'G#4', '-'],
      ['G#5', 'G5', 'F5', 'D#5', 'D5', 'C5', 'G#4', '-'],
      ['G4', 'B4', 'D5', 'G5', 'D5', 'B4', 'G4', '-'],
    ],
  },

  // Stage four. Nothing here moves in a straight line, and neither does the
  // kick: the pattern is off the grid and the melody floats over the top of it.
  shoal: {
    bpm: 152,
    drums: 'broken',
    duty: 0.33,
    chords: [
      { bass: 'E2', notes: ['E3', 'G3', 'B3'] },
      { bass: 'C2', notes: ['C3', 'E3', 'G3'] },
      { bass: 'A1', notes: ['A2', 'C3', 'E3'] },
      { bass: 'B1', notes: ['B2', 'D#3', 'F#3'] },
      { bass: 'E2', notes: ['E3', 'G3', 'B3'] },
      { bass: 'G1', notes: ['G2', 'B2', 'D3'] },
      { bass: 'A1', notes: ['A2', 'C3', 'E3'] },
      { bass: 'B1', notes: ['B2', 'D#3', 'F#3'] },
    ],
    melody: [
      ['E5', 'B4', 'G4', 'B4', 'E5', 'G5', 'B5', '-'],
      ['G5', 'E5', 'C5', 'E5', 'G5', 'C6', 'G5', '-'],
      ['A5', 'E5', 'C5', 'A4', 'C5', 'E5', 'A5', '-'],
      ['F#5', 'D#5', 'B4', 'D#5', 'F#5', 'B5', 'F#5', '-'],
      ['E5', 'G5', 'B5', 'E6', 'B5', 'G5', 'E5', '-'],
      ['D5', 'G5', 'B5', 'D6', 'B5', 'G5', 'D5', '-'],
      ['C5', 'E5', 'A5', 'C6', 'A5', 'E5', 'C5', '-'],
      ['B4', 'D#5', 'F#5', 'B5', 'F#5', 'D#5', 'B4', '-'],
    ],
  },

  // Stage five. The fastest, the flattest and the least forgiving: a kick on
  // every eighth and a melody that keeps landing a semitone from where the
  // chord wants it.
  core: {
    bpm: 168,
    drums: 'hammer',
    duty: 0.16,
    chords: [
      { bass: 'B1', notes: ['B2', 'D3', 'F#3'] },
      { bass: 'B1', notes: ['B2', 'D3', 'F#3'] },
      { bass: 'G1', notes: ['G2', 'A#2', 'D3'] },
      { bass: 'F#1', notes: ['F#2', 'A#2', 'C#3'] },
      { bass: 'B1', notes: ['B2', 'D3', 'F#3'] },
      { bass: 'A1', notes: ['A2', 'C3', 'E3'] },
      { bass: 'G1', notes: ['G2', 'A#2', 'D3'] },
      { bass: 'F#1', notes: ['F#2', 'A#2', 'C#3'] },
    ],
    melody: [
      ['B4', 'F#5', 'B5', 'F#5', 'D5', 'F#5', 'B4', '-'],
      ['C5', 'F#5', 'B5', 'C6', 'B5', 'F#5', 'D5', '-'],
      ['D5', 'G5', 'A#5', 'D6', 'A#5', 'G5', 'D5', '-'],
      ['C#5', 'F#5', 'A#5', 'C#6', 'A#5', 'F#5', 'C#5', '-'],
      ['B5', 'A#5', 'F#5', 'D5', 'F#5', 'A#5', 'B5', '-'],
      ['A5', 'E5', 'C5', 'E5', 'A5', 'C6', 'A5', '-'],
      ['G5', 'A#5', 'D6', 'A#5', 'G5', 'D5', 'A#4', '-'],
      ['F#5', 'A#5', 'C#6', 'F#6', 'C#6', 'A#5', 'F#5', '-'],
    ],
  },
};

/**
 * A song, as a list of what happens on each sixteenth.
 *
 * The arpeggio is the chord cycled one note per sixteenth, which is the trick
 * that made three voices sound like a band on hardware that only had three. The
 * bass is on every sixteenth rather than every eighth, which is the difference
 * between this and the other games' soundtracks: a sixteenth-note bass is
 * something you are being pushed along by.
 */
export function buildSong(def) {
  const bars = def.chords.length;
  const step = 60 / def.bpm / 4;
  const total = bars * STEPS_PER_BAR;
  const lead = new Array(total).fill(null);
  const arp = new Array(total).fill(null);
  const bass = new Array(total).fill(null);
  const drum = new Array(total).fill(null);
  const pattern = DRUMS[def.drums] || DRUMS.four;

  for (let bar = 0; bar < bars; bar++) {
    const chord = def.chords[bar];
    const phrase = def.melody[bar % def.melody.length];
    for (let i = 0; i < STEPS_PER_BAR; i++) {
      const at = bar * STEPS_PER_BAR + i;
      if (i % 2 === 0) {
        const note = phrase[i / 2];
        if (note && note !== '-') lead[at] = { freq: noteFreq(note), dur: step * 1.7 };
      }
      arp[at] = { freq: noteFreq(chord.notes[i % chord.notes.length]), dur: step * 0.8 };
      bass[at] = { freq: noteFreq(chord.bass), dur: step * 0.8 };
      drum[at] = pattern(i);
    }
  }
  return {
    lead, arp, bass, drum, steps: total, step, duty: def.duty ?? 0.25,
  };
}

const built = new Map();

/** One song, built once. Falls back to the menu track for anything unknown. */
export function song(name) {
  const key = SONGS[name] ? name : 'title';
  if (!built.has(key)) built.set(key, buildSong(SONGS[key]));
  return built.get(key);
}

/** A pulse wave of the given duty cycle, which is what gives it the bite. */
function pulseWave(ctx, duty, harmonics = 24) {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    imag[n] = (2 / (n * Math.PI)) * Math.sin(Math.PI * n * duty);
  }
  return ctx.createPeriodicWave(real, imag);
}

/**
 * One audio context shared by the tune, the gun and the effects. They have to
 * share it: the tune suspends nothing when it stops, or the gun would go with
 * it, and browsers hand out a limited number of contexts.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  /** Browsers only allow this from a click or a key press. */
  wake() {
    if (!this.ctx) {
      const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctx) return null; // no Web Audio: the game is perfectly playable in silence
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      this.waves = new Map();
      this.arpWave = this.pulse(0.125);
      this.noise = this.makeNoise(0.5);
      this.longNoise = this.makeNoise(3.2);
    }
    this.ctx.resume?.();
    return this.ctx;
  }

  /** A pulse wave of a given duty, built once. Each song has its own. */
  pulse(duty) {
    if (!this.waves.has(duty)) this.waves.set(duty, pulseWave(this.ctx, duty));
    return this.waves.get(duty);
  }

  makeNoise(seconds) {
    const frames = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** A plain tone with a hard attack and a quick decay. */
  tone(freq, at, dur, wave, level) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (typeof wave === 'string') osc.type = wave;
    else osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    return osc;
  }

  /** A tone that slides from one pitch to another. Half the game is these. */
  sweep(from, to, at, dur, wave, level) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (typeof wave === 'string') osc.type = wave;
    else osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + Math.min(0.03, dur / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.master);
    osc.start(at);
    osc.stop(at + dur + 0.03);
    return osc;
  }

  /** Filtered noise: everything percussive here is made of this. */
  noiseBurst(at, {
    freq, q = 1, dur, level, sweepTo = null, long = false, type = 'bandpass',
  }) {
    const src = this.ctx.createBufferSource();
    src.buffer = long ? this.longNoise : this.noise;
    if (long) src.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = type;
    band.frequency.setValueAtTime(freq, at);
    band.Q.value = q;
    if (sweepTo) band.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + Math.min(0.04, dur / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(band).connect(gain).connect(this.master);
    src.start(at);
    src.stop(at + dur + 0.05);
    return gain;
  }
}

/**
 * The soundtrack, playing.
 *
 * Two clocks: a coarse interval that keeps topping up what the audio clock -
 * which is the accurate one - is going to play next. That is the standard way to
 * sequence anything in a browser, because setInterval is nowhere near steady
 * enough to put a kick drum on.
 *
 * It has its own gain, and that is not decoration: the music plays under the
 * game now rather than only in the menu, and a chip track mixed for a title
 * screen is a chip track that buries the sound of being shot. It ducks when a
 * stage starts and comes back up in the menu.
 */
export class Chiptune {
  constructor(engine) {
    this.engine = engine;
    this.playing = false;
    this.timer = null;
    this.name = null;
    this.song = null;
    this.stepIndex = 0;
    this.nextStepTime = 0;
    this.level = 1;
  }

  /**
   * Plays a named song, switching if something else is already going.
   *
   * A switch is a cut rather than a fade. It only ever happens at a stage
   * boundary, where the screen is showing a stage name and holding still, and a
   * crossfade between two tracks in different keys at different tempos sounds
   * like a mistake rather than like a transition.
   */
  play(name) {
    if (this.playing && this.name === name) return;
    this.name = name;
    this.song = song(name);
    if (!this.engine.wake()) return;
    this.ctx = this.engine.ctx;
    this.leadWave = this.engine.pulse(this.song.duty);
    this.arpWave = this.engine.arpWave;
    this.noise = this.engine.noise;
    if (!this.out) {
      this.out = this.ctx.createGain();
      this.out.gain.value = this.level;
      this.out.connect(this.engine.master);
    }
    this.stepIndex = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    if (!this.playing) {
      this.playing = true;
      this.timer = setInterval(() => this.schedule(), 25);
    }
    this.schedule();
  }

  stop() {
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    // Deliberately not suspending the context: the guns and the explosions carry
    // on through it once the stage has started.
  }

  toggle(on) {
    if (on) this.play(this.name || 'title');
    else this.stop();
  }

  /** How loud the music sits under everything else. */
  duck(level) {
    this.level = level;
    if (this.out) this.out.gain.setTargetAtTime(level, this.ctx.currentTime, 0.25);
  }

  schedule() {
    if (!this.playing || !this.song) return;
    const lookahead = 0.25;
    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      this.playStep(this.stepIndex, this.nextStepTime);
      this.nextStepTime += this.song.step;
      this.stepIndex = (this.stepIndex + 1) % this.song.steps;
    }
  }

  playStep(i, at) {
    const lead = this.song.lead[i];
    if (lead) this.tone(lead.freq, at, lead.dur, this.leadWave, 0.24);

    const arp = this.song.arp[i];
    if (arp) this.tone(arp.freq, at, arp.dur, this.arpWave, 0.07);

    const bass = this.song.bass[i];
    if (bass) this.tone(bass.freq, at, bass.dur, 'triangle', 0.34);

    for (const hit of this.song.drum[i] || []) {
      if (hit === 'kick') this.kick(at);
      else if (hit === 'clap') this.clap(at);
      else if (hit === 'open') this.hit(at, 6200, 0.14, 0.05);
      else if (hit === 'hat') this.hit(at, 8200, 0.03, 0.05);
    }
  }

  tone(freq, at, dur, wave, level) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (typeof wave === 'string') osc.type = wave;
    else osc.setPeriodicWave(wave);
    osc.frequency.setValueAtTime(freq, at);
    // Hard on, quick decay: no envelope knobs on those chips either.
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(this.out);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** Longer and lower than the other games': this one is the pulse of the track. */
  kick(at) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.09);
    gain.gain.setValueAtTime(0.7, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    osc.connect(gain).connect(this.out);
    osc.start(at);
    osc.stop(at + 0.22);
  }

  /**
   * A clap rather than a snare, which is most of what says techno instead of
   * rock. Three bursts a few milliseconds apart and a longer tail - a clap is a
   * lot of people not quite together, and that is exactly how it is built.
   */
  clap(at) {
    for (const [delay, level, dur] of [[0, 0.2, 0.02], [0.011, 0.16, 0.02],
      [0.022, 0.24, 0.13]]) {
      this.hit(at + delay, 1900, dur, level);
    }
  }

  hit(at, freq, dur, level) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(band).connect(gain).connect(this.out);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
}

/**
 * The charge, as one long note.
 *
 * Two oscillators a fifth apart through a lowpass that opens as the charge
 * fills, plus a ring of noise. All of it is set every frame from how long the
 * button has been held, so this is a state rather than a sound that gets
 * triggered - and it stops the moment the button comes up, which is the whole
 * point: silence means the beam has gone.
 *
 * The same object doubles as the boss drone, which is a second voice an octave
 * and a bit lower with nothing but a slow throb on it. They share a filter
 * because they are never both interesting at once.
 */
export class Charger {
  constructor(engine) {
    this.engine = engine;
    this.running = false;
    this.phase = 0;
  }

  start() {
    if (this.running) return;
    const ctx = this.engine.wake();
    if (!ctx) return;
    this.ctx = ctx;

    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 500;
    this.filter.Q.value = 6;
    this.filter.connect(this.gain).connect(this.engine.master);

    this.low = ctx.createOscillator();
    this.low.type = 'sawtooth';
    this.high = ctx.createOscillator();
    this.high.type = 'square';
    const mix = ctx.createGain();
    mix.gain.value = 0.3;
    this.low.connect(this.filter);
    this.high.connect(mix).connect(this.filter);
    this.low.start();
    this.high.start();

    this.drone = ctx.createOscillator();
    this.drone.type = 'sawtooth';
    this.drone.frequency.value = 44;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 220;
    this.drone.connect(droneFilter).connect(this.droneGain).connect(this.engine.master);
    this.drone.start();

    this.running = true;
  }

  /**
   * One frame.
   *
   * @param charge 0 to 1 of a full wind-up, or 0 when the button is not held
   * @param full whether it is at the top, where it stops climbing and pulses
   * @param boss 0 to 1 of how much boss there is on the screen
   */
  update(charge, full, boss = 0) {
    if (!this.running || !this.engine.enabled) return;
    const now = this.ctx.currentTime;
    this.phase += 0.2;
    const wobble = full ? 1 + Math.sin(this.phase * 2.2) * 0.06 : 1;
    const hz = (120 + charge * 520) * wobble;
    this.low.frequency.setTargetAtTime(hz, now, 0.02);
    this.high.frequency.setTargetAtTime(hz * 1.5, now, 0.02);
    this.filter.frequency.setTargetAtTime(300 + charge * 2600, now, 0.03);
    this.gain.gain.setTargetAtTime(charge > 0 ? 0.035 + charge * 0.075 : 0, now, 0.04);
    this.droneGain.gain.setTargetAtTime(boss * 0.11, now, 0.25);
    this.drone.frequency.setTargetAtTime(40 + boss * 8 + Math.sin(this.phase * 0.09) * 3,
      now, 0.4);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    const now = this.ctx.currentTime;
    // Faded rather than cut: stopping an oscillator at full level is a click.
    this.gain.gain.setTargetAtTime(0, now, 0.06);
    this.droneGain.gain.setTargetAtTime(0, now, 0.2);
    const at = now + 0.6;
    this.low.stop(at);
    this.high.stop(at);
    this.drone.stop(at);
  }
}

/** The least time between two things the announcer says, in seconds. */
const LINE_GAP = 2.4;

/**
 * The noises, built from the same two ingredients as the tune: a tone and a band
 * of noise. Nothing here is a recording.
 *
 * Almost everything is rate limited. A screen with forty things on it produces
 * forty events a tick, and a synthesiser that honestly played all of them is a
 * synthesiser that produces a wall of mud and then crashes the tab.
 */
export class Sfx {
  constructor(engine, speech = null) {
    this.engine = engine;
    this.speech = speech;
    this.lastLine = -99;
    this.last = new Map();
    this.talking = true;
  }

  get ctx() {
    return this.engine.ctx;
  }

  ready() {
    return !!this.engine.ctx && this.engine.enabled;
  }

  /** True at most once every `gap` seconds for a given name. */
  allow(name, gap) {
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -99) < gap) return false;
    this.last.set(name, now);
    return true;
  }

  /** The pea shooter. Short, dry and quiet: it happens eight times a second. */
  shot() {
    if (!this.ready() || !this.allow('shot', 0.045)) return;
    const now = this.ctx.currentTime;
    this.engine.sweep(1500, 700, now, 0.06, 'square', 0.075);
  }

  /**
   * The beam. A downward sweep with a wall of noise behind it, and both of them
   * get longer and lower the more of a charge went into it, so a full one sounds
   * like a different weapon rather than a louder one.
   */
  beam(power = 1) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    const dur = 0.24 + power * 0.4;
    this.engine.sweep(340 + power * 500, 70, now, dur, 'sawtooth', 0.16 + power * 0.16);
    this.engine.sweep(180, 44, now, dur * 1.2, 'triangle', 0.12 + power * 0.14);
    this.engine.noiseBurst(now, {
      freq: 400 + power * 3200, q: 0.7, dur, level: 0.1 + power * 0.14, sweepTo: 180,
    });
  }

  /** The pod, which sounds like whichever crystal it swallowed. */
  pod(kind) {
    if (!this.ready() || !this.allow('pod', 0.07)) return;
    const now = this.ctx.currentTime;
    if (kind === 'red') {
      this.engine.noiseBurst(now, {
        freq: 900, q: 0.8, dur: 0.1, level: 0.11, sweepTo: 2600,
      });
    } else if (kind === 'blue') {
      this.engine.sweep(900, 1600, now, 0.09, 'square', 0.08);
    } else if (kind === 'yellow') {
      this.engine.sweep(600, 980, now, 0.13, 'sine', 0.09);
    }
  }

  missile() {
    if (!this.ready() || !this.allow('missile', 0.12)) return;
    const now = this.ctx.currentTime;
    this.engine.noiseBurst(now, {
      freq: 700, q: 1.2, dur: 0.2, level: 0.09, sweepTo: 2400,
    });
  }

  /** A hit that did not kill: a click, so a wall of them is still countable. */
  tick() {
    if (!this.ready() || !this.allow('tick', 0.04)) return;
    const now = this.ctx.currentTime;
    this.engine.noiseBurst(now, {
      freq: 3000, q: 4, dur: 0.03, level: 0.07, sweepTo: 1400,
    });
  }

  /** Something blew up. Bigger things get a longer, lower version of the same. */
  boom(big = false) {
    if (!this.ready() || !this.allow(big ? 'big' : 'boom', big ? 0.1 : 0.05)) return;
    const now = this.ctx.currentTime;
    this.engine.noiseBurst(now, {
      freq: big ? 900 : 1500,
      q: 0.6,
      dur: big ? 0.75 : 0.22,
      level: big ? 0.34 : 0.17,
      sweepTo: big ? 60 : 160,
    });
    this.engine.sweep(big ? 190 : 260, big ? 30 : 60, now, big ? 0.6 : 0.2, 'triangle',
      big ? 0.3 : 0.14);
  }

  /**
   * A seeker leaving the rack: a rising whoosh, which is the one enemy sound
   * that has to carry over everything else. It is the only thing in the corridor
   * that will follow you.
   */
  seeker() {
    if (!this.ready() || !this.allow('seeker', 0.09)) return;
    const now = this.ctx.currentTime;
    this.engine.noiseBurst(now, {
      freq: 500, q: 1.1, dur: 0.4, level: 0.15, sweepTo: 2600,
    });
    this.engine.sweep(220, 620, now, 0.35, 'sawtooth', 0.09);
  }

  /** And a small tick each time it changes its mind. */
  seekTurn() {
    if (!this.ready() || !this.allow('seekturn', 0.05)) return;
    const now = this.ctx.currentTime;
    this.engine.tone(1450, now, 0.05, 'square', 0.08);
  }

  /** A mine going down: a dull clunk, deliberately quiet. */
  mineLaid() {
    if (!this.ready() || !this.allow('minelaid', 0.08)) return;
    const now = this.ctx.currentTime;
    this.engine.noiseBurst(now, {
      freq: 340, q: 2.2, dur: 0.09, level: 0.1, sweepTo: 130,
    });
  }

  /** The pod eating a shot. A short, bright ting, so you know it worked. */
  absorb() {
    if (!this.ready() || !this.allow('absorb', 0.05)) return;
    const now = this.ctx.currentTime;
    this.engine.tone(2100, now, 0.05, 'sine', 0.07);
  }

  bounce() {
    if (!this.ready() || !this.allow('bounce', 0.05)) return;
    const now = this.ctx.currentTime;
    this.engine.sweep(1700, 2400, now, 0.05, 'sine', 0.06);
  }

  /** Being hit, which has to cut through everything else on the screen. */
  hurt() {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    this.engine.sweep(420, 90, now, 0.34, 'sawtooth', 0.3);
    this.engine.noiseBurst(now, {
      freq: 1800, q: 0.5, dur: 0.3, level: 0.22, sweepTo: 120,
    });
  }

  /** Losing a ship. Everything at once, and then nothing for a moment. */
  die() {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    this.engine.noiseBurst(now, {
      freq: 1200, q: 0.4, dur: 1.1, level: 0.36, sweepTo: 44,
    });
    this.engine.sweep(300, 28, now, 0.9, 'sawtooth', 0.3);
  }

  /** Picking something up. A rising figure, which is the arcade for "yes". */
  pickup(spare = false) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    const notes = spare ? [880, 1170] : [660, 880, 1320, 1760];
    notes.forEach((f, i) => this.engine.tone(f, now + i * 0.055, 0.12, 'square', 0.16));
  }

  /** A repair, which is worth its own warmer sound. */
  heal() {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      this.engine.tone(f, now + i * 0.07, 0.4, 'triangle', 0.2);
    });
  }

  /** Pushing the pod off the ship, and calling it back. */
  podLaunch(out = true) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    if (out) this.engine.sweep(300, 1300, now, 0.16, 'square', 0.14);
    else this.engine.sweep(1300, 400, now, 0.16, 'square', 0.12);
  }

  /** The alarm that means something large has arrived. */
  alarm() {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      this.engine.sweep(660, 990, now + i * 0.22, 0.18, 'square', 0.2);
    }
  }

  /** Getting to the end of a stage, and getting to the end of a run. */
  fanfare(win = true) {
    if (!this.ready()) return;
    const now = this.ctx.currentTime;
    const notes = win ? [523, 659, 784, 1046, 1318] : [440, 349, 294, 220];
    notes.forEach((freq, i) => {
      this.engine.tone(freq, now + i * 0.13, 0.3, 'square', 0.24);
      this.engine.tone(freq / 2, now + i * 0.13, 0.3, 'triangle', 0.16);
    });
  }

  /**
   * The announcer. Rarely, and never over himself: this game is loud enough
   * without a voice in the middle of a boss.
   */
  call(text, { force = false } = {}) {
    if (!this.ready() || !this.talking || !this.speech || !text) return 0;
    const now = this.ctx.currentTime;
    if (!force && now - this.lastLine < LINE_GAP) return 0;
    this.lastLine = now;
    return this.speech.line(text, now);
  }

  say(event) {
    if (!this.ready() || !this.talking || !this.speech) return 0;
    const now = this.ctx.currentTime;
    if (now - this.lastLine < LINE_GAP) return 0;
    this.lastLine = now;
    return this.speech.say(event);
  }

  /**
   * Everything the simulation reported this frame, turned into noise.
   *
   * `seat` is which ship is yours, and it does more work than it looks: being
   * hit is the loudest thing in the game and it must not be that loud when it
   * happened to somebody else.
   */
  play(events, { seat = -1, lines = {} } = {}) {
    if (!this.ready()) return;
    for (const e of events) {
      switch (e.type) {
        case 'shot':
          if (e.seat === seat) this.shot();
          break;
        case 'beam':
          if (e.seat === seat) this.beam(e.power);
          break;
        case 'podshot':
          if (e.seat === seat) this.pod(e.kind);
          break;
        case 'missile':
          if (e.seat === seat) this.missile();
          break;
        case 'hit':
        case 'bosshurt':
          this.tick();
          break;
        case 'kill':
          this.boom(e.r > 12);
          break;
        case 'chain':
          this.boom(false);
          break;
        case 'absorb':
          if (e.seat === seat) this.absorb();
          break;
        case 'bounce':
          this.bounce();
          break;
        case 'seeker':
          this.seeker();
          break;
        case 'seekturn':
          this.seekTurn();
          break;
        case 'minelaid':
          this.mineLaid();
          break;
        case 'minepop':
          this.boom(true);
          break;
        case 'minekill':
          this.boom(false);
          break;
        case 'hurt':
          if (e.seat === seat) {
            this.hurt();
            this.say('hit');
          }
          break;
        case 'die':
          this.die();
          if (e.seat === seat) this.say('down');
          break;
        case 'pickup':
          if (e.give === 'heal' && !e.spare) this.heal();
          else this.pickup(e.spare);
          if (!e.spare && e.give === 'heal') this.call(lines.repair);
          break;
        case 'revive':
          this.heal();
          break;
        case 'podlaunch':
          if (e.seat === seat) this.podLaunch(true);
          break;
        case 'podcall':
          if (e.seat === seat) this.podLaunch(false);
          break;
        case 'bossin':
          this.alarm();
          this.call(lines.warning, { force: true });
          break;
        case 'bossdie':
          this.boom(true);
          break;
        case 'clear':
          this.fanfare(true);
          this.call(lines.clear, { force: true });
          break;
        case 'over':
          this.fanfare(false);
          this.call(lines.over, { force: true });
          break;
        default:
          break;
      }
    }
  }
}
