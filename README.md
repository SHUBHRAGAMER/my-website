# SHUBHRA GAUTAM — secure terminal portfolio

A phosphor-on-black CRT terminal portfolio with a fully playable 3D arcade cabinet.

**Stack:** React 19 + TypeScript + Vite · Three.js (game + WebGL) · Space Mono · vite-plugin-pwa (installable, network-first pages)

## The game — ICE BREAKER: data vault run

You are a rogue process inside a corporate data vault. Collect data cores, chain combos,
and outrun the ICE before your integrity hits zero.

- **Move** WASD / arrows · **Camera** mouse drag (touch: left stick + right drag)
- **Start** Space / Enter · **Pause** Esc · **Restart** R (on the results screen)
- **Objective** hit the data quota across 3 waves — each wave sends more, faster ICE sentinels
- **Hazards** red firewall gates (timed on/off cycles — cross while they're live and you burn),
  ICE sentinels that chase inside their aggro radius
- **Pickups** SHIELD (absorbs one hit) · OVERCLOCK (speed ×1.55)
- **Scoring** cores build a ×1–×5 combo chain; finishing waves banks integrity as bonus points
- High score persists in `localStorage` (this device only)

### Systems

Fixed-timestep loop (60 Hz, render decoupled) · pooled instanced particles (500 cap, auto-degrade
below 45 fps) · patrol/chase sentinel AI · timed firewall phases with crossing detection ·
wave/quota difficulty curve · knockback + i-frames + camera shake · Web Audio synthesized SFX and
adaptive bass · six-state loop: title → playing ⇄ paused → victory/defeat → restart.

## The page

Terminal boot sequence (skippable) · matrix-rain canvas backdrop · CRT scanlines + notched viewport
frame · sticky session rail with live packet log · Tech Arsenal section (original site's skills) ·
**MUN Enthusiast & Chair** section · fully responsive (mobile-first, 4:5 cabinet screen in portrait).

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build → dist/ (tsc + vite + build-output verification)
npm run verify     # headless smoke test (needs a chromium with WebGL; see scripts/verify-game.mjs)
```

## Credits

- Space Mono (SIL OFL) via `@fontsource/space-mono`
- three.js (MIT) · React (MIT) · vite-plugin-pwa (MIT)
- PWA icons AI-generated (circuit padlock, phosphor green on black)
- Game/engine patterns from the bundled `game-3d` template (`src/game/engine|state|input|audio|storage`)
