/**
 * hud.ts — tiny pub/sub bridge between the imperative game (src/game/) and the React HUD
 * (src/pages/Home.tsx). The game publishes discrete events; React subscribes once.
 */

export interface HudSnapshot {
  state: "title" | "playing" | "paused" | "gameover";
  /** true when the run ended in victory (state === "gameover" + won). */
  won: boolean;
  score: number;
  hi: number;
  /** data cores collected this run */
  data: number;
  /** quota for the current wave */
  target: number;
  wave: number;
  maxWave: number;
  integrity: number; // 0..100
  shield: boolean;
  boost: number; // seconds remaining, 0 = none
  combo: number; // current combo multiplier
  /** short-lived banner text ("WAVE 2", "SHIELD ONLINE", ...) */
  banner: string | null;
  muted: boolean;
}

type Listener = (hud: HudSnapshot) => void;

export const hudEvents = {
  _listeners: new Set<Listener>(),
  _last: null as HudSnapshot | null,

  publish(hud: HudSnapshot): void {
    this._last = hud;
    for (const fn of this._listeners) fn(hud);
  },

  subscribe(fn: Listener): () => void {
    this._listeners.add(fn);
    if (this._last) fn(this._last);
    return () => this._listeners.delete(fn);
  },
};
