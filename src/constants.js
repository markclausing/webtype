/**
 * Every dimension, speed and rule in one place - the same arrangement as
 * websoccer, webtennis and webracing, and for the same reason: tuning a game
 * means changing numbers, and hunting them through the code is how a game stops
 * being tuneable.
 *
 * The world here is a corridor seen from the side, and it is a fixed size. That
 * is the one big difference from webracing, which fits its camera to whatever
 * window it is given. It cannot be done that way in a shooter: a wider window
 * would mean seeing an enemy sooner, and a game where the size of your monitor
 * decides whether you survive is a game whose score board means nothing. So the
 * view is VIEW_W by VIEW_H world units on every machine, and the renderer only
 * decides how large to draw them.
 */

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const FRAME_TIME = 1000 / TICK_RATE;

/** Two ships, and no more: the relay hands out two seats. */
export const MAX_SHIPS = 2;

// --- The corridor ------------------------------------------------------------

/**
 * What everybody can see, in world units. 16:9, because that is the shape of
 * nearly every screen this will be played on, and letterboxing a shooter costs
 * it the two things it needs most - warning time and room to dodge.
 */
export const VIEW_W = 480;
export const VIEW_H = 270;

/** How fast the corridor goes past. Each stage scales this. */
export const SCROLL_SPEED = 52;

/** How close to the edges of the view a ship may fly. */
export const EDGE_X = 10;
export const EDGE_TOP = 6;

/**
 * How far a bullet may travel outside the view before it is forgotten. Generous
 * on the right, because a beam that has just left the screen may still be about
 * to meet something that has not arrived yet, and stingy on the left, where
 * there is nothing left to hit.
 */
export const CULL_LEFT = 40;
export const CULL_RIGHT = 140;

// --- The ship ----------------------------------------------------------------

/** How large it is drawn, nose to tail and wingtip to wingtip. */
export const SHIP_W = 30;
export const SHIP_H = 21;
/**
 * What it collides with, and it is deliberately far smaller than the picture.
 *
 * Every shooter of this kind lies about the hitbox: the ship you see is three
 * times the size of the ship the game tests, and without that lie the genre
 * simply does not work - threading a gap between two bullets has to be
 * possible, and it is only possible if the thing you are threading is the
 * cockpit rather than the wings.
 */
export const SHIP_R = 4.5;

export const SHIP_SPEED = 104; // world units per second, with nothing collected
export const SPEED_STEP = 16; // and what each speed-up adds
export const MAX_SPEEDUPS = 3;

/** How hard the ship is thrown back out of a wall it has flown into. */
export const WALL_KICK = 130;

// --- Staying alive -----------------------------------------------------------

/**
 * The hull, which is the whole shape of this game.
 *
 * The arcade original killed you in one hit and sold you another go. There are
 * no coins here, so the currency is the hull: you start with a few points of it,
 * nothing but a rare repair ever gives any back, and how long it lasts is how
 * many stages you see and therefore how large a score you can possibly set. A
 * run ends when it runs out, and that is the end of the run - there is no
 * continue, because a continue would make the board a measure of patience.
 */
export const HULL_MAX = 12;
export const HEAL_AMOUNT = 4;

/** How long you flash and cannot be hurt again after being hit. */
export const INVULN_TICKS = 72;

/** What things cost, in hull. */
export const DMG_FLAK = 1; // a shot
export const DMG_WALL = 1; // the ceiling or the floor
export const DMG_FOE = 2; // flying into something
export const DMG_BEAM = 3; // whatever the boss is doing

// --- The gun -----------------------------------------------------------------

export const FIRE_EVERY = 7; // ticks between pellets while the button is held
export const PELLET_SPEED = 320;
export const PELLET_DMG = 1;
export const PELLET_R = 3;

/**
 * The charge, which is the other half of what makes this game this game.
 *
 * One button does both jobs: tapped it is a pea shooter, held it winds up and
 * released it is a beam that goes through everything in the corridor. So the
 * decision every few seconds is whether you can afford to stop shooting, and
 * that decision is the whole texture of play.
 *
 * Below CHARGE_MIN a release is just a pellet, so tapping never accidentally
 * costs you a wave. Above CHARGE_PIERCE the beam stops being stopped by what it
 * kills, which is the moment it is worth having waited for.
 */
export const CHARGE_MIN = 22;
export const CHARGE_FULL = 96;
export const CHARGE_PIERCE = 58;
export const BEAM_SPEED = 430;
export const BEAM_DMG_MIN = 3;
export const BEAM_DMG_MAX = 15;

/** Homing missiles, off the wing, once you have found a rack for them. */
export const MISSILE_EVERY = 26;
export const MISSILE_SPEED = 200;
export const MISSILE_TURN = 3.4; // radians per second
export const MISSILE_DMG = 3;
export const MISSILE_LIFE = 150;
export const MAX_MISSILES = 2;

// --- The pod -----------------------------------------------------------------

/**
 * The pod: a small indestructible companion that does most of the interesting
 * work in the game.
 *
 * Attached to the nose or the tail it eats every shot that hits it, which turns
 * it into a shield you have to aim; pushed off the ship it flies forward and
 * hangs there, still firing, which turns it into a turret you have to place. It
 * is the same object doing both, and choosing which it is this second is the
 * decision the game is actually about.
 *
 * Which weapon it carries depends on the crystal it last swallowed, and how
 * strong that weapon is depends on how many of that colour it has had.
 */
export const POD_R = 7;
// Far enough in front that it clears the charging ring on the nose: at 19 the
// pod sat inside the glow and the two most important things on the screen were
// the same blob of light.
export const POD_NOSE = 24;
export const POD_TAIL = -24;
export const POD_FOLLOW = 0.4; // how quickly it catches up to where it should be
export const POD_LAUNCH_SPEED = 300;
export const POD_RECALL_SPEED = 360;
export const POD_CONTACT_DMG = 3;
export const POD_CONTACT_EVERY = 10; // ticks between grinding damage
export const POD_MAX_LEVEL = 3;

/** The three crystals, and what the pod does with each. */
export const POD_KINDS = {
  none: { key: 'none', label: 'NONE', colour: '#7f8ba6' },
  red: { key: 'red', label: 'SPREAD', colour: '#ff5b47' },
  blue: { key: 'blue', label: 'REFLECT', colour: '#49b8ff' },
  yellow: { key: 'yellow', label: 'SEARCH', colour: '#ffd23d' },
};

// Red: a fan of short-lived shards, murderous up close and useless at range.
export const SPREAD_COUNT = [3, 5, 7];
export const SPREAD_ARC = 0.62; // radians, corner to corner
export const SPREAD_SPEED = 230;
export const SPREAD_DMG = 2;
export const SPREAD_LIFE = 30;

// Blue: bolts that come off the ceiling and the floor, so the corridor itself
// becomes part of the weapon.
export const REFLECT_SPEED = 290;
export const REFLECT_DMG = 3;
export const REFLECT_BOUNCES = [2, 3, 5];

// Yellow: slow rings that go looking. Weak per hit and impossible to miss with.
export const SEARCH_COUNT = [1, 2, 3];
export const SEARCH_SPEED = 170;
export const SEARCH_TURN = 4.2;
export const SEARCH_DMG = 3;
export const SEARCH_LIFE = 170;

/** How often the pod fires, whatever it is carrying. */
export const POD_FIRE_EVERY = [16, 13, 10];

// --- What is coming the other way --------------------------------------------

export const FLAK_SPEED = 132;
export const FLAK_R = 3.2;

/** How close a pickup has to be to be picked up. Generous: this is a reward. */
export const DROP_R = 11;
export const DROP_LIFE = 460; // about eight seconds of drifting before it is gone
export const DROP_DRIFT = -26; // and it drifts leftwards with the corridor

// --- Scoring -----------------------------------------------------------------

/** What clearing a stage is worth, before the bonus for the hull you kept. */
export const STAGE_BONUS = 2000;
export const HULL_BONUS = 250;
/** And what a pickup you did not need is worth instead. */
export const DROP_POINTS = 100;

// --- Phases ------------------------------------------------------------------

export const READY_TICKS = 2.2 * TICK_RATE;
export const CLEAR_TICKS = 3.4 * TICK_RATE;
/** How long the screen holds still after the last ship is lost. */
export const DEATH_TICKS = 1.6 * TICK_RATE;

export const BTN = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, FIRE: 16, SWITCH: 32 };

/**
 * The two ships.
 *
 * Colours and nothing else. They fly identically, which they have to: the board
 * at the end is a list of scores, and a score means nothing if the second ship
 * was quicker than the first before anybody touched a key.
 */
export const SHIP_PRESETS = [
  {
    name: 'ONE', hull: '#dfefff', trim: '#3aa7e0', glow: '#7fe6ff', shot: '#9ef0ff',
  },
  {
    name: 'TWO', hull: '#ffe9d6', trim: '#e07a2a', glow: '#ffc061', shot: '#ffd08a',
  },
];

/**
 * The three settings, and what actually separates them.
 *
 * Not the enemies' aim, which is fixed: a game that quietly makes the shots more
 * accurate is a game you can feel cheating. What changes is how much hull you
 * start with, how often the corridor shoots at all, and how quickly what it
 * fires arrives - three numbers you can see the effect of.
 */
export const SKILL_LEVELS = {
  easy: {
    key: 'easy', label: 'EASY', hull: 10, rate: 1.15, flak: 0.94, foeHp: 0.9,
  },
  normal: {
    key: 'normal', label: 'NORMAL', hull: 7, rate: 1, flak: 1, foeHp: 1,
  },
  hard: {
    key: 'hard', label: 'HARD', hull: 5, rate: 0.8, flak: 1.16, foeHp: 1.2,
  },
};

/**
 * How long the quiet bit at the start of a stage lasts, in world units.
 *
 * Every stage opens with something you can read: a wave or two with room around
 * them, so that arriving somewhere new is a chance to see what the place is
 * rather than an ambush. Past this mark the stage is allowed to get busy, and it
 * does - the scripts put most of their weight in the back two thirds.
 *
 * At the usual scroll speed this is about eighteen seconds. It shrinks by
 * LOOP_QUIET every time round the five stages, because the tenth time you fly
 * through the approach you do not need to be shown it again.
 */
export const QUIET_RUN = 900;
export const LOOP_QUIET = 220;
/** ...but never to nothing. There is always a moment to get your bearings. */
export const QUIET_FLOOR = 240;

/**
 * What each lap of the five stages adds, once you are round them all.
 *
 * The run does not stop at the last stage; it starts again harder, which is how
 * an arcade game of this kind decides who is best rather than who has finished.
 * There is no ceiling on any of this on purpose: something has to eventually
 * stop the best player in the world, and it is these four numbers.
 *
 * Which of them does the work matters. Health is the least interesting way to
 * make a game harder - it makes a fight longer rather than sharper - so it
 * climbs the most slowly. What really raises the pressure is how much is coming
 * at you (LOOP_CROWD), how often it fires (LOOP_RATE) and how little time you
 * have to read a shot once it has (LOOP_FLAK). Measured against the game's own
 * autopilot, the old numbers left it alive for twenty minutes and eleven stages
 * on EASY, which is not a difficulty curve, it is a plateau.
 */
export const LOOP_HP = 0.4; // extra enemy health per completed lap
export const LOOP_RATE = 0.2; // and how much faster the corridor shoots
export const LOOP_FLAK = 0.08; // and how much faster what it fires arrives
export const LOOP_SCORE = 0.3; // everything is worth this much more, too

/**
 * How much of a stage's script is flown a second time on each later lap.
 *
 * A third of it per lap, spread evenly through the stage rather than bunched,
 * and mirrored across the corridor so that the second copy is a different
 * problem rather than the same one twice. Past three laps it is spawning every
 * wave twice over; past six, three times.
 *
 * Pickups are never copied. They are the one thing in the game that is scarce on
 * purpose, and a lap that handed out two of every repair would be an easier lap,
 * not a harder one.
 */
export const LOOP_CROWD = 0.34;
