// Game time: real time run at an adjustable rate, so combat can go into
// bullet time. Everything that moves in the world on its own (actors, their
// attacks, the crew's weapon cooldowns) is timed by it; the player's own
// input and the UI run in real time.

let realBase = performance.now();
let gameBase = 0;
let rate = 1;
let paused = false;

export const gameClock = {
  // ms of game time
  now(): number {
    return paused ? gameBase : gameBase + (performance.now() - realBase) * rate;
  },
  rate(): number {
    return paused ? 0 : rate;
  },
  // 1 = normal speed, 0.1 = bullet time
  setRate(next: number) {
    gameBase = gameClock.now();
    realBase = performance.now();
    rate = next;
  },
  setPaused(next: boolean) {
    if (paused === next) return;
    gameBase = gameClock.now();
    realBase = performance.now();
    paused = next;
  },
};
