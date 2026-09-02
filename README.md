# WebType

### ▶ [Play it](https://markclausing.github.io/webtype/)

A horizontal shoot-em-up in the spirit of the 16-bit corridor shooters: a small
ship, a gun you have to hold down, an indestructible pod you can push off the
front of it, and five stages of rock and ordnance between you and a boss.
**1 player**, **2 round one keyboard**, or **2 online** with a four-character
room code.

You have one hull and there are no continues. How far you get is how much you
score, and both go on a shared board.

No dependencies, no build step — HTML, CSS and JavaScript exactly as the browser
receives them. It is the fourth game built this way, after
[websoccer](https://github.com/markclausing/websoccer),
[webtennis](https://github.com/markclausing/webtennis) and
[webracing](https://github.com/markclausing/webracing).

![The ship, its pod and a full charge on the way down the corridor](docs/screenshots/beam.png)

## Running it yourself

```bash
git clone https://github.com/markclausing/webtype.git
cd webtype && npm start
```

Then open http://localhost:5173/. There is no `npm install`.

![The menu, with the attract mode playing behind it](docs/screenshots/menu.png)

## Controls

|                        | Player 1        | Player 2        |
| ---------------------- | --------------- | --------------- |
| Fly                    | `W` `A` `S` `D` | Arrow keys      |
| Fire, hold to charge   | `Space`         | `Enter`         |
| Pod out / back         | `Q`             | `R Shift`       |
| Pause                  | `Esc`           |                 |

Every key can be changed in the menu. Gamepads need no setting up: the first pad
shares with player one, a second pad is player two.

On a phone, hold it sideways. The bottom-left corner is the stick, `FIRE` is the
big button, `POD` is the small one beside it, and the little `II` at the top
pauses — from there you can resume or leave the run. The whole playfield is drawn
whatever the screen, because it has to be — see below.

![On a phone, held sideways](docs/screenshots/mobile.png)

## How it plays

**Tap fire for pellets, hold it for a beam.** Holding winds the gun up and
releasing lets it go; below about a third of a second there is no beam, so a
tapped button is a pea shooter and nothing is ever swallowed. A full charge goes
straight through everything in the corridor, and a lot of what is in the later
stages does not die to anything else. That is the whole rhythm of the game: the
question every few seconds is whether you can afford to stop shooting.

![The gun wound up to the top, a moment before it is let go](docs/screenshots/charge.png)

**The pod is a shield you have to aim.** On the nose or the tail it eats every
shot that hits it and grinds through anything it touches, and it cannot be
destroyed. Press the second button and it flies off forwards and hangs there,
still firing, which turns it from a shield into a turret you have placed. Press
it again and it comes home — and if you fly past it while it is out there, it
comes back onto your tail instead of your nose, which is how you cover the thing
that is chasing you.

![The pod on the nose, pellets away and a beam on its way down the corridor](docs/screenshots/gameplay.png)

**The crystals are three weapons, not three levels.** Red is a fan of short-lived
shards, murderous at the range where being that close is a bad idea. Blue bounces
off the ceiling and the floor, so the corridor itself becomes part of the gun.
Yellow is slow rings that go looking for what you cannot see. A second crystal of
the same colour makes that weapon stronger; a different colour starts again from
the bottom. Every one of them is at a fixed mark, so which you end a stage
carrying is a decision rather than an accident.

**The hull is the whole game.** There are no lives and no continues. You start
with five to ten points of it depending on the setting, one hit costs one or
two, and when it runs out the run is over and whatever you had collected is gone
with it. Repairs exist. There are three of them written into the five stages,
plus one from every boss, and they are always in the same places for everybody.

Two players share a score and have a hull each. A repair picked up while your
partner is down brings them back rather than patching you up, because two people
playing and one of them watching is not the game either of them started.

![The Gatekeeper, at the end of the first stage](docs/screenshots/boss.png)

## What is coming the other way

Most of it is a hot orange bead that flies where it was pointed. Three things in
the corridor carry something better, and each of them asks a different question.

**The carrier fires seekers.** A seeker is *slower* than a plain shot and it is
allowed to change its mind three times. That is the whole weapon: a fast homing
missile is not a puzzle, it is a countdown — there is nothing to do about it but
be somewhere else already. A slow one that corrects three times is a
conversation. It locks on, you move, it corrects, you move again, and on the
fourth move it has nothing left and sails past. It carries one white pip for each
correction it still has, so how much argument it has left in it is something you
can read rather than something you have to count.

**The walker lays mines.** It does not shoot at you at all: it crawls up the
corridor against the scroll leaving mines behind it, and the corridor brings them
back to you. A mine arms visibly before it is dangerous — a hazard that is lethal
the instant it exists cannot be planned around by somebody already committed to
that piece of air — and once armed it draws the ring inside which it will go off.
It throws its shrapnel outwards, so the answer is distance rather than a
direction. It can also be shot, and the pod grinds a line of them away for
nothing, which is one of the nicer things the pod does.

**The orb sprays.** Its shots come out at an angle taken from how long it has
been alive rather than from where you are, so the spray turns at a steady rate
and sweeps *through* you instead of following you. It is the opposite of an aimed
shot, and standing still is the only way to be hit by it.

**And the divers are not in the corridor yet.** Everything else arrives from the
right-hand edge, which is a rule rather than a habit: being killed by something
you were never shown is the one thing a shooter must not do. A diver breaks the
rule honestly. It hangs behind the plane of play — small, faint, growing, with a
ring closing in on it — drifting after whoever it means to surface beside. Then
it arrives, spends two seconds being as solid as anything else, and sinks back
out. While it is down there it cannot be shot and cannot hurt you, and once it
starts to leave it cannot be killed at all, so a diver you did not deal with in
its window is one that got away with it. What it costs you is the seconds you
spent watching it come up.

## The bosses

Each of the five does something that belongs to its own stage rather than to
bosses in general.

The **Gatekeeper** does what a gate does: its core sits behind a shutter that
opens for about two seconds in every four, which is almost exactly what a full
charge takes to build. Shots at a closed core hit armour. So the first boss in
the game teaches the gun — wind up while it is shut, spend it the moment it is
not — which is the whole point of putting it at the end of the stage you are
meant to be learning on.

The **Vertebra**'s body is solid, not decoration. On the stage where half of what
kills you is the rock, the boss is another wall that will not hold still.

The **Crucible** bolts new turrets into the walls while you fight it, which is
the foundry in one habit, and drops mines that stay where they land, because the
corridor has stopped for the fight.

The **Shoalmother** sends up divers, in the open stage that has the room for
them.

**The Core** is all of it: a shutter on a shorter cycle, seekers, a ring, and
divers arriving in the middle of it.

## The stages

Five of them — the approach, the spine, the foundry, the shoal and the core — and
then it starts again harder, for ever, because something has to eventually stop
the best player in the world.

Each stage opens with a wave or two with room around them and then fills up:
about eighteen seconds of air, and after that most of what the stage has. Every
lap of the five flies half the script again on top of that, mirrored across the
corridor so the second copy is a different problem rather than the same one
twice, and the quiet opening shrinks each lap. Firing rate and projectile speed
climb with it; enemy health climbs slowest, because more health makes a fight
longer rather than sharper. Measured with the game's own autopilot over five
seeds, hits taken per seventy-five seconds go 3.8 on stage 1-1, 7.0 on 1-2, 13.0
on 1-3 and 15.0 on 1-4.

Repairs are the one thing a later lap never hands out more of. Everything in them is written down: every wave,
every turret, every crystal, at a fixed mark in the corridor. That is a design
decision rather than a shortcut. A shooter of this kind is *learned*: you die at
the same place three times and the fourth time you are ready for it, and none of
that works if the corridor is different every run. It is also the only way the
score board can mean anything — two people racing a number have to have been
given the same problem.

The corridor itself is a ceiling and a floor, worked out from a handful of
keyframes by a pure function and cached. Flying into it costs you hull. A blue
bolt bounces off it. A fully charged beam does not care.

**The shoal is the exception.** Everywhere else the rock is half the problem and
decides where you are allowed to be; there it steps back almost out of the way —
219 world units of clear air at the narrowest point against 48 in the core — so
up and down costs you nothing and the whole stage is about what is in the air.
That is deliberate, and it is what makes room for the divers: something that
arrives out of the background instead of in from the edge needs somewhere to
arrive.

![The second stage, with the same ship still carrying what it found in the first](docs/screenshots/spine.png)

## What the picture is

The playfield is a fixed 480 by 270 world units on every machine, letterboxed
into whatever window it is given. This is the one place webtype does the opposite
of what [webracing](https://github.com/markclausing/webracing) does, which fits
its camera to the window: a wider window in a shooter means seeing an enemy
sooner, and a game where the size of your monitor decides whether you survive is
a game whose score board means nothing.

Almost everything bright is drawn twice — once wide and dim with `lighter`
blending, once narrow and pale on top. That is the whole trick behind the look. A
glow here is not a filter, it is a second, fatter copy of the same shape, and it
costs nothing.

## The score board

Ten per list, and there are seven lists: one player and two, three settings
each, plus online. Each row is a name, a score and how far it got — `3-2` is the
third stage on the second time round.

Kept in `localStorage`, so a browser on its own needs nothing. If a relay is
configured it also syncs: every board carries an id and a timestamp per row, two
boards merge without either winning by being loaded second, and a row that has
been round three devices does not turn into three rows.

The setting changes how much hull you start with, and hull is how far you get, so
each setting keeps its own list. So does playing with somebody: two ships against
the same corridor is a different problem, and a shared score would be a
comparison between two games.

![The board, after three runs](docs/screenshots/scores.png)

Getting onto it is announced in Discord, in the channel the four games share. The
post says which game is talking and links back to it, because a bare `142 300`
next to a football result is not something anybody could place. Only rows that
actually landed in the top ten are news, and the same run arriving from a second
device is not announced twice — that is worked out by comparing the board before
and after rather than by trusting what was posted.

## Online

Two people, one four-character code, one score.

It is lockstep with input delay, the same arrangement as the other three games.
Both machines run the identical deterministic simulation and send each other
nothing but a one-byte button mask per frame — never positions, never scores. The
input for a tick is sent a few ticks early so that it arrives before it is
needed; if it is late anyway the simulation waits rather than guessing, so the
two can never drift apart. Once a second each side hashes its whole state and
compares; a difference stops the run rather than letting two people play two
different games.

The delay tunes itself to the connection. Somebody closing their tab does not end
the run — their ship is handed nothing but zeroes, which both machines do
identically.

It needs a relay, because two browsers cannot find each other on their own. One
is already running at `webtype.vibecoach.workers.dev` and the published game
points at it, so the online mode and the shared board work out of the box.
`npm start` is a relay too, for playing on your own network; `worker/` is the
same thing as a Cloudflare Worker, which is two commands and a line in
`src/config.js`.

## Tests

```bash
npm test
```

Three of them, none of which opens a browser.

`tools/simtest.js` plays whole runs headlessly and checks the rules — that the
corridor never pinches shut, that the boss arena is open, that the script is in
the order it will actually be spawned in, that a tap is not a beam and a full
charge pierces, that the pod eats a shot that would have hit the ship, that four
shots arriving together cost one point of hull rather than four, that losing a
ship loses everything it was carrying, that the repairs are in the same places
whatever the seed, and that the same seed and the same buttons produce the same
run twice.

`tools/netcheck.js` starts the real relay, connects two real clients, plays a
real run between them and checks that both machines computed the same one — then
that a third player is turned away, that a message is stamped with the seat it
came from rather than the seat the sender claimed, that somebody leaving does not
stop the game, and that two boards posted from two devices come back as one.

`tools/sync-shared.js` checks the files this game shares with the other three are
still the same files.

Two more that are tools rather than tests: `tools/make-icons.js` draws the app
icons as PNGs with nothing but `zlib`, and `tools/screenshot.js` drives a
headless Chrome to retake the pictures in this file.

## Shared with the others

Seven files are byte-for-byte identical in websoccer, webtennis, webracing and
webtype: the input mask, the touch controls, the room protocol, the three-letter
name entry, the speech synthesiser, the maths and the WebSocket server. They are
shared by being the same file in four repositories rather than by a package,
because none of the four has a build step and none is going to get one for this —
and `npm test` fails on any of them the moment the copies drift apart.

What is *not* shared is anything that knows what game it is. The simulation, the
renderer, the sounds, the words and the score board are each game's own. A
scoreline, a lap time and a run are three different shapes, and pretending
otherwise would mean a shared file full of `if (shooter)`.

## The sound

Synthesised in the browser; there is no audio file anywhere in the repository. A
pulse wave carries the melody, a second one runs the arpeggio, a triangle plays
the bass and filtered noise does the drums.

**Six tracks — one for the menu and one for each stage** — and they play while
you are flying rather than only at the title. It is 8-bit techno rather than the
walking-bass arrangement the other three games use, and the difference is almost
entirely in two lines: a kick on every beat with a clap on two and four, and an
open hat on the offbeat eighths, which is the sound that makes a bar feel like it
is being pushed rather than counted. The bass runs in sixteenths for the same
reason. Each stage gets its own key, tempo and pulse width — the approach is the
slowest and roomiest, the foundry is the narrowest and most mechanical, the core
is the fastest and never resolves — so you can tell where you are with your eyes
shut. The track changes as you arrive, as a cut rather than a fade: it only
happens while the screen is holding still on a stage name, and a crossfade
between two tracks in different keys at different tempos sounds like a mistake.

The music has its own level and ducks under the game, because a chip track mixed
for a title screen buries the sound of being shot, and being shot is the one
thing you always have to hear.

The charge is the one sound that is a state rather than an event: a tone whose
pitch and brightness are how long you have been holding the button, running from
the moment you press it to the moment you let go. It is doing a job — it is how
you know the beam is ready without looking away from the corridor at the nose of
your own ship.

The voice is formant synthesis, the same file the other three games run. It says
four things.

## What is not there yet

- Four players. The relay hands out two seats and the simulation has room for
  two; the corridor was designed around them.
- More than five stages before the loop.
- A replay. The netcode already means a run is a seed and a list of button
  masks, so it is mostly a matter of writing them down.

## Licence

MIT. See [LICENSE](LICENSE).
