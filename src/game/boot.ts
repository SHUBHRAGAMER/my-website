/**
 * boot.ts — mounts ICEBREAKER onto the portfolio page's canvas and exposes the
 * startGame(canvas) / stopGame() contract used by src/pages/Home.tsx.
 */
import { Game } from "./game";

declare global {
  interface Window {
    /** Player-coordinate probe — scripts/verify-game.mjs asserts direction mapping through it. */
    __gameProbe?: () => { x: number; y: number; z: number };
    /** Readiness signal — the self-check waits for it before screenshotting/asserting. */
    __GAME_READY__?: boolean;
  }
}

let session: { dispose: () => void } | null = null;
let current: Game | null = null;

/** DOM HUD buttons reach the game through this (React shell → imperative game). */
export function control(action: "start" | "resume" | "restart" | "title" | "mute"): void {
  current?.handleControl(action);
}

/** The page disables gameplay keys while the cabinet is scrolled out of view. */
export function setInputActive(v: boolean): void {
  current?.setInputActive(v);
}

export function startGame(canvas: HTMLCanvasElement): void {
  stopGame();
  const game = new Game(canvas);
  current = game;

  window.__gameProbe = () => game.probePosition();

  const onKey = (e: KeyboardEvent) => {
    if (e.code === "Space" || e.code === "Enter" || e.code === "Escape") {
      game.handleAction(e.code);
    }
  };
  window.addEventListener("keydown", onKey);

  // keep the canvas sized to its container (the arcade cabinet panel)
  const ro = new ResizeObserver((entries) => {
    const r = entries[0]?.contentRect;
    if (r) game.resize(r.width, r.height);
  });
  ro.observe(canvas);

  session = {
    dispose: () => {
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
      game.dispose();
      if (current === game) current = null;
    },
  };
}

export function stopGame(): void {
  session?.dispose();
  session = null;
}
