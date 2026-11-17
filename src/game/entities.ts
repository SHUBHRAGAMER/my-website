/**
 * entities.ts — pooled game entities: player drone, ICE sentinels, data cores, pickups,
 * and one InstancedMesh particle system. Zero allocation in the hot loop.
 */
import * as THREE from "three";
import { ARENA, randomArenaPos } from "./world";

/* ------------------------------------------------------------------ */
/* Particles                                                           */
/* ------------------------------------------------------------------ */

const PARTICLE_CAP = 500;

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly px = new Float32Array(PARTICLE_CAP * 3);
  private readonly vx = new Float32Array(PARTICLE_CAP * 3);
  private readonly life = new Float32Array(PARTICLE_CAP);
  private readonly maxLife = new Float32Array(PARTICLE_CAP);
  private readonly col = new Float32Array(PARTICLE_CAP * 3);
  private head = 0;
  private budget = PARTICLE_CAP;
  private readonly dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, PARTICLE_CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < PARTICLE_CAP; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, new THREE.Color(0x00f48e));
    }
    scene.add(this.mesh);
  }

  setBudget(n: number): void {
    this.budget = Math.min(n, PARTICLE_CAP);
  }

  burst(x: number, y: number, z: number, color: THREE.Color, count: number, speed: number, life = 0.7): void {
    const n = Math.min(count, this.budget);
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % PARTICLE_CAP;
      const i3 = i * 3;
      this.px[i3] = x; this.px[i3 + 1] = y; this.px[i3 + 2] = z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.vx[i3] = Math.cos(a) * Math.cos(b) * s;
      this.vx[i3 + 1] = Math.sin(b) * s * 0.6 + 0.8;
      this.vx[i3 + 2] = Math.sin(a) * Math.cos(b) * s;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.7);
      this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
    }
  }

  /** A single drifting mote (engine trail) — cheaper than a burst. */
  mote(x: number, y: number, z: number, color: THREE.Color): void {
    const i = this.head;
    this.head = (this.head + 1) % PARTICLE_CAP;
    const i3 = i * 3;
    this.px[i3] = x; this.px[i3 + 1] = y; this.px[i3 + 2] = z;
    this.vx[i3] = (Math.random() - 0.5) * 0.4;
    this.vx[i3 + 1] = 0.4 + Math.random() * 0.6;
    this.vx[i3 + 2] = (Math.random() - 0.5) * 0.4;
    this.life[i] = this.maxLife[i] = 0.5;
    this.col[i3] = color.r; this.col[i3 + 1] = color.g; this.col[i3 + 2] = color.b;
  }

  update(dt: number): void {
    const zeroScale = 0.0001;
    for (let i = 0; i < PARTICLE_CAP; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.setScalar(zeroScale);
      } else {
        this.px[i3] += this.vx[i3] * dt;
        this.px[i3 + 1] += this.vx[i3 + 1] * dt;
        this.px[i3 + 2] += this.vx[i3 + 2] * dt;
        this.vx[i3 + 1] -= 1.6 * dt;
        const t = this.life[i] / this.maxLife[i];
        this.dummy.position.set(this.px[i3], this.px[i3 + 1], this.px[i3 + 2]);
        this.dummy.scale.setScalar(Math.max(0.05, t));
      }
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      if (this.life[i] > 0) this.mesh.setColorAt(i, _color.setRGB(this.col[i3], this.col[i3 + 1], this.col[i3 + 2]));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const _color = new THREE.Color();

/* ------------------------------------------------------------------ */
/* Player drone                                                        */
/* ------------------------------------------------------------------ */

export class Player {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3(0, 0, 14);
  readonly vel = new THREE.Vector3();
  /** knockback impulse, decays fast */
  private readonly knock = new THREE.Vector3();
  hover = 0;
  private readonly core: THREE.Mesh;
  private readonly wings: THREE.Mesh;
  private readonly light: THREE.PointLight;

  constructor(scene: THREE.Scene) {
    const coreGeo = new THREE.OctahedronGeometry(0.42);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x0b241a,
      emissive: 0x00f48e,
      emissiveIntensity: 2.2,
      roughness: 0.3,
      metalness: 0.6,
    });
    this.core = new THREE.Mesh(coreGeo, coreMat);
    this.group.add(this.core);

    const wingGeo = new THREE.BoxGeometry(1.5, 0.08, 0.4);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x0d3a26,
      emissive: 0x00f48e,
      emissiveIntensity: 0.7,
    });
    this.wings = new THREE.Mesh(wingGeo, wingMat);
    this.wings.position.y = -0.08;
    this.group.add(this.wings);

    this.light = new THREE.PointLight(0x00f48e, 14, 14, 1.8);
    this.light.position.y = 0.6;
    this.group.add(this.light);

    this.group.position.copy(this.pos);
    scene.add(this.group);
  }

  applyKnockback(fromX: number, fromZ: number, power: number): void {
    const dx = this.pos.x - fromX;
    const dz = this.pos.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    this.knock.x += (dx / len) * power;
    this.knock.z += (dz / len) * power;
  }

  /** moveX/moveZ are camera-relative input axes; speed in units/sec. */
  step(dt: number, moveX: number, moveZ: number, speed: number, time: number): void {
    const sin = Math.sin(_yaw), cos = Math.cos(_yaw);
    // forward = camera facing (-z at yaw 0); right = +x
    const ax = moveX * cos - moveZ * sin;
    const az = -moveX * sin - moveZ * cos;

    this.vel.x += (ax * speed - this.vel.x) * Math.min(1, dt * 8);
    this.vel.z += (az * speed - this.vel.z) * Math.min(1, dt * 8);

    this.pos.x += (this.vel.x + this.knock.x) * dt;
    this.pos.z += (this.vel.z + this.knock.z) * dt;
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 5));

    const h = ARENA.half - 0.6;
    this.pos.x = Math.max(-h, Math.min(h, this.pos.x));
    this.pos.z = Math.max(-h, Math.min(h, this.pos.z));

    this.hover = 0.9 + Math.sin(time * 2.4) * 0.12;
    this.group.position.set(this.pos.x, this.hover, this.pos.z);

    // bank into movement + always face travel direction
    this.group.rotation.y = Math.atan2(this.vel.x, this.vel.z);
    this.group.rotation.z = THREE.MathUtils.clamp(-this.vel.x * 0.03, -0.4, 0.4);
    this.group.rotation.x = THREE.MathUtils.clamp(this.vel.z * 0.03, -0.4, 0.4);
    this.core.rotation.y += dt * 3;
    this.core.rotation.x += dt * 1.2;
  }

  reset(): void {
    this.pos.set(0, 0, 14);
    this.vel.set(0, 0, 0);
    this.knock.set(0, 0, 0);
  }
}

/** Camera yaw shared with the player transform (set each frame by the game). */
export let _yaw = 0;
export function setYaw(v: number): void {
  _yaw = v;
}

/* ------------------------------------------------------------------ */
/* ICE sentinels                                                       */
/* ------------------------------------------------------------------ */

const SENTINEL_CAP = 6;

export class Sentinels {
  private readonly pool: {
    group: THREE.Group;
    body: THREE.Mesh;
    pos: THREE.Vector3;
    target: THREE.Vector3;
    active: boolean;
  }[] = [];
  private count = 0;

  constructor(private scene: THREE.Scene) {
    const bodyGeo = new THREE.IcosahedronGeometry(0.62, 0);
    for (let i = 0; i < SENTINEL_CAP; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x2a0a12,
        emissive: 0xff3b5c,
        emissiveIntensity: 1.6,
        wireframe: true,
      });
      const body = new THREE.Mesh(bodyGeo, mat);
      const halo = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.85),
        new THREE.MeshBasicMaterial({
          color: 0xff3b5c,
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const group = new THREE.Group();
      group.add(body, halo);
      group.visible = false;
      this.scene.add(group);
      this.pool.push({
        group, body,
        pos: new THREE.Vector3(),
        target: new THREE.Vector3(),
        active: false,
      });
    }
  }

  /** (Re)spawn `n` sentinels on the arena, kept clear of the player's position. */
  spawn(n: number, avoid?: THREE.Vector3): void {
    let i = 0;
    for (const s of this.pool) {
      if (i < n) {
        s.active = true;
        s.group.visible = true;
        randomArenaPos(s.pos, avoid, 9);
        s.pos.y = 1.1;
        randomArenaPos(s.target, s.pos, 8);
        s.group.position.copy(s.pos);
        i++;
      } else {
        s.active = false;
        s.group.visible = false;
      }
    }
    this.count = n;
  }

  get activeCount(): number {
    return this.count;
  }

  /**
   * Patrol or chase. Returns the first sentinel currently touching the player, or null.
   */
  step(dt: number, player: THREE.Vector3, aggroRadius: number, chaseSpeed: number, patrolSpeed: number, time: number): { x: number; z: number } | null {
    let touch: { x: number; z: number } | null = null;
    for (const s of this.pool) {
      if (!s.active) continue;
      const dx = player.x - s.pos.x;
      const dz = player.z - s.pos.z;
      const dist = Math.hypot(dx, dz);
      const chasing = dist < aggroRadius;
      const speed = chasing ? chaseSpeed : patrolSpeed;
      if (chasing || s.pos.distanceTo(s.target) < 1) {
        if (chasing) s.target.set(player.x, 1.1, player.z);
        else randomArenaPos(s.target, s.pos, 8);
      }
      const tx = s.target.x - s.pos.x;
      const tz = s.target.z - s.pos.z;
      const tl = Math.hypot(tx, tz) || 1;
      s.pos.x += (tx / tl) * speed * dt;
      s.pos.z += (tz / tl) * speed * dt;
      const h = ARENA.half - 0.5;
      s.pos.x = Math.max(-h, Math.min(h, s.pos.x));
      s.pos.z = Math.max(-h, Math.min(h, s.pos.z));
      s.pos.y = 1.1 + Math.sin(time * 2 + s.pos.x) * 0.15;
      s.group.position.copy(s.pos);
      s.body.rotation.y += dt * (chasing ? 4 : 1.4);
      s.body.rotation.x += dt * 0.7;
      const scale = chasing ? 1.15 : 1;
      s.group.scale.setScalar(scale);
      if (dist < 1.3 && !touch) touch = { x: s.pos.x, z: s.pos.z };
    }
    return touch;
  }
}

/* ------------------------------------------------------------------ */
/* Data cores                                                          */
/* ------------------------------------------------------------------ */

const CORE_CAP = 12;

export class Cores {
  private readonly pool: { mesh: THREE.Mesh; pos: THREE.Vector3; active: boolean }[] = [];

  constructor(scene: THREE.Scene) {
    const geo = new THREE.OctahedronGeometry(0.5);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x062018,
      emissive: 0x2affc4,
      emissiveIntensity: 2.4,
      roughness: 0.2,
    });
    for (let i = 0; i < CORE_CAP; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, pos: new THREE.Vector3(), active: false });
    }
  }

  /** Ensure `n` active cores exist at random nodes (kept clear of the player). */
  maintain(n: number, playerPos: THREE.Vector3): void {
    let active = 0;
    for (const c of this.pool) if (c.active) active++;
    let i = active;
    for (const c of this.pool) {
      if (i >= n) break;
      if (c.active) continue;
      randomArenaPos(c.pos, playerPos, 5);
      c.pos.y = 1.0;
      c.mesh.position.copy(c.pos);
      c.mesh.visible = true;
      c.active = true;
      i++;
    }
  }

  /** Remove + return the position of a core touching the player, if any. */
  collect(playerPos: THREE.Vector3): THREE.Vector3 | null {
    for (const c of this.pool) {
      if (!c.active) continue;
      if (c.pos.distanceTo(playerPos) < 1.5) {
        c.active = false;
        c.mesh.visible = false;
        return c.pos;
      }
    }
    return null;
  }

  /** Remaining active cores (for scoring). */
  deactivateAll(): void {
    for (const c of this.pool) {
      c.active = false;
      c.mesh.visible = false;
    }
  }

  spin(time: number): void {
    for (const c of this.pool) {
      if (!c.active) continue;
      c.mesh.rotation.y = time * 1.8;
      c.mesh.position.y = 1.0 + Math.sin(time * 2.2 + c.pos.x) * 0.18;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Pickups (shield / overclock)                                        */
/* ------------------------------------------------------------------ */

export type PickupKind = "shield" | "overclock";

export class Pickups {
  private readonly meshes: { mesh: THREE.Mesh; kind: PickupKind; active: boolean; pos: THREE.Vector3; ttl: number }[] = [];
  private spawnTimer = 6;

  constructor(scene: THREE.Scene) {
    const mk = <T extends THREE.BufferGeometry>(geo: T, kind: PickupKind, color: number) => {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: 0x101010, emissive: color, emissiveIntensity: 2 }),
      );
      mesh.visible = false;
      scene.add(mesh);
      this.meshes.push({ mesh, kind, active: false, pos: new THREE.Vector3(), ttl: 0 });
    };
    mk(new THREE.TorusGeometry(0.45, 0.14, 10, 22), "shield", 0x35c8ff);
    mk(new THREE.TetrahedronGeometry(0.55), "overclock", 0xffb347);
  }

  maybeSpawn(dt: number, playerPos: THREE.Vector3): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 9 + Math.random() * 5;
    const slot = this.meshes.find((m) => !m.active);
    if (!slot) return;
    randomArenaPos(slot.pos, playerPos, 6);
    slot.pos.y = 1.0;
    slot.mesh.position.copy(slot.pos);
    slot.mesh.visible = true;
    slot.active = true;
    slot.ttl = 14;
  }

  step(dt: number, time: number): void {
    for (const m of this.meshes) {
      if (!m.active) continue;
      m.ttl -= dt;
      m.mesh.rotation.y = time * 2;
      if (m.ttl <= 0) {
        m.active = false;
        m.mesh.visible = false;
      }
    }
  }

  /** Pick up a touching pickup; returns its kind or null. */
  collect(playerPos: THREE.Vector3): PickupKind | null {
    for (const m of this.meshes) {
      if (!m.active) continue;
      if (m.pos.distanceTo(playerPos) < 1.4) {
        m.active = false;
        m.mesh.visible = false;
        return m.kind;
      }
    }
    return null;
  }

  clear(): void {
    for (const m of this.meshes) {
      m.active = false;
      m.mesh.visible = false;
    }
  }
}
