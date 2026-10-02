import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAPS, START_MAP, cellAt, doorAt, doorCrossed, floorHeight, liftAt, liftDoorOf } from "./map";
import { DIR_VECTOR, behindOf, leftOf, rightOf, stepForward } from "./movement";
import { CLIMB_MS_PER_HEIGHT, jumpDown, passage } from "./heights";
import type { Direction, GameMap, Vec2, PropSpec } from "./types";
import { initialCrew } from "./crew";
import { variantOf } from "./variation";
import { rollLoot, stacksText } from "./items";
import type { ItemStack, LootSpill } from "./items";
import { PROP_TYPES, propHeight, propPlacement } from "./props";
import type { ShipMood } from "./variation";
import { ACTOR_TYPES, actorAt, createActors, partyHitChance, stepActors } from "./actors";
import type { ActorState } from "./actors";
import { gameClock } from "./clock";
import { AIM_TIME_RATE, applyHit, rollAmount } from "./combat";
import { crewWeapon } from "./meta";
import type { ShotResult } from "./combat";
import { cellKey, visibleCells } from "./visibility";

export interface LogEntry {
  id: number;
  text: string;
}

// A lift ride in progress (performance.now() times), for the viewport's
// effects: the cabin shakes and the shaft's lights sweep past. The next
// map is swapped in `swapAt` ms into it, while the cabin lights dip.
export interface LiftRide {
  start: number;
  duration: number;
  swapAt: number;
  up: boolean;
}

let logId = 0;

const DOOR_ANIM_MS = 450;
// roughly the walk to and from a ladder around the climb itself (the
// viewport's move duration)
const CLIMB_WALK_MS = 250;
// a lift ride: the door shuts, then the cabin travels
const LIFT_CLOSE_MS = 600;
const LIFT_RIDE_MS = 3600;
const LIFT_SWAP_AT = 1700;
// after a slow load, the cabin sits still this long before the doors open
const LIFT_SETTLE_MS = 700;

const BLOCKED_MESSAGES: Record<"wall" | "ledge" | "low" | "prop", string> = {
  wall: "A bulkhead blocks the way.",
  ledge: "The ledge is too high to climb.",
  low: "The passage is too low.",
  prop: "Something is in the way.",
};
// how often the actors take their next steps
const ACTOR_TICK_MS = 100;
// a lift door shuts this long after the last time someone passed through it
const LIFT_DOOR_CLOSE_MS = 15000;

export function doorCellKey(cell: Vec2): string {
  return `${cell.x},${cell.y}`;
}

// the direction from a cell to a neighbor
function directionTo(from: Vec2, to: Vec2): Direction | undefined {
  return (Object.keys(DIR_VECTOR) as Direction[]).find(
    (d) => from.x + DIR_VECTOR[d].x === to.x && from.y + DIR_VECTOR[d].y === to.y,
  );
}

export function useGameState() {
  // the deck as its map has it; `map` - what's played - is its variation
  // (see variation.ts), unless there's none (the editor shows everything)
  const [fullMap, setMap] = useState<GameMap>(START_MAP);
  const [variation, setVariation] = useState<{ seed: number; mood: ShipMood } | null>(null);
  const map = useMemo(
    () => (variation === null ? fullMap : variantOf(fullMap, variation.seed, variation.mood)),
    [fullMap, variation],
  );
  const mapRef = useRef(map);
  mapRef.current = map;
  const fullMapRef = useRef(fullMap);
  fullMapRef.current = fullMap;
  const variationRef = useRef(variation);
  variationRef.current = variation;
  // arriving in the lift, facing its door
  const [pos, setPos] = useState<Vec2>(map.start.cell);
  const [dir, setDir] = useState<Direction>(map.start.facing);
  // the height the party stands at: the cell's floor, or a bridge above it
  const [elevation, setElevation] = useState(() => floorHeight(map, map.start.cell.x, map.start.cell.y));
  const [crew, setCrew] = useState(initialCrew);
  const crewRef = useRef(crew);
  crewRef.current = crew;
  // when each crewmate's weapon is ready again (game time)
  const [readyAt, setReadyAt] = useState<number[]>(() => crew.map(() => 0));
  const readyAtRef = useRef(readyAt);
  readyAtRef.current = readyAt;
  // the crewmate aiming (bullet time), if any
  const [aim, setAim] = useState<{ crew: number } | null>(null);
  const aimRef = useRef(aim);
  // a shot of the current use is out (a burst's first, say)
  const aimFiredRef = useRef(false);
  aimRef.current = aim;
  // when the party was last hit (real time), for a red flash
  const [hurtAt, setHurtAt] = useState(0);
  // how much of the party each actor sees past cover (0..1, by actor id),
  // measured in the scene by the viewport; unmeasured: fully exposed
  const partyCoverRef = useRef(new Map<number, number>());
  // testing: hits never take a crewmate below 1 HP
  const immortalRef = useRef(false);
  const setImmortalCrew = useCallback((on: boolean) => {
    immortalRef.current = on;
  }, []);
  // testing: steps go anywhere on the map - through walls, doors, props
  // and actors
  const noclipRef = useRef(false);
  const setNoclip = useCallback((on: boolean) => {
    noclipRef.current = on;
  }, []);
  const [log, setLog] = useState<LogEntry[]>([
    { id: logId++, text: `You board the USV Horizon, ${START_MAP.name}.` },
  ]);
  const [openingDoor, setOpeningDoor] = useState<Vec2 | null>(null);
  // door cells whose panel is up, keyed "x,y" (see doorCellKey); doors stay
  // open once opened
  const [openDoors, setOpenDoors] = useState<ReadonlySet<string>>(() => new Set());
  // a lift is taking the party to another deck (from the button press until
  // the doors open there); `ride` is its travelling part
  const [inLift, setInLift] = useState(false);
  const [ride, setRide] = useState<LiftRide | null>(null);

  const pushLog = useCallback((text: string) => {
    setLog((prev) => [...prev.slice(-7), { id: logId++, text }]);
  }, []);

  // Lift doors close LIFT_DOOR_CLOSE_MS after the last passage: entering or
  // leaving the door cell (re)starts the countdown. It never closes on the
  // player - while they stand in the doorway it checks again shortly.
  const posRef = useRef(pos);
  posRef.current = pos;
  const elevationRef = useRef(elevation);
  elevationRef.current = elevation;
  const openDoorsRef = useRef(openDoors);
  openDoorsRef.current = openDoors;
  const prevPosRef = useRef(pos);
  const closeTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = closeTimers.current;
    const schedule = (cell: Vec2, delay: number) => {
      const key = doorCellKey(cell);
      clearTimeout(timers.get(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          const here = posRef.current;
          if (here.x === cell.x && here.y === cell.y) {
            schedule(cell, 1000);
            return;
          }
          if (!openDoorsRef.current.has(key)) return;
          setOpenDoors((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          pushLog("The lift door slides shut.");
        }, delay),
      );
    };
    for (const cell of [prevPosRef.current, pos]) {
      if (cellAt(map, cell.x, cell.y) === "door" && doorAt(map, cell.x, cell.y).kind === "lift") {
        schedule(cell, LIFT_DOOR_CLOSE_MS);
      }
    }
    prevPosRef.current = pos;
  }, [pos, map, pushLog]);
  useEffect(() => {
    const timers = closeTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  // the map whose scene the viewport has built and shows (see sceneReady);
  // nothing moves while the current one is still loading
  const readyMapRef = useRef<string | null>(null);
  // a lift arrival waiting for its deck to load
  const pendingArrivalRef = useRef<{ mapId: string; arrive: () => void } | null>(null);
  const sceneReady = useCallback((mapId: string) => {
    readyMapRef.current = mapId;
    const pending = pendingArrivalRef.current;
    if (pending?.mapId === mapId) {
      pendingArrivalRef.current = null;
      pending.arrive();
    }
  }, []);

  // no moving or turning until a ladder climb or a lift ride is over, or
  // while the map loads
  const busyUntilRef = useRef(0);
  const busy = () =>
    performance.now() < busyUntilRef.current || readyMapRef.current !== mapRef.current.id || aimRef.current !== null;

  // the deck's actors, reset with each deck; they walk on while the deck
  // is shown
  const [actors, setActors] = useState<ActorState[]>(() => createActors(map, gameClock.now()));
  const actorsRef = useRef(actors);
  actorsRef.current = actors;
  // the actors destroyed on this run (by variation, deck and index in the
  // deck's full map): they stay wrecks when the deck is come back to
  const killedRef = useRef(new Set<string>());
  const [kills, setKills] = useState(0);
  const actorKey = useCallback(
    (m: GameMap, id: number) => `${variationRef.current?.seed ?? 0}|${m.id}|actor ${(fullMapRef.current.actors ?? []).indexOf(m.actors?.[id] as never)}`,
    [],
  );
  const updateActors = useCallback(
    (next: ActorState[]) => {
      for (const a of next) {
        if (a.diedAt === null) continue;
        const key = actorKey(mapRef.current, a.id);
        if (!killedRef.current.has(key)) {
          killedRef.current.add(key);
          setKills(killedRef.current.size);
        }
      }
      actorsRef.current = next;
      setActors(next);
    },
    [actorKey],
  );
  useEffect(() => {
    const now = gameClock.now();
    updateActors(
      createActors(map, now).map((a) => (killedRef.current.has(actorKey(map, a.id)) ? { ...a, hp: 0, diedAt: now - 1e6 } : a)),
    );
  }, [map, updateActors, actorKey]);
  // the map editor: the world holds still (no enemies moving or firing)
  const frozenRef = useRef(false);
  const setWorldFrozen = useCallback((on: boolean) => {
    frozenRef.current = on;
  }, []);
  // the map editor: to another deck outright (no lift ride), at its start
  const enterMap = useCallback((to: GameMap) => {
    closeTimers.current.forEach((t) => clearTimeout(t));
    closeTimers.current.clear();
    prevPosRef.current = to.start.cell;
    readyMapRef.current = null;
    setMap(to);
    setPos(to.start.cell);
    setDir(to.start.facing);
    setElevation(floorHeight(to, to.start.cell.x, to.start.cell.y));
    setOpenDoors(new Set());
  }, []);
  // the map editor: the party moved along with everything on the map (the
  // grid grew or shrank at its north or west edge)
  const shiftParty = useCallback((dx: number, dy: number) => {
    setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
    prevPosRef.current = { x: prevPosRef.current.x + dx, y: prevPosRef.current.y + dy };
  }, []);
  // the map editor: the deck as edited, in place of the current one
  const replaceMap = useCallback((next: GameMap) => {
    if (next.id === mapRef.current.id) setMap(next);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      const m = mapRef.current;
      if (readyMapRef.current !== m.id || frozenRef.current) return;
      const { actors: next, attacks } = stepActors(
        m,
        actorsRef.current,
        gameClock.now(),
        posRef.current,
        (cell) => openDoorsRef.current.has(doorCellKey(cell)),
        elevationRef.current,
      );
      if (next !== actorsRef.current) updateActors(next);
      // their shots may land on a random conscious crewmate: the farther
      // and the better covered the party, the likelier they miss
      for (const attack of attacks) {
        const standing = crewRef.current.filter((c) => c.hp > 0);
        if (!standing.length) break;
        const attacker = next.find((a) => a.id === attack.actor);
        const name = attacker ? ACTOR_TYPES[attacker.type].name : "Something";
        const chance = attacker
          ? partyHitChance(ACTOR_TYPES[attacker.type], attack.distance, partyCoverRef.current.get(attacker.id) ?? 1)
          : 1;
        const odds = ` (${Math.round(chance * 100)}%)`;
        if (Math.random() >= chance) {
          pushLog(`${name} fires and misses${odds}.`);
          continue;
        }
        const victim = standing[Math.floor(Math.random() * standing.length)];
        const hp = Math.max(immortalRef.current ? Math.min(1, victim.hp) : 0, victim.hp - attack.damage);
        crewRef.current = crewRef.current.map((c) => (c.id === victim.id ? { ...c, hp } : c));
        setCrew(crewRef.current);
        setHurtAt(performance.now());
        pushLog(
          `${name} hits ${victim.name} for ${attack.damage}${odds}.` +
            (hp === 0 ? ` ${victim.name} goes down!` : ""),
        );
        if (crewRef.current.every((c) => c.hp === 0)) pushLog("The whole crew is down.");
      }
    }, ACTOR_TICK_MS);
    return () => clearInterval(timer);
  }, [pushLog, updateActors]);

  // Combat (see combat.ts): a crewmate uses their weapon - a heal at once, a
  // shot by aiming in bullet time (the aiming overlay resolves it)
  const endAim = useCallback(() => {
    gameClock.setRate(1);
    aimRef.current = null;
    setAim(null);
  }, []);
  // living enemies within a weapon's reach and in sight of the party
  const targetsInReach = useCallback((range: number) => {
    const here = posRef.current;
    const sight = visibleCells(mapRef.current, here.x, here.y, Math.ceil(range), (k) => openDoorsRef.current.has(k));
    return actorsRef.current.filter(
      (a) =>
        a.diedAt === null &&
        sight.has(cellKey(a.cell.x, a.cell.y)) &&
        Math.hypot(a.cell.x - here.x, a.cell.y - here.y) <= range,
    );
  }, []);
  const fireWeapon = useCallback(
    (index: number) => {
      const mate = crewRef.current[index];
      const weapon = mate && crewWeapon(mate.id);
      if (!weapon || aimRef.current || busy()) return;
      if (mate.hp === 0) {
        pushLog(`${mate.name} is down.`);
        return;
      }
      if (gameClock.now() < readyAtRef.current[index]) {
        pushLog(`${mate.name}'s ${weapon.name.toLowerCase()} isn't ready.`);
        return;
      }
      const cool = () => setReadyAt((prev) => prev.map((t, i) => (i === index ? gameClock.now() + weapon.cooldownMs : t)));
      if (weapon.kind === "heal") {
        const hurt = crewRef.current
          .filter((c) => c.hp > 0 && c.hp < c.maxHp)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (!hurt) {
          pushLog("Nobody needs patching up.");
          return;
        }
        const amount = Math.min(hurt.maxHp - hurt.hp, rollAmount(weapon.amount));
        crewRef.current = crewRef.current.map((c) => (c.id === hurt.id ? { ...c, hp: c.hp + amount } : c));
        setCrew(crewRef.current);
        pushLog(hurt.id === mate.id ? `${mate.name} takes a stim: +${amount} HP.` : `${mate.name} patches up ${hurt.name}: +${amount} HP.`);
        cool();
        return;
      }
      if (!targetsInReach(weapon.range ?? 1).length) {
        pushLog(`${mate.name}: no target in reach.`);
        return;
      }
      gameClock.setRate(AIM_TIME_RATE);
      aimRef.current = { crew: index };
      aimFiredRef.current = false;
      setAim({ crew: index });
    },
    [pushLog, targetsInReach],
  );
  // (a burst cut short still cools the weapon down)
  const cancelAim = useCallback(() => {
    const current = aimRef.current;
    if (!current) return;
    if (aimFiredRef.current) {
      const cooldown = crewWeapon(crewRef.current[current.crew].id)?.cooldownMs ?? 0;
      setReadyAt((prev) => prev.map((t, i) => (i === current.crew ? gameClock.now() + cooldown : t)));
    }
    endAim();
  }, [endAim]);
  // the aiming overlay's shot: what it hit (or didn't); the burst's last
  // one ends the aiming
  const resolveShot = useCallback(
    (result: ShotResult, last = true) => {
      const current = aimRef.current;
      if (!current) return;
      const mate = crewRef.current[current.crew];
      const weapon = crewWeapon(mate.id);
      if (!weapon) return;
      const now = gameClock.now();
      if (result.kind === "actor") {
        const target = actorsRef.current.find((a) => a.id === result.actor);
        if (target && target.diedAt === null) {
          const hit = applyHit(target, result.part, weapon, now, !!result.crit);
          const type = ACTOR_TYPES[target.type];
          updateActors(actorsRef.current.map((a) => (a.id === target.id ? hit.actor : a)));
          pushLog(
            `${mate.name} hits the ${(result.crit ?? type.parts[result.part].label).toLowerCase()}` +
              `${result.crit ? " (critical!)" : ""} for ${hit.damage}` +
              (hit.killed ? " - it's destroyed!" : hit.effect ? ` - ${hit.effect}.` : "."),
          );
        }
      } else {
        pushLog(`${mate.name} misses${result.hit === "nothing" ? "." : ` and hits the ${result.hit}.`}`);
      }
      aimFiredRef.current = true;
      if (!last) return;
      setReadyAt((prev) => prev.map((t, i) => (i === current.crew ? now + weapon.cooldownMs : t)));
      endAim();
    },
    [endAim, pushLog, updateActors],
  );
  // a new deck: no aiming carries over
  useEffect(() => {
    if (aimRef.current) endAim();
  }, [map, endAim]);

  const turnL = useCallback(() => {
    if (!busy()) setDir((d) => leftOf(d));
  }, []);
  const turnR = useCallback(() => {
    if (!busy()) setDir((d) => rightOf(d));
  }, []);

  const startOpening = useCallback(
    (cell: Vec2) => {
      const m = mapRef.current;
      pushLog(doorAt(m, cell.x, cell.y).kind === "lift" ? "The lift door slides open." : "The door slides open.");
      setOpeningDoor(cell);
      setOpenDoors((prev) => new Set(prev).add(doorCellKey(cell)));
    },
    [pushLog],
  );

  // Takes the lift the party stands in to its other deck: shuts the door,
  // rides (the next map is swapped in mid-ride, behind the closed door),
  // turns to the door there and opens it.
  const startLift = useCallback(() => {
    const from = mapRef.current;
    const cabin = posRef.current;
    const lift = liftAt(from, cabin);
    if (!lift || busy() || openingDoor) return;
    const to = MAPS[lift.to];
    const arrival = to?.lifts?.find((l) => l.to === from.id) ?? to?.lifts?.[0];
    if (!to || !arrival) {
      pushLog("The lift panel stays dark.");
      return;
    }
    const up = to.deck < from.deck;
    busyUntilRef.current = performance.now() + LIFT_CLOSE_MS + LIFT_RIDE_MS + DOOR_ANIM_MS;
    setInLift(true);
    pushLog(`You call the lift ${up ? "up" : "down"} to ${to.name}.`);

    const door = liftDoorOf(from, cabin);
    if (door && openDoorsRef.current.has(doorCellKey(door.cell))) {
      setOpenDoors((prev) => {
        const next = new Set(prev);
        next.delete(doorCellKey(door.cell));
        return next;
      });
    }

    setTimeout(() => {
      setRide({ start: performance.now(), duration: LIFT_RIDE_MS, swapAt: LIFT_SWAP_AT, up });
    }, LIFT_CLOSE_MS);

    setTimeout(() => {
      // the old deck's lift door timers mean nothing on the new one
      closeTimers.current.forEach((t) => clearTimeout(t));
      closeTimers.current.clear();
      prevPosRef.current = arrival.cell;
      readyMapRef.current = null;
      setMap(to);
      setPos(arrival.cell);
      setElevation(floorHeight(to, arrival.cell.x, arrival.cell.y));
      setOpenDoors(new Set());
    }, LIFT_CLOSE_MS + LIFT_SWAP_AT);

    // arrive when the ride is over and the deck has loaded (its loading
    // screen gone for a moment)
    // (the door stays shut until the party opens it)
    const arrive = () => {
      setRide(null);
      setInLift(false);
      busyUntilRef.current = 0;
      pushLog(`The lift arrives at ${to.name}.`);
      const arrivalDoor = liftDoorOf(to, arrival.cell);
      const facing = arrivalDoor && directionTo(arrival.cell, arrivalDoor.cell);
      if (facing) setDir(facing);
    };
    setTimeout(() => {
      if (readyMapRef.current === to.id) arrive();
      else pendingArrivalRef.current = { mapId: to.id, arrive: () => setTimeout(arrive, LIFT_SETTLE_MS) };
    }, LIFT_CLOSE_MS + LIFT_RIDE_MS);
  }, [openingDoor, pushLog]);

  // steps one cell in `moveDir` while keeping the current facing
  const step = useCallback((moveDir: Direction) => {
    if (openingDoor || busy()) return;

    const next = stepForward(pos, moveDir);
    const target = cellAt(map, next.x, next.y);

    if (noclipRef.current) {
      if (next.x < 0 || next.y < 0 || next.x >= map.width || next.y >= map.height) return;
      setPos(next);
      if (target !== "wall") setElevation(floorHeight(map, next.x, next.y));
      return;
    }

    // pressing against a lift's button wall pushes the button
    if (target === "wall" && moveDir === dir && liftAt(map, pos)?.button === moveDir) {
      startLift();
      return;
    }

    const way = passage(map, pos, elevation, next, moveDir);
    if (way.kind === "blocked") {
      pushLog(BLOCKED_MESSAGES[way.reason]);
      return;
    }
    // (one on the floor under a bridge isn't in the way on its deck)
    const blocker = actorAt(
      actorsRef.current.filter((a) => !ACTOR_TYPES[a.type].passive),
      next,
      gameClock.now(),
      way.y,
    );
    if (blocker) {
      pushLog(`${ACTOR_TYPES[blocker.type].name} blocks the way.`);
      return;
    }
    if (way.kind === "drop") pushLog(way.height > 0.5 ? "You jump down." : "You hop down.");
    if (way.kind === "climb") {
      // up only facing the ladder; down either way (backing down it faces
      // the ladder, like climbing down a real one)
      if (way.up && moveDir !== dir) {
        pushLog("Face the ladder to climb it.");
        return;
      }
      pushLog(way.up ? "You climb up the ladder." : "You climb down the ladder.");
      busyUntilRef.current = performance.now() + CLIMB_MS_PER_HEIGHT * way.height + CLIMB_WALK_MS;
    }

    // a shut door on the way (in the next cell, or this one's far side)
    const door = doorCrossed(map, pos, next);
    if (door && !openDoors.has(doorCellKey(door))) {
      startOpening(door);
      setTimeout(() => {
        setPos(next);
        setElevation(way.y);
        setOpeningDoor(null);
      }, DOOR_ANIM_MS);
      return;
    }

    setPos(next);
    setElevation(way.y);
  }, [pos, dir, elevation, map, pushLog, openingDoor, openDoors, startOpening, startLift]);

  const moveForward = useCallback(() => step(dir), [step, dir]);
  const moveBackward = useCallback(() => step(behindOf(dir)), [step, dir]);

  // The run's haul: how many of each item the party has taken (see
  // items.ts); the containers emptied and the loose items picked up (by
  // variation, deck and index in the deck's full map - a variation leaves
  // some out); and the spills the view shows
  const [haul, setHaul] = useState<Readonly<Record<string, number>>>({});
  const [looted, setLooted] = useState<ReadonlySet<string>>(() => new Set());
  const [spills, setSpills] = useState<LootSpill[]>([]);
  const spillIdRef = useRef(0);
  const lootKey = useCallback(
    (kind: "prop" | "item", index: number) => `${variation?.seed ?? 0}|${fullMap.id}|${kind === "item" ? "item " : ""}${index}`,
    [variation, fullMap.id],
  );
  const addToHaul = useCallback((stacks: ItemStack[]) => {
    if (!stacks.length) return;
    setHaul((h) => {
      const next = { ...h };
      for (const s of stacks) next[s.item] = (next[s.item] ?? 0) + s.count;
      return next;
    });
  }, []);
  // a container's contents: put in by hand, or rolled from its table
  const lootOf = useCallback(
    (spec: PropSpec) => {
      const key = lootKey("prop", (fullMap.props ?? []).indexOf(spec));
      if (looted.has(key)) return { key, items: [] as ItemStack[] };
      const table = PROP_TYPES[spec.prop]?.container;
      return { key, items: spec.loot ?? (table ? rollLoot(table, key) : []) };
    },
    [fullMap, lootKey, looted],
  );
  // the indices (in the played map) of the containers emptied and the loose
  // items taken, for the view
  const lootedProps = useMemo(
    () => new Set((map.props ?? []).flatMap((p, i) => (looted.has(lootKey("prop", (fullMap.props ?? []).indexOf(p))) ? [i] : []))),
    [map, fullMap, looted, lootKey],
  );
  const takenItems = useMemo(
    () => new Set((map.items ?? []).flatMap((it, i) => (looted.has(lootKey("item", (fullMap.items ?? []).indexOf(it))) ? [i] : []))),
    [map, fullMap, looted, lootKey],
  );
  // within reach: in the party's cell (and with `ahead`, the one it faces),
  // on the surface it stands on
  const inReach = useCallback(
    (cell: Vec2, ahead: boolean) => {
      const front = { x: pos.x + DIR_VECTOR[dir].x, y: pos.y + DIR_VECTOR[dir].y };
      return (
        ((cell.x === pos.x && cell.y === pos.y) || (ahead && cell.x === front.x && cell.y === front.y)) &&
        Math.abs(floorHeight(map, cell.x, cell.y) - elevation) <= 0.25 + 1e-6
      );
    },
    [map, pos, dir, elevation],
  );
  // takes the loose items within reach (not yet taken): the haul gets them,
  // the view draws them in; false if there were none
  const pickUpItems = useCallback(
    (ahead: boolean) => {
      const found = (map.items ?? []).filter(
        (it) => inReach(it.cell, ahead) && !looted.has(lootKey("item", (fullMap.items ?? []).indexOf(it))),
      );
      if (!found.length) return false;
      const stacks = found.map((it) => ({ item: it.item, count: it.count ?? 1 }));
      pushLog(`You pick up ${stacksText(stacks)}.`);
      addToHaul(stacks);
      setLooted((prev) => new Set([...prev, ...found.map((it) => lootKey("item", (fullMap.items ?? []).indexOf(it)))]));
      return true;
    },
    [map, fullMap, inReach, looted, lootKey, pushLog, addToHaul],
  );
  // stepping into a cell picks up what lies there
  const pickUpRef = useRef(pickUpItems);
  pickUpRef.current = pickUpItems;
  useEffect(() => {
    // (not while the map is being edited - no variation is played then:
    // the editor walks over what lies about)
    if (variationRef.current === null) return;
    pickUpRef.current(false);
  }, [pos, elevation, map.id]);

  // Use: whatever is in front of the party - a lift's button, or the
  // containers within reach: everything in them spills out and goes into
  // the haul (and loose items there)
  const use = useCallback(() => {
    if (liftAt(map, pos)?.button === dir) {
      startLift();
      return;
    }
    const containers = (map.props ?? []).filter((p) => PROP_TYPES[p.prop]?.container && inReach(p.cell, true));
    const picked = pickUpItems(true);
    // wrecks within reach, not searched yet: their parts
    const wrecks = actorsRef.current.filter(
      (a) => a.diedAt !== null && ACTOR_TYPES[a.type].loot && inReach(a.cell, true) && !looted.has(`${actorKey(map, a.id)} wreck`),
    );
    if (wrecks.length) {
      const parts = new Map<string, number>();
      const wreckSpills: LootSpill[] = [];
      for (const a of wrecks) {
        const items = rollLoot(ACTOR_TYPES[a.type].loot!, actorKey(map, a.id));
        for (const s of items) parts.set(s.item, (parts.get(s.item) ?? 0) + s.count);
        if (items.length) wreckSpills.push({ id: ++spillIdRef.current, from: { x: a.cell.x, y: a.y + 0.2, z: a.cell.y }, floorY: a.y, items });
      }
      const stacks = [...parts].map(([item, count]) => ({ item, count }));
      pushLog(stacks.length ? `You salvage ${stacksText(stacks)} from the wreck.` : "You search the wreck: nothing worth taking.");
      addToHaul(stacks);
      setSpills((prev) => [...prev.slice(-8), ...wreckSpills]);
      setLooted((prev) => new Set([...prev, ...wrecks.map((a) => `${actorKey(map, a.id)} wreck`)]));
      if (!containers.length) return;
    }
    if (!containers.length) {
      // a way off the ship underfoot
      const exit = (map.exits ?? []).find((e) => inReach(e.cell, false));
      if (exit) {
        setRunEnd({ exit: exit.name ?? "the airlock", at: gameClock.now() });
        return;
      }
      if (!picked) pushLog("There's nothing to use here.");
      return;
    }
    const taken = new Map<string, number>();
    const keys: string[] = [];
    const newSpills: LootSpill[] = [];
    for (const spec of containers) {
      const { key, items } = lootOf(spec);
      keys.push(key);
      for (const s of items) taken.set(s.item, (taken.get(s.item) ?? 0) + s.count);
      if (items.length) {
        const at = propPlacement(spec);
        const floor = floorHeight(map, spec.cell.x, spec.cell.y) + (spec.elevation ?? 0);
        newSpills.push({
          id: ++spillIdRef.current,
          from: { x: at.x, y: floor + propHeight(map, spec), z: at.z },
          floorY: floorHeight(map, spec.cell.x, spec.cell.y),
          items,
        });
      }
    }
    const stacks = [...taken].map(([item, count]) => ({ item, count }));
    const what = containers.length > 1 ? "the containers" : `the ${PROP_TYPES[containers[0].prop].container === "crate" ? "crate" : "container"}`;
    if (!stacks.length) {
      const emptied = keys.every((k) => looted.has(k));
      pushLog(emptied ? `You've emptied ${what} already.` : `You search ${what}: nothing.`);
    } else {
      pushLog(`You take ${stacksText(stacks)} from ${what}.`);
      addToHaul(stacks);
      setSpills((prev) => [...prev.slice(-8), ...newSpills]);
    }
    setLooted((prev) => new Set([...prev, ...keys]));
  }, [map, pos, dir, startLift, pushLog, inReach, pickUpItems, lootOf, looted, addToHaul, actorKey]);

  // The run: it ends when the party leaves the ship through an exit (see
  // ExitSpec); what it hauled then goes to the stash, and the next run
  // starts clean - nothing taken, nobody destroyed, the crew patched up.
  const [runEnd, setRunEnd] = useState<{ exit: string; at: number } | null>(null);
  const [runStart, setRunStart] = useState(() => gameClock.now());
  const [stash, setStash] = useState<Readonly<Record<string, number>>>({});
  const nextRun = useCallback(() => {
    setStash((s) => {
      const next = { ...s };
      for (const [item, count] of Object.entries(haul)) next[item] = (next[item] ?? 0) + count;
      return next;
    });
    setHaul({});
    setLooted(new Set());
    setSpills([]);
    killedRef.current = new Set();
    setKills(0);
    setCrew(initialCrew);
    setRunStart(gameClock.now());
    setRunEnd(null);
  }, [haul]);
  // standing on a way out says so
  const exitHere = (map.exits ?? []).find((e) => e.cell.x === pos.x && e.cell.y === pos.y);
  const exitName = exitHere ? (exitHere.name ?? "An airlock") : null;
  useEffect(() => {
    if (exitName) pushLog(`${exitName}: Use (Space) to leave the ship.`);
  }, [exitName, pushLog]);

  // a touched (clicked, tapped) interactive decal
  const touch = useCallback(
    (action: string) => {
      if (action === "lift" && liftAt(map, pos)) startLift();
    },
    [map, pos, startLift],
  );

  // off a bridge, down onto the floor below it (null: not on one)
  const jump = useMemo(() => {
    const fall = jumpDown(map, pos, elevation);
    if (fall === null) return null;
    return () => {
      if (openingDoor || busy()) return;
      pushLog("You jump down from the bridge.");
      setElevation(floorHeight(map, pos.x, pos.y));
    };
  }, [map, pos, elevation, openingDoor, pushLog]);

  // free movement: the continuous pose drives the grid state (nearest cell,
  // facing and the surface underfoot), which the minimap and door logic read
  const syncPose = useCallback((cell: Vec2, facing: Direction, height: number) => {
    setPos((p) => (p.x === cell.x && p.y === cell.y ? p : cell));
    setDir(facing);
    setElevation(height);
  }, []);

  // free movement: bumping into a closed door opens it
  const openDoorAt = useCallback(
    (cell: Vec2) => {
      if (openingDoor || openDoors.has(doorCellKey(cell))) return;
      startOpening(cell);
      setTimeout(() => setOpeningDoor(null), DOOR_ANIM_MS);
    },
    [openingDoor, openDoors, startOpening],
  );

  // dev-only: jump anywhere from the console, e.g. __voidcrewTeleport(6, 3, "S")
  const touchRef = useRef(touch);
  touchRef.current = touch;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, {
      // `height`: stand on a bridge instead of the floor
      __voidcrewTeleport: (x: number, y: number, facing: Direction, height?: number) => {
        setPos({ x, y });
        setDir(facing);
        setElevation(height ?? floorHeight(mapRef.current, x, y));
      },
      __voidcrewPos: () => ({ ...posRef.current, map: mapRef.current.id }),
      __voidcrewActors: () => actorsRef.current,
      __voidcrewTouch: (action: string) => touchRef.current(action),
      // stops (or restarts) the actors, e.g. for comparing screenshots
      __voidcrewFreeze: (on: boolean) => (frozenRef.current = on),
      // kills an actor at once (to see it fall)
      __voidcrewKill: (id: number) =>
        updateActors(actorsRef.current.map((a) => (a.id === id ? { ...a, hp: 0, diedAt: gameClock.now() } : a))),
      // hits an actor for some damage (to see it react)
      __voidcrewHit: (id: number, damage = 1) =>
        updateActors(
          actorsRef.current.map((a) => {
            if (a.id !== id || a.diedAt !== null) return a;
            const hp = Math.max(0, a.hp - damage);
            return { ...a, hp, hitAt: gameClock.now(), diedAt: hp ? null : gameClock.now() };
          }),
        ),
      // plays an edited version of the deck (e.g. from the map store)
      __voidcrewReplaceMap: (next: GameMap) => replaceMap(next),
    });
  }, []);

  return {
    map,
    haul,
    lootedProps,
    takenItems,
    spills,
    kills,
    runEnd,
    runStart,
    stash,
    nextRun,
    pos,
    dir,
    actors,
    readyAt,
    aim,
    hurtAt,
    partyCoverRef,
    fireWeapon,
    cancelAim,
    resolveShot,
    setImmortalCrew,
    setNoclip,
    setWorldFrozen,
    replaceMap,
    enterMap,
    shiftParty,
    setVariation,
    elevation,
    jumpDown: jump,
    use,
    touch,
    inLift,
    ride,
    crew,
    log,
    moveForward,
    moveBackward,
    turnL,
    turnR,
    pushLog,
    openingDoor,
    openDoors,
    sceneReady,
    syncPose,
    openDoorAt,
  };
}
