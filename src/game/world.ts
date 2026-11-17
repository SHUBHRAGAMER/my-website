/**
 * world.ts — the data-vault arena: grid floor, boundary pillars, sweeping firewall gates.
 * Everything is parametric Three.js geometry (no external assets).
 */
import * as THREE from "three";

export const ARENA = {
  half: 20, // playable half-extent on x/z
  wallHeight: 3.2,
} as const;

const GATE_PERIOD = 5.2;
const GATE_ACTIVE = 2.4;
const GATE_WARN = 0.6;

export class FirewallGate {
  readonly group = new THREE.Group();
  readonly laser: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  /** 0 = inactive (safe), 1 = active (lethal wall), 0.5 = warning flicker */
  phase: 0 | 0.5 | 1 = 0;
  playerSide = 1;
  private prevSide = 1;
  private timer: number;

  constructor(
    readonly x: number,
    offset: number,
  ) {
    this.timer = offset;
    const span = ARENA.half * 2 + 2;
    const pillarGeo = new THREE.BoxGeometry(0.5, ARENA.wallHeight + 0.8, 0.5);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1a0d12,
      emissive: 0xff3b5c,
      emissiveIntensity: 0.55,
    });
    for (const z of [-span / 2, span / 2]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(0, (ARENA.wallHeight + 0.8) / 2, z);
      this.group.add(p);
    }
    const laserGeo = new THREE.PlaneGeometry(span, ARENA.wallHeight);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0xff3b5c,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.laser = new THREE.Mesh(laserGeo, laserMat);
    this.laser.rotation.y = Math.PI / 2; // wall spans the z axis, crossed along x
    this.laser.position.y = ARENA.wallHeight / 2;
    this.group.add(this.laser);
    this.group.position.x = x;
  }

  /** Advance the cycle; returns true if the player crossed this gate while active. */
  step(dt: number, time: number, playerX: number): boolean {
    this.timer -= dt;
    if (this.timer <= 0) this.timer += GATE_PERIOD;
    const activeLeft = GATE_ACTIVE - (GATE_PERIOD - this.timer);
    if (activeLeft > 0) this.phase = 1;
    else if (this.timer < GATE_WARN) this.phase = 0.5;
    else this.phase = 0;

    const m = this.laser.material;
    if (this.phase === 1) m.opacity = 0.5 + 0.2 * Math.sin(time * 24);
    else if (this.phase === 0.5) m.opacity = Math.sin(time * 30) > 0 ? 0.22 : 0.04;
    else m.opacity = Math.max(0, m.opacity - dt * 3);
    this.laser.visible = m.opacity > 0.015;

    this.prevSide = this.playerSide;
    this.playerSide = playerX >= this.x ? 1 : -1;
    return this.playerSide !== this.prevSide && this.phase === 1;
  }

  reset(): void {
    this.playerSide = 1;
    this.prevSide = 1;
  }
}

export class World {
  readonly scene = new THREE.Scene();
  readonly gates: FirewallGate[] = [];
  private readonly grid: THREE.GridHelper;
  private readonly stars: THREE.Points;
  private time = 0;

  constructor() {
    const scene = this.scene;
    scene.background = new THREE.Color(0x04070a);
    scene.fog = new THREE.FogExp2(0x04070a, 0.026);

    // vault floor — very dark plane for fog depth under the glowing grid
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.half * 2 + 30, ARENA.half * 2 + 30),
      new THREE.MeshBasicMaterial({ color: 0x03060a }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);

    // phosphor grid
    this.grid = new THREE.GridHelper(ARENA.half * 2, ARENA.half * 2, 0x00f48e, 0x0a3d28);
    const gridMat = this.grid.material as THREE.Material & { transparent: boolean; opacity: number };
    gridMat.transparent = true;
    gridMat.opacity = 0.55;
    scene.add(this.grid);

    // faint diamond ring marking the arena bound
    const bound = new THREE.Mesh(
      new THREE.RingGeometry(ARENA.half * 1.414 - 0.15, ARENA.half * 1.414 + 0.15, 4, 1),
      new THREE.MeshBasicMaterial({
        color: 0x00f48e,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    bound.rotation.x = -Math.PI / 2;
    bound.rotation.z = Math.PI / 4;
    bound.position.y = 0.01;
    scene.add(bound);

    // boundary pillars at corners + midpoints
    const postGeo = new THREE.BoxGeometry(0.4, ARENA.wallHeight, 0.4);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x0c1f16,
      emissive: 0x00f48e,
      emissiveIntensity: 0.8,
    });
    const h = ARENA.half;
    for (const [x, z] of [
      [-h, -h], [h, -h], [-h, h], [h, h], [0, -h], [0, h], [-h, 0], [h, 0],
    ]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, ARENA.wallHeight / 2, z);
      scene.add(post);
    }

    // drifting dust above the arena — cheap ambience
    const N = 260;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * (h + 8);
      pos[i * 3 + 1] = Math.random() * 9 + 0.5;
      pos[i * 3 + 2] = (Math.random() * 2 - 1) * (h + 8);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0x1f8f5f, size: 0.06, transparent: true, opacity: 0.8 }),
    );
    scene.add(this.stars);

    // firewall gates across three lanes (offset cycles so they never sync)
    for (const [x, offset] of [[-11, 2.2], [0, 0], [11, 3.6]] as const) {
      const g = new FirewallGate(x, offset);
      this.gates.push(g);
      scene.add(g.group);
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.stars.rotation.y += dt * 0.012;
    this.grid.position.y = Math.sin(this.time * 0.8) * 0.03;
  }

  get timeNow(): number {
    return this.time;
  }

  dispose(): void {
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        const m = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
  }
}

/** Pick a random arena position at least `minDist` from `avoid` (grid-snapped). */
export function randomArenaPos(out: THREE.Vector3, avoid?: THREE.Vector3, minDist = 5): THREE.Vector3 {
  const h = ARENA.half - 2;
  for (let tries = 0; tries < 12; tries++) {
    out.set(
      Math.round((Math.random() * 2 - 1) * h),
      0,
      Math.round((Math.random() * 2 - 1) * h),
    );
    if (!avoid || out.distanceTo(avoid) >= minDist) return out;
  }
  return out;
}
