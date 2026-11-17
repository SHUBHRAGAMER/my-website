/**
 * game.ts — ICEBREAKER: a data-vault heist. Orchestrates world, entities, state machine,
 * camera, HUD events, audio and the fixed-timestep loop.
 *
 * Core loop: title → playing ⇄ paused → gameover (victory or trace-out) → restart.
 */
import * as THREE from "three";
import { GameLoop } from "./engine";
import { GameStateMachine } from "./state";
import { Input } from "./input";
import { AudioSystem } from "./audio";
import { storage, highScore } from "./storage";
import { World } from "./world";
import { Player, Sentinels, Cores, Pickups, Particles, setYaw } from "./entities";
import { hudEvents } from "./hud";
import { QUALITY } from "./config";

const MAX_WAVE = 3;
const QUOTA = [0, 6, 8, 10]; // per-wave data targets
const SENTINELS = [0, 2, 3, 4];
const AGGRO = 9;
const BASE_SPEED = 8;
const IFRAMES = 1.1;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly loop: GameLoop;
  private readonly fsm = new GameStateMachine();
  private readonly input: Input;
  private readonly audio = new AudioSystem();
  private readonly world: World;
  private readonly player: Player;
  private readonly sentinels: Sentinels;
  private readonly cores: Cores;
  private readonly pickups: Pickups;
  private readonly particles: Particles;

  // run state
  private score = 0;
  private data = 0;
  private integrity = 100;
  private wave = 1;
  private combo = 1;
  private comboTimer = 0;
  private shield = false;
  private boostTimer = 0;
  private invuln = 0;
  private banner: string | null = null;
  private bannerTimer = 0;
  private won = false;
  private time = 0;
  private shake = 0;

  // camera rig
  private camYaw = 0;
  private camPitch = 0.32;
  private readonly camTarget = new THREE.Vector3();
  private titleAngle = 0;
  private disposed = false;

  // fps monitor (auto quality degrade)
  private fpsAcc = 0;
  private fpsN = 0;
  private lowTimer = 0;
  private degraded = false;

  /** When false (game scrolled out of view), gameplay keys are ignored. */
  inputActive = true;

  /** Page-driven: cabinet visibility gate for both game logic and key capture. */
  setInputActive(v: boolean): void {
    this.inputActive = v;
    this.input.captureKeys = v;
  }

  private readonly cGreen = new THREE.Color(0x00f48e);
  private readonly cRed = new THREE.Color(0xff3b5c);
  private readonly cAmber = new THREE.Color(0xffb347);
  private readonly cCyan = new THREE.Color(0x35c8ff);

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const rect = canvas.getBoundingClientRect();
    this.renderer.setSize(rect.width || 800, rect.height || 500, false);

    this.camera = new THREE.PerspectiveCamera(68, (rect.width || 800) / (rect.height || 500), 0.1, 120);

    this.world = new World();
    this.world.scene.add(new THREE.AmbientLight(0x2f5c46, 1.2));
    const key = new THREE.DirectionalLight(0x9dffc9, 0.7);
    key.position.set(6, 12, 4);
    this.world.scene.add(key);

    this.player = new Player(this.world.scene);
    this.sentinels = new Sentinels(this.world.scene);
    this.cores = new Cores(this.world.scene);
    this.pickups = new Pickups(this.world.scene);
    this.particles = new Particles(this.world.scene);

    this.input = new Input(canvas);

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.renderFrame(),
    });

    this.fsm.onChange((s, prev) => {
      if (s === "playing" && prev === "title") this.startRun();
      if (s === "gameover" && !this.won) this.audio.sfx("lose");
      this.pushHud();
    });

    this.resetArena();
    this.loop.start();
    this.pushHud();
  }

  /* ---------------- HUD ---------------- */

  private pushHud(): void {
    hudEvents.publish({
      state: this.fsm.state,
      won: this.won,
      score: this.score,
      hi: highScore.get(),
      data: this.data,
      target: QUOTA[this.wave] ?? QUOTA[MAX_WAVE],
      wave: this.wave,
      maxWave: MAX_WAVE,
      integrity: Math.max(0, Math.round(this.integrity)),
      shield: this.shield,
      boost: Math.max(0, this.boostTimer),
      combo: this.combo,
      banner: this.banner,
      muted: this.audio.muted,
    });
  }

  private showBanner(text: string, seconds = 2): void {
    this.banner = text;
    this.bannerTimer = seconds;
    this.pushHud();
  }

  /* ---------------- run lifecycle ---------------- */

  private resetArena(): void {
    this.cores.maintain(8, this.player.pos);
    this.sentinels.spawn(SENTINELS[this.wave], this.player.pos);
    this.pickups.clear();
  }

  private startRun(): void {
    this.score = 0;
    this.data = 0;
    this.integrity = 100;
    this.wave = 1;
    this.combo = 1;
    this.comboTimer = 0;
    this.shield = false;
    this.boostTimer = 0;
    this.invuln = 0;
    this.won = false;
    this.player.reset();
    this.cores.deactivateAll();
    for (const g of this.world.gates) g.reset();
    this.resetArena();
    this.audio.startMusic();
    this.showBanner("INFILTRATION STARTED — GRAB THE DATA", 2.4);
    this.audio.sfx("ui");
  }

  private endRun(won: boolean): void {
    this.won = won;
    if (won) {
      this.score += Math.round(this.integrity) * 5;
      this.audio.sfx("win");
    }
    if (this.score > highScore.get()) highScore.set(this.score);
    storage.set("lastScore", this.score);
    this.audio.stopMusic();
    this.fsm.transition("gameover");
  }

  nextWave(): void {
    if (this.wave >= MAX_WAVE) return;
    this.wave++;
    this.sentinels.spawn(SENTINELS[this.wave], this.player.pos);
    this.showBanner(`WAVE ${this.wave} — ICE REINFORCED`, 2.2);
    this.audio.sfx("alarm");
  }

  restart(): void {
    if (!this.fsm.is("gameover", "paused")) return;
    const from = this.fsm.state;
    this.fsm.transition("playing"); // gameover -> playing / paused -> playing
    if (from === "gameover") this.startRun(); // fresh run, not a resume
    this.pushHud();
  }

  toTitle(): void {
    if (this.fsm.is("paused", "gameover", "playing")) this.fsm.transition("title");
    this.audio.stopMusic();
    this.resetArena();
    this.pushHud();
  }

  togglePause(): void {
    if (this.fsm.is("playing")) {
      this.fsm.transition("paused");
      this.audio.stopMusic();
    } else if (this.fsm.is("paused")) {
      this.fsm.transition("playing");
      this.audio.startMusic();
    }
    this.audio.sfx("ui");
  }

  toggleMute(): void {
    this.audio.toggleMute();
    this.pushHud();
  }

  /* ---------------- update ---------------- */

  private update(dt: number): void {
    this.time += dt;
    this.world.update(dt);
    this.cores.spin(this.time);
    this.pickups.step(dt, this.time);
    this.particles.update(dt);

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.banner = null;
        this.pushHud();
      }
    }

    const st = this.fsm.state;
    if (st === "title") {
      this.titleAngle += dt * 0.12;
      this.cores.maintain(8, this.player.pos);
      this.sentinels.step(dt, this.player.pos, 0, 0, 1.6, this.time);
      return;
    }
    if (st === "paused" || st === "gameover") {
      if (this.fsm.is("gameover") && this.inputActive) {
        // R / Space restart shortcut on the results screen
        if (this.input.actions.has("KeyR") || this.input.actions.has("Space")) {
          this.input.actions.clear();
          this.restart();
        }
      }
      this.input.consumeLook();
      this.input.actions.clear();
      return;
    }

    // ---- playing ----
    this.camYaw += this.input.consumeLook().yaw;
    this.input.actions.clear();

    if (this.invuln > 0) this.invuln -= dt;
    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) this.pushHud();
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1;
        this.pushHud();
      }
    }

    const speed = BASE_SPEED * (this.boostTimer > 0 ? 1.55 : 1);
    setYaw(this.camYaw);
    this.player.step(dt, this.inputActive ? this.input.moveX : 0, this.inputActive ? this.input.moveZ : 0, speed, this.time);

    // engine trail
    if ((Math.abs(this.player.vel.x) + Math.abs(this.player.vel.z)) > 1 && Math.random() < 0.55) {
      this.particles.mote(this.player.pos.x, this.player.hover, this.player.pos.z, this.boostTimer > 0 ? this.cAmber : this.cGreen);
    }

    // firewall gates
    for (const g of this.world.gates) {
      if (g.step(dt, this.time, this.player.pos.x)) this.damage(16, this.player.pos.x - (g.x - this.player.pos.x), this.player.pos.z, "FIREWALL BREACH");
    }

    // sentinels
    const touch = this.sentinels.step(dt, this.player.pos, AGGRO, 4.6 + this.wave * 0.5, 1.8, this.time);
    if (touch) this.damage(22, touch.x, touch.z, "ICE CONTACT");

    // pickups
    this.pickups.maybeSpawn(dt, this.player.pos);
    const got = this.pickups.collect(this.player.pos);
    if (got === "shield") {
      this.shield = true;
      this.audio.sfx("shield");
      this.showBanner("SHIELD ONLINE — BLOCKS ONE HIT", 1.8);
      this.particles.burst(this.player.pos.x, 1, this.player.pos.z, this.cCyan, 24, 4);
    } else if (got === "overclock") {
      this.boostTimer = 5;
      this.audio.sfx("boost");
      this.showBanner("OVERCLOCK — SPEED x1.55", 1.8);
      this.particles.burst(this.player.pos.x, 1, this.player.pos.z, this.cAmber, 24, 4);
    }

    // data cores
    const corePos = this.cores.collect(this.player.pos);
    if (corePos) {
      this.data++;
      const chained = this.comboTimer > 0;
      this.combo = chained ? Math.min(5, this.combo + 1) : 1;
      this.comboTimer = 4;
      this.score += 100 * this.combo;
      this.audio.sfx("core");
      this.particles.burst(corePos.x, 1, corePos.z, this.cGreen, 26, 5);
      this.cores.maintain(8, this.player.pos);
      if (this.data >= (QUOTA[this.wave] ?? QUOTA[MAX_WAVE])) {
        if (this.wave >= MAX_WAVE) {
          this.endRun(true);
          return;
        }
        this.nextWave();
      }
      this.pushHud();
    }

    // camera follow
    this.updateCamera(dt);
    this.monitorPerf(dt);
  }

  private damage(amount: number, fromX: number, fromZ: number, label: string): void {
    if (this.invuln > 0 || this.fsm.state !== "playing") return;
    if (this.shield) {
      this.shield = false;
      this.invuln = IFRAMES;
      this.audio.sfx("shield");
      this.showBanner("SHIELD ABSORBED THE HIT", 1.6);
      this.particles.burst(this.player.pos.x, 1, this.player.pos.z, this.cCyan, 30, 6);
      this.pushHud();
      return;
    }
    this.integrity -= amount;
    this.invuln = IFRAMES;
    this.shake = 0.5;
    this.combo = 1;
    this.comboTimer = 0;
    this.player.applyKnockback(fromX, fromZ, 10);
    this.audio.sfx("hit");
    this.particles.burst(this.player.pos.x, 1, this.player.pos.z, this.cRed, 34, 7);
    this.showBanner(label, 1.4);
    if (this.integrity <= 0) {
      this.particles.burst(this.player.pos.x, 1, this.player.pos.z, this.cRed, 80, 9, 1.1);
      this.endRun(false);
      return;
    }
    this.pushHud();
  }

  private updateCamera(dt: number): void {
    const dist = 9.2;
    const height = 3.4 + Math.sin(this.camPitch) * 4;
    const tx = this.player.pos.x + Math.sin(this.camYaw) * dist * Math.cos(this.camPitch);
    const tz = this.player.pos.z + Math.cos(this.camYaw) * dist * Math.cos(this.camPitch);
    this.camTarget.set(tx, height, tz);
    this.camera.position.lerp(this.camTarget, Math.min(1, dt * 6));
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.7;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.7;
    }
    this.camera.lookAt(this.player.pos.x, 1.1, this.player.pos.z);
  }

  private monitorPerf(dt: number): void {
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc >= 1) {
      const fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
      if (!this.degraded && fps < QUALITY.DEGRADE_FPS) {
        this.lowTimer++;
        if (this.lowTimer >= 2) {
          this.degraded = true;
          this.particles.setBudget(QUALITY.PARTICLES_LOW);
          this.renderer.setPixelRatio(1);
        }
      } else {
        this.lowTimer = 0;
      }
    }
  }

  /* ---------------- render ---------------- */

  private renderFrame(): void {
    if (this.disposed) return;
    if (this.fsm.state === "title") {
      // slow orbital shot of the vault
      const r = 17;
      this.camera.position.set(Math.sin(this.titleAngle) * r, 7.5, Math.cos(this.titleAngle) * r);
      this.camera.lookAt(0, 0.8, 0);
    }
    this.renderer.render(this.world.scene, this.camera);
    window.__GAME_READY__ = true;
  }

  /** Player position — used by scripts/verify-game.mjs for direction assertions. */
  probePosition(): { x: number; y: number; z: number } {
    return { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z };
  }

  /** Called by the page when the canvas resizes. */
  resize(width: number, height: number): void {
    if (width < 2 || height < 2) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  /** DOM HUD buttons (start / resume / restart / title / mute). */
  handleControl(action: "start" | "resume" | "restart" | "title" | "mute"): void {
    switch (action) {
      case "start":
        if (this.fsm.is("title")) this.fsm.transition("playing");
        break;
      case "resume":
        if (this.fsm.is("paused")) this.togglePause();
        break;
      case "restart":
        this.restart();
        break;
      case "title":
        this.toTitle();
        break;
      case "mute":
        this.toggleMute();
        break;
    }
  }

  /** Keyboard actions forwarded by the page shell (start/pause shortcuts). */
  handleAction(code: string): void {
    if (!this.inputActive) return;
    if (code === "Escape") {
      this.togglePause();
      return;
    }
    if ((code === "Space" || code === "Enter") && this.fsm.is("title")) {
      this.fsm.transition("playing");
    }
  }

  dispose(): void {
    this.disposed = true;
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.particles.dispose();
    this.world.dispose();
    this.renderer.dispose();
    window.__GAME_READY__ = false;
    delete window.__gameProbe;
  }
}
