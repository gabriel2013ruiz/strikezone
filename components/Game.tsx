"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type Phase = "menu" | "playing" | "paused" | "dead" | "multiplayer" | "win";
type Mode = "single" | "training";
type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

const ARENA = 110;
const MAPS = [
  { name: "Forest Lake", desc: "Pine woods, a big lake & cabins" },
  { name: "Harbor", desc: "Docks, sea, towers & crates" },
  { name: "Dust Town", desc: "Desert village, houses & towers" },
  { name: "Lakeside Villas", desc: "Houses, pools & gardens" },
];

interface Weapon { name: string; abbr: string; dmg: number; rate: number; mag: number; auto: boolean; fov: number; spread: number; pellets: number; rarity: Rarity; }
const WEAPONS: Record<string, Weapon> = {
  pistol: { name: "Pistol", abbr: "PST", dmg: 26, rate: 240, mag: 12, auto: false, fov: 46, spread: 0.012, pellets: 1, rarity: "common" },
  smg: { name: "SMG", abbr: "SMG", dmg: 17, rate: 70, mag: 30, auto: true, fov: 50, spread: 0.022, pellets: 1, rarity: "uncommon" },
  rifle: { name: "Rifle", abbr: "RIF", dmg: 33, rate: 100, mag: 30, auto: true, fov: 42, spread: 0.008, pellets: 1, rarity: "rare" },
  ak: { name: "AK-47", abbr: "AK", dmg: 36, rate: 120, mag: 30, auto: true, fov: 42, spread: 0.013, pellets: 1, rarity: "rare" },
  shotgun: { name: "Shotgun", abbr: "SHT", dmg: 12, rate: 650, mag: 6, auto: false, fov: 52, spread: 0.07, pellets: 9, rarity: "epic" },
  lmg: { name: "LMG", abbr: "LMG", dmg: 24, rate: 80, mag: 60, auto: true, fov: 48, spread: 0.02, pellets: 1, rarity: "epic" },
  sniper: { name: "Sniper", abbr: "SNP", dmg: 140, rate: 1200, mag: 5, auto: false, fov: 18, spread: 0.0, pellets: 1, rarity: "legendary" },
  dmr: { name: "Marksman", abbr: "DMR", dmg: 72, rate: 340, mag: 10, auto: false, fov: 28, spread: 0.002, pellets: 1, rarity: "legendary" },
};
interface GunSpec { body: number; barrel: number; barrelR: number; mag: number; stock: boolean; scope: boolean; color: number; }
const GUNSPEC: Record<string, GunSpec> = {
  pistol: { body: 0.32, barrel: 0.14, barrelR: 0.03, mag: 0.2, stock: false, scope: false, color: 0x202227 },
  smg: { body: 0.46, barrel: 0.2, barrelR: 0.03, mag: 0.28, stock: true, scope: false, color: 0x2a2d34 },
  rifle: { body: 0.72, barrel: 0.42, barrelR: 0.035, mag: 0.3, stock: true, scope: false, color: 0x14161b },
  ak: { body: 0.7, barrel: 0.4, barrelR: 0.04, mag: 0.34, stock: true, scope: false, color: 0x3a2a1a },
  shotgun: { body: 0.68, barrel: 0.5, barrelR: 0.06, mag: 0.14, stock: true, scope: false, color: 0x3a2418 },
  lmg: { body: 0.82, barrel: 0.55, barrelR: 0.045, mag: 0.42, stock: true, scope: false, color: 0x1a1c20 },
  sniper: { body: 0.82, barrel: 0.62, barrelR: 0.028, mag: 0.2, stock: true, scope: true, color: 0x202830 },
  dmr: { body: 0.7, barrel: 0.5, barrelR: 0.03, mag: 0.26, stock: true, scope: true, color: 0x26221c },
};
const RARITY: Record<Rarity, { c: string; w: number }> = { common: { c: "#9aa0a8", w: 44 }, uncommon: { c: "#37c871", w: 28 }, rare: { c: "#3a9bff", w: 16 }, epic: { c: "#b15bff", w: 9 }, legendary: { c: "#ffb01f", w: 3 } };
const RAR_POOL: Record<Rarity, string[]> = { common: ["pistol"], uncommon: ["smg"], rare: ["rifle", "ak"], epic: ["shotgun", "lmg"], legendary: ["sniper", "dmr"] };
const HEALS: Record<string, { name: string; icon: string; amt: number; rarity: Rarity }> = { bandaid: { name: "Bandaid", icon: "🩹", amt: 15, rarity: "common" }, medkit: { name: "Medkit", icon: "💊", amt: 40, rarity: "rare" } };

interface Slot { type: "empty" | "weapon" | "heal"; wId?: string; ammo?: number; reserve?: number; hId?: string; count?: number; }
const emptyInv = (): Slot[] => Array.from({ length: 7 }, () => ({ type: "empty" as const }));

function tex(draw: (c: CanvasRenderingContext2D, s: number) => void, size = 256, repeat = 1) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size; draw(cv.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export default function Game() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [mode, setMode] = useState<Mode>("single");
  const [mapIdx, setMapIdx] = useState(0);
  const [hud, setHud] = useState({ hp: 100, ammo: 12, mag: 12, reserve: 24, score: 0, kills: 0, shots: 0, hits: 0, reloading: false, mode: "single" as Mode, alive: 0, wname: "Pistol" });
  const [inv, setInv] = useState<Slot[]>(emptyInv());
  const [equip, setEquip] = useState(0);
  const [hit, setHit] = useState(0); const [dmgFlash, setDmgFlash] = useState(0);
  const [aiming, setAiming] = useState(false); const [hidden, setHidden] = useState(false);
  const [prompt, setPrompt] = useState(""); const [toast, setToast] = useState(""); const [count, setCount] = useState(0);

  const apiRef = useRef<{ start: (mode: Mode, map: number) => void } | null>(null);
  const phaseRef = useRef<Phase>("menu"); phaseRef.current = phase;

  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 1200); camera.position.set(0, 1.7, 0); scene.add(camera);
    const hemi = new THREE.HemisphereLight(0xbcd3ff, 0x4a4636, 0.8); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.6); sun.position.set(80, 120, 50); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 1; sun.shadow.camera.far = 400;
    const scam = sun.shadow.camera as THREE.OrthographicCamera; scam.left = -120; scam.right = 120; scam.top = 120; scam.bottom = -120; sun.shadow.bias = -0.0004; scene.add(sun);
    // image-based lighting for realistic PBR reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;

    const worldGrp = new THREE.Group(); scene.add(worldGrp);
    const solids: THREE.Object3D[] = []; const floors: THREE.Object3D[] = [];
    type Col = { minx: number; minz: number; maxx: number; maxz: number };
    const colliders: Col[] = []; const spawnSpots: THREE.Vector3[] = []; const spawns: THREE.Vector3[] = [];
    const waterUpdaters: ((t: number) => void)[] = []; const bushZones: { x: number; z: number; r: number }[] = [];
    interface Door { pivot: THREE.Group; open: boolean; target: number; col: Col; saved: Col; pos: THREE.Vector3; }
    const doors: Door[] = [];
    interface Pickup { group: THREE.Group; pos: THREE.Vector3; active: boolean; respawn: number; }
    const pickups: Pickup[] = [];
    interface Chest { group: THREE.Group; pos: THREE.Vector3; opened: boolean; glow: THREE.Mesh; lid: THREE.Group; }
    const chests: Chest[] = [];

    const clearWorld = () => {
      worldGrp.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = o.material; Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose(); } });
      while (worldGrp.children.length) worldGrp.remove(worldGrp.children[0]);
      solids.length = 0; floors.length = 0; colliders.length = 0; spawnSpots.length = 0; spawns.length = 0; waterUpdaters.length = 0; bushZones.length = 0; doors.length = 0; pickups.length = 0; chests.length = 0;
    };
    const pushCol = (a: number, b: number, c: number, d: number): Col => { const col = { minx: a, minz: b, maxx: c, maxz: d }; colliders.push(col); return col; };
    const addSolid = (m: THREE.Mesh, col = true) => { worldGrp.add(m); solids.push(m); if (col) { const b = new THREE.Box3().setFromObject(m); pushCol(b.min.x, b.min.z, b.max.x, b.max.z); } };
    const addFloor = (m: THREE.Mesh) => { worldGrp.add(m); floors.push(m); solids.push(m); };

    const groundTex = (a: string, b: string) => tex((c, s) => { c.fillStyle = a; c.fillRect(0, 0, s, s); for (let i = 0; i < 2000; i++) { c.fillStyle = Math.random() > 0.5 ? b : a; const r = Math.random() * 2.2; c.fillRect(Math.random() * s, Math.random() * s, r, r); } }, 256, 30);
    const winTex = (base: string) => tex((c, s) => { c.fillStyle = base; c.fillRect(0, 0, s, s); for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = Math.random() > 0.6 ? "#ffe9a8" : "#28323f"; c.fillRect(40 + x * 50, 40 + y * 50, 34, 34); } }, 256, 1);

    const makeCrate = (x: number, z: number, s: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshStandardMaterial({ color: 0x8a6b3f, roughness: 0.85 })); m.position.set(x, s / 2, z); m.castShadow = true; m.receiveShadow = true; addSolid(m, true); };
    const makeTree = (x: number, z: number) => { const th = 3.5 + Math.random() * 2.5; const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, th, 7), new THREE.MeshStandardMaterial({ color: 0x5b3f24, roughness: 1 })); trunk.position.set(x, th / 2, z); trunk.castShadow = true; worldGrp.add(trunk); solids.push(trunk); pushCol(x - 0.45, z - 0.45, x + 0.45, z + 0.45); for (let i = 0; i < 3; i++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(2.3 - i * 0.5, 2.4, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x2f6b34 : 0x37803f, roughness: 1 })); cone.position.set(x, th - 0.5 + i * 1.3, z); cone.castShadow = true; worldGrp.add(cone); } };
    const makeBush = (x: number, z: number, big = false) => { const g = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0x356b39, roughness: 1 }); const n = big ? 7 : 4; const sc = big ? 1.3 : 1; for (let i = 0; i < n; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry((0.6 + Math.random() * 0.5) * sc, 0), mat); s.position.set((Math.random() - 0.5) * 1.6 * sc, (0.5 + Math.random() * 0.5) * sc, (Math.random() - 0.5) * 1.6 * sc); s.castShadow = true; g.add(s); } g.position.set(x, 0, z); worldGrp.add(g); bushZones.push({ x, z, r: big ? 1.8 : 1.2 }); spawnSpots.push(new THREE.Vector3(x, 0, z)); };
    const makeWater = (x: number, z: number, w: number, d: number) => { const geo = new THREE.PlaneGeometry(w, d, Math.min(40, w / 3 | 0), Math.min(40, d / 3 | 0)); const mat = new THREE.MeshStandardMaterial({ color: 0x2f7596, transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.55 }); const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z); m.receiveShadow = true; worldGrp.add(m); const base = Float32Array.from(geo.attributes.position.array); waterUpdaters.push((t) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const ix = i * 3; p.setZ(i, Math.sin(base[ix] * 0.4 + t * 1.4) * 0.14 + Math.cos(base[ix + 1] * 0.4 + t * 1.1) * 0.14); } p.needsUpdate = true; }); };
    const makeMedkit = (x: number, z: number) => { const g = new THREE.Group(); const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x114411, emissiveIntensity: 0.4 })); const cm = new THREE.MeshStandardMaterial({ color: 0x22c55e }); const cv = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.62), cm); const ch = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.62), cm); g.add(box, cv, ch); g.position.set(x, 0.9, z); worldGrp.add(g); pickups.push({ group: g, pos: new THREE.Vector3(x, 0.9, z), active: true, respawn: 0 }); };

    const doorWall = (cx: number, cz: number, w: number, d: number, base: string, H: number) => {
      const T = 0.3, doorW = 1.5, doorH = 2.3;
      const wmat = () => new THREE.MeshStandardMaterial({ map: winTex(base), roughness: 0.9 });
      const wall = (x: number, y: number, z: number, sx: number, sy: number, sz: number, col = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wmat()); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; worldGrp.add(m); solids.push(m); if (col) { const b = new THREE.Box3().setFromObject(m); pushCol(b.min.x, b.min.z, b.max.x, b.max.z); } };
      wall(cx, H / 2, cz - d / 2, w, H, T); wall(cx - w / 2, H / 2, cz, T, H, d); wall(cx + w / 2, H / 2, cz, T, H, d);
      const segW = (w - doorW) / 2;
      wall(cx - (doorW / 2 + segW / 2), H / 2, cz + d / 2, segW, H, T); wall(cx + (doorW / 2 + segW / 2), H / 2, cz + d / 2, segW, H, T);
      wall(cx, doorH + (H - doorH) / 2, cz + d / 2, doorW, H - doorH, T, false);
      const pivot = new THREE.Group(); pivot.position.set(cx - doorW / 2, 0, cz + d / 2); worldGrp.add(pivot);
      const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 })); door.position.set(doorW / 2, doorH / 2, 0); door.castShadow = true; pivot.add(door); solids.push(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.3 })); knob.position.set(doorW - 0.15, doorH / 2, 0.08); pivot.add(knob);
      const col = pushCol(cx - doorW / 2, cz + d / 2 - 0.1, cx + doorW / 2, cz + d / 2 + 0.1);
      doors.push({ pivot, open: false, target: 0, col, saved: { ...col }, pos: pivot.position.clone() });
    };

    const makeHouse = (cx: number, cz: number, w: number, d: number, base: string) => {
      const H = 3.2; doorWall(cx, cz, w, d, base, H);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshStandardMaterial({ color: 0x6b5b48, roughness: 1 })); floor.position.set(cx, 0.05, cz); floor.receiveShadow = true; addFloor(floor);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.95 })); roof.position.set(cx, H + 0.15, cz); roof.castShadow = true; worldGrp.add(roof); solids.push(roof);
      // interior props
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.7), new THREE.MeshStandardMaterial({ color: 0x6e4a2c })); table.position.set(cx, 0.9, cz - d / 4); addSolid(table, true);
      makeCrate(cx + w / 4, cz + d / 4, 0.9);
      spawnSpots.push(new THREE.Vector3(cx, 0, cz));
    };

    const makeTower = (cx: number, cz: number, w: number, d: number, base: string, storeys = 2) => {
      const H = 3.4 * storeys; doorWall(cx, cz, w, d, base, H);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 1 })); floor.position.set(cx, 0.05, cz); floor.receiveShadow = true; addFloor(floor);
      // walkable roof
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 1 })); roof.position.set(cx, H, cz); roof.castShadow = true; roof.receiveShadow = true; addFloor(roof);
      // roof railings (cover) leaving a gap on +x for stair arrival
      const rh = 1, rt = 0.25;
      const rail = (x: number, z: number, sx: number, sz: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, rh, sz), new THREE.MeshStandardMaterial({ color: 0x3a3a42 })); m.position.set(x, H + rh / 2, z); addSolid(m, true); };
      rail(cx, cz - d / 2, w, rt); rail(cx - w / 2, cz, rt, d); rail(cx, cz + d / 2, w, rt);
      // external staircase up +x side (rises front->back)
      const steps = Math.round(H / 0.42); const stepH = H / steps, stepD = 0.7, sx = cx + w / 2 + 1.1, swid = 1.6;
      for (let i = 0; i <= steps; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(swid, stepH, stepD), new THREE.MeshStandardMaterial({ color: 0x55555c, roughness: 1 })); st.position.set(sx, (i + 0.5) * stepH, cz + d / 2 - 0.4 - i * stepD); st.castShadow = true; st.receiveShadow = true; addFloor(st); }
      // landing onto roof
      const land = new THREE.Mesh(new THREE.BoxGeometry(swid + 0.6, 0.25, 1.4), new THREE.MeshStandardMaterial({ color: 0x4a4a52 })); land.position.set(cx + w / 2 - 0.2, H, cz - d / 2 + 1.2); addFloor(land);
      spawnSpots.push(new THREE.Vector3(cx, 0, cz));
    };

    const woodTex = tex((c, s) => { c.fillStyle = "#6b4a26"; c.fillRect(0, 0, s, s); for (let i = 0; i < s; i += 22) { c.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.08})`; c.fillRect(0, i, s, 3); c.fillStyle = `rgba(255,220,170,${0.04})`; c.fillRect(0, i + 8, s, 2); } });
    const makeChest = (x: number, z: number) => {
      const g = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.75, metalness: 0.05 });
      const metal = new THREE.MeshStandardMaterial({ color: 0x4a4036, metalness: 0.9, roughness: 0.35 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.25, emissive: 0x3a2e08, emissiveIntensity: 0.4 });
      // base
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.74), wood); base.position.y = 0.32; base.castShadow = true; base.receiveShadow = true; g.add(base);
      // metal bands on base
      for (const bx of [-0.42, 0.42]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.64, 0.78), metal); band.position.set(bx, 0.32, 0); g.add(band); }
      // curved lid on a pivot (hinged at back)
      const lid = new THREE.Group(); lid.position.set(0, 0.62, -0.37); g.add(lid);
      const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 1.1, 16, 1, false, 0, Math.PI), wood); dome.rotation.z = Math.PI / 2; dome.position.set(0, 0, 0.37); dome.castShadow = true; lid.add(dome);
      for (const bx of [-0.42, 0.42]) { const lband = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.035, 8, 16, Math.PI), metal); lband.rotation.y = Math.PI / 2; lband.position.set(bx, 0, 0.37); lid.add(lband); }
      // gold lock + corners
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.07), gold); lock.position.set(0, 0.5, 0.39); g.add(lock);
      for (const cx of [-0.5, 0.5]) for (const cz of [-0.32, 0.32]) { const cor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.1), metal); cor.position.set(cx, 0.32, cz); g.add(cor); }
      // glow aura (rises a beam)
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.4, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); glow.position.y = 1.2; g.add(glow);
      g.position.set(x, 0, z); worldGrp.add(g);
      chests.push({ group: g, pos: new THREE.Vector3(x, 0.6, z), opened: false, glow, lid });
      spawnSpots.push(new THREE.Vector3(x, 0, z));
    };

    const buildMap = (idx: number) => {
      clearWorld();
      const P = [
        { g: ["#3b5a2e", "#314e27"], sky: ["#5b86c4", "#d8e2ee"], bld: "#7c8694" },
        { g: ["#454c55", "#3a4049"], sky: ["#6b7f9e", "#c2cedd"], bld: "#5d6470" },
        { g: ["#a98b5b", "#8f7148"], sky: ["#d8c79b", "#efe6cf"], bld: "#c2a878" },
        { g: ["#4a6b3a", "#3e5b31"], sky: ["#79a7d6", "#dfeaf4"], bld: "#9aa3ad" },
      ][idx];
      const rand = (a: number, b: number) => a + Math.random() * (b - a);
      const ring = (r: number, n: number, cb: (x: number, z: number, i: number) => void) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rand(-0.18, 0.18); cb(Math.cos(a) * r, Math.sin(a) * r, i); } };
      const clearOf = (x: number, z: number) => Math.hypot(x, z) > 9;

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshStandardMaterial({ map: groundTex(P.g[0], P.g[1]), roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; addFloor(ground);
      const bh = 8; for (const [x, z, w, d] of [[0, -ARENA, ARENA * 2, 2], [0, ARENA, ARENA * 2, 2], [-ARENA, 0, 2, ARENA * 2], [ARENA, 0, 2, ARENA * 2]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, bh, d), new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 1 })); m.position.set(x, bh / 2, z); addSolid(m, true); }

      if (idx === 0) {
        makeWater(40, -34, 60, 48);
        ring(46, 5, (x, z) => makeHouse(x, z, rand(7, 10), rand(7, 10), P.bld));
        ring(70, 5, (x, z) => makeTower(x, z, rand(9, 12), rand(9, 12), P.bld, 2));
        for (let i = 0; i < 80; i++) { const x = rand(-ARENA + 6, ARENA - 6), z = rand(-ARENA + 6, ARENA - 6); if (Math.hypot(x - 40, z + 34) > 32 && clearOf(x, z)) makeTree(x, z); }
        for (let i = 0; i < 50; i++) makeBush(rand(-ARENA + 6, ARENA - 6), rand(-ARENA + 6, ARENA - 6), Math.random() > 0.5);
      } else if (idx === 1) {
        makeWater(0, -78, ARENA * 2, 70);
        ring(34, 6, (x, z) => makeHouse(x, z, rand(8, 11), rand(8, 11), P.bld));
        ring(64, 8, (x, z) => makeTower(x, z, rand(10, 13), rand(10, 13), P.bld, 2));
        for (let i = 0; i < 70; i++) makeCrate(rand(-70, 70), rand(-55, 80), rand(1.4, 2.8));
        for (let i = 0; i < 22; i++) makeBush(rand(-80, 80), rand(20, 80), Math.random() > 0.5);
      } else if (idx === 2) {
        ring(24, 7, (x, z) => makeHouse(x, z, rand(7, 10), rand(7, 10), P.bld));
        ring(50, 9, (x, z) => makeTower(x, z, rand(8, 12), rand(8, 12), P.bld, 2));
        ring(78, 11, (x, z) => makeHouse(x, z, rand(6, 9), rand(6, 9), P.bld));
        for (let i = 0; i < 55; i++) makeCrate(rand(-75, 75), rand(-75, 75), rand(1.2, 2.4));
        for (let i = 0; i < 24; i++) makeBush(rand(-75, 75), rand(-75, 75), Math.random() > 0.6);
      } else {
        makeWater(-46, 40, 50, 40);
        ring(30, 7, (x, z, i) => { makeHouse(x, z, rand(8, 11), rand(8, 11), P.bld); if (i % 2 === 0) makeWater(x * 1.4, z * 1.4, rand(6, 9), rand(5, 8)); });
        ring(60, 8, (x, z) => makeTower(x, z, rand(9, 12), rand(9, 12), P.bld, 2));
        for (let i = 0; i < 60; i++) makeTree(rand(-ARENA + 6, ARENA - 6), rand(-ARENA + 6, ARENA - 6));
        for (let i = 0; i < 55; i++) makeBush(rand(-ARENA + 6, ARENA - 6), rand(-ARENA + 6, ARENA - 6), Math.random() > 0.4);
      }

      // chests + medkits
      ring(38, 8, (x, z) => makeChest(x, z)); ring(64, 6, (x, z) => makeChest(x, z));
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.3; const r = 20 + (i % 3) * 22; makeMedkit(Math.cos(a) * r, Math.sin(a) * r); }
      ring(82, 14, (x, z) => spawns.push(new THREE.Vector3(x, 0, z)));
      scene.background = tex((c, s) => { const g = c.createLinearGradient(0, 0, 0, s); g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]); c.fillStyle = g; c.fillRect(0, 0, s, s); });
      scene.fog = new THREE.Fog(new THREE.Color(P.sky[1]).getHex(), 90, 240);
    };

    /* ---------- gun (per-weapon view model) ---------- */
    const gun = new THREE.Group(); gun.position.set(0.3, -0.26, -0.55); camera.add(gun);
    const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, -0.92); gun.add(muzzle);
    const muzzleLight = new THREE.PointLight(0xffcc66, 0, 10); muzzle.add(muzzleLight);
    const gunParts: THREE.Mesh[] = [];
    const setViewModel = (wId: string) => {
      for (const p of gunParts) { gun.remove(p); p.geometry.dispose(); (p.material as THREE.Material).dispose(); }
      gunParts.length = 0;
      const sp = GUNSPEC[wId] || GUNSPEC.pistol;
      const matMain = new THREE.MeshStandardMaterial({ color: sp.color, roughness: 0.45, metalness: 0.85 });
      const matDark = new THREE.MeshStandardMaterial({ color: 0x1c1e23, roughness: 0.6, metalness: 0.6 });
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rx) m.rotation.x = rx; gun.add(m); gunParts.push(m); };
      add(new THREE.BoxGeometry(0.14, 0.14, sp.body), matMain, 0, 0, 0);
      add(new THREE.CylinderGeometry(sp.barrelR, sp.barrelR, sp.barrel, 12), matDark, 0, 0.02, -sp.body / 2 - sp.barrel / 2, Math.PI / 2);
      add(new THREE.BoxGeometry(0.1, sp.mag, 0.13), matDark, 0, -sp.mag / 2 - 0.03, 0.05);
      add(new THREE.BoxGeometry(0.09, 0.2, 0.12), matDark, 0, -0.14, 0.2, 0.3);
      if (sp.stock) add(new THREE.BoxGeometry(0.1, 0.13, 0.28), matDark, 0, -0.03, sp.body / 2 + 0.14);
      if (sp.scope) { add(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 12), matDark, 0, 0.14, -0.08, Math.PI / 2); add(new THREE.BoxGeometry(0.04, 0.06, 0.05), matDark, 0, 0.1, -0.08); }
      else add(new THREE.BoxGeometry(0.04, 0.06, 0.2), matMain, 0, 0.11, -0.04);
      muzzle.position.set(0, 0.02, -sp.body / 2 - sp.barrel - 0.04);
    };
    setViewModel("pistol");

    /* ---------- bots ---------- */
    interface Bot { group: THREE.Group; head: THREE.Mesh; body: THREE.Mesh; hp: number; speed: number; lastShot: number; roam: THREE.Vector3; dummy: boolean; dying?: boolean; dieAt?: number; }
    const bots: Bot[] = []; const botParts: THREE.Object3D[] = [];
    const pickRoam = () => new THREE.Vector3((Math.random() - 0.5) * ARENA * 1.7, 0, (Math.random() - 0.5) * ARENA * 1.7);
    const makeBot = (pos: THREE.Vector3, dummy: boolean) => {
      const g = new THREE.Group(); const team = dummy ? 0xc9a23a : 0x9aa0a8; const skin = new THREE.MeshStandardMaterial({ color: 0xd9a878, roughness: 0.7 }); const vest = new THREE.MeshStandardMaterial({ color: team, roughness: 0.8 }); const dark = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.85 }); const helmet = new THREE.MeshStandardMaterial({ color: dummy ? 0xc9a23a : 0x3a4a3a, roughness: 0.7 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.42), vest); torso.position.y = 1.35; torso.name = "body"; const hips = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), dark); hips.position.y = 0.78; const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.42, 0.4), skin); head.position.y = 2.04; head.name = "head"; const hel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.46), helmet); hel.position.y = 2.22;
      const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.82, 0.26), dark); lLeg.position.set(-0.16, 0.42, 0); const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.82, 0.26), dark); rLeg.position.set(0.16, 0.42, 0); const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.2), vest); lArm.position.set(-0.46, 1.34, 0); const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.2), vest); rArm.position.set(0.46, 1.34, 0.05); const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.6), dark); rifle.position.set(0.5, 1.25, -0.25);
      [torso, hips, head, hel, lLeg, rLeg, lArm, rArm, rifle].forEach((m) => { m.castShadow = true; g.add(m); }); g.position.copy(pos); g.userData.legs = [lLeg, rLeg]; worldGrp.add(g);
      const bot: Bot = { group: g, head, body: torso, hp: dummy ? 99999 : 100, speed: dummy ? 0 : 3 + Math.random() * 1.4, lastShot: 0, roam: pickRoam(), dummy }; bots.push(bot); botParts.push(torso, head); return bot;
    };
    const removeBot = (i: number) => { const b = bots[i]; b.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); worldGrp.remove(b.group); [b.body, b.head].forEach((m) => { const k = botParts.indexOf(m); if (k >= 0) botParts.splice(k, 1); }); bots.splice(i, 1); };

    interface Target { mesh: THREE.Mesh; } const targets: Target[] = []; const targetParts: THREE.Object3D[] = [];
    const targetTex = tex((c, s) => { c.fillStyle = "#f4f4f4"; c.fillRect(0, 0, s, s); const cols = ["#222", "#f4f4f4", "#3a7bd5", "#f4f4f4", "#d33", "#f4f4f4", "#fc0"]; for (let i = 0; i < cols.length; i++) { c.beginPath(); c.arc(s / 2, s / 2, (s / 2) * (1 - i / cols.length), 0, Math.PI * 2); c.fillStyle = cols[i]; c.fill(); } });
    const makeTarget = (pos: THREE.Vector3) => { const g = new THREE.Group(); const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x333 })); stand.position.y = 0.6; const board = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshStandardMaterial({ map: targetTex, roughness: 0.7, side: THREE.DoubleSide })); board.position.y = 1.5; board.name = "target"; g.add(stand, board); g.position.copy(pos); worldGrp.add(g); targets.push({ mesh: board }); targetParts.push(board); };

    let actx: AudioContext | null = null;
    const sfx = (k: "shoot" | "hit" | "head" | "hurt" | "reload" | "enemy" | "heal" | "door" | "loot") => { try { if (!actx) actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination); const cfg = { shoot: [220, "square", 0.1, 0.07], hit: [620, "sine", 0.13, 0.05], head: [950, "sine", 0.18, 0.09], hurt: [110, "sawtooth", 0.2, 0.18], reload: [320, "triangle", 0.09, 0.05], enemy: [180, "square", 0.05, 0.06], heal: [520, "sine", 0.16, 0.22], door: [140, "triangle", 0.12, 0.18], loot: [660, "triangle", 0.16, 0.3] }[k] as [number, OscillatorType, number, number]; o.type = cfg[1]; o.frequency.setValueAtTime(cfg[0], t); if (k === "shoot") o.frequency.exponentialRampToValueAtTime(80, t + cfg[3]); if (k === "heal" || k === "loot") o.frequency.exponentialRampToValueAtTime(990, t + cfg[3]); g.gain.setValueAtTime(cfg[2], t); g.gain.exponentialRampToValueAtTime(0.001, t + cfg[3]); o.start(t); o.stop(t + cfg[3]); } catch {} };

    /* ---------- state + inventory ---------- */
    const controls = new PointerLockControls(camera, renderer.domElement);
    const state = { hp: 100, score: 0, kills: 0, shots: 0, hits: 0, reloading: false, vel: new THREE.Vector3(), canJump: true, mouseDown: false, ads: false, lastShot: 0, alive: true, won: false, mode: "single" as Mode, inv: emptyInv(), equip: 0, countEnd: 0 };
    const keys: Record<string, boolean> = {};
    const raycaster = new THREE.Raycaster(); const losRay = new THREE.Raycaster(); const downRay = new THREE.Raycaster(); const DOWN = new THREE.Vector3(0, -1, 0);
    const curW = () => { const s = state.inv[state.equip]; return s && s.type === "weapon" && s.wId ? WEAPONS[s.wId] : WEAPONS.pistol; };
    let lastHudSync = 0;
    const syncHud = (force = false) => { const now = performance.now(); if (!force && now - lastHudSync < 80) return; lastHudSync = now; const s = state.inv[state.equip]; const w = curW(); setHud({ hp: Math.max(0, Math.round(state.hp)), ammo: s?.ammo ?? 0, mag: w.mag, reserve: s?.reserve ?? 0, score: state.score, kills: state.kills, shots: state.shots, hits: state.hits, reloading: state.reloading, mode: state.mode, alive: bots.filter((b) => !b.dummy && !b.dying).length, wname: w.name }); };
    const syncInv = () => { setInv(state.inv.map((s) => ({ ...s }))); setEquip(state.equip); };
    let lastAds = false, lastHidden = false, lastPrompt = "", toastT = 0, lastCount = 0;

    const tracers: { line: THREE.Line; life: number }[] = [];
    const addTracer = (from: THREE.Vector3, to: THREE.Vector3, color = 0xfff2a0) => { const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })); worldGrp.add(line); tracers.push({ line, life: 0.06 }); };

    const reload = () => { const s = state.inv[state.equip]; if (s.type !== "weapon") return; const w = curW(); if (state.reloading || (s.ammo ?? 0) >= w.mag || (s.reserve ?? 0) <= 0) return; state.reloading = true; syncHud(true); sfx("reload"); window.setTimeout(() => { const need = w.mag - (s.ammo ?? 0); const take = Math.min(need, s.reserve ?? 0); s.ammo = (s.ammo ?? 0) + take; s.reserve = (s.reserve ?? 0) - take; state.reloading = false; syncHud(true); }, 1100); };
    const shoot = () => {
      const s = state.inv[state.equip]; if (s.type !== "weapon" || !state.alive || state.reloading) return; const w = curW();
      if (now() < state.countEnd) return;
      if ((s.ammo ?? 0) <= 0) { reload(); return; }
      s.ammo = (s.ammo ?? 0) - 1; state.shots++; state.lastShot = performance.now(); sfx("shoot");
      gun.position.z = -0.45; gun.rotation.x = 0.05; muzzleLight.intensity = 7; window.setTimeout(() => { muzzleLight.intensity = 0; }, 40);
      const origin = camera.getWorldPosition(new THREE.Vector3()); const fwd = camera.getWorldDirection(new THREE.Vector3()); const mw = muzzle.getWorldPosition(new THREE.Vector3());
      const sp = state.ads ? w.spread * 0.15 : w.spread;
      for (let p = 0; p < w.pellets; p++) {
        const dir = fwd.clone(); if (sp) { dir.x += (Math.random() - 0.5) * sp; dir.y += (Math.random() - 0.5) * sp; dir.z += (Math.random() - 0.5) * sp; dir.normalize(); }
        raycaster.set(origin, dir); raycaster.far = 500;
        const hits = raycaster.intersectObjects([...botParts, ...targetParts, ...solids], false);
        if (hits.length) { const h = hits[0]; if (p === 0 || w.pellets <= 3) addTracer(mw, h.point);
          if (botParts.includes(h.object)) { const idx = bots.findIndex((b) => b.body === h.object || b.head === h.object); if (idx >= 0 && !bots[idx].dummy && !bots[idx].dying) { const head = h.object.name === "head"; bots[idx].hp -= head ? w.dmg * 3 : w.dmg; state.hits++; setHit((v) => v + 1); sfx(head ? "head" : "hit"); if (bots[idx].hp <= 0) { const b = bots[idx]; b.dying = true; b.dieAt = now() + 1000; const bi = botParts.indexOf(b.body); if (bi >= 0) botParts.splice(bi, 1); const hi = botParts.indexOf(b.head); if (hi >= 0) botParts.splice(hi, 1); state.kills++; state.score += head ? 150 : 100; } } else if (idx >= 0) { state.hits++; setHit((v) => v + 1); sfx("hit"); } }
          else if (targetParts.includes(h.object)) { state.hits++; state.score += 50; setHit((v) => v + 1); sfx("hit"); const tg = targets.find((t) => t.mesh === h.object); if (tg) { tg.mesh.visible = false; window.setTimeout(() => { tg.mesh.visible = true; }, 700); } }
        } else if (p === 0) addTracer(mw, mw.clone().add(dir.multiplyScalar(250)));
      }
      syncHud(true);
    };

    /* ---------- inventory ops ---------- */
    const showToast = (msg: string) => { setToast(msg); toastT = now() + 2200; };
    const addWeapon = (wId: string) => { let i = state.inv.findIndex((s) => s.type === "empty"); if (i < 0) i = state.equip; state.inv[i] = { type: "weapon", wId, ammo: WEAPONS[wId].mag, reserve: WEAPONS[wId].mag * 2 }; syncInv(); };
    const giveAmmo = () => { for (const s of state.inv) if (s.type === "weapon" && s.wId) { const cap = WEAPONS[s.wId].mag * 5; s.reserve = Math.min(cap, (s.reserve ?? 0) + WEAPONS[s.wId].mag); } syncInv(); syncHud(true); };
    const addHeal = (hId: string) => { let i = state.inv.findIndex((s) => s.type === "heal" && s.hId === hId); if (i >= 0) state.inv[i].count = (state.inv[i].count ?? 0) + 1; else { i = state.inv.findIndex((s) => s.type === "empty"); if (i < 0) return; state.inv[i] = { type: "heal", hId, count: 1 }; } syncInv(); };
    const useSlot = (i: number) => { const s = state.inv[i]; if (!s || s.type === "empty") return; if (s.type === "weapon") { state.equip = i; state.reloading = false; setViewModel(s.wId!); syncInv(); syncHud(true); } else if (s.type === "heal") { if (state.hp >= 100) return; const h = HEALS[s.hId!]; state.hp = Math.min(100, state.hp + h.amt); s.count = (s.count ?? 1) - 1; if ((s.count ?? 0) <= 0) state.inv[i] = { type: "empty" }; sfx("heal"); showToast(`+${h.amt} HP`); syncInv(); syncHud(true); } };
    const cycleW = (dir: number) => { const wi = state.inv.map((s, idx) => (s.type === "weapon" ? idx : -1)).filter((x) => x >= 0); if (!wi.length) return; let k = wi.indexOf(state.equip); k = (k + dir + wi.length) % wi.length; state.equip = wi[k]; state.reloading = false; setViewModel(state.inv[state.equip].wId!); syncInv(); syncHud(true); };
    const rollRarity = (): Rarity => { const total = (Object.keys(RARITY) as Rarity[]).reduce((a, r) => a + RARITY[r].w, 0); let x = Math.random() * total; for (const r of Object.keys(RARITY) as Rarity[]) { x -= RARITY[r].w; if (x <= 0) return r; } return "common"; };
    const openChest = (c: Chest) => { if (c.opened) return; c.opened = true; c.glow.visible = false; c.lid.rotation.x = -1.7; const r = rollRarity(); const pool = RAR_POOL[r]; const wId = pool[(Math.random() * pool.length) | 0]; addWeapon(wId); giveAmmo(); const healId = Math.random() < 0.78 ? "bandaid" : "medkit"; addHeal(healId); sfx("loot"); showToast(`📦 ${WEAPONS[wId].name} (${r}) + ${HEALS[healId].name} + ammo`); };

    function now() { return performance.now(); }
    const tryInteract = () => {
      let bestC: Chest | null = null, bd = 3.6; for (const c of chests) if (!c.opened) { const d = c.pos.distanceTo(camera.position); if (d < bd) { bd = d; bestC = c; } }
      if (bestC) { openChest(bestC); return; }
      let bi = -1; bd = 3.6; for (let i = 0; i < doors.length; i++) { const d = doors[i].pos.distanceTo(camera.position); if (d < bd) { bd = d; bi = i; } }
      if (bi >= 0) { const dr = doors[bi]; dr.open = !dr.open; dr.target = dr.open ? -Math.PI / 1.9 : 0; const c = dr.col; if (dr.open) { c.minx = c.maxx = c.minz = c.maxz = 99999; } else { c.minx = dr.saved.minx; c.maxx = dr.saved.maxx; c.minz = dr.saved.minz; c.maxz = dr.saved.maxz; } sfx("door"); }
    };

    const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; if (e.code === "KeyR") reload(); if (e.code === "KeyE") tryInteract(); if (e.code === "Space" && state.canJump) { state.vel.y = 6.4; state.canJump = false; } if (/^Digit[1-7]$/.test(e.code)) useSlot(+e.code.slice(5) - 1); };
    const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
    const onMouseDown = (e: MouseEvent) => { if (!controls.isLocked) return; if (e.button === 0) { state.mouseDown = true; if (!curW().auto) shoot(); } if (e.button === 2) state.ads = true; };
    const onMouseUp = (e: MouseEvent) => { if (e.button === 0) state.mouseDown = false; if (e.button === 2) state.ads = false; };
    const onWheel = (e: WheelEvent) => { if (controls.isLocked) cycleW(e.deltaY > 0 ? 1 : -1); };
    const onContext = (e: Event) => e.preventDefault();
    document.addEventListener("keydown", onKeyDown); document.addEventListener("keyup", onKeyUp); document.addEventListener("mousedown", onMouseDown); document.addEventListener("mouseup", onMouseUp); document.addEventListener("wheel", onWheel); document.addEventListener("contextmenu", onContext);
    controls.addEventListener("lock", () => setPhase("playing")); controls.addEventListener("unlock", () => { if (state.alive) setPhase("paused"); });

    const collide = (pos: THREE.Vector3, r: number) => { for (const c of colliders) { if (c.minx > 9000) continue; const cx = Math.max(c.minx, Math.min(pos.x, c.maxx)); const cz = Math.max(c.minz, Math.min(pos.z, c.maxz)); const dx = pos.x - cx, dz = pos.z - cz; const d2 = dx * dx + dz * dz; if (d2 < r * r) { const d = Math.sqrt(d2) || 0.0001; pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d); } } const lim = ARENA - 1.5; pos.x = Math.max(-lim, Math.min(lim, pos.x)); pos.z = Math.max(-lim, Math.min(lim, pos.z)); };

    const reset = (m: Mode, idx: number) => {
      for (let i = bots.length - 1; i >= 0; i--) removeBot(i); targets.length = 0; targetParts.length = 0;
      buildMap(idx);
      state.hp = 100; state.score = 0; state.kills = 0; state.shots = 0; state.hits = 0; state.reloading = false; state.alive = true; state.mode = m; state.vel.set(0, 0, 0);
      state.won = false; state.inv = emptyInv(); state.inv[0] = { type: "weapon", wId: "pistol", ammo: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.mag * 2 }; state.equip = 0; setViewModel("pistol"); syncInv();
      // varied spawn near cover
      const sp = spawnSpots.length ? spawnSpots[(Math.random() * spawnSpots.length) | 0] : new THREE.Vector3(0, 0, 0);
      camera.position.set(sp.x + (Math.random() - 0.5) * 2, 1.7, sp.z + 2.5); camera.rotation.set(0, Math.atan2(-sp.x, -sp.z), 0);
      if (m === "single") { for (let i = 0; i < 10; i++) makeBot((spawns[i % spawns.length] || pickRoam()).clone(), false); }
      else { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; makeTarget(new THREE.Vector3(Math.cos(a) * (16 + (i % 3) * 7), 0, Math.sin(a) * (16 + (i % 3) * 7))); } for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.4; makeBot(new THREE.Vector3(Math.cos(a) * 28, 0, Math.sin(a) * 28), true); } }
      state.countEnd = now() + 3000; syncHud(true);
    };
    apiRef.current = { start: (m, idx) => { if (!state.alive || phaseRef.current === "menu" || phaseRef.current === "dead") reset(m, idx); controls.lock(); } };
    const die = () => { state.alive = false; controls.unlock(); setPhase("dead"); };
    const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock(); const tmp = new THREE.Vector3(); const eye = new THREE.Vector3(); const rayOrig = new THREE.Vector3(); let raf = 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05); const t = clock.elapsedTime; const nowt = now();
      for (const u of waterUpdaters) u(t);
      for (const dr of doors) if (Math.abs(dr.pivot.rotation.y - dr.target) > 0.01) dr.pivot.rotation.y += (dr.target - dr.pivot.rotation.y) * Math.min(1, dt * 8);
      for (const c of chests) if (!c.opened) c.glow.rotation.y += dt;
      let playerHidden = false;
      const counting = nowt < state.countEnd;
      const cval = counting ? Math.ceil((state.countEnd - nowt) / 1000) : 0;
      if (cval !== lastCount) { lastCount = cval; setCount(cval); }
      const playing = controls.isLocked && state.alive;

      if (playing) {
        // vertical: floor under player
        rayOrig.set(camera.position.x, camera.position.y + 0.3, camera.position.z); downRay.set(rayOrig, DOWN); downRay.far = 80;
        const fh = downRay.intersectObjects(floors, false); let groundY = 0; if (fh.length) groundY = fh[0].point.y;
        const feetEye = groundY + 1.7;

        if (!counting) {
          const sprint = keys["ShiftLeft"] ? 1.7 : 1; const accel = 58 * sprint, damp = 9;
          state.vel.x -= state.vel.x * damp * dt; state.vel.z -= state.vel.z * damp * dt;
          const fwd = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0); const side = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);
          if (fwd) state.vel.z -= fwd * accel * dt; if (side) state.vel.x += side * accel * dt;
          controls.moveRight(state.vel.x * dt); controls.moveForward(-state.vel.z * dt); collide(camera.position, 0.5);
        }
        state.vel.y -= 20 * dt; camera.position.y += state.vel.y * dt;
        if (camera.position.y <= feetEye) { camera.position.y = feetEye; state.vel.y = 0; state.canJump = true; }

        const w = curW(); const targetFov = state.ads ? w.fov : 80;
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix();
        gun.position.x += (((state.ads ? 0.0 : 0.3)) - gun.position.x) * Math.min(1, dt * 12); gun.position.y += (((state.ads ? -0.14 : -0.26)) - gun.position.y) * Math.min(1, dt * 12);
        gun.position.z += (-0.55 - gun.position.z) * Math.min(1, dt * 13); gun.rotation.x += (0 - gun.rotation.x) * Math.min(1, dt * 13);

        if (!counting && state.mouseDown && w.auto && nowt - state.lastShot >= w.rate) shoot();

        for (const bz of bushZones) { if ((camera.position.x - bz.x) ** 2 + (camera.position.z - bz.z) ** 2 < bz.r * bz.r) { playerHidden = true; break; } }
        // interact prompt
        let pr = ""; for (const c of chests) if (!c.opened && c.pos.distanceTo(camera.position) < 3.6) { pr = "open chest"; break; } if (!pr) for (const dr of doors) if (dr.pos.distanceTo(camera.position) < 3.6) { pr = "open/close door"; break; }
        if (pr !== lastPrompt) { lastPrompt = pr; setPrompt(pr); }
        // medkit pickups
        for (const p of pickups) { if (p.active) { p.group.rotation.y += dt * 1.5; p.group.position.y = 0.9 + Math.sin(t * 2) * 0.12; if (state.hp < 100 && camera.position.distanceToSquared(p.pos) < 2.4) { state.hp = Math.min(100, state.hp + 30); p.active = false; p.group.visible = false; p.respawn = nowt + 18000; sfx("heal"); showToast("+30 HP"); syncHud(true); } } else if (nowt > p.respawn) { p.active = true; p.group.visible = true; } }
        if (toastT && nowt > toastT) { toastT = 0; setToast(""); }

        if (!counting) {
          eye.copy(camera.position);
          for (let i = bots.length - 1; i >= 0; i--) { const b = bots[i]; if (b.dummy) continue; if (b.dying) { b.group.rotation.z += (1.55 - b.group.rotation.z) * Math.min(1, dt * 6); b.group.position.y -= dt * 0.4; if (now() > (b.dieAt || 0)) removeBot(i); continue; } tmp.set(eye.x - b.group.position.x, 0, eye.z - b.group.position.z); const dist = tmp.length(); tmp.normalize(); let canSee = dist < 75; if (canSee && playerHidden && dist > 5) canSee = false; if (canSee) { losRay.set(new THREE.Vector3(b.group.position.x, 1.6, b.group.position.z), new THREE.Vector3(eye.x - b.group.position.x, eye.y - 1.6, eye.z - b.group.position.z).normalize()); losRay.far = dist; const bl = losRay.intersectObjects(solids, false); if (bl.length && bl[0].distance < dist - 1) canSee = false; } if (canSee && dist < 62) { if (dist > 14) b.group.position.addScaledVector(tmp, b.speed * dt); b.group.rotation.y = Math.atan2(tmp.x, tmp.z); collide(b.group.position, 0.5); const legs = b.group.userData.legs as THREE.Mesh[]; if (legs) { legs[0].rotation.x = Math.sin(t * 8 + i) * 0.5; legs[1].rotation.x = -Math.sin(t * 8 + i) * 0.5; } if (nowt - b.lastShot > 900) { b.lastShot = nowt + Math.random() * 450; addTracer(new THREE.Vector3(b.group.position.x, 1.5, b.group.position.z), eye.clone(), 0xff5a3c); sfx("enemy"); const hc = Math.max(0.1, Math.min(0.66, 1 - dist / 68)); if (Math.random() < hc) { state.hp -= 6 + Math.random() * 6; setDmgFlash((v) => v + 1); syncHud(true); if (state.hp <= 0) { state.hp = 0; syncHud(true); die(); } } } } else { tmp.set(b.roam.x - b.group.position.x, 0, b.roam.z - b.group.position.z); if (tmp.length() < 2) b.roam = pickRoam(); else { tmp.normalize(); b.group.position.addScaledVector(tmp, b.speed * 0.55 * dt); b.group.rotation.y = Math.atan2(tmp.x, tmp.z); collide(b.group.position, 0.5); } } }
          if (state.mode === "training") for (const b of bots) if (b.dummy) { tmp.set(eye.x - b.group.position.x, 0, eye.z - b.group.position.z).normalize(); b.group.rotation.y = Math.atan2(tmp.x, tmp.z); }
          if (state.mode === "single" && !state.won && bots.filter((b) => !b.dummy && !b.dying).length === 0) { state.won = true; state.alive = false; controls.unlock(); setPhase("win"); }
        }

        if (state.ads !== lastAds) { lastAds = state.ads; setAiming(state.ads); }
        if (playerHidden !== lastHidden) { lastHidden = playerHidden; setHidden(playerHidden); }
        syncHud();
      }
      for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].life -= dt; const m = tracers[i].line.material as THREE.LineBasicMaterial; m.opacity = Math.max(0, tracers[i].life / 0.06) * 0.9; if (tracers[i].life <= 0) { worldGrp.remove(tracers[i].line); tracers[i].line.geometry.dispose(); (tracers[i].line.material as THREE.Material).dispose(); tracers.splice(i, 1); } }
      renderer.render(scene, camera);
    };
    animate();

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); document.removeEventListener("keydown", onKeyDown); document.removeEventListener("keyup", onKeyUp); document.removeEventListener("mousedown", onMouseDown); document.removeEventListener("mouseup", onMouseUp); document.removeEventListener("wheel", onWheel); document.removeEventListener("contextmenu", onContext); controls.dispose(); renderer.dispose(); pmrem.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); if (actx) actx.close().catch(() => {}); };
  }, []);

  const lowHp = hud.hp <= 30; const acc = hud.shots ? Math.round((hud.hits / hud.shots) * 100) : 0;
  const rarOf = (s: Slot): Rarity => s.type === "weapon" ? WEAPONS[s.wId!].rarity : s.type === "heal" ? HEALS[s.hId!].rarity : "common";

  return (
    <div className="relative h-full w-full">
      <div ref={mountRef} className="absolute inset-0" />
      <div key={dmgFlash} className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 160px 50px rgba(220,40,40,0.55)", opacity: 0, animation: dmgFlash ? "fadeIn 0.1s ease forwards reverse" : undefined }} />
      {phase === "playing" && aiming && <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 220px 120px rgba(0,0,0,0.85)" }} />}

      {phase === "playing" && (
        <>
          {/* countdown */}
          {count > 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="text-8xl font-black text-cyan-300 hud-shadow" style={{ textShadow: "0 0 30px rgba(0,200,255,0.7)" }}>{count}</div></div>}

          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            {aiming ? <div className="h-1.5 w-1.5 rounded-full bg-red-400" /> : (<div className="relative h-6 w-6"><span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-white/80" /><span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-white/80" /><span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white/80" /><span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-white/80" /><span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" /></div>)}
          </div>
          {hit > 0 && <div key={hit} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" style={{ animation: "fadeIn 0.18s ease forwards reverse" }}><div className="relative h-7 w-7"><span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-red-400" /><span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-red-400" /><span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-red-400" /><span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-red-400" /></div></div>}

          <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between p-4 text-sm hud-shadow">
            <div className="rounded-lg bg-black/40 px-3 py-1.5">{hud.mode === "single" ? <>ENEMIES <span className="font-bold text-red-400">{hud.alive}</span></> : <>ACCURACY <span className="font-bold text-cyan-300">{acc}%</span> <span className="opacity-50">({hud.hits}/{hud.shots})</span></>}</div>
            <div className="rounded-lg bg-black/40 px-3 py-1.5">SCORE <span className="font-bold text-yellow-300">{hud.score}</span> <span className="opacity-50">· {hud.kills} kills</span></div>
          </div>

          {hidden && <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold text-green-300 hud-shadow">🌿 HIDDEN</div>}
          {prompt && <div className="pointer-events-none absolute left-1/2 top-1/2 mt-10 -translate-x-1/2 rounded bg-black/50 px-3 py-1 text-xs font-bold hud-shadow">Press <span className="text-cyan-300">E</span> to {prompt}</div>}
          {toast && <div className="pointer-events-none absolute left-1/2 top-28 -translate-x-1/2 rounded-full bg-cyan-500/25 px-4 py-1.5 text-sm font-bold text-cyan-100 hud-shadow">{toast}</div>}

          {/* inventory bar */}
          <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-1.5">
            {inv.map((s, i) => { const r = rarOf(s); return (
              <div key={i} className={`relative h-12 w-12 rounded-md border-2 ${equip === i && s.type === "weapon" ? "ring-2 ring-white" : ""}`} style={{ borderColor: s.type === "empty" ? "rgba(255,255,255,0.15)" : RARITY[r].c, background: "rgba(0,0,0,0.45)" }}>
                <span className="absolute left-0.5 top-0 text-[9px] text-white/50">{i + 1}</span>
                <span className="flex h-full w-full items-center justify-center text-center text-[11px] font-bold leading-tight">{s.type === "weapon" ? WEAPONS[s.wId!].abbr : s.type === "heal" ? HEALS[s.hId!].icon : ""}</span>
                {s.type === "heal" && <span className="absolute bottom-0 right-0.5 text-[10px] font-bold text-white">{s.count}</span>}
              </div>); })}
          </div>

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-end justify-between p-5 hud-shadow">
            <div className="w-56"><div className="mb-1 flex justify-between text-xs"><span className={lowHp ? "text-red-400" : "text-emerald-300"}>HP</span><span>{hud.hp}</span></div><div className="h-3 w-full overflow-hidden rounded-full bg-white/10"><div className={`h-full transition-all ${lowHp ? "bg-red-500" : "bg-emerald-400"}`} style={{ width: `${hud.hp}%` }} /></div><div className="mt-1.5 text-[11px] opacity-60">📦 open chests (E) for guns · 1-7 use slots · scroll = swap gun</div></div>
            <div className="text-right"><div className="text-3xl font-bold tabular-nums">{hud.reloading ? <span className="text-xl text-yellow-300">RELOADING…</span> : <>{hud.ammo}<span className={`text-base ${hud.reserve <= 0 ? "text-red-400" : "opacity-50"}`}> / {hud.reserve} spare</span></>}</div><div className="text-xs opacity-60">🔫 {hud.wname} <span className="opacity-50">(R reload · RMB aim)</span></div></div>
          </div>
        </>
      )}

      {phase === "menu" && (
        <Overlay><Title /><p className="mt-2 text-sm text-white/55">Pick a mode and a map.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3"><ModeCard active={mode === "single"} onClick={() => setMode("single")} icon="🤖" title="Single Player" desc="10 bots — last one standing" /><ModeCard active={mode === "training"} onClick={() => setMode("training")} icon="🎯" title="Training" desc="Targets + dummies + accuracy" /><ModeCard active={false} onClick={() => setPhase("multiplayer")} icon="🌐" title="Multiplayer" desc="Online — coming soon" soon /></div>
          <p className="mt-7 text-xs uppercase tracking-widest text-white/50">Map</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">{MAPS.map((m, i) => (<button key={m.name} onClick={() => setMapIdx(i)} className={`w-44 rounded-lg border px-3 py-2 text-left transition ${mapIdx === i ? "border-cyan-400 bg-cyan-400/10" : "border-white/15 hover:border-white/40"}`}><div className="text-sm font-bold">{m.name}</div><div className="text-[11px] text-white/50">{m.desc}</div></button>))}</div>
          <PlayButton label="▶ CLICK TO PLAY" onClick={() => apiRef.current?.start(mode, mapIdx)} /><Controls />
        </Overlay>
      )}
      {phase === "multiplayer" && (<Overlay><h2 className="text-3xl font-bold tracking-widest text-cyan-300">🌐 ONLINE MULTIPLAYER</h2><p className="mt-4 max-w-md text-center text-sm text-white/70">Real-time online play needs a dedicated game server (WebSockets + netcode) that Vercel can&apos;t host. It&apos;s <span className="text-yellow-300">coming soon</span> — needs a separate realtime backend (Colyseus/Socket.IO on Railway/Fly.io).</p><PlayButton label="← Back" onClick={() => setPhase("menu")} /></Overlay>)}
      {phase === "paused" && (<Overlay><h2 className="text-3xl font-bold tracking-widest">PAUSED</h2><Controls /><PlayButton label="▶ RESUME" onClick={() => apiRef.current?.start(mode, mapIdx)} /><button onClick={() => setPhase("menu")} className="mt-3 text-sm text-white/50 hover:text-white">Main menu</button></Overlay>)}
      {phase === "win" && (<Overlay><h2 className="text-5xl font-black tracking-widest text-yellow-300" style={{ textShadow: "0 0 30px rgba(255,200,40,0.6)" }}>🏆 VICTORY</h2><p className="mt-3 text-lg text-white/80">Last one standing!</p><p className="mt-1 text-base">Score <span className="font-bold text-yellow-300">{hud.score}</span> · {hud.kills} kills · {acc}% acc</p><PlayButton label="↻ PLAY AGAIN" onClick={() => apiRef.current?.start(mode, mapIdx)} /><button onClick={() => setPhase("menu")} className="mt-3 text-sm text-white/50 hover:text-white">Main menu</button></Overlay>)}
      {phase === "dead" && (<Overlay><h2 className="text-4xl font-black tracking-widest text-red-500">YOU DIED</h2><p className="mt-3 text-lg">Score <span className="font-bold text-yellow-300">{hud.score}</span> · {hud.kills} kills · {acc}% acc</p><PlayButton label="↻ PLAY AGAIN" onClick={() => apiRef.current?.start(mode, mapIdx)} /><button onClick={() => setPhase("menu")} className="mt-3 text-sm text-white/50 hover:text-white">Main menu</button></Overlay>)}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) { return <div className="fade-in absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 px-4 backdrop-blur-sm">{children}</div>; }
function Title() { return <h1 className="text-center text-5xl font-black tracking-[0.2em] sm:text-7xl"><span className="text-cyan-300">STRIKE</span><span className="text-red-500">ZONE</span></h1>; }
function ModeCard({ active, onClick, icon, title, desc, soon }: { active: boolean; onClick: () => void; icon: string; title: string; desc: string; soon?: boolean }) { return (<button onClick={onClick} className={`relative w-44 rounded-xl border p-4 text-left transition ${active ? "border-cyan-400 bg-cyan-400/10" : "border-white/15 hover:border-white/40"}`}>{soon && <span className="absolute right-2 top-2 rounded bg-yellow-400/20 px-1.5 py-0.5 text-[9px] font-bold text-yellow-300">SOON</span>}<div className="text-3xl">{icon}</div><div className="mt-2 font-bold">{title}</div><div className="text-[11px] text-white/55">{desc}</div></button>); }
function PlayButton({ label, onClick }: { label: string; onClick: () => void }) { return <button onClick={onClick} className="mt-7 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-8 py-3.5 text-lg font-bold text-black transition hover:scale-105 hover:brightness-110">{label}</button>; }
function Controls() { const rows = [["WASD", "Move"], ["Mouse", "Look"], ["LMB", "Shoot"], ["RMB", "Aim"], ["1-7", "Inventory"], ["Scroll", "Swap gun"], ["E", "Chest/Door"], ["R", "Reload"]]; return (<div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-4">{rows.map(([k, v]) => (<div key={k} className="flex items-center gap-2"><span className="rounded bg-white/10 px-2 py-0.5 font-bold text-cyan-200">{k}</span><span className="text-white/60">{v}</span></div>))}</div>); }
