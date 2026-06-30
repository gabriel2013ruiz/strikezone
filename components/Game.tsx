"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

type Phase = "menu" | "playing" | "paused" | "dead";

interface Hud {
  hp: number;
  ammo: number;
  mag: number;
  score: number;
  wave: number;
  enemies: number;
  reloading: boolean;
  walls: number;
}

const MAG = 30;
const MAX_WALLS = 6;

export default function Game() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [hud, setHud] = useState<Hud>({ hp: 100, ammo: MAG, mag: MAG, score: 0, wave: 1, enemies: 0, reloading: false, walls: MAX_WALLS });
  const [hit, setHit] = useState(0); // hit-marker tick
  const [dmgFlash, setDmgFlash] = useState(0);
  const [best, setBest] = useState(0);

  // imperative handle to start/restart the game from React
  const apiRef = useRef<{ start: () => void } | null>(null);
  const phaseRef = useRef<Phase>("menu");
  phaseRef.current = phase;

  useEffect(() => {
    try { setBest(Number(localStorage.getItem("sz_best") || 0)); } catch {}
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ---------- renderer / scene / camera ----------
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e1a);
    scene.fog = new THREE.Fog(0x0a0e1a, 40, 140);

    const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, 1.7, 0);
    scene.add(camera);

    // ---------- lights ----------
    const hemi = new THREE.HemisphereLight(0x9bb8ff, 0x202028, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
    scene.add(sun);

    // ---------- arena ----------
    const ARENA = 50;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA * 2, ARENA * 2),
      new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(ARENA * 2, 50, 0x2a3550, 0x1b2233);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    scene.add(grid);

    // collidable boxes (cover + boundary walls + player-built walls)
    type Box = { mesh: THREE.Mesh; min: THREE.Vector2; max: THREE.Vector2; built?: boolean };
    const boxes: Box[] = [];
    const addBox = (x: number, z: number, w: number, h: number, d: number, color: number, built = false) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.1 })
      );
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh);
      boxes.push({
        mesh,
        min: new THREE.Vector2(x - w / 2, z - d / 2),
        max: new THREE.Vector2(x + w / 2, z + d / 2),
        built,
      });
      return mesh;
    };

    // boundary walls
    const WALL_H = 5;
    addBox(0, -ARENA, ARENA * 2, WALL_H, 1, 0x232a3a);
    addBox(0, ARENA, ARENA * 2, WALL_H, 1, 0x232a3a);
    addBox(-ARENA, 0, 1, WALL_H, ARENA * 2, 0x232a3a);
    addBox(ARENA, 0, 1, WALL_H, ARENA * 2, 0x232a3a);
    // cover scattered around
    const cover = [
      [-12, -8, 4, 3, 4], [14, -16, 6, 4, 3], [-20, 14, 3, 5, 8], [8, 18, 5, 3, 5],
      [22, 6, 4, 4, 4], [-6, 24, 7, 3, 3], [0, -22, 8, 4, 3], [-26, -18, 4, 6, 4],
      [18, -28, 5, 3, 6], [-16, 30, 5, 4, 5],
    ];
    for (const [x, z, w, h, d] of cover) addBox(x, z, w, h, d, 0x2c3650);

    // ---------- view-model (gun) ----------
    const gun = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.5, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.7), gunMat);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.5), gunMat);
    barrel.position.set(0, 0.02, -0.55);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.14), gunMat);
    grip.position.set(0, -0.2, 0.2);
    gun.add(body, barrel, grip);
    gun.position.set(0.32, -0.28, -0.6);
    camera.add(gun);
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0.02, -0.85);
    gun.add(muzzle);
    const muzzleLight = new THREE.PointLight(0xffcc66, 0, 8);
    muzzle.add(muzzleLight);

    // ---------- enemies ----------
    interface Enemy { group: THREE.Group; hp: number; speed: number; lastHit: number; }
    const enemies: Enemy[] = [];
    const enemyMeshes: THREE.Object3D[] = []; // for raycasting

    const makeEnemy = (x: number, z: number, speed: number, hp: number) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.6 });
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 4, 8), mat);
      torso.position.y = 1.1; torso.castShadow = true; torso.name = "body";
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), new THREE.MeshStandardMaterial({ color: 0xf0a0a0, roughness: 0.5 }));
      head.position.y = 2.0; head.castShadow = true; head.name = "head";
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      eye.position.set(0, 2.05, 0.3);
      g.add(torso, head, eye);
      g.position.set(x, 0, z);
      g.userData.body = torso; g.userData.head = head;
      scene.add(g);
      enemies.push({ group: g, hp, speed, lastHit: 0 });
      enemyMeshes.push(torso, head);
    };

    const removeEnemy = (i: number) => {
      const e = enemies[i];
      e.group.traverse((o) => {
        if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
      });
      scene.remove(e.group);
      const bi = enemyMeshes.indexOf(e.group.userData.body); if (bi >= 0) enemyMeshes.splice(bi, 1);
      const hi = enemyMeshes.indexOf(e.group.userData.head); if (hi >= 0) enemyMeshes.splice(hi, 1);
      enemies.splice(i, 1);
    };

    // ---------- tracers ----------
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.9 });
    const tracers: { line: THREE.Line; life: number }[] = [];
    const addTracer = (from: THREE.Vector3, to: THREE.Vector3) => {
      const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
      const line = new THREE.Line(geo, tracerMat.clone());
      scene.add(line);
      tracers.push({ line, life: 0.07 });
    };

    // ---------- controls ----------
    const controls = new PointerLockControls(camera, renderer.domElement);

    // ---------- audio (simple synth SFX) ----------
    let actx: AudioContext | null = null;
    const sfx = (type: "shoot" | "hit" | "head" | "hurt" | "reload" | "wave") => {
      try {
        if (!actx) actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const t = actx.currentTime;
        const o = actx.createOscillator();
        const g = actx.createGain();
        o.connect(g); g.connect(actx.destination);
        const conf = {
          shoot: { f: 220, type: "square" as OscillatorType, v: 0.12, d: 0.07 },
          hit: { f: 600, type: "sine" as OscillatorType, v: 0.15, d: 0.06 },
          head: { f: 900, type: "sine" as OscillatorType, v: 0.2, d: 0.1 },
          hurt: { f: 120, type: "sawtooth" as OscillatorType, v: 0.2, d: 0.18 },
          reload: { f: 320, type: "triangle" as OscillatorType, v: 0.1, d: 0.05 },
          wave: { f: 440, type: "triangle" as OscillatorType, v: 0.18, d: 0.25 },
        }[type];
        o.type = conf.type; o.frequency.setValueAtTime(conf.f, t);
        if (type === "shoot") o.frequency.exponentialRampToValueAtTime(90, t + conf.d);
        if (type === "wave") o.frequency.exponentialRampToValueAtTime(880, t + conf.d);
        g.gain.setValueAtTime(conf.v, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + conf.d);
        o.start(t); o.stop(t + conf.d);
      } catch {}
    };

    // ---------- game state ----------
    const state = {
      hp: 100, ammo: MAG, score: 0, wave: 0, reloading: false, walls: MAX_WALLS,
      vel: new THREE.Vector3(), canJump: true, mouseDown: false, ads: false,
      lastShot: 0, lastBuild: 0, alive: true, spawning: false,
    };
    const keys: Record<string, boolean> = {};
    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);

    let lastHudSync = 0;
    const syncHud = (force = false) => {
      const now = performance.now();
      if (!force && now - lastHudSync < 80) return;
      lastHudSync = now;
      setHud({
        hp: Math.max(0, Math.round(state.hp)),
        ammo: state.ammo, mag: MAG, score: state.score, wave: state.wave,
        enemies: enemies.length, reloading: state.reloading, walls: state.walls,
      });
    };

    // ---------- waves ----------
    const startWave = () => {
      state.wave++;
      const count = 3 + state.wave * 2;
      const speed = 2.4 + state.wave * 0.25;
      const hp = 30 + state.wave * 6;
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 15;
        makeEnemy(Math.cos(ang) * r, Math.sin(ang) * r, speed, hp);
      }
      sfx("wave");
      syncHud(true);
    };

    // ---------- shooting ----------
    const reload = () => {
      if (state.reloading || state.ammo === MAG) return;
      state.reloading = true; syncHud(true); sfx("reload");
      window.setTimeout(() => { state.ammo = MAG; state.reloading = false; syncHud(true); }, 1100);
    };

    const shoot = () => {
      if (state.reloading || state.ammo <= 0 || !state.alive) { if (state.ammo <= 0) reload(); return; }
      state.ammo--; state.lastShot = performance.now();
      sfx("shoot");
      // recoil
      gun.position.z = -0.5; gun.rotation.x = 0.06;
      camera.rotation.x += 0.012;
      muzzleLight.intensity = 6;
      window.setTimeout(() => { muzzleLight.intensity = 0; }, 45);

      raycaster.setFromCamera(center, camera);
      raycaster.far = 250;
      const hits = raycaster.intersectObjects([...enemyMeshes, ...boxes.map((b) => b.mesh)], false);
      const muzzleWorld = new THREE.Vector3(); muzzle.getWorldPosition(muzzleWorld);

      if (hits.length) {
        const h = hits[0];
        addTracer(muzzleWorld, h.point);
        const isEnemyPart = enemyMeshes.includes(h.object);
        if (isEnemyPart) {
          const idx = enemies.findIndex((e) => e.group.userData.body === h.object || e.group.userData.head === h.object);
          if (idx >= 0) {
            const head = h.object.name === "head";
            enemies[idx].hp -= head ? 100 : 34;
            sfx(head ? "head" : "hit");
            setHit((v) => v + 1);
            if (enemies[idx].hp <= 0) {
              removeEnemy(idx);
              state.score += head ? 150 : 100;
            }
            syncHud();
          }
        }
      } else {
        const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
        addTracer(muzzleWorld, muzzleWorld.clone().add(dir.multiplyScalar(120)));
      }
      syncHud();
    };

    const buildWall = () => {
      const now = performance.now();
      if (state.walls <= 0 || now - state.lastBuild < 400 || !state.alive) return;
      state.lastBuild = now;
      const dir = new THREE.Vector3(); camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
      const p = camera.position.clone().add(dir.multiplyScalar(3));
      const ang = Math.atan2(dir.x, dir.z);
      const w = Math.abs(Math.sin(ang)) > 0.5 ? 1 : 4;
      const d = w === 1 ? 4 : 1;
      addBox(p.x, p.z, w, 3, d, 0x3aa0ff, true);
      state.walls--; syncHud(true);
    };

    // ---------- input ----------
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === "KeyR") reload();
      if (e.code === "KeyQ") buildWall();
      if (e.code === "Space" && state.canJump) { state.vel.y = 7.0; state.canJump = false; }
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    const onMouseDown = (e: MouseEvent) => {
      if (!controls.isLocked) return;
      if (e.button === 0) { state.mouseDown = true; }
      if (e.button === 2) { state.ads = true; }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) state.mouseDown = false;
      if (e.button === 2) state.ads = false;
    };
    const onContext = (e: Event) => e.preventDefault();

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("contextmenu", onContext);

    controls.addEventListener("lock", () => { setPhase("playing"); });
    controls.addEventListener("unlock", () => {
      if (state.alive) setPhase("paused");
    });

    // ---------- start / reset ----------
    const reset = () => {
      for (let i = enemies.length - 1; i >= 0; i--) removeEnemy(i);
      // remove built walls
      for (let i = boxes.length - 1; i >= 0; i--) {
        if (boxes[i].built) {
          scene.remove(boxes[i].mesh);
          boxes[i].mesh.geometry.dispose();
          (boxes[i].mesh.material as THREE.Material).dispose();
          boxes.splice(i, 1);
        }
      }
      state.hp = 100; state.ammo = MAG; state.score = 0; state.wave = 0;
      state.reloading = false; state.walls = MAX_WALLS; state.alive = true;
      state.vel.set(0, 0, 0);
      camera.position.set(0, 1.7, 0);
      camera.rotation.set(0, 0, 0);
      syncHud(true);
      startWave();
    };

    apiRef.current = {
      start: () => {
        if (!state.alive || phaseRef.current === "menu" || phaseRef.current === "dead") reset();
        controls.lock();
      },
    };

    const die = () => {
      state.alive = false;
      controls.unlock();
      try {
        const b = Number(localStorage.getItem("sz_best") || 0);
        if (state.score > b) { localStorage.setItem("sz_best", String(state.score)); setBest(state.score); }
      } catch {}
      setPhase("dead");
    };

    // ---------- resize ----------
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    // ---------- main loop ----------
    const clock = new THREE.Clock();
    const tmpDir = new THREE.Vector3();
    const playerPos2 = new THREE.Vector2();
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const playing = controls.isLocked && state.alive;

      if (playing) {
        // --- movement ---
        const sprint = keys["ShiftLeft"] ? 1.6 : 1;
        const accel = 60 * sprint;
        const damp = 10;
        state.vel.x -= state.vel.x * damp * dt;
        state.vel.z -= state.vel.z * damp * dt;
        state.vel.y -= 22 * dt; // gravity

        const fwd = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0);
        const side = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);
        if (fwd) state.vel.z -= fwd * accel * dt;
        if (side) state.vel.x += side * accel * dt;

        controls.moveRight(state.vel.x * dt);
        controls.moveForward(-state.vel.z * dt);
        camera.position.y += state.vel.y * dt;

        // ground
        if (camera.position.y < 1.7) { camera.position.y = 1.7; state.vel.y = 0; state.canJump = true; }

        // arena bounds
        const lim = ARENA - 1.2;
        camera.position.x = Math.max(-lim, Math.min(lim, camera.position.x));
        camera.position.z = Math.max(-lim, Math.min(lim, camera.position.z));

        // collide with boxes (circle vs AABB push-out)
        const pr = 0.55;
        for (const b of boxes) {
          const cx = Math.max(b.min.x, Math.min(camera.position.x, b.max.x));
          const cz = Math.max(b.min.y, Math.min(camera.position.z, b.max.y));
          const dx = camera.position.x - cx, dz = camera.position.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < pr * pr) {
            const d = Math.sqrt(d2) || 0.0001;
            camera.position.x += (dx / d) * (pr - d);
            camera.position.z += (dz / d) * (pr - d);
          }
        }

        // --- ADS / fov ---
        const targetFov = state.ads ? 50 : 78;
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
        camera.updateProjectionMatrix();
        gun.position.x += (((state.ads ? 0.0 : 0.32)) - gun.position.x) * Math.min(1, dt * 12);
        gun.position.y += (((state.ads ? -0.18 : -0.28)) - gun.position.y) * Math.min(1, dt * 12);

        // recoil recover
        gun.position.z += (-0.6 - gun.position.z) * Math.min(1, dt * 14);
        gun.rotation.x += (0 - gun.rotation.x) * Math.min(1, dt * 14);

        // --- auto fire ---
        const fireRate = 95;
        if (state.mouseDown && performance.now() - state.lastShot >= fireRate) shoot();

        // --- enemies ---
        playerPos2.set(camera.position.x, camera.position.z);
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          tmpDir.set(camera.position.x - e.group.position.x, 0, camera.position.z - e.group.position.z);
          const dist = tmpDir.length();
          tmpDir.normalize();
          if (dist > 1.4) e.group.position.addScaledVector(tmpDir, e.speed * dt);
          e.group.rotation.y = Math.atan2(tmpDir.x, tmpDir.z);
          // bob
          e.group.position.y = Math.sin(performance.now() * 0.006 + i) * 0.06;
          if (dist < 1.7) {
            const now = performance.now();
            if (now - e.lastHit > 600) {
              e.lastHit = now;
              state.hp -= 9;
              sfx("hurt");
              setDmgFlash((v) => v + 1);
              syncHud(true);
              if (state.hp <= 0) { state.hp = 0; syncHud(true); die(); }
            }
          }
        }

        // next wave
        if (enemies.length === 0 && !state.spawning) {
          state.spawning = true;
          window.setTimeout(() => { startWave(); state.spawning = false; }, 1500);
        }

        syncHud();
      }

      // tracers fade
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        const m = tracers[i].line.material as THREE.LineBasicMaterial;
        m.opacity = Math.max(0, tracers[i].life / 0.07) * 0.9;
        if (tracers[i].life <= 0) {
          scene.remove(tracers[i].line);
          tracers[i].line.geometry.dispose();
          (tracers[i].line.material as THREE.Material).dispose();
          tracers.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    // ---------- cleanup ----------
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("contextmenu", onContext);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      if (actx) actx.close().catch(() => {});
    };
  }, []);

  const lowHp = hud.hp <= 30;

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="absolute inset-0" />

      {/* damage flash */}
      <div
        key={dmgFlash}
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 160px 40px rgba(220,40,40,0.55)", opacity: 0, animation: dmgFlash ? "fadeIn 0.08s ease forwards reverse" : undefined }}
      />

      {/* HUD */}
      {phase === "playing" && (
        <>
          {/* crosshair */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative h-6 w-6">
              <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-white/80" />
              <span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-white/80" />
              <span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white/80" />
              <span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white/80" />
              <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
            </div>
          </div>

          {/* hit marker */}
          {hit > 0 && (
            <div key={hit} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ animation: "fadeIn 0.18s ease forwards reverse" }}>
              <div className="relative h-7 w-7 rotate-45">
                <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-red-400" />
                <span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-red-400" />
                <span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-red-400" />
                <span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-red-400" />
              </div>
            </div>
          )}

          {/* top bar */}
          <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between p-4 text-sm hud-shadow">
            <div className="rounded-lg bg-black/40 px-3 py-1.5">
              WAVE <span className="text-cyan-300 font-bold">{hud.wave}</span>
              <span className="mx-2 opacity-40">|</span>
              {hud.enemies} <span className="opacity-60">enemies</span>
            </div>
            <div className="rounded-lg bg-black/40 px-3 py-1.5">
              SCORE <span className="font-bold text-yellow-300">{hud.score}</span>
            </div>
          </div>

          {/* bottom bar */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-end justify-between p-5 hud-shadow">
            <div className="w-56">
              <div className="mb-1 flex justify-between text-xs">
                <span className={lowHp ? "text-red-400" : "text-emerald-300"}>HP</span>
                <span>{hud.hp}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                <div className={`h-full transition-all ${lowHp ? "bg-red-500" : "bg-emerald-400"}`} style={{ width: `${hud.hp}%` }} />
              </div>
              <div className="mt-2 text-xs opacity-70">🧱 walls: {hud.walls}/{MAX_WALLS} <span className="opacity-50">(Q)</span></div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tabular-nums">
                {hud.reloading ? <span className="text-yellow-300 text-xl">RELOADING…</span> : <>{hud.ammo}<span className="text-base opacity-50"> / {hud.mag}</span></>}
              </div>
              <div className="text-xs opacity-60">🔫 ASSAULT RIFLE <span className="opacity-50">(R reload)</span></div>
            </div>
          </div>
        </>
      )}

      {/* MENU */}
      {phase === "menu" && (
        <Overlay>
          <Title />
          <p className="mt-2 max-w-md text-center text-sm text-white/60">
            A fast browser FPS. Survive endless waves. Headshots = bonus points.
          </p>
          <Controls />
          <PlayButton label="▶ CLICK TO PLAY" onClick={() => apiRef.current?.start()} />
          {best > 0 && <p className="mt-4 text-xs text-white/50">Best score: <span className="text-yellow-300">{best}</span></p>}
        </Overlay>
      )}

      {/* PAUSED */}
      {phase === "paused" && (
        <Overlay>
          <h2 className="text-3xl font-bold tracking-widest">PAUSED</h2>
          <Controls />
          <PlayButton label="▶ RESUME" onClick={() => apiRef.current?.start()} />
        </Overlay>
      )}

      {/* DEAD */}
      {phase === "dead" && (
        <Overlay>
          <h2 className="text-4xl font-black tracking-widest text-red-500">YOU DIED</h2>
          <p className="mt-3 text-lg">Score: <span className="font-bold text-yellow-300">{hud.score}</span> · Wave <span className="text-cyan-300">{hud.wave}</span></p>
          {hud.score >= best && hud.score > 0 && <p className="mt-1 text-sm text-emerald-300">★ New best!</p>}
          <PlayButton label="↻ PLAY AGAIN" onClick={() => apiRef.current?.start()} />
        </Overlay>
      )}
    </div>
  );
}

/* ---------- overlay UI bits ---------- */
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fade-in absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
      {children}
    </div>
  );
}
function Title() {
  return (
    <h1 className="text-center text-5xl font-black tracking-[0.2em] sm:text-7xl">
      <span className="text-cyan-300">STRIKE</span><span className="text-red-500">ZONE</span>
    </h1>
  );
}
function PlayButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-8 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-8 py-3.5 text-lg font-bold text-black transition hover:scale-105 hover:brightness-110"
    >
      {label}
    </button>
  );
}
function Controls() {
  const rows = [
    ["WASD", "Move"], ["Mouse", "Look"], ["Left click", "Shoot (auto)"], ["Right click", "Aim (ADS)"],
    ["Shift", "Sprint"], ["Space", "Jump"], ["R", "Reload"], ["Q", "Build wall"], ["Esc", "Pause"],
  ];
  return (
    <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="rounded bg-white/10 px-2 py-0.5 font-bold text-cyan-200">{k}</span>
          <span className="text-white/60">{v}</span>
        </div>
      ))}
    </div>
  );
}
