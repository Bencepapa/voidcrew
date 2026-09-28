# Void Crew – combat design

The combat plan: how fights work, the ideas collected so far (some to keep,
some to shelve), what the engine needs for them and a suggested order to
build them in. See [TOOLS.md](TOOLS.md) for the asset pipeline.

## Core loop

- **Real time, free movement.** Outside of attacks the game runs in real
  time; enemies move, notice the party and shoot on their own schedule.
- **Crew actions.** Each of the four crewmates has a weapon or a tool with a
  cooldown. Clicking its button on the crewmate's card (or pressing 1–4)
  uses it – if it isn't cooling down and the crewmate is conscious.
- **Bullet time.** Using a weapon drops the world into slow motion (about
  10% speed) and locks movement while the player aims. Only that crewmate
  acts; when the action is resolved, time runs on and the weapon starts
  cooling down.
- **Chaining.** Right after one action, another crewmate whose weapon is
  ready can act at once – that's how combos are played (the hacker
  overloads a shield, the marine fires into it straight away).
- **Success is about order and aim, not reflexes.** Level 1 crews already
  have every combo; better gear only adds damage and steadiness.

## Aiming

1. **Pick a target and a body part.** The aiming overlay marks every enemy in
   sight and in range, with its body parts outlined on the sprite and a hit
   chance on each. Click a part, or cycle targets (Tab, ←/→) and parts
   (↑/↓, W/S); Enter/Space confirms, Esc cancels (no cooldown).
2. **The hit chance** comes from the real scene, not a table:
   - the weapon's accuracy, falling off with distance;
   - the part's size on screen – farther enemies are smaller targets;
   - cover – the fraction of the part that's visible past walls, crates and
     other enemies (rays from the camera to points on the part).
3. **Resolving the shot:**
   - **Mini-game off** (menu setting): the chance is rolled. A miss picks a
     spot near the part and the shot hits whatever is really there – the
     wall, a crate, another enemy.
   - **Mini-game on:** a crosshair sways around the chosen part on the real
     enemy, per the weapon (a sniper rifle barely, a welder a lot); fire
     when it's over the part. The shot goes where the crosshair is: the
     part, the part next to it, another enemy behind, the cover in front.
     It fires by itself after a few seconds. The sway steadies the longer
     the aim is held, and the view zooms per the weapon (Weapon.aimZoom).
4. **Weak spots.** Each part can have critical spots (a robot's optics and
   antenna, its reactor vent, elbow and knee joints), drawn red with a
   yellow rim on the highlighted part and placed per view column. A hit
   there multiplies the part's damage (CRIT_DAMAGE, ×2) on top of the
   part's own multiplier. The percentages cover the whole part; they are the
   real odds with the mini-game off and a guide with it on.
5. **Rapid fire.** A burst weapon (Weapon.burst, the pulse rifle for now:
   3 shots) runs the same mini-game once per round: each press fires one
   and restarts the auto-fire countdown.
   Each shot leaves a mark on the target until the burst ends (x: hit,
   o: miss). Cancelling after a shot still starts the cooldown.
6. **Shakes.** The sway settles the longer the aim is held, but every shot
   of a burst (recoil) and every hit the crew takes while aiming adds a
   jolt to it that fades over about a second.
7. **Enemies aim too.** An enemy's shot hits with its accuracy, falling off
   per cell, times the share of the party's body it can see: rays from the
   enemy to points on the party (three heights, both sides) that get past
   walls and props. Behind a crate at range, the odds drop a lot. The log
   shows the odds for now, for tuning.
8. **Enemy senses.** An enemy notices the party only ahead of it (a 120°
   field of view), within 5 cells and with a clear line between the cells'
   centres; once hunting, it tracks the party all round within 7 cells.
   The party's answer to their better sensors: the scanner (crew gear, a
   debug toggle for now) outlines enemies in view even in the dark.

### Per-role mini-games (later)

Adapted from abstract "swing bar" designs to aiming at real enemies:

| Role | Weapon | Mini-game |
| --- | --- | --- |
| Marine / gunner | rifle, laser | crosshair sway (above); the steadier the aim, the more damage (a centre hit crits) |
| Marine / gunner | autocannon, burst weapons | a rhythm around the target: the crosshair orbits the part and each press on the beat fires one round of the burst |
| Hacker | robot hacking | a short direction or code sequence to key in: perfect – the strongest effect (confuse: it shoots its allies, or its shield drops); partial – a short stun; failed – feedback (the hacker loses energy) |
| Medic | stim, medkit | stabilise: hold a marker inside a moving green band for a moment; the longer it stays, the more it heals |

## Crew

| Crewmate | Role | Weapon (first version) |
| --- | --- | --- |
| Reese | Marine | pulse rifle – steady, long range |
| Lyn | Engineer | arc welder – short range, heavy damage; later magnetic grenades |
| Orion | Android | shock emitter – light damage, stuns; later hacking |
| Kell | Medic | stim injector – heals the most wounded crewmate |

**Sniper rifle:** a weapon found on the ship, not a crewmate's own. Anyone
can carry it as a second weapon, but the android and the marine are the
best with it (steadier aim, more damage); it has a long cooldown.

## Enemies

- **Body parts** (robot): sensor/head – ×1.8 damage and a stun; core/torso
  – normal damage; weapon arms – less damage but disarms for a while (it
  can't shoot); legs – less damage but slows it down.
- Parts are rectangles on each sprite cell, set up in the actor editor
  (`?editor=actors`) next to the frame alignment.
- **AI (first version):** patrols; once it sees the party (the same grid
  sight as the lights) it turns hostile, closes in to its attack range and
  fires on its cooldown at a random conscious crewmate. Stunned: frozen;
  disarmed: can't fire; slowed: walks at half speed.
- **Later:** takes cover behind crates, retreats under suppressing fire or a
  grenade, flanks; mutants that rush in melee.

## Statuses and combos

Combos aren't scripted one by one: abilities leave statuses, and other
abilities do more against a status.

| Setup (first action) | Finisher (second action) | Result |
| --- | --- | --- |
| Engineer: magnetic grenade on a crate or behind a concrete block | Marine shoots the crate / block | shrapnel and a magnetic burst: area damage and a stun on everyone behind the cover |
| Hacker: shield overload | Sniper: headshot on the unshielded target | "conductive shot": the round goes through and the overload jumps to nearby robots (chain lightning) |
| Marine: suppressing fire (pinned) | Hacker: overloads the ceiling vent / plasma pipe above the enemy | pinned, it can't escape the gas or plasma falling on it |
| Marine: grenade or suppression drives it back | Hacker: shuts the security bulkhead behind it | it's locked in a section |
| (locked in) | anyone shoots the gas pipe / nitrogen tank in that section | the section floods; the enemy dies behind the closed door without a fight |

Statuses so far: **stunned**, **disarmed**, **slowed**, **pinned**
(suppressed: stays put), **overloaded** (shield down, conducts), **marked**.

## Environment

- **Destructible props:** props get hit points and a material. Explosive
  crates (area damage, stun), cover that wears away, glass that breaks.
- **Hackable fixtures:** ceiling vents and plasma pipes (a hazard dropped on
  whatever is below), security bulkheads (doors that shut and lock on
  command), lights (darkness).
- **Sections:** connected cells bounded by walls and closed doors – worked
  out on the grid. Gas, fire and vacuum spread through a section and stop
  at closed doors.
- **Hull breach (set piece, not a general mechanic):** a shot-out window
  vents the section: light enemies are dragged cell by cell toward the
  breach and blown out; the party is dragged and hurt unless a big crate
  stands between it and the breach; an emergency bulkhead seals the section
  after a few seconds. Shooting a window can be the player's own trick.

## Horror

- **Ambush around the corner:** a trigger cell on the map; turning the corner
  onto it makes a hidden enemy lunge into the party's face – a close-up
  sprite, a camera jolt, a sound – followed by an automatic bullet time so
  the player can react. Used rarely.
- Flickering lights, power cuts in a section, sounds from behind closed
  doors.

## Engine work needed

- **Game clock:** everything that happens in the world by itself (enemy
  moves and shots, cooldowns, animations) runs on one clock that can be
  slowed down; input and UI run in real time. *(in progress)*
- **Aiming overlay:** each frame, the targets in sight with their parts'
  screen rectangles and hit chances; shots are raycasts through the scene,
  checking the sprite's alpha, so they hit what's really at that pixel.
- **Hit zones** per sprite cell in the actor editor.
- **Feedback:** hit flash on the sprite, death fade, tracer and muzzle flash,
  impact sparks (decals), a red flash when the party is hit, damage numbers
  in the log.
- **Settings:** the aiming mini-game on/off; later difficulty (sway,
  bullet-time speed).

## Art needed

- Robot: attack, hit and death sprite sheets (death from one angle is
  enough, like Doom).
- Crew weapon icons for the action buttons.
- Effects: muzzle flashes, beams (welder, shock), sparks, explosions, gas.
- Explosive crate, gas pipe, vent, security bulkhead, broken-window decals.
- Mutant enemy (for melee and the ambush), with its close-up lunge frame.

## Suggested order

1. **Combat core** *(in progress)*
   - game clock and bullet time;
   - crew weapons with cooldowns on the crew cards, 1–4 keys;
   - aiming overlay on real enemies: targets, body parts, hit chance from
     distance, size and cover;
   - the crosshair mini-game (optional, menu setting) and the rolled
     fallback; misses hit whatever is there;
   - damage, part effects (stun, disarm, slow), death;
   - hostile robot AI: notice, close in, fire; the crew takes damage;
   - feedback: flash, fade, tracer, log.
2. **Hit zones in the actor editor**, and the robot's attack / hit / death
   sprites.
3. **Abilities and statuses:** grenade, suppressing fire (pinned), shield
   overload (hacker), heal with its mini-game; the first combos; per-role
   mini-games.
4. **Environment:** destructible and explosive props, hackable vents and
   pipes, security bulkheads, sections with gas.
5. **Horror and set pieces:** the corner ambush, lights going out, the hull
   breach.
6. **More enemies and AI:** cover, retreating, flanking, a melee mutant.
