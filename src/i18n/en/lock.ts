// English strings of the locks on props: chests, crates, levers, buttons (see game/propLocks.ts).
export const lockEn = {
  // the log
  "lock.locked": "It's locked.",
  "lock.unlocked": "You unlock the {what}.",
  "lock.keyUsedUp": "The key is used up.",
  // the Inspector's lock block
  "lock.title": "Lock",
  "lock.on": "Locked",
  "lock.onTitle": "The party cannot open or pull it until it has the key.",
  "lock.key": "Key",
  "lock.keyTitle": "The story flag that opens the lock: a key item picked up raises it (the item panel's \"Make it a key\"). Several locks, doors too, may share one key; a lock needs exactly one.",
  "lock.keyNone": "- none -",
  "lock.from.item": "item",
  "lock.from.action": "story",
  "lock.from.contents": "in a container",
  "lock.from.door": "a door's key",
  "lock.from.lock": "another lock's key",
  "lock.message": "Says",
  "lock.messageTitle": "What the party is told while it is shut.",
  "lock.consume": "Key used up",
  "lock.consumeTitle": "Opening it takes the key item away from the party (and the flag with it, if none is left).",
  "lock.create": "Create a key for this lock",
  "lock.createTitle": "Names a new key flag for this lock. Then put an item on the map and make it a key with that flag.",
  "lock.created": "Key flag: {flag}. Now put an item on the map and, in its panel, set its key flag to this.",
  "lock.nobody": "Nothing on the map raises this key: nobody can open this.",
  "lock.noKey": "Pick or create a key, or it never opens.",
  // the problem list
  "minimap.problem.lockNoKey": "The lock has no key: it never opens.",
  "minimap.problem.lockKeyNobody": "Nothing on this map raises the lock's key ({id}): nobody can open this.",
  "minimap.problem.lockNotLockable": "A {prop} cannot be locked (only containers, levers and buttons).",
} as const;
