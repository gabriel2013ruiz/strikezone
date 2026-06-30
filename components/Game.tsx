"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

type Phase = "menu" | "playing" | "paused" | "dead" | "multiplayer";
type Mode = "single" | "training";

interface Hud {
  hp: number; ammo: number; mag: number; score: number; kills: number;
  shots: number; hits: number; reloading: boolean; mode: Mode; alive: number;
}

const MAG = 30;
const MAPS = [
  { name: "Forest Outpost", desc: "Pines, a lake & wooden cabins" },
  { name: "Harbor", desc: "Docks, water, shipping crates" },
  { name: "Dust Town", desc: "Desert village & ruined walls" },
];

/* ---------- texture helpers (procedural, no external files) ---------- */
function tex(draw: (c: CanvasRenderingContext2D, s: number) => void, size = 256, repeat = 1) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  draw(cv.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function Game() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [mode, setMode] = useState<Mode>("single");
  const [mapIdx, setMapIdx] = useState(0);
  const [hud, setHud] = useState<Hud>({ hp: 100, ammo: MAG, mag: MAG, score: 0, kills: 0, shots: 0, hits: 0, reloading: false, mode: "single", alive: 0 });
  const [hit, setHit] = useState(0);
  const [dmgFlash, setDmgFlash] = useState(0);

  const apiRef = useRef<{ start: (mode: Mode, map: number) => void } | null>(null);
  const phaseRef = useRef<Phase>("menu");
  phaseRef.current = phase;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    /* ---------- renderer / scene / camera ---------- */
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 1000);
    camera.position.set(0, 1.7, 0);
    scene.add(camera);

    /* ---------- sky ---------- */
    const skyTex = tex((c, s) => {
      const g = c.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, "#5b86c4"); g.addColorStop(0.5, "#9bb6d8"); g.addColorStop(1, "#d8e2ee");
      c.fillStyle = g; c.fillRect(0, 0, s, s);
    }, 256, 1);
    scene.background = skyTex;

    /* ---------- lights ---------- */
    const hemi = new THREE.HemisphereLight(0xbcd3ff, 0x4a4636, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.5);
    sun.position.set(60, 90, 40); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 300;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90;
    scene.add(sun);

    /* ---------- shared geometry/materials ---------- */
    const ARENA = 80;

    /* ---------- world containers (rebuilt per map) ---------- */
    const world = new THREE.Group();
    scene.add(world);
    const solids: THREE.Object3D[] = [];           // meshes that block bullets
    type Col = { minx: number; minz: number; maxx: number; maxz: number };
    const colliders: Col[] = [];                    // AABB for movement
    const spawns: THREE.Vector3[] = [];
    const waterUpdaters: ((t: number) => void)[] = [];

    const clearWorld = () => {
      world.traverse((o) => {
        if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = o.material; if (Array.isArray(m)) m.forEach((x) => x.dispose()); else m.dispose(); }
      });
      while (world.children.length) world.remove(world.children[0]);
      solids.length = 0; colliders.length = 0; spawns.length = 0; waterUpdaters.length = 0;
    };

    const addSolid = (mesh: THREE.Mesh, collide = true) => {
      world.add(mesh); solids.push(mesh);
      if (collide) {
        const b = new THREE.Box3().setFromObject(mesh);
        colliders.push({ minx: b.min.x, minz: b.min.z, maxx: b.max.x, maxz: b.max.z });
      }
    };

    /* ---------- prop builders ---------- */
    const groundTex = (col1: string, col2: string) => tex((c, s) => {
      c.fillStyle = col1; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 1600; i++) { c.fillStyle = Math.random() > 0.5 ? col2 : col1; const r = Math.random() * 2; c.fillRect(Math.random() * s, Math.random() * s, r, r); }
    }, 256, 24);

    const winTex = (base: string) => tex((c, s) => {
      c.fillStyle = base; c.fillRect(0, 0, s, s);
      const cols = 4, rows = 4, pad = s * 0.12, gw = (s - pad * 2) / cols, gh = (s - pad * 2) / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        c.fillStyle = Math.random() > 0.65 ? "#ffe9a8" : "#26303f";
        c.fillRect(pad + x * gw + gw * 0.15, pad + y * gh + gh * 0.15, gw * 0.7, gh * 0.7);
      }
    }, 256, 1);

    const makeBuilding = (x: number, z: number, w: number, h: number, d: number, base: string) => {
      const mat = new THREE.MeshStandardMaterial({ map: winTex(base), roughness: 0.9 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true;
      addSolid(m, true);
    };
    const makeCrate = (x: number, z: number, s: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshStandardMaterial({ color: 0x8a6b3f, roughness: 0.85 }));
      m.position.set(x, s / 2, z); m.castShadow = true; m.receiveShadow = true; addSolid(m, true);
    };
    const makeTree = (x: number, z: number) => {
      const g = new THREE.Group();
      const th = 3 + Math.random() * 2;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, th, 6), new THREE.MeshStandardMaterial({ color: 0x5b3f24, roughness: 1 }));
      trunk.position.y = th / 2; trunk.castShadow = true;
      g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2 - i * 0.45, 2.2, 7), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x2f6b34 : 0x357a3c, roughness: 1 }));
        cone.position.y = th - 0.4 + i * 1.2; cone.castShadow = true; g.add(cone);
      }
      g.position.set(x, 0, z); world.add(g);
      solids.push(trunk);
      colliders.push({ minx: x - 0.4, minz: z - 0.4, maxx: x + 0.4, maxz: z + 0.4 });
    };
    const makeBush = (x: number, z: number) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x3a7d3f, roughness: 1 });
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 + Math.random() * 0.4, 0), mat);
        s.position.set((Math.random() - 0.5) * 1.1, 0.4 + Math.random() * 0.3, (Math.random() - 0.5) * 1.1);
        s.castShadow = true; g.add(s);
      }
      g.position.set(x, 0, z); world.add(g);
    };
    const makeWater = (x: number, z: number, w: number, d: number) => {
      const geo = new THREE.PlaneGeometry(w, d, 24, 24);
      const mat = new THREE.MeshStandardMaterial({ color: 0x2d6e8f, transparent: true, opacity: 0.82, roughness: 0.18, metalness: 0.5 });
      const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.08, z); m.receiveShadow = true;
      world.add(m);
      const base = geo.attributes.position.array.slice() as unknown as number[];
      waterUpdaters.push((t) => {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const ix = i * 3; const px = base[ix], py = base[ix + 1];
          p.setZ(i, Math.sin(px * 0.5 + t * 1.5) * 0.12 + Math.cos(py * 0.5 + t * 1.2) * 0.12);
        }
        p.needsUpdate = true;
      });
    };

    /* ---------- map builder ---------- */
    const buildMap = (idx: number) => {
      clearWorld();
      const palettes = [
        { grnd: ["#3b5a2e", "#314e27"], sky: ["#5b86c4", "#d8e2ee"], bld: "#7a8390" },
        { grnd: ["#444b54", "#3a4049"], sky: ["#6b7f9e", "#c2cedd"], bld: "#5d6470" },
        { grnd: ["#a98b5b", "#8f7148"], sky: ["#cdbb92", "#efe6cf"], bld: "#c2a878" },
      ][idx];

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshStandardMaterial({ map: groundTex(palettes.grnd[0], palettes.grnd[1]), roughness: 1 }));
      ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);

      // boundary walls (invisible-ish low)
      const bh = 6;
      for (const [x, z, w, d] of [[0, -ARENA, ARENA * 2, 2], [0, ARENA, ARENA * 2, 2], [-ARENA, 0, 2, ARENA * 2], [ARENA, 0, 2, ARENA * 2]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, bh, d), new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 1 }));
        m.position.set(x, bh / 2, z); addSolid(m, true);
      }

      const rand = (a: number, b: number) => a + Math.random() * (b - a);
      const ring = (r: number, n: number, cb: (x: number, z: number, i: number) => void) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2); cb(Math.cos(a) * r, Math.sin(a) * r, i); } };

      if (idx === 0) {
        // forest: cabins, trees, bushes, lake
        makeWater(28, -22, 34, 30);
        ring(40, 7, (x, z) => makeBuilding(x, z, rand(6, 9), rand(4, 7), rand(6, 9), palettes.bld));
        for (let i = 0; i < 70; i++) { const x = rand(-ARENA + 5, ARENA - 5), z = rand(-ARENA + 5, ARENA - 5); if (Math.hypot(x - 28, z + 22) > 20 && Math.hypot(x, z) > 8) makeTree(x, z); }
        for (let i = 0; i < 40; i++) makeBush(rand(-ARENA + 5, ARENA - 5), rand(-ARENA + 5, ARENA - 5));
      } else if (idx === 1) {
        // harbor: water strip, crates, warehouses
        makeWater(0, -52, ARENA * 2, 56);
        ring(34, 8, (x, z) => makeBuilding(x, z, rand(8, 12), rand(5, 9), rand(8, 12), palettes.bld));
        for (let i = 0; i < 60; i++) makeCrate(rand(-50, 50), rand(-40, 60), rand(1.4, 2.6));
        for (let i = 0; i < 18; i++) makeTree(rand(-60, 60), rand(20, 60));
      } else {
        // dust town: dense buildings + ruined walls
        ring(22, 9, (x, z) => makeBuilding(x, z, rand(7, 11), rand(5, 10), rand(7, 11), palettes.bld));
        ring(48, 12, (x, z) => makeBuilding(x, z, rand(6, 10), rand(4, 8), rand(6, 10), palettes.bld));
        for (let i = 0; i < 40; i++) makeCrate(rand(-55, 55), rand(-55, 55), rand(1.2, 2.2));
        for (let i = 0; i < 14; i++) makeBush(rand(-55, 55), rand(-55, 55));
      }

      // spawn points
      ring(55, 12, (x, z) => spawns.push(new THREE.Vector3(x, 0, z)));
      scene.background = tex((c, s) => { const g = c.createLinearGradient(0, 0, 0, s); g.addColorStop(0, palettes.sky[0]); g.addColorStop(1, palettes.sky[1]); c.fillStyle = g; c.fillRect(0, 0, s, s); });
      scene.fog = new THREE.Fog(new THREE.Color(palettes.sky[1]).getHex(), 70, 180);
    };

    /* ---------- view-model gun ---------- */
    const gun = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.45, metalness: 0.8 });
    const gBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.7), gunMat);
    const gBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.55), gunMat); gBarrel.position.set(0, 0.02, -0.6);
    const gGrip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.13), gunMat); gGrip.position.set(0, -0.2, 0.18);
    const gSight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.2), gunMat); gSight.position.set(0, 0.12, -0.1);
    gun.add(gBody, gBarrel, gGrip, gSight);
    gun.position.set(0.3, -0.26, -0.55); camera.add(gun);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.9); gun.add(muzzle);
    const muzzleLight = new THREE.PointLight(0xffcc66, 0, 10); muzzle.add(muzzleLight);

    /* ---------- bots ---------- */
    interface Bot { group: THREE.Group; head: THREE.Mesh; body: THREE.Mesh; hp: number; speed: number; lastShot: number; roam: THREE.Vector3; dummy: boolean; }
    const bots: Bot[] = [];
    const botParts: THREE.Object3D[] = [];

    const makeBot = (pos: THREE.Vector3, dummy: boolean) => {
      const g = new THREE.Group();
      const teamCol = dummy ? 0xc9a23a : 0xcf3b3b;
      const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48c, roughness: 0.7 });
      const cloth = new THREE.MeshStandardMaterial({ color: teamCol, roughness: 0.8 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.8 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.4), cloth); torso.position.y = 1.35; torso.name = "body";
      const hips = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.38), dark); hips.position.y = 0.75;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.42), skin); head.position.y = 2.05; head.name = "head";
      const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.26), dark); lLeg.position.set(-0.16, 0.4, 0);
      const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.8, 0.26), dark); rLeg.position.set(0.16, 0.4, 0);
      const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.22), cloth); lArm.position.set(-0.46, 1.35, 0);
      const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.22), cloth); rArm.position.set(0.46, 1.35, 0);
      [torso, hips, head, lLeg, rLeg, lArm, rArm].forEach((m) => { m.castShadow = true; g.add(m); });
      g.position.copy(pos); g.userData.body = torso; g.userData.head = head; g.userData.legs = [lLeg, rLeg];
      world.add(g);
      const bot: Bot = { group: g, head, body: torso, hp: dummy ? 9999 : 100, speed: dummy ? 0 : 3 + Math.random(), lastShot: 0, roam: pickRoam(), dummy };
      bots.push(bot); botParts.push(torso, head);
      return bot;
    };
    const pickRoam = () => new THREE.Vector3((Math.random() - 0.5) * ARENA * 1.6, 0, (Math.random() - 0.5) * ARENA * 1.6);
    const removeBot = (i: number) => {
      const b = bots[i];
      b.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      world.remove(b.group);
      [b.body, b.head].forEach((m) => { const k = botParts.indexOf(m); if (k >= 0) botParts.splice(k, 1); });
      bots.splice(i, 1);
    };

    /* ---------- targets (training) ---------- */
    interface Target { mesh: THREE.Mesh; base: THREE.Vector3; }
    const targets: Target[] = [];
    const targetParts: THREE.Object3D[] = [];
    const targetTex = tex((c, s) => {
      c.fillStyle = "#f4f4f4"; c.fillRect(0, 0, s, s);
      const cx = s / 2; const cols = ["#222", "#f4f4f4", "#3a7bd5", "#f4f4f4", "#d33", "#f4f4f4", "#fc0"];
      for (let i = 0; i < cols.length; i++) { c.beginPath(); c.arc(cx, cx, (s / 2) * (1 - i / cols.length), 0, Math.PI * 2); c.fillStyle = cols[i]; c.fill(); }
    });
    const makeTarget = (pos: THREE.Vector3) => {
      const g = new THREE.Group();
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x333 }));
      stand.position.y = 0.6;
      const board = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshStandardMaterial({ map: targetTex, roughness: 0.7, side: THREE.DoubleSide }));
      board.position.y = 1.5; board.name = "target";
      g.add(stand, board); g.position.copy(pos); world.add(g);
      targets.push({ mesh: board, base: pos.clone() }); targetParts.push(board);
    };

    /* ---------- audio ---------- */
    let actx: AudioContext | null = null;
    const sfx = (kind: "shoot" | "hit" | "head" | "hurt" | "reload" | "enemy") => {
      try {
        if (!actx) actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination);
        const cfg = { shoot: [220, "square", 0.1, 0.07], hit: [620, "sine", 0.13, 0.05], head: [950, "sine", 0.18, 0.09], hurt: [110, "sawtooth", 0.2, 0.18], reload: [320, "triangle", 0.09, 0.05], enemy: [180, "square", 0.05, 0.06] }[kind] as [number, OscillatorType, number, number];
        o.type = cfg[1]; o.frequency.setValueAtTime(cfg[0], t); if (kind === "shoot") o.frequency.exponentialRampToValueAtTime(80, t + cfg[3]);
        g.gain.setValueAtTime(cfg[2], t); g.gain.exponentialRampToValueAtTime(0.001, t + cfg[3]); o.start(t); o.stop(t + cfg[3]);
      } catch {}
    };

    /* ---------- controls + state ---------- */
    const controls = new PointerLockControls(camera, renderer.domElement);
    const state = {
      hp: 100, ammo: MAG, score: 0, kills: 0, shots: 0, hits: 0, reloading: false,
      vel: new THREE.Vector3(), canJump: true, mouseDown: false, ads: false,
      lastShot: 0, alive: true, mode: "single" as Mode, maxBots: 6,
    };
    const keys: Record<string, boolean> = {};
    const raycaster = new THREE.Raycaster();
    const center = new THREE.Vector2(0, 0);
    const losRay = new THREE.Raycaster();

    let lastHudSync = 0;
    const syncHud = (force = false) => {
      const now = performance.now();
      if (!force && now - lastHudSync < 80) return; lastHudSync = now;
      setHud({ hp: Math.max(0, Math.round(state.hp)), ammo: state.ammo, mag: MAG, score: state.score, kills: state.kills, shots: state.shots, hits: state.hits, reloading: state.reloading, mode: state.mode, alive: bots.filter((b) => !b.dummy).length });
    };

    /* ---------- tracers ---------- */
    const tracers: { line: THREE.Line; life: number }[] = [];
    const addTracer = (from: THREE.Vector3, to: THREE.Vector3, color = 0xfff2a0) => {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      world.add(line); tracers.push({ line, life: 0.06 });
    };

    /* ---------- shooting ---------- */
    const reload = () => {
      if (state.reloading || state.ammo === MAG) return;
      state.reloading = true; syncHud(true); sfx("reload");
      window.setTimeout(() => { state.ammo = MAG; state.reloading = false; syncHud(true); }, 1100);
    };
    const shoot = () => {
      if (state.reloading || !state.alive) return;
      if (state.ammo <= 0) { reload(); return; }
      state.ammo--; state.shots++; state.lastShot = performance.now(); sfx("shoot");
      gun.position.z = -0.45; gun.rotation.x = 0.05; muzzleLight.intensity = 7;
      window.setTimeout(() => { muzzleLight.intensity = 0; }, 40);

      // precise: tiny spread hip-fire, zero when ADS
      const spread = state.ads ? 0 : 0.005;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      if (spread) { dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.normalize(); }
      raycaster.set(camera.getWorldPosition(new THREE.Vector3()), dir);
      raycaster.far = 400;
      const hits = raycaster.intersectObjects([...botParts, ...targetParts, ...solids], false);
      const mw = muzzle.getWorldPosition(new THREE.Vector3());
      if (hits.length) {
        const h = hits[0];
        addTracer(mw, h.point);
        if (botParts.includes(h.object)) {
          const idx = bots.findIndex((b) => b.body === h.object || b.head === h.object);
          if (idx >= 0 && !bots[idx].dummy) {
            const head = h.object.name === "head";
            bots[idx].hp -= head ? 100 : 40;
            state.hits++; setHit((v) => v + 1); sfx(head ? "head" : "hit");
            if (bots[idx].hp <= 0) { const sp = spawns.length ? spawns[(Math.random() * spawns.length) | 0].clone() : pickRoam(); removeBot(idx); state.kills++; state.score += head ? 150 : 100; if (state.mode === "single") window.setTimeout(() => { if (state.alive) makeBot(sp, false); }, 2500); }
          } else if (idx >= 0) { state.hits++; setHit((v) => v + 1); sfx("hit"); }
          syncHud();
        } else if (targetParts.includes(h.object)) {
          state.hits++; state.score += 50; setHit((v) => v + 1); sfx("hit");
          const tg = targets.find((t) => t.mesh === h.object);
          if (tg) { tg.mesh.visible = false; window.setTimeout(() => { tg.mesh.visible = true; }, 700); }
          syncHud();
        }
      } else { addTracer(mw, mw.clone().add(dir.multiplyScalar(200))); }
      syncHud();
    };

    /* ---------- input ---------- */
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (e.code === "KeyR") reload();
      if (e.code === "Space" && state.canJump) { state.vel.y = 6.6; state.canJump = false; }
    };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    const onMouseDown = (e: MouseEvent) => { if (!controls.isLocked) return; if (e.button === 0) state.mouseDown = true; if (e.button === 2) state.ads = true; };
    const onMouseUp = (e: MouseEvent) => { if (e.button === 0) state.mouseDown = false; if (e.button === 2) state.ads = false; };
    const onContext = (e: Event) => e.preventDefault();
    document.addEventListener("keydown", onKeyDown); document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousedown", onMouseDown); document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("contextmenu", onContext);
    controls.addEventListener("lock", () => setPhase("playing"));
    controls.addEventListener("unlock", () => { if (state.alive) setPhase("paused"); });

    /* ---------- collision ---------- */
    const collide = (pos: THREE.Vector3, r: number) => {
      for (const c of colliders) {
        const cx = Math.max(c.minx, Math.min(pos.x, c.maxx));
        const cz = Math.max(c.minz, Math.min(pos.z, c.maxz));
        const dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 < r * r) { const d = Math.sqrt(d2) || 0.0001; pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d); }
      }
      const lim = ARENA - 1.5; pos.x = Math.max(-lim, Math.min(lim, pos.x)); pos.z = Math.max(-lim, Math.min(lim, pos.z));
    };

    /* ---------- start / reset ---------- */
    const reset = (m: Mode, idx: number) => {
      for (let i = bots.length - 1; i >= 0; i--) removeBot(i);
      targets.length = 0; targetParts.length = 0;
      buildMap(idx);
      state.hp = 100; state.ammo = MAG; state.score = 0; state.kills = 0; state.shots = 0; state.hits = 0;
      state.reloading = false; state.alive = true; state.mode = m; state.vel.set(0, 0, 0);
      camera.position.set(0, 1.7, 0); camera.rotation.set(0, 0, 0);
      if (m === "single") { state.maxBots = 6; for (let i = 0; i < 6; i++) makeBot((spawns[i % spawns.length] || pickRoam()).clone(), false); }
      else { // training
        for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; makeTarget(new THREE.Vector3(Math.cos(a) * (16 + (i % 3) * 6), 0, Math.sin(a) * (16 + (i % 3) * 6))); }
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.4; makeBot(new THREE.Vector3(Math.cos(a) * 26, 0, Math.sin(a) * 26), true); }
      }
      syncHud(true);
    };
    apiRef.current = {
      start: (m, idx) => {
        if (!state.alive || phaseRef.current === "menu" || phaseRef.current === "dead") reset(m, idx);
        controls.lock();
      },
    };
    const die = () => { state.alive = false; controls.unlock(); setPhase("dead"); };

    const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener("resize", onResize);

    /* ---------- main loop ---------- */
    const clock = new THREE.Clock();
    const tmp = new THREE.Vector3();
    const eye = new THREE.Vector3();
    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      for (const u of waterUpdaters) u(t);
      const playing = controls.isLocked && state.alive;

      if (playing) {
        const sprint = keys["ShiftLeft"] ? 1.7 : 1;
        const accel = 58 * sprint, damp = 9;
        state.vel.x -= state.vel.x * damp * dt; state.vel.z -= state.vel.z * damp * dt; state.vel.y -= 20 * dt;
        const fwd = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0);
        const side = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);
        if (fwd) state.vel.z -= fwd * accel * dt; if (side) state.vel.x += side * accel * dt;
        controls.moveRight(state.vel.x * dt); controls.moveForward(-state.vel.z * dt);
        camera.position.y += state.vel.y * dt;
        if (camera.position.y < 1.7) { camera.position.y = 1.7; state.vel.y = 0; state.canJump = true; }
        collide(camera.position, 0.5);

        const targetFov = state.ads ? 48 : 80;
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix();
        gun.position.x += (((state.ads ? 0.0 : 0.3)) - gun.position.x) * Math.min(1, dt * 12);
        gun.position.y += (((state.ads ? -0.16 : -0.26)) - gun.position.y) * Math.min(1, dt * 12);
        gun.position.z += (-0.55 - gun.position.z) * Math.min(1, dt * 13);
        gun.rotation.x += (0 - gun.rotation.x) * Math.min(1, dt * 13);

        const rate = 95;
        if (state.mouseDown && performance.now() - state.lastShot >= rate) shoot();

        // bots
        eye.copy(camera.position);
        for (let i = bots.length - 1; i >= 0; i--) {
          const b = bots[i];
          if (b.dummy) continue;
          tmp.set(eye.x - b.group.position.x, 0, eye.z - b.group.position.z);
          const dist = tmp.length(); tmp.normalize();
          // LOS check
          let canSee = dist < 70;
          if (canSee) {
            losRay.set(new THREE.Vector3(b.group.position.x, 1.6, b.group.position.z), new THREE.Vector3(eye.x - b.group.position.x, eye.y - 1.6, eye.z - b.group.position.z).normalize());
            losRay.far = dist;
            const blocked = losRay.intersectObjects(solids, false);
            if (blocked.length && blocked[0].distance < dist - 1) canSee = false;
          }
          if (canSee && dist < 60) {
            // chase to a comfortable range then strafe
            if (dist > 14) b.group.position.addScaledVector(tmp, b.speed * dt);
            b.group.rotation.y = Math.atan2(tmp.x, tmp.z);
            collide(b.group.position, 0.5);
            // leg walk anim
            const legs = b.group.userData.legs as THREE.Mesh[];
            if (legs) { legs[0].rotation.x = Math.sin(t * 8) * 0.5; legs[1].rotation.x = -Math.sin(t * 8) * 0.5; }
            // shoot at player
            const now = performance.now();
            if (now - b.lastShot > 900) {
              b.lastShot = now + Math.random() * 400;
              const mz = new THREE.Vector3(b.group.position.x, 1.5, b.group.position.z);
              addTracer(mz, eye.clone(), 0xff5a3c); sfx("enemy");
              const hitChance = Math.max(0.12, Math.min(0.72, 1 - dist / 65));
              if (Math.random() < hitChance) {
                state.hp -= 7 + Math.random() * 6; setDmgFlash((v) => v + 1); syncHud(true);
                if (state.hp <= 0) { state.hp = 0; syncHud(true); die(); }
              }
            }
          } else {
            // roam
            tmp.set(b.roam.x - b.group.position.x, 0, b.roam.z - b.group.position.z);
            if (tmp.length() < 2) b.roam = pickRoam(); else { tmp.normalize(); b.group.position.addScaledVector(tmp, b.speed * 0.6 * dt); b.group.rotation.y = Math.atan2(tmp.x, tmp.z); collide(b.group.position, 0.5); }
          }
        }
        // training dummies face player + bob
        if (state.mode === "training") for (const b of bots) if (b.dummy) { tmp.set(eye.x - b.group.position.x, 0, eye.z - b.group.position.z).normalize(); b.group.rotation.y = Math.atan2(tmp.x, tmp.z); }

        syncHud();
      }

      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt; const m = tracers[i].line.material as THREE.LineBasicMaterial;
        m.opacity = Math.max(0, tracers[i].life / 0.06) * 0.9;
        if (tracers[i].life <= 0) { world.remove(tracers[i].line); tracers[i].line.geometry.dispose(); (tracers[i].line.material as THREE.Material).dispose(); tracers.splice(i, 1); }
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKeyDown); document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("mousedown", onMouseDown); document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("contextmenu", onContext);
      controls.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      if (actx) actx.close().catch(() => {});
    };
  }, []);

  const lowHp = hud.hp <= 30;
  const acc = hud.shots ? Math.round((hud.hits / hud.shots) * 100) : 0;

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="absolute inset-0" />
      <div key={dmgFlash} className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 160px 50px rgba(220,40,40,0.55)", opacity: 0, animation: dmgFlash ? "fadeIn 0.1s ease forwards reverse" : undefined }} />

      {phase === "playing" && (
        <>
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative h-6 w-6">
              <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-white/80" />
              <span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-white/80" />
              <span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white/80" />
              <span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white/80" />
              <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
            </div>
          </div>
          {hit > 0 && (
            <div key={hit} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" style={{ animation: "fadeIn 0.18s ease forwards reverse" }}>
              <div className="relative h-7 w-7">
                <span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-red-400" /><span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-red-400" />
                <span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-red-400" /><span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-red-400" />
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between p-4 text-sm hud-shadow">
            <div className="rounded-lg bg-black/40 px-3 py-1.5">
              {hud.mode === "single" ? <>ENEMIES <span className="font-bold text-red-400">{hud.alive}</span></> : <>ACCURACY <span className="font-bold text-cyan-300">{acc}%</span> <span className="opacity-50">({hud.hits}/{hud.shots})</span></>}
            </div>
            <div className="rounded-lg bg-black/40 px-3 py-1.5">SCORE <span className="font-bold text-yellow-300">{hud.score}</span> <span className="opacity-50">· {hud.kills} kills</span></div>
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-end justify-between p-5 hud-shadow">
            <div className="w-56">
              <div className="mb-1 flex justify-between text-xs"><span className={lowHp ? "text-red-400" : "text-emerald-300"}>HP</span><span>{hud.hp}</span></div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-white/10"><div className={`h-full transition-all ${lowHp ? "bg-red-500" : "bg-emerald-400"}`} style={{ width: `${hud.hp}%` }} /></div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold tabular-nums">{hud.reloading ? <span className="text-xl text-yellow-300">RELOADING…</span> : <>{hud.ammo}<span className="text-base opacity-50"> / {hud.mag}</span></>}</div>
              <div className="text-xs opacity-60">🔫 RIFLE <span className="opacity-50">(R reload · RMB aim)</span></div>
            </div>
          </div>
        </>
      )}

      {phase === "menu" && (
        <Overlay>
          <Title />
          <p className="mt-2 text-sm text-white/55">Pick a mode and a map.</p>
          {/* mode */}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ModeCard active={mode === "single"} onClick={() => setMode("single")} icon="🤖" title="Single Player" desc="Fight bots across the map" />
            <ModeCard active={mode === "training"} onClick={() => setMode("training")} icon="🎯" title="Training" desc="Targets + dummies, track accuracy" />
            <ModeCard active={false} onClick={() => setPhase("multiplayer")} icon="🌐" title="Multiplayer" desc="Online — coming soon" soon />
          </div>
          {/* map */}
          <p className="mt-7 text-xs uppercase tracking-widest text-white/50">Map</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {MAPS.map((m, i) => (
              <button key={m.name} onClick={() => setMapIdx(i)} className={`rounded-lg border px-4 py-2 text-left transition ${mapIdx === i ? "border-cyan-400 bg-cyan-400/10" : "border-white/15 hover:border-white/40"}`}>
                <div className="text-sm font-bold">{m.name}</div>
                <div className="text-[11px] text-white/50">{m.desc}</div>
              </button>
            ))}
          </div>
          <PlayButton label="▶ CLICK TO PLAY" onClick={() => apiRef.current?.start(mode, mapIdx)} />
          <Controls />
        </Overlay>
      )}

      {phase === "multiplayer" && (
        <Overlay>
          <h2 className="text-3xl font-bold tracking-widest text-cyan-300">🌐 ONLINE MULTIPLAYER</h2>
          <p className="mt-4 max-w-md text-center text-sm text-white/70">
            Real-time online multiplayer needs a dedicated game server (WebSockets + netcode) that Vercel can&apos;t host. It&apos;s <span className="text-yellow-300">coming soon</span> — it needs a separate realtime backend (e.g. a Colyseus/Socket.IO server on Railway/Fly.io).
          </p>
          <p className="mt-3 text-xs text-white/45">For now, Single Player vs bots plays the same way you&apos;d fight real opponents.</p>
          <PlayButton label="← Back" onClick={() => setPhase("menu")} />
        </Overlay>
      )}

      {phase === "paused" && (
        <Overlay>
          <h2 className="text-3xl font-bold tracking-widest">PAUSED</h2>
          <Controls />
          <PlayButton label="▶ RESUME" onClick={() => apiRef.current?.start(mode, mapIdx)} />
          <button onClick={() => setPhase("menu")} className="mt-3 text-sm text-white/50 hover:text-white">Main menu</button>
        </Overlay>
      )}

      {phase === "dead" && (
        <Overlay>
          <h2 className="text-4xl font-black tracking-widest text-red-500">YOU DIED</h2>
          <p className="mt-3 text-lg">Score <span className="font-bold text-yellow-300">{hud.score}</span> · {hud.kills} kills · {acc}% acc</p>
          <PlayButton label="↻ PLAY AGAIN" onClick={() => apiRef.current?.start(mode, mapIdx)} />
          <button onClick={() => setPhase("menu")} className="mt-3 text-sm text-white/50 hover:text-white">Main menu</button>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="fade-in absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 px-4 backdrop-blur-sm">{children}</div>;
}
function Title() {
  return <h1 className="text-center text-5xl font-black tracking-[0.2em] sm:text-7xl"><span className="text-cyan-300">STRIKE</span><span className="text-red-500">ZONE</span></h1>;
}
function ModeCard({ active, onClick, icon, title, desc, soon }: { active: boolean; onClick: () => void; icon: string; title: string; desc: string; soon?: boolean }) {
  return (
    <button onClick={onClick} className={`relative w-44 rounded-xl border p-4 text-left transition ${active ? "border-cyan-400 bg-cyan-400/10" : "border-white/15 hover:border-white/40"}`}>
      {soon && <span className="absolute right-2 top-2 rounded bg-yellow-400/20 px-1.5 py-0.5 text-[9px] font-bold text-yellow-300">SOON</span>}
      <div className="text-3xl">{icon}</div>
      <div className="mt-2 font-bold">{title}</div>
      <div className="text-[11px] text-white/55">{desc}</div>
    </button>
  );
}
function PlayButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button onClick={onClick} className="mt-7 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-8 py-3.5 text-lg font-bold text-black transition hover:scale-105 hover:brightness-110">{label}</button>;
}
function Controls() {
  const rows = [["WASD", "Move"], ["Mouse", "Look"], ["LMB", "Shoot"], ["RMB", "Aim"], ["Shift", "Sprint"], ["Space", "Jump"], ["R", "Reload"], ["Esc", "Pause"]];
  return (
    <div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-4">
      {rows.map(([k, v]) => (<div key={k} className="flex items-center gap-2"><span className="rounded bg-white/10 px-2 py-0.5 font-bold text-cyan-200">{k}</span><span className="text-white/60">{v}</span></div>))}
    </div>
  );
}
