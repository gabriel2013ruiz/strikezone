"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

type Phase = "menu" | "playing" | "paused" | "dead" | "multiplayer" | "win" | "shop" | "settings";
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
  railgun: { name: "Mythic Railgun", abbr: "RAIL", dmg: 220, rate: 850, mag: 4, auto: false, fov: 24, spread: 0, pellets: 1, rarity: "legendary" },
  goldak: { name: "Golden AK", abbr: "gAK", dmg: 50, rate: 105, mag: 35, auto: true, fov: 42, spread: 0.007, pellets: 1, rarity: "legendary" },
};
const MYTHICS = ["railgun", "goldak"]; // only from legendary crates (luck)
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
  railgun: { body: 0.9, barrel: 0.7, barrelR: 0.05, mag: 0.24, stock: true, scope: true, color: 0x1a3a4a },
  goldak: { body: 0.72, barrel: 0.42, barrelR: 0.04, mag: 0.34, stock: true, scope: false, color: 0xb8860b },
};
// ---- meta / shop data ----
type Acc = "none" | "horns" | "crown" | "visor" | "hood";
interface Skin { name: string; color: number; price: number; rarity: Rarity; crateOnly?: boolean; accent?: number; metal?: number; emissive?: number; acc?: Acc; icon: string; limited?: boolean; }
const TEAMS: { id: string; name: string; flag: string; color: number }[] = [
  { id: "bra", name: "Brazil", flag: "🇧🇷", color: 0x009c3b }, { id: "arg", name: "Argentina", flag: "🇦🇷", color: 0x6cace4 },
  { id: "fra", name: "France", flag: "🇫🇷", color: 0x0055a4 }, { id: "eng", name: "England", flag: "🏴", color: 0xffffff },
  { id: "esp", name: "Spain", flag: "🇪🇸", color: 0xc60b1e }, { id: "ger", name: "Germany", flag: "🇩🇪", color: 0x111111 },
  { id: "por", name: "Portugal", flag: "🇵🇹", color: 0x006600 }, { id: "ned", name: "Netherlands", flag: "🇳🇱", color: 0xff6a00 },
  { id: "ita", name: "Italy", flag: "🇮🇹", color: 0x0066b3 }, { id: "usa", name: "USA", flag: "🇺🇸", color: 0x1a3a6b },
  { id: "mex", name: "Mexico", flag: "🇲🇽", color: 0x006847 }, { id: "uru", name: "Uruguay", flag: "🇺🇾", color: 0x5cbcf0 },
  { id: "bel", name: "Belgium", flag: "🇧🇪", color: 0xe30613 }, { id: "cro", name: "Croatia", flag: "🇭🇷", color: 0xd81e2c },
  { id: "jpn", name: "Japan", flag: "🇯🇵", color: 0xbc002d }, { id: "kor", name: "South Korea", flag: "🇰🇷", color: 0xcd2e3a },
  { id: "mar", name: "Morocco", flag: "🇲🇦", color: 0xc1272d }, { id: "sen", name: "Senegal", flag: "🇸🇳", color: 0x00853f },
  { id: "col", name: "Colombia", flag: "🇨🇴", color: 0xfcd116 }, { id: "sui", name: "Switzerland", flag: "🇨🇭", color: 0xd52b1e },
];
const SKINS: Record<string, Skin> = {
  ranger: { name: "Ranger", color: 0x4b5320, price: 0, rarity: "common", accent: 0x2f3a2a, acc: "none", icon: "🪖" },
  crimson: { name: "Crimson Reaper", color: 0x9b1c1c, price: 300, rarity: "rare", accent: 0xff3b3b, acc: "horns", icon: "😈" },
  frost: { name: "Frost Ranger", color: 0x2a6f97, price: 500, rarity: "rare", accent: 0x9fe6ff, emissive: 0x1a3a5a, acc: "crown", icon: "❄️" },
  golden: { name: "Golden Legend", color: 0xd4af37, price: 1200, rarity: "epic", accent: 0xffe08a, metal: 0.9, emissive: 0x3a2e08, acc: "crown", icon: "👑" },
  neon: { name: "Neon Striker", color: 0x101014, price: 0, rarity: "epic", crateOnly: true, accent: 0x22ff88, emissive: 0x22ff88, acc: "visor", icon: "🟢" },
  shadow: { name: "Shadow Assassin", color: 0x141418, price: 2000, rarity: "legendary", accent: 0x6b21a8, emissive: 0x2a0a4a, acc: "hood", icon: "🥷" },
  worldcup: { name: "World Cup 2026 ⚽", color: 0xd4af37, price: 2500, rarity: "legendary", accent: 0xffe08a, metal: 0.85, emissive: 0x4a3a10, acc: "crown", icon: "🏆", limited: true },
};
const POTIONS: Record<string, { name: string; icon: string; price: number }> = {
  health: { name: "Health Potion", icon: "❤️", price: 150 },
  shield: { name: "Shield Potion", icon: "🛡️", price: 250 },
  speed: { name: "Speed Potion", icon: "⚡", price: 200 },
};
const CRATES: Record<Rarity, { name: string; price: number }> = {
  common: { name: "Common Crate", price: 100 }, uncommon: { name: "Uncommon Crate", price: 200 },
  rare: { name: "Rare Crate", price: 350 }, epic: { name: "Epic Crate", price: 700 }, legendary: { name: "Legendary Crate", price: 1500 },
};
const COIN_PACKS = [{ coins: 500, price: "$4.99" }, { coins: 1200, price: "$9.99" }, { coins: 3000, price: "$19.99" }, { coins: 7000, price: "$39.99" }];
interface Meta { coins: number; skins: string[]; skin: string; weapons: string[]; potions: Record<string, number>; team: string; }
const defaultMeta = (): Meta => ({ coins: 0, skins: ["ranger"], skin: "ranger", weapons: [], potions: { health: 0, shield: 0, speed: 0 }, team: "" });
function loadMeta(): Meta { try { const raw = localStorage.getItem("sz_meta"); if (raw) return { ...defaultMeta(), ...JSON.parse(raw) }; } catch {} return defaultMeta(); }
function saveMeta(m: Meta) { try { localStorage.setItem("sz_meta", JSON.stringify(m)); } catch {} }
interface Settings { sens: number; fov: number; volume: number; sfx: boolean; shadows: boolean; bloom: boolean; crosshair: string; binds: Record<string, string>; }
const BIND_ACTIONS: [string, string][] = [["forward", "Move forward"], ["back", "Move back"], ["left", "Move left"], ["right", "Move right"], ["jump", "Jump"], ["crouch", "Crouch"], ["sprint", "Sprint"], ["reload", "Reload"], ["interact", "Open chest"], ["kick", "Kick ball"]];
const defaultSettings = (): Settings => ({ sens: 1, fov: 80, volume: 0.8, sfx: true, shadows: true, bloom: true, crosshair: "#ffffff", binds: { forward: "KeyW", back: "KeyS", left: "KeyA", right: "KeyD", jump: "Space", crouch: "KeyC", sprint: "ShiftLeft", reload: "KeyR", interact: "KeyE", kick: "KeyF" } });
function loadSettings(): Settings { try { const raw = localStorage.getItem("sz_settings"); if (raw) { const p = JSON.parse(raw); return { ...defaultSettings(), ...p, binds: { ...defaultSettings().binds, ...(p.binds || {}) } }; } } catch {} return defaultSettings(); }
function saveSettings(s: Settings) { try { localStorage.setItem("sz_settings", JSON.stringify(s)); } catch {} }
function keyLabel(c: string) { const m: Record<string, string> = { Space: "Space", ShiftLeft: "Shift", ShiftRight: "RShift", ControlLeft: "Ctrl", ControlRight: "RCtrl", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" }; if (m[c]) return m[c]; return c.replace("Key", "").replace("Digit", ""); }
const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
type Reward = { kind: "weapon" | "skin" | "potion" | "coins"; id: string; amount?: number; rarity: Rarity };
function openCrateReward(crate: Rarity, m: Meta): Reward {
  const ci = RARITY_ORDER.indexOf(crate); const roll = Math.random();
  if (crate === "legendary" && roll < 0.12) { const locked = MYTHICS.filter((w) => !m.weapons.includes(w)); if (locked.length) return { kind: "weapon", id: locked[(Math.random() * locked.length) | 0], rarity: "legendary" }; }
  if (roll < 0.15 + ci * 0.1) { const opts = Object.keys(SKINS).filter((k) => RARITY_ORDER.indexOf(SKINS[k].rarity) <= ci && !m.skins.includes(k)); if (opts.length) { const id = opts[(Math.random() * opts.length) | 0]; return { kind: "skin", id, rarity: SKINS[id].rarity }; } }
  if (roll < 0.82) { const pk = ["health", "shield", "speed"][(Math.random() * 3) | 0]; return { kind: "potion", id: pk, rarity: "common" }; }
  return { kind: "coins", id: "", amount: [50, 100, 150, 250, 400][ci], rarity: "common" };
}
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
  const miniRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [mode, setMode] = useState<Mode>("single");
  const [mapIdx, setMapIdx] = useState(0);
  const [hud, setHud] = useState({ hp: 100, ammo: 12, mag: 12, reserve: 24, score: 0, kills: 0, shots: 0, hits: 0, reloading: false, mode: "single" as Mode, alive: 0, wname: "Pistol" });
  const [inv, setInv] = useState<Slot[]>(emptyInv());
  const [equip, setEquip] = useState(0);
  const [hit, setHit] = useState(0); const [dmgFlash, setDmgFlash] = useState(0);
  const [aiming, setAiming] = useState(false); const [hidden, setHidden] = useState(false);
  const [prompt, setPrompt] = useState(""); const [toast, setToast] = useState(""); const [count, setCount] = useState(0); const [crouched, setCrouched] = useState(false);
  const [meta, setMeta] = useState<Meta>(defaultMeta);
  const [shopTab, setShopTab] = useState<"crates" | "skins" | "potions" | "coins">("crates");
  const [crateReveal, setCrateReveal] = useState<{ label: string; rarity: Rarity } | null>(null);
  const [winCoins, setWinCoins] = useState(0); const [place, setPlace] = useState(0);
  const [potionHud, setPotionHud] = useState({ health: 0, shield: 0, speed: 0 });
  const [shieldHud, setShieldHud] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [crateOpening, setCrateOpening] = useState<Rarity | null>(null);
  const [showTeams, setShowTeams] = useState(false);
  const [showLocker, setShowLocker] = useState(false);
  const [goalShow, setGoalShow] = useState(false);
  const metaRef = useRef<Meta>(defaultMeta());
  const applyMeta = (m: Meta) => { metaRef.current = m; setMeta(m); saveMeta(m); };
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [rebind, setRebind] = useState<string | null>(null);
  const settingsRef = useRef<Settings>(defaultSettings());
  const applySettings = (s: Settings) => { settingsRef.current = s; setSettings(s); saveSettings(s); };
  const buySkin = (id: string) => { const s = SKINS[id]; if (!s || s.crateOnly || meta.skins.includes(id) || meta.coins < s.price) return; applyMeta({ ...meta, coins: meta.coins - s.price, skins: [...meta.skins, id], skin: id }); };
  const equipSkin = (id: string) => { if (!meta.skins.includes(id)) return; applyMeta({ ...meta, skin: id }); };
  const buyPotion = (id: string) => { const p = POTIONS[id]; if (!p || meta.coins < p.price) return; applyMeta({ ...meta, coins: meta.coins - p.price, potions: { ...meta.potions, [id]: (meta.potions[id] || 0) + 1 } }); };
  const buyCoins = (amt: number) => applyMeta({ ...meta, coins: meta.coins + amt });
  const openCrate = (crate: Rarity) => {
    if (crateOpening) return; const c = CRATES[crate]; if (meta.coins < c.price) return;
    applyMeta({ ...meta, coins: meta.coins - c.price }); setCrateOpening(crate);
    window.setTimeout(() => {
      const cur = metaRef.current; const rew = openCrateReward(crate, cur);
      const m2: Meta = { ...cur, skins: [...cur.skins], weapons: [...cur.weapons], potions: { ...cur.potions } }; let label = "";
      if (rew.kind === "weapon") { m2.weapons.push(rew.id); label = `${WEAPONS[rew.id].name} UNLOCKED!`; }
      else if (rew.kind === "skin") { m2.skins.push(rew.id); label = `${SKINS[rew.id].name}`; }
      else if (rew.kind === "potion") { m2.potions[rew.id] = (m2.potions[rew.id] || 0) + 1; label = `${POTIONS[rew.id].icon} ${POTIONS[rew.id].name}`; }
      else { m2.coins += rew.amount || 0; label = `+${rew.amount} coins`; }
      applyMeta(m2); setCrateOpening(null); setCrateReveal({ label, rarity: rew.rarity });
    }, 1700);
  };

  const apiRef = useRef<{ start: (mode: Mode, map: number) => void } | null>(null);
  const phaseRef = useRef<Phase>("menu"); phaseRef.current = phase;

  useEffect(() => { const m = loadMeta(); metaRef.current = m; setMeta(m); const s = loadSettings(); settingsRef.current = s; setSettings(s); }, []);
  useEffect(() => {
    if (!rebind) return;
    const h = (e: KeyboardEvent) => { e.preventDefault(); applySettings({ ...settings, binds: { ...settings.binds, [rebind]: e.code } }); setRebind(null); };
    window.addEventListener("keydown", h, { once: true });
    return () => window.removeEventListener("keydown", h);
  }, [rebind, settings]);

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
    // post-processing: subtle bloom for glow (muzzle, chests, loot)
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

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
    interface Ground { group: THREE.Group; pos: THREE.Vector3; kind: "weapon" | "heal"; id: string; }
    const grounds: Ground[] = [];
    let soccer: { ball: THREE.Mesh; home: THREE.Vector3; goal: THREE.Vector3; kicking: boolean; kickStart: number } | null = null;

    const clearWorld = () => {
      worldGrp.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = o.material; Array.isArray(m) ? m.forEach((x) => x.dispose()) : m.dispose(); } });
      while (worldGrp.children.length) worldGrp.remove(worldGrp.children[0]);
      solids.length = 0; floors.length = 0; colliders.length = 0; spawnSpots.length = 0; spawns.length = 0; waterUpdaters.length = 0; bushZones.length = 0; doors.length = 0; pickups.length = 0; chests.length = 0; grounds.length = 0; soccer = null;
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

    const furnish = (cx: number, cz: number, w: number, d: number) => {
      const wood = () => new THREE.MeshStandardMaterial({ color: 0x6e4a2c, roughness: 0.8 });
      const place = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, col = false) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; if (col) addSolid(m, true); else { worldGrp.add(m); solids.push(m); } };
      const rugCol = [0x7a2e2e, 0x2e4a7a, 0x2e7a4a][(Math.random() * 3) | 0];
      const rug = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w, d) * 0.5, Math.min(w, d) * 0.4), new THREE.MeshStandardMaterial({ color: rugCol, roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(cx, 0.12, cz); worldGrp.add(rug);
      place(new THREE.BoxGeometry(1.2, 0.1, 0.7), wood(), cx, 0.9, cz - d / 4); place(new THREE.BoxGeometry(0.1, 0.8, 0.1), wood(), cx - 0.5, 0.45, cz - d / 4); place(new THREE.BoxGeometry(0.1, 0.8, 0.1), wood(), cx + 0.5, 0.45, cz - d / 4);
      for (const ox of [-0.55, 0.55]) place(new THREE.BoxGeometry(0.4, 0.5, 0.4), wood(), cx + ox, 0.25, cz - d / 4 + 0.7);
      place(new THREE.BoxGeometry(w * 0.5, 1.5, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a3f24, roughness: 0.9 }), cx, 0.78, cz - d / 2 + 0.35, false);
      for (let i = 0; i < 2; i++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x3a4a3a, metalness: 0.4, roughness: 0.5 })); bar.position.set(cx + (i ? 1 : -1) * w * 0.3, 0.45, cz + d * 0.3); bar.castShadow = true; worldGrp.add(bar); solids.push(bar); }
    };
    const doorWall = (cx: number, cz: number, w: number, d: number, base: string, H: number) => {
      const T = 0.3, doorW = 2.0, doorH = 2.5;
      const wmat = () => new THREE.MeshStandardMaterial({ map: winTex(base), roughness: 0.9 });
      // walls do NOT collide with movement (no invisible barrier) — they still block bullets (in solids) and look solid
      const wall = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wmat()); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; worldGrp.add(m); solids.push(m); };
      wall(cx, H / 2, cz - d / 2, w, H, T); wall(cx - w / 2, H / 2, cz, T, H, d); wall(cx + w / 2, H / 2, cz, T, H, d);
      const segW = (w - doorW) / 2;
      wall(cx - (doorW / 2 + segW / 2), H / 2, cz + d / 2, segW, H, T); wall(cx + (doorW / 2 + segW / 2), H / 2, cz + d / 2, segW, H, T);
      wall(cx, doorH + (H - doorH) / 2, cz + d / 2, doorW, H - doorH, T);
      // door hangs permanently OPEN (no collider) — doorways are always-clear passages, no barrier
      const pivot = new THREE.Group(); pivot.position.set(cx - doorW / 2, 0, cz + d / 2); pivot.rotation.y = -1.4; worldGrp.add(pivot);
      const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.08), new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 })); door.position.set(doorW / 2, doorH / 2, 0); door.castShadow = true; pivot.add(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.3 })); knob.position.set(doorW - 0.15, doorH / 2, 0.08); pivot.add(knob);
    };

    const makeHouse = (cx: number, cz: number, w: number, d: number, base: string) => {
      const H = 3.2; doorWall(cx, cz, w, d, base, H);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshStandardMaterial({ color: 0x6b5b48, roughness: 1 })); floor.position.set(cx, 0.05, cz); floor.receiveShadow = true; addFloor(floor);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.3, d + 0.4), new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.95 })); roof.position.set(cx, H + 0.15, cz); roof.castShadow = true; worldGrp.add(roof); solids.push(roof);
      furnish(cx, cz, w, d);
      if (Math.random() < 0.55) makeChest(cx + w / 4, cz - d / 6);
      spawnSpots.push(new THREE.Vector3(cx, 0, cz));
    };

    const makeTower = (cx: number, cz: number, w: number, d: number, base: string) => {
      const H = 5.2; doorWall(cx, cz, w, d, base, H);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshStandardMaterial({ color: 0x5a5a60, roughness: 1 })); floor.position.set(cx, 0.05, cz); floor.receiveShadow = true; addFloor(floor);
      // roof covers all but a -x gap strip (the internal stairwell exits there, away from the +z door)
      const gapW = 2.6; const roofW = w - gapW;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.3, d), new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 1 })); roof.position.set(cx + gapW / 2, H, cz); roof.castShadow = true; roof.receiveShadow = true; addFloor(roof);
      const rh = 1, rt = 0.25;
      const rail = (x: number, z: number, sx: number, sz: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, rh, sz), new THREE.MeshStandardMaterial({ color: 0x3a3a42 })); m.position.set(x, H + rh / 2, z); addSolid(m, true); };
      rail(cx + gapW / 2, cz - d / 2, roofW, rt); rail(cx + gapW / 2, cz + d / 2, roofW, rt); rail(cx + w / 2, cz, rt, d);
      // INTERNAL staircase along the -x wall (far from the door), rising back->front to the roof gap
      const stairX = cx - w / 2 + gapW / 2; const steps = Math.round(H / 0.42); const stepH = H / steps; const run = (d - 2.4) / steps;
      for (let i = 0; i <= steps; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(1.9, stepH, Math.max(0.75, run + 0.25)), new THREE.MeshStandardMaterial({ color: 0x55555c, roughness: 1 })); st.position.set(stairX, (i + 0.5) * stepH, cz - d / 2 + 1.2 + i * run); st.castShadow = true; st.receiveShadow = true; addFloor(st); }
      furnish(cx, cz - d * 0.28, w * 0.7, d * 0.45);
      makeChest(cx + w / 5, cz - d / 5);
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

    const makeSoccer = (cx: number, cz: number) => {
      const field = new THREE.Mesh(new THREE.PlaneGeometry(22, 15), new THREE.MeshStandardMaterial({ color: 0x2f7d3f, roughness: 1 })); field.rotation.x = -Math.PI / 2; field.position.set(cx, 0.04, cz); field.receiveShadow = true; worldGrp.add(field);
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 15), new THREE.MeshStandardMaterial({ color: 0xffffff })); cl.rotation.x = -Math.PI / 2; cl.position.set(cx, 0.05, cz); worldGrp.add(cl);
      const gx = cx + 10; const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
      const post = (x: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), white); m.position.set(x, 1.3, z); m.castShadow = true; worldGrp.add(m); solids.push(m); };
      post(gx, cz - 2.5); post(gx, cz + 2.5);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 5.2), white); bar.position.set(gx, 2.6, cz); worldGrp.add(bar); solids.push(bar);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.6), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.15, side: THREE.DoubleSide })); net.position.set(gx + 0.6, 1.3, cz); net.rotation.y = Math.PI / 2; worldGrp.add(net);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.1 })); ball.position.set(cx, 0.4, cz); ball.castShadow = true; worldGrp.add(ball);
      soccer = { ball, home: new THREE.Vector3(cx, 0.4, cz), goal: new THREE.Vector3(gx - 0.8, 1.2, cz), kicking: false, kickStart: 0 };
      spawnSpots.push(new THREE.Vector3(cx, 0, cz));
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
      const BUILDINGS_ON = true; // buildings back on (walls no longer collide → no barrier)
      const house = (a: number, b: number, c: number, dd: number, e: string) => { if (BUILDINGS_ON) makeHouse(a, b, c, dd, e); };
      const tower = (a: number, b: number, c: number, dd: number, e: string) => { if (BUILDINGS_ON) makeTower(a, b, c, dd, e); };

      const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), new THREE.MeshStandardMaterial({ map: groundTex(P.g[0], P.g[1]), roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; addFloor(ground);
      const bh = 8; for (const [x, z, w, d] of [[0, -ARENA, ARENA * 2, 2], [0, ARENA, ARENA * 2, 2], [-ARENA, 0, 2, ARENA * 2], [ARENA, 0, 2, ARENA * 2]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, bh, d), new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 1 })); m.position.set(x, bh / 2, z); addSolid(m, true); }

      if (idx === 0) {
        makeWater(40, -34, 60, 48);
        ring(46, 5, (x, z) => house(x, z, rand(7, 10), rand(7, 10), P.bld));
        ring(70, 5, (x, z) => tower(x, z, rand(9, 12), rand(9, 12), P.bld));
        for (let i = 0; i < 80; i++) { const x = rand(-ARENA + 6, ARENA - 6), z = rand(-ARENA + 6, ARENA - 6); if (Math.hypot(x - 40, z + 34) > 32 && clearOf(x, z)) makeTree(x, z); }
        for (let i = 0; i < 50; i++) makeBush(rand(-ARENA + 6, ARENA - 6), rand(-ARENA + 6, ARENA - 6), Math.random() > 0.5);
      } else if (idx === 1) {
        makeWater(0, -78, ARENA * 2, 70);
        ring(34, 6, (x, z) => house(x, z, rand(8, 11), rand(8, 11), P.bld));
        ring(64, 8, (x, z) => tower(x, z, rand(10, 13), rand(10, 13), P.bld));
        for (let i = 0; i < 70; i++) makeCrate(rand(-70, 70), rand(-55, 80), rand(1.4, 2.8));
        for (let i = 0; i < 22; i++) makeBush(rand(-80, 80), rand(20, 80), Math.random() > 0.5);
      } else if (idx === 2) {
        ring(24, 7, (x, z) => house(x, z, rand(7, 10), rand(7, 10), P.bld));
        ring(50, 9, (x, z) => tower(x, z, rand(8, 12), rand(8, 12), P.bld));
        ring(78, 11, (x, z) => house(x, z, rand(6, 9), rand(6, 9), P.bld));
        for (let i = 0; i < 55; i++) makeCrate(rand(-75, 75), rand(-75, 75), rand(1.2, 2.4));
        for (let i = 0; i < 24; i++) makeBush(rand(-75, 75), rand(-75, 75), Math.random() > 0.6);
      } else {
        makeWater(-46, 40, 50, 40);
        ring(30, 7, (x, z, i) => { house(x, z, rand(8, 11), rand(8, 11), P.bld); if (i % 2 === 0) makeWater(x * 1.4, z * 1.4, rand(6, 9), rand(5, 8)); });
        ring(60, 8, (x, z) => tower(x, z, rand(9, 12), rand(9, 12), P.bld));
        for (let i = 0; i < 60; i++) makeTree(rand(-ARENA + 6, ARENA - 6), rand(-ARENA + 6, ARENA - 6));
        for (let i = 0; i < 55; i++) makeBush(rand(-ARENA + 6, ARENA - 6), rand(-ARENA + 6, ARENA - 6), Math.random() > 0.4);
      }

      // outdoor props (rocks & barrels) for cover + realism
      for (let i = 0; i < 26; i++) { const x = rand(-ARENA + 8, ARENA - 8), z = rand(-ARENA + 8, ARENA - 8); if (Math.hypot(x, z) < 11) continue; if (Math.random() < 0.5) { const rr = 0.6 + Math.random() * 1.2; const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 0), new THREE.MeshStandardMaterial({ color: 0x6b6b70, roughness: 1, flatShading: true })); rock.position.set(x, rr * 0.5, z); rock.castShadow = true; rock.receiveShadow = true; addSolid(rock, true); } else { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 12), new THREE.MeshStandardMaterial({ color: [0x8a3b2e, 0x3a4a3a, 0x2e6a7a][(Math.random() * 3) | 0], metalness: 0.5, roughness: 0.5 })); bar.position.set(x, 0.55, z); bar.castShadow = true; addSolid(bar, true); } }
      // chests + medkits
      ring(38, 8, (x, z) => makeChest(x, z)); ring(64, 6, (x, z) => makeChest(x, z));
      makeSoccer(ARENA - 26, -ARENA + 26); // hidden soccer field in a corner
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

    /* ---------- 3rd-person player model + skins ---------- */
    const pmVest = new THREE.MeshStandardMaterial({ color: 0x4b5320, roughness: 0.85 });
    const pmSkin = new THREE.MeshStandardMaterial({ color: 0xc98d63, roughness: 0.75 });
    const pmDark = new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.8 });
    const pmHelm = new THREE.MeshStandardMaterial({ color: 0x2f3a2a, roughness: 0.7, metalness: 0.1 });
    const playerModel = new THREE.Group();
    const pmAccessory = new THREE.Group(); playerModel.add(pmAccessory);
    {
      const box = (w: number, h: number, d: number, mat: THREE.Material, y: number, x = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; playerModel.add(m); return m; };
      box(0.66, 0.86, 0.4, pmVest, 1.4); box(0.7, 0.5, 0.46, pmDark, 1.45); box(0.58, 0.34, 0.4, pmDark, 0.84);
      box(0.38, 0.42, 0.4, pmSkin, 2.06); const hel = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), pmHelm); hel.position.y = 2.16; hel.castShadow = true; playerModel.add(hel);
      box(0.22, 0.8, 0.24, pmDark, 0.45, -0.15); box(0.22, 0.8, 0.24, pmDark, 0.45, 0.15); box(0.26, 0.16, 0.34, pmDark, 0.08, -0.15, 0.04); box(0.26, 0.16, 0.34, pmDark, 0.08, 0.15, 0.04);
      box(0.16, 0.7, 0.18, pmVest, 1.42, -0.36, -0.12).rotation.x = -0.7; box(0.16, 0.7, 0.18, pmVest, 1.42, 0.32, -0.12).rotation.x = -0.7;
      box(0.09, 0.13, 0.66, pmDark, 1.42, 0.0, -0.42);
    }
    playerModel.visible = false; scene.add(playerModel);
    const buildAccessory = (acc: Acc, accent: number) => {
      while (pmAccessory.children.length) { const c = pmAccessory.children[0] as THREE.Mesh; pmAccessory.remove(c); c.geometry?.dispose?.(); }
      const mat = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.7, roughness: 0.3, emissive: accent, emissiveIntensity: 0.3 });
      if (acc === "horns") for (const sx of [-0.15, 0.15]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 6), mat); c.position.set(sx, 2.42, 0); c.rotation.z = sx < 0 ? 0.3 : -0.3; c.castShadow = true; pmAccessory.add(c); }
      else if (acc === "crown") for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), mat); c.position.set(Math.cos(a) * 0.2, 2.4, Math.sin(a) * 0.2); c.castShadow = true; pmAccessory.add(c); }
      else if (acc === "visor") { const v = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.05), new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 2 })); v.position.set(0, 2.08, 0.21); pmAccessory.add(v); }
      else if (acc === "hood") { const h = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.5), new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 1 })); h.position.y = 2.14; h.castShadow = true; pmAccessory.add(h); }
    };
    const applyPlayerSkin = (id: string) => { const s = SKINS[id] || SKINS.ranger; pmVest.color.setHex(s.color); pmVest.metalness = s.metal ?? 0; pmVest.emissive.setHex(s.emissive ?? 0x000000); pmVest.emissiveIntensity = s.emissive ? 0.5 : 0; pmHelm.color.setHex(s.accent ?? s.color); buildAccessory(s.acc ?? "none", s.accent ?? 0xffffff); };

    /* ---------- bots ---------- */
    interface Bot { group: THREE.Group; head: THREE.Mesh; body: THREE.Mesh; hp: number; speed: number; lastShot: number; roam: THREE.Vector3; dummy: boolean; dying?: boolean; dieAt?: number; dead?: boolean; home?: THREE.Vector3; respawnAt?: number; }
    const bots: Bot[] = []; const botParts: THREE.Object3D[] = [];
    const pickRoam = () => new THREE.Vector3((Math.random() - 0.5) * ARENA * 1.7, 0, (Math.random() - 0.5) * ARENA * 1.7);
    const makeBot = (pos: THREE.Vector3, dummy: boolean) => {
      const g = new THREE.Group();
      const skin = new THREE.MeshStandardMaterial({ color: 0xc98d63, roughness: 0.75 });
      const vestC = dummy ? 0xcf8a2a : 0x4b5320; const vest = new THREE.MeshStandardMaterial({ color: vestC, roughness: 0.85, metalness: 0.05 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.8 }); const boot = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 });
      const helmet = new THREE.MeshStandardMaterial({ color: dummy ? 0xb8791f : 0x2f3a2a, roughness: 0.7, metalness: 0.1 });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.86, 0.4), vest); torso.position.y = 1.4; torso.name = "body";
      const rig = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.46), dark); rig.position.y = 1.45;
      const hips = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.34, 0.4), dark); hips.position.y = 0.84;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.4), skin); head.position.y = 2.06; head.name = "head";
      const hel = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.7), helmet); hel.position.y = 2.16;
      const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.04), dark); eyeL.position.set(-0.09, 2.06, 0.2); const eyeR = eyeL.clone(); eyeR.position.x = 0.09;
      const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), dark); lLeg.position.set(-0.15, 0.45, 0); const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), dark); rLeg.position.set(0.15, 0.45, 0);
      const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.34), boot); lBoot.position.set(-0.15, 0.08, 0.04); const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.34), boot); rBoot.position.set(0.15, 0.08, 0.04);
      const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.18), vest); lArm.position.set(-0.36, 1.42, -0.12); lArm.rotation.x = -0.7;
      const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.18), vest); rArm.position.set(0.32, 1.42, -0.12); rArm.rotation.x = -0.7;
      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.66), dark); rifle.position.set(0.0, 1.42, -0.42);
      const rbar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 8), dark); rbar.rotation.x = Math.PI / 2; rbar.position.set(0, 1.44, -0.8);
      [torso, rig, hips, head, hel, eyeL, eyeR, lLeg, rLeg, lBoot, rBoot, lArm, rArm, rifle, rbar].forEach((m) => { m.castShadow = true; g.add(m); });
      g.position.copy(pos); g.userData.legs = [lLeg, rLeg]; worldGrp.add(g);
      const bot: Bot = { group: g, head, body: torso, hp: 100, speed: dummy ? 0 : 3 + Math.random() * 1.4, lastShot: 0, roam: pickRoam(), dummy, home: pos.clone() }; bots.push(bot); botParts.push(torso, head); return bot;
    };
    const removeBot = (i: number) => { const b = bots[i]; b.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); worldGrp.remove(b.group); [b.body, b.head].forEach((m) => { const k = botParts.indexOf(m); if (k >= 0) botParts.splice(k, 1); }); bots.splice(i, 1); };

    interface Target { mesh: THREE.Mesh; } const targets: Target[] = []; const targetParts: THREE.Object3D[] = [];
    const targetTex = tex((c, s) => { c.fillStyle = "#f4f4f4"; c.fillRect(0, 0, s, s); const cols = ["#222", "#f4f4f4", "#3a7bd5", "#f4f4f4", "#d33", "#f4f4f4", "#fc0"]; for (let i = 0; i < cols.length; i++) { c.beginPath(); c.arc(s / 2, s / 2, (s / 2) * (1 - i / cols.length), 0, Math.PI * 2); c.fillStyle = cols[i]; c.fill(); } });
    const makeTarget = (pos: THREE.Vector3) => { const g = new THREE.Group(); const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x333 })); stand.position.y = 0.6; const board = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshStandardMaterial({ map: targetTex, roughness: 0.7, side: THREE.DoubleSide })); board.position.y = 1.5; board.name = "target"; g.add(stand, board); g.position.copy(pos); worldGrp.add(g); targets.push({ mesh: board }); targetParts.push(board); };

    let actx: AudioContext | null = null;
    const sfx = (k: "shoot" | "hit" | "head" | "hurt" | "reload" | "enemy" | "heal" | "door" | "loot") => { if (!settingsRef.current.sfx) return; try { if (!actx) actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.connect(g); g.connect(actx.destination); const cfg = { shoot: [220, "square", 0.1, 0.07], hit: [620, "sine", 0.13, 0.05], head: [950, "sine", 0.18, 0.09], hurt: [110, "sawtooth", 0.2, 0.18], reload: [320, "triangle", 0.09, 0.05], enemy: [180, "square", 0.05, 0.06], heal: [520, "sine", 0.16, 0.22], door: [140, "triangle", 0.12, 0.18], loot: [660, "triangle", 0.16, 0.3] }[k] as [number, OscillatorType, number, number]; o.type = cfg[1]; o.frequency.setValueAtTime(cfg[0], t); if (k === "shoot") o.frequency.exponentialRampToValueAtTime(80, t + cfg[3]); if (k === "heal" || k === "loot") o.frequency.exponentialRampToValueAtTime(990, t + cfg[3]); g.gain.setValueAtTime(cfg[2] * settingsRef.current.volume, t); g.gain.exponentialRampToValueAtTime(0.001, t + cfg[3]); o.start(t); o.stop(t + cfg[3]); } catch {} };

    /* ---------- state + inventory ---------- */
    const controls = new PointerLockControls(camera, renderer.domElement);
    const state = { hp: 100, shield: 0, score: 0, kills: 0, shots: 0, hits: 0, reloading: false, vel: new THREE.Vector3(), canJump: true, mouseDown: false, ads: false, lastShot: 0, alive: true, won: false, crouchAmt: 0, speedUntil: 0, camMode: 0, potions: { health: 0, shield: 0, speed: 0 } as Record<string, number>, invuln: false, lastKickKills: 0, mode: "single" as Mode, inv: emptyInv(), equip: 0, countEnd: 0 };
    const keys: Record<string, boolean> = {};
    const raycaster = new THREE.Raycaster(); const losRay = new THREE.Raycaster(); const downRay = new THREE.Raycaster(); const DOWN = new THREE.Vector3(0, -1, 0);
    const curW = () => { const s = state.inv[state.equip]; return s && s.type === "weapon" && s.wId ? WEAPONS[s.wId] : WEAPONS.pistol; };
    let lastHudSync = 0;
    const syncHud = (force = false) => { const now = performance.now(); if (!force && now - lastHudSync < 80) return; lastHudSync = now; const s = state.inv[state.equip]; const w = curW(); setHud({ hp: Math.max(0, Math.round(state.hp)), ammo: s?.ammo ?? 0, mag: w.mag, reserve: s?.reserve ?? 0, score: state.score, kills: state.kills, shots: state.shots, hits: state.hits, reloading: state.reloading, mode: state.mode, alive: bots.filter((b) => !b.dummy && !b.dying).length, wname: w.name }); };
    const syncInv = () => { setInv(state.inv.map((s) => ({ ...s }))); setEquip(state.equip); };
    const syncPotions = () => { setPotionHud({ health: state.potions.health, shield: state.potions.shield, speed: state.potions.speed }); setShieldHud(Math.round(state.shield)); };
    const usePotion = (id: "health" | "shield" | "speed") => {
      if (!state.alive || (state.potions[id] ?? 0) <= 0) return;
      if (id === "health") { if (state.hp >= 100) return; state.hp = 100; }
      else if (id === "shield") state.shield = Math.min(100, state.shield + 50);
      else state.speedUntil = now() + 15000;
      state.potions[id]--; metaRef.current.potions[id] = Math.max(0, (metaRef.current.potions[id] ?? 0) - 1); applyMeta({ ...metaRef.current });
      sfx("heal"); showToast(`${POTIONS[id].icon} ${POTIONS[id].name}`); syncPotions(); syncHud(true);
    };
    let lastAds = false, lastHidden = false, lastPrompt = "", toastT = 0, lastCount = 0, lastCrouch = false;

    const tracers: { line: THREE.Line; life: number }[] = [];
    const ballTrail: { m: THREE.Mesh; life: number }[] = [];
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
          if (botParts.includes(h.object)) { const idx = bots.findIndex((b) => b.body === h.object || b.head === h.object); if (idx >= 0) { const b = bots[idx]; if (!b.dying && !b.dead) { const head = h.object.name === "head"; b.hp -= head ? w.dmg * 3 : w.dmg; state.hits++; setHit((v) => v + 1); sfx(head ? "head" : "hit"); if (b.hp <= 0) { b.dying = true; b.dieAt = now() + (b.dummy ? 700 : 1000); const bi = botParts.indexOf(b.body); if (bi >= 0) botParts.splice(bi, 1); const hi = botParts.indexOf(b.head); if (hi >= 0) botParts.splice(hi, 1); if (b.dummy) state.score += 25; else { state.kills++; state.score += head ? 150 : 100; } } } } }
          else if (targetParts.includes(h.object)) { state.hits++; state.score += 50; setHit((v) => v + 1); sfx("hit"); const tg = targets.find((t) => t.mesh === h.object); if (tg) { tg.mesh.visible = false; window.setTimeout(() => { tg.mesh.visible = true; }, 700); } }
        } else if (p === 0) addTracer(mw, mw.clone().add(dir.multiplyScalar(250)));
      }
      syncHud(true);
    };

    /* ---------- inventory ops ---------- */
    const showToast = (msg: string) => { setToast(msg); toastT = now() + 2200; };
    const addWeapon = (wId: string): boolean => { const i = state.inv.findIndex((s) => s.type === "empty"); if (i < 0) return false; state.inv[i] = { type: "weapon", wId, ammo: WEAPONS[wId].mag, reserve: WEAPONS[wId].mag * 2 }; syncInv(); return true; };
    const giveAmmo = () => { for (const s of state.inv) if (s.type === "weapon" && s.wId) { const cap = WEAPONS[s.wId].mag * 5; s.reserve = Math.min(cap, (s.reserve ?? 0) + WEAPONS[s.wId].mag); } syncInv(); syncHud(true); };
    const dropGround = (kind: "weapon" | "heal", id: string, rarity: Rarity, pos: THREE.Vector3) => {
      const g = new THREE.Group();
      if (kind === "weapon") { const col = new THREE.Color(RARITY[rarity].c); const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.16), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5, metalness: 0.6, roughness: 0.4 })); const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0x222 })); bar.rotation.z = Math.PI / 2; bar.position.x = -0.36; g.add(box, bar); }
      else { const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x114411, emissiveIntensity: 0.4 })); const cm = new THREE.MeshStandardMaterial({ color: 0x22c55e }); const cv = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.44), cm); const ch = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.44), cm); g.add(box, cv, ch); }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: kind === "weapon" ? RARITY[rarity].c : "#22c55e", transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 0.6; g.add(beam);
      g.position.set(pos.x, 0.6, pos.z); worldGrp.add(g); grounds.push({ group: g, pos: new THREE.Vector3(pos.x, 0.6, pos.z), kind, id });
    };
    const addHeal = (hId: string): boolean => { let i = state.inv.findIndex((s) => s.type === "heal" && s.hId === hId); if (i >= 0) { state.inv[i].count = (state.inv[i].count ?? 0) + 1; syncInv(); return true; } i = state.inv.findIndex((s) => s.type === "empty"); if (i < 0) return false; state.inv[i] = { type: "heal", hId, count: 1 }; syncInv(); return true; };
    const useSlot = (i: number) => { const s = state.inv[i]; if (!s || s.type === "empty") return; if (s.type === "weapon") { state.equip = i; state.reloading = false; setViewModel(s.wId!); syncInv(); syncHud(true); } else if (s.type === "heal") { if (state.hp >= 100) return; const h = HEALS[s.hId!]; state.hp = Math.min(100, state.hp + h.amt); s.count = (s.count ?? 1) - 1; if ((s.count ?? 0) <= 0) state.inv[i] = { type: "empty" }; sfx("heal"); showToast(`+${h.amt} HP`); syncInv(); syncHud(true); } };
    const cycleW = (dir: number) => { const wi = state.inv.map((s, idx) => (s.type === "weapon" ? idx : -1)).filter((x) => x >= 0); if (!wi.length) return; let k = wi.indexOf(state.equip); k = (k + dir + wi.length) % wi.length; state.equip = wi[k]; state.reloading = false; setViewModel(state.inv[state.equip].wId!); syncInv(); syncHud(true); };
    const rollRarity = (): Rarity => { const total = (Object.keys(RARITY) as Rarity[]).reduce((a, r) => a + RARITY[r].w, 0); let x = Math.random() * total; for (const r of Object.keys(RARITY) as Rarity[]) { x -= RARITY[r].w; if (x <= 0) return r; } return "common"; };
    const openChest = (c: Chest) => { if (c.opened) return; c.opened = true; c.glow.visible = false; c.lid.rotation.x = -1.7; const r = rollRarity(); const pool = r === "legendary" ? [...RAR_POOL.legendary, ...metaRef.current.weapons] : RAR_POOL[r]; const wId = pool[(Math.random() * pool.length) | 0]; if (!addWeapon(wId)) dropGround("weapon", wId, r, new THREE.Vector3(c.pos.x + 0.9, 0, c.pos.z)); giveAmmo(); const healId = Math.random() < 0.78 ? "bandaid" : "medkit"; if (!addHeal(healId)) dropGround("heal", healId, HEALS[healId].rarity, new THREE.Vector3(c.pos.x - 0.9, 0, c.pos.z)); sfx("loot"); showToast(`📦 ${WEAPONS[wId].name} (${r}) + ${HEALS[healId].name} + ammo`); };

    function now() { return performance.now(); }
    const tryInteract = () => {
      let bestC: Chest | null = null, bd = 3.6; for (const c of chests) if (!c.opened) { const d = c.pos.distanceTo(camera.position); if (d < bd) { bd = d; bestC = c; } }
      if (bestC) openChest(bestC);
    };
    const tryKick = () => { if (!soccer || soccer.kicking || !state.alive) return; if (camera.position.distanceTo(soccer.home) > 3.8) return; if (state.kills - state.lastKickKills < 4) return; soccer.kicking = true; soccer.kickStart = now(); state.invuln = true; sfx("shoot"); showToast("⚽ KICK!"); };

    const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; const B = settingsRef.current.binds; if (e.code === B.reload) reload(); if (e.code === B.interact) tryInteract(); if (e.code === B.jump && state.canJump) { state.vel.y = 6.4; state.canJump = false; } if (e.code === B.kick) tryKick(); if (/^Digit[1-7]$/.test(e.code)) useSlot(+e.code.slice(5) - 1); if (e.code === "Tab") { e.preventDefault(); state.camMode = (state.camMode + 1) % 3; } if (e.code === "Digit8") usePotion("health"); if (e.code === "Digit9") usePotion("shield"); if (e.code === "Digit0") usePotion("speed"); };
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
      state.shield = 0; state.speedUntil = 0; state.camMode = 0; state.invuln = false; state.lastKickKills = 0; playerModel.visible = false; gun.visible = true;
      state.potions = { health: metaRef.current.potions.health || 0, shield: metaRef.current.potions.shield || 0, speed: metaRef.current.potions.speed || 0 }; syncPotions();
      applyPlayerSkin(metaRef.current.skin || "ranger");
      // varied spawn near cover
      const sp = spawnSpots.length ? spawnSpots[(Math.random() * spawnSpots.length) | 0] : new THREE.Vector3(0, 0, 0);
      camera.position.set(sp.x + (Math.random() - 0.5) * 2, 1.7, sp.z + 2.5); camera.rotation.set(0, Math.atan2(-sp.x, -sp.z), 0);
      if (m === "single") { for (let i = 0; i < 10; i++) makeBot((spawns[i % spawns.length] || pickRoam()).clone(), false); }
      else { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; makeTarget(new THREE.Vector3(Math.cos(a) * (16 + (i % 3) * 7), 0, Math.sin(a) * (16 + (i % 3) * 7))); } for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.4; makeBot(new THREE.Vector3(Math.cos(a) * 28, 0, Math.sin(a) * 28), true); } }
      state.countEnd = now() + 3000; syncHud(true);
    };
    apiRef.current = { start: (m, idx) => { if (!state.alive || phaseRef.current === "menu" || phaseRef.current === "dead") reset(m, idx); controls.lock(); } };
    const die = () => { state.alive = false; const aliveLeft = bots.filter((b) => !b.dummy && !b.dying && !b.dead).length; const placement = aliveLeft + 1; const earned = placement === 1 ? 150 : placement === 2 ? 100 : placement === 3 ? 50 : 20; metaRef.current.coins += earned; applyMeta({ ...metaRef.current }); setWinCoins(earned); setPlace(placement); controls.unlock(); setPhase("dead"); };
    const onResize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); };
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
        // crouch + vertical
        controls.pointerSpeed = settingsRef.current.sens;
        renderer.shadowMap.enabled = settingsRef.current.shadows;
        state.crouchAmt += ((keys[settingsRef.current.binds.crouch] || keys["ControlLeft"] ? 1 : 0) - state.crouchAmt) * Math.min(1, dt * 10);
        const eyeH = 1.7 - state.crouchAmt * 0.75;
        rayOrig.set(camera.position.x, camera.position.y + 0.3, camera.position.z); downRay.set(rayOrig, DOWN); downRay.far = 80;
        const fh = downRay.intersectObjects(floors, false); let groundY = 0; if (fh.length) groundY = fh[0].point.y;
        const feetEye = groundY + eyeH;

        if (!counting) {
          const B = settingsRef.current.binds;
          const sprint = keys[B.sprint] ? 1.7 : 1; const spd = nowt < state.speedUntil ? 1.5 : 1; const accel = 58 * sprint * spd * (1 - 0.45 * state.crouchAmt), damp = 9;
          state.vel.x -= state.vel.x * damp * dt; state.vel.z -= state.vel.z * damp * dt;
          const fwd = (keys[B.forward] ? 1 : 0) - (keys[B.back] ? 1 : 0); const side = (keys[B.right] ? 1 : 0) - (keys[B.left] ? 1 : 0);
          if (fwd) state.vel.z -= fwd * accel * dt; if (side) state.vel.x += side * accel * dt;
          controls.moveRight(state.vel.x * dt); controls.moveForward(-state.vel.z * dt); collide(camera.position, 0.5);
        }
        state.vel.y -= 20 * dt; camera.position.y += state.vel.y * dt;
        if (camera.position.y <= feetEye) { camera.position.y = feetEye; state.vel.y = 0; state.canJump = true; }

        const w = curW(); const targetFov = state.ads ? w.fov : settingsRef.current.fov;
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix();
        gun.position.x += (((state.ads ? 0.0 : 0.3)) - gun.position.x) * Math.min(1, dt * 12); gun.position.y += (((state.ads ? -0.14 : -0.26)) - gun.position.y) * Math.min(1, dt * 12);
        gun.position.z += (-0.55 - gun.position.z) * Math.min(1, dt * 13); gun.rotation.x += (0 - gun.rotation.x) * Math.min(1, dt * 13);

        if (!counting && state.mouseDown && w.auto && nowt - state.lastShot >= w.rate) shoot();

        for (const bz of bushZones) { if ((camera.position.x - bz.x) ** 2 + (camera.position.z - bz.z) ** 2 < bz.r * bz.r) { playerHidden = true; break; } }
        // auto-open doors when the player is near (so buildings are always enterable)
        for (const dr of doors) { const near = dr.pos.distanceTo(camera.position) < 4.2; if (near !== dr.open) { dr.open = near; dr.target = near ? -Math.PI / 1.9 : 0; const c = dr.col; if (near) { c.minx = c.maxx = c.minz = c.maxz = 99999; } else { c.minx = dr.saved.minx; c.maxx = dr.saved.maxx; c.minz = dr.saved.minz; c.maxz = dr.saved.maxz; } } }
        // interact prompt (chests + soccer)
        let pr = ""; for (const c of chests) if (!c.opened && c.pos.distanceTo(camera.position) < 3.6) { pr = "open chest"; break; }
        if (!pr && soccer && !soccer.kicking && camera.position.distanceTo(soccer.home) < 3.8) pr = state.kills - state.lastKickKills >= 4 ? "kick the ball ⚽ (F)" : `kill ${4 - (state.kills - state.lastKickKills)} more to unlock ⚽`;
        if (pr !== lastPrompt) { lastPrompt = pr; setPrompt(pr); }
        // soccer kick animation (invulnerable while it plays)
        if (soccer?.kicking) {
          const p = Math.min(1, (nowt - soccer.kickStart) / 1600);
          soccer.ball.position.lerpVectors(soccer.home, soccer.goal, p);
          soccer.ball.position.y = soccer.home.y + Math.sin(p * Math.PI) * 4.5; // high arc
          soccer.ball.position.x += Math.sin(p * Math.PI) * 1.2; // curve (banana kick)
          soccer.ball.rotation.x += dt * 22; soccer.ball.rotation.z += dt * 10;
          // motion-blur trail
          const gm = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false })); gm.position.copy(soccer.ball.position); worldGrp.add(gm); ballTrail.push({ m: gm, life: 0.4 });
          if (p >= 1) { soccer.kicking = false; state.lastKickKills = state.kills; metaRef.current.coins += 100; applyMeta({ ...metaRef.current }); setGoalShow(true); window.setTimeout(() => setGoalShow(false), 2800); window.setTimeout(() => { state.invuln = false; }, 2600); const s2 = soccer; window.setTimeout(() => { if (s2) { s2.ball.position.copy(s2.home); s2.ball.rotation.set(0, 0, 0); } }, 1800); }
        }
        // medkit pickups
        for (const p of pickups) { if (p.active) { p.group.rotation.y += dt * 1.5; p.group.position.y = 0.9 + Math.sin(t * 2) * 0.12; if (state.hp < 100 && camera.position.distanceToSquared(p.pos) < 2.4) { state.hp = Math.min(100, state.hp + 30); p.active = false; p.group.visible = false; p.respawn = nowt + 18000; sfx("heal"); showToast("+30 HP"); syncHud(true); } } else if (nowt > p.respawn) { p.active = true; p.group.visible = true; } }
        for (let gi = grounds.length - 1; gi >= 0; gi--) { const gd = grounds[gi]; gd.group.rotation.y += dt * 1.6; gd.group.position.y = 0.6 + Math.sin(t * 2 + gi) * 0.1; if (camera.position.distanceToSquared(gd.pos) < 2.8) { const ok = gd.kind === "weapon" ? addWeapon(gd.id) : addHeal(gd.id); if (ok) { sfx("loot"); showToast(`Picked up ${gd.kind === "weapon" ? WEAPONS[gd.id].name : HEALS[gd.id].name}`); worldGrp.remove(gd.group); gd.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } }); grounds.splice(gi, 1); } } }
        if (toastT && nowt > toastT) { toastT = 0; setToast(""); }

        if (!counting) {
          eye.copy(camera.position);
          for (let i = bots.length - 1; i >= 0; i--) { const b = bots[i]; if (b.dummy) continue; if (b.dying) { b.group.rotation.z += (1.55 - b.group.rotation.z) * Math.min(1, dt * 6); b.group.position.y -= dt * 0.4; if (now() > (b.dieAt || 0)) removeBot(i); continue; } tmp.set(eye.x - b.group.position.x, 0, eye.z - b.group.position.z); const dist = tmp.length(); tmp.normalize(); let canSee = dist < 75; if (canSee && playerHidden && dist > 5) canSee = false; if (canSee) { losRay.set(new THREE.Vector3(b.group.position.x, 1.6, b.group.position.z), new THREE.Vector3(eye.x - b.group.position.x, eye.y - 1.6, eye.z - b.group.position.z).normalize()); losRay.far = dist; const bl = losRay.intersectObjects(solids, false); if (bl.length && bl[0].distance < dist - 1) canSee = false; } if (canSee && dist < 62) { if (dist > 14) b.group.position.addScaledVector(tmp, b.speed * dt); b.group.rotation.y = Math.atan2(tmp.x, tmp.z); collide(b.group.position, 0.5); const legs = b.group.userData.legs as THREE.Mesh[]; if (legs) { legs[0].rotation.x = Math.sin(t * 8 + i) * 0.5; legs[1].rotation.x = -Math.sin(t * 8 + i) * 0.5; } if (nowt - b.lastShot > 900) { b.lastShot = nowt + Math.random() * 450; addTracer(new THREE.Vector3(b.group.position.x, 1.5, b.group.position.z), eye.clone(), 0xff5a3c); sfx("enemy"); const hc = Math.max(0.1, Math.min(0.66, 1 - dist / 68)) * (1 - 0.4 * state.crouchAmt); if (!state.invuln && Math.random() < hc) { let dmg = 6 + Math.random() * 6; if (state.shield > 0) { const ab = Math.min(state.shield, dmg); state.shield -= ab; dmg -= ab; syncPotions(); } state.hp -= dmg; setDmgFlash((v) => v + 1); syncHud(true); if (state.hp <= 0) { state.hp = 0; syncHud(true); die(); } } } } else { tmp.set(b.roam.x - b.group.position.x, 0, b.roam.z - b.group.position.z); if (tmp.length() < 2) b.roam = pickRoam(); else { tmp.normalize(); b.group.position.addScaledVector(tmp, b.speed * 0.55 * dt); b.group.rotation.y = Math.atan2(tmp.x, tmp.z); collide(b.group.position, 0.5); } } }
          if (state.mode === "training") for (const b of bots) { if (!b.dummy) continue;
            if (b.dead) { if (now() > (b.respawnAt || 0)) { b.dead = false; b.hp = 100; b.group.visible = true; b.group.rotation.set(0, 0, 0); if (b.home) b.group.position.copy(b.home); botParts.push(b.body, b.head); } continue; }
            if (b.dying) { b.group.rotation.z += (1.55 - b.group.rotation.z) * Math.min(1, dt * 7); if (now() > (b.dieAt || 0)) { b.dying = false; b.dead = true; b.group.visible = false; b.respawnAt = now() + 3000; } continue; }
            tmp.set(eye.x - b.group.position.x, 0, eye.z - b.group.position.z).normalize(); b.group.rotation.y = Math.atan2(tmp.x, tmp.z);
          }
          if (state.mode === "single" && !state.won && bots.filter((b) => !b.dummy && !b.dying).length === 0) { state.won = true; state.alive = false; const earned = 150; metaRef.current.coins += earned; applyMeta({ ...metaRef.current }); setWinCoins(earned); setPlace(1); controls.unlock(); setPhase("win"); }
        }

        if (state.ads !== lastAds) { lastAds = state.ads; setAiming(state.ads); }
        if (playerHidden !== lastHidden) { lastHidden = playerHidden; setHidden(playerHidden); }
        const cr = state.crouchAmt > 0.5; if (cr !== lastCrouch) { lastCrouch = cr; setCrouched(cr); }
        syncHud();
      }
      for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].life -= dt; const m = tracers[i].line.material as THREE.LineBasicMaterial; m.opacity = Math.max(0, tracers[i].life / 0.06) * 0.9; if (tracers[i].life <= 0) { worldGrp.remove(tracers[i].line); tracers[i].line.geometry.dispose(); (tracers[i].line.material as THREE.Material).dispose(); tracers.splice(i, 1); } }
      for (let i = ballTrail.length - 1; i >= 0; i--) { ballTrail[i].life -= dt; const m = ballTrail[i].m.material as THREE.MeshBasicMaterial; m.opacity = Math.max(0, ballTrail[i].life / 0.4) * 0.45; if (ballTrail[i].life <= 0) { worldGrp.remove(ballTrail[i].m); ballTrail[i].m.geometry.dispose(); m.dispose(); ballTrail.splice(i, 1); } }

      // minimap radar
      const mini = miniRef.current;
      if (mini) { const mc = mini.getContext("2d"); if (mc) {
        const S = mini.width, R = 68, sc = S / (2 * R), px = camera.position.x, pz = camera.position.z;
        const w2m = (wx: number, wz: number): [number, number] => [S / 2 + (wx - px) * sc, S / 2 + (wz - pz) * sc];
        mc.clearRect(0, 0, S, S); mc.save(); mc.beginPath(); mc.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); mc.clip();
        mc.fillStyle = "rgba(8,12,18,0.72)"; mc.fillRect(0, 0, S, S);
        mc.fillStyle = "rgba(120,132,152,0.45)"; for (const c of colliders) { if (c.minx > 9000) continue; const [x1, y1] = w2m(c.minx, c.minz); const [x2, y2] = w2m(c.maxx, c.maxz); mc.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1) || 1, Math.abs(y2 - y1) || 1); }
        mc.fillStyle = "rgba(56,168,84,0.4)"; for (const bz of bushZones) { const [x, y] = w2m(bz.x, bz.z); mc.beginPath(); mc.arc(x, y, bz.r * sc, 0, Math.PI * 2); mc.fill(); }
        for (const c of chests) { if (c.opened) continue; const [x, y] = w2m(c.pos.x, c.pos.z); mc.fillStyle = "#ffd24a"; mc.fillRect(x - 2, y - 2, 4, 4); }
        for (const p of pickups) { if (!p.active) continue; const [x, y] = w2m(p.pos.x, p.pos.z); mc.fillStyle = "#22c55e"; mc.fillRect(x - 1.5, y - 1.5, 3, 3); }
        for (const gd of grounds) { const [x, y] = w2m(gd.pos.x, gd.pos.z); mc.fillStyle = "#ffffff"; mc.fillRect(x - 1.5, y - 1.5, 3, 3); }
        mc.fillStyle = "#ff4444"; for (const b of bots) { if (b.dummy || b.dying || b.dead) continue; const [x, y] = w2m(b.group.position.x, b.group.position.z); mc.beginPath(); mc.arc(x, y, 2.6, 0, Math.PI * 2); mc.fill(); }
        mc.restore();
        const d = camera.getWorldDirection(new THREE.Vector3());
        mc.strokeStyle = "#00e5ff"; mc.lineWidth = 2; mc.beginPath(); mc.moveTo(S / 2, S / 2); mc.lineTo(S / 2 + d.x * 13, S / 2 + d.z * 13); mc.stroke();
        mc.fillStyle = "#00e5ff"; mc.beginPath(); mc.arc(S / 2, S / 2, 3, 0, Math.PI * 2); mc.fill();
        mc.strokeStyle = "rgba(255,255,255,0.22)"; mc.lineWidth = 2; mc.beginPath(); mc.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); mc.stroke();
      } }

      // camera modes: 0 first-person · 1 third-person behind · 2 front view (see your skin)
      let savedCam: THREE.Vector3 | null = null; let savedQuat: THREE.Quaternion | null = null;
      if (state.camMode > 0 && controls.isLocked && state.alive) {
        savedCam = camera.position.clone(); savedQuat = camera.quaternion.clone();
        const dir = camera.getWorldDirection(new THREE.Vector3());
        const eyeH2 = 1.7 - state.crouchAmt * 0.75;
        playerModel.visible = true; gun.visible = false;
        playerModel.position.set(savedCam.x, savedCam.y - eyeH2, savedCam.z); playerModel.rotation.y = Math.atan2(dir.x, dir.z);
        if (state.camMode === 1) {
          let dist = 4.2; losRay.set(savedCam, dir.clone().negate()); losRay.far = dist; const hb = losRay.intersectObjects(solids, false); if (hb.length) dist = Math.max(1.3, hb[0].distance - 0.4);
          camera.position.addScaledVector(dir, -dist); camera.position.y += 0.55;
        } else {
          let dist = 3.4; losRay.set(savedCam, dir.clone()); losRay.far = dist; const hb = losRay.intersectObjects(solids, false); if (hb.length) dist = Math.max(1.5, hb[0].distance - 0.4);
          camera.position.addScaledVector(dir, dist); camera.position.y += 0.35;
          camera.lookAt(savedCam.x, savedCam.y - 0.25, savedCam.z);
        }
      } else { playerModel.visible = false; gun.visible = true; }
      if (settingsRef.current.bloom) composer.render(); else renderer.render(scene, camera);
      if (savedCam) camera.position.copy(savedCam); if (savedQuat) camera.quaternion.copy(savedQuat);
    };
    animate();

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); document.removeEventListener("keydown", onKeyDown); document.removeEventListener("keyup", onKeyUp); document.removeEventListener("mousedown", onMouseDown); document.removeEventListener("mouseup", onMouseUp); document.removeEventListener("wheel", onWheel); document.removeEventListener("contextmenu", onContext); controls.dispose(); renderer.dispose(); pmrem.dispose(); composer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); if (actx) actx.close().catch(() => {}); };
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
          {/* soccer goal celebration */}
          {goalShow && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"><div className="reward-pop text-center"><div className="text-8xl">⚽🎉</div><div className="text-7xl font-black text-yellow-300" style={{ textShadow: "0 0 40px rgba(255,200,40,0.9)" }}>GOOOOAL!</div><div className="mt-2 text-3xl font-bold text-white">+100 🪙</div><div className="mt-1 text-sm text-white/60">🛡️ invincible…</div></div></div>}

          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ color: settings.crosshair }}>
            {aiming ? <div className="h-1.5 w-1.5 rounded-full bg-current" /> : (<div className="relative h-6 w-6"><span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-current" /><span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-current" /><span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-current" /><span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-current" /><span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" /></div>)}
          </div>
          {hit > 0 && <div key={hit} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" style={{ animation: "fadeIn 0.18s ease forwards reverse" }}><div className="relative h-7 w-7"><span className="absolute left-1/2 top-0 h-2 w-0.5 -translate-x-1/2 bg-red-400" /><span className="absolute bottom-0 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-red-400" /><span className="absolute left-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-red-400" /><span className="absolute right-0 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-red-400" /></div></div>}

          <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between p-4 text-sm hud-shadow">
            <div className="rounded-lg bg-black/40 px-3 py-1.5">{hud.mode === "single" ? <>ENEMIES <span className="font-bold text-red-400">{hud.alive}</span></> : <>ACCURACY <span className="font-bold text-cyan-300">{acc}%</span> <span className="opacity-50">({hud.hits}/{hud.shots})</span></>}</div>
            <div className="rounded-lg bg-black/40 px-3 py-1.5">SCORE <span className="font-bold text-yellow-300">{hud.score}</span> <span className="opacity-50">· {hud.kills} kills</span></div>
          </div>

          {/* minimap */}
          <canvas ref={miniRef} width={172} height={172} className="pointer-events-none absolute right-4 top-14 h-[172px] w-[172px] rounded-full" />
          {/* status badges */}
          <div className="pointer-events-none absolute left-1/2 top-16 flex -translate-x-1/2 gap-2">
            {hidden && <div className="rounded-full bg-green-500/20 px-3 py-1 text-xs font-bold text-green-300 hud-shadow">🌿 HIDDEN</div>}
            {crouched && <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-cyan-200 hud-shadow">🡇 CROUCH</div>}
          </div>
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
            <div className="w-56">
              {shieldHud > 0 && (<><div className="mb-1 flex justify-between text-xs"><span className="text-cyan-300">🛡 SHIELD</span><span>{shieldHud}</span></div><div className="mb-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-400" style={{ width: `${shieldHud}%` }} /></div></>)}
              <div className="mb-1 flex justify-between text-xs"><span className={lowHp ? "text-red-400" : "text-emerald-300"}>HP</span><span>{hud.hp}</span></div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-white/10"><div className={`h-full transition-all ${lowHp ? "bg-red-500" : "bg-emerald-400"}`} style={{ width: `${hud.hp}%` }} /></div>
              <div className="mt-2.5 space-y-1 text-[11px]">
                <div className="font-bold uppercase tracking-wider text-white/40">Potions</div>
                <div className="flex gap-1.5">
                  <span className="rounded bg-white/10 px-2 py-1"><b className="text-cyan-300">8</b> ❤️ ×{potionHud.health}</span>
                  <span className="rounded bg-white/10 px-2 py-1"><b className="text-cyan-300">9</b> 🛡️ ×{potionHud.shield}</span>
                  <span className="rounded bg-white/10 px-2 py-1"><b className="text-cyan-300">0</b> ⚡ ×{potionHud.speed}</span>
                </div>
              </div>
            </div>
            <div className="text-right"><div className="text-3xl font-bold tabular-nums">{hud.reloading ? <span className="text-xl text-yellow-300">RELOADING…</span> : <>{hud.ammo}<span className={`text-base ${hud.reserve <= 0 ? "text-red-400" : "opacity-50"}`}> / {hud.reserve} spare</span></>}</div><div className="text-xs opacity-60">🔫 {hud.wname} <span className="opacity-50">(R reload · RMB aim)</span></div></div>
          </div>
        </>
      )}

      {phase === "menu" && (
        <Overlay>
          <button onClick={() => setShowTeams(true)} className="absolute right-4 top-4 flex items-center gap-2 rounded-xl border border-white/20 bg-black/40 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/10">
            <span className="text-lg">{meta.team ? TEAMS.find((t) => t.id === meta.team)?.flag : "🏆"}</span>
            {meta.team ? TEAMS.find((t) => t.id === meta.team)?.name : "Pick your team"}
          </button>
          <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-transparent p-8 text-center shadow-2xl sm:p-12">
            <Title />
            <p className="mt-2 text-sm font-bold tracking-[0.5em] text-cyan-300/70">3D BROWSER FPS</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <span className="rounded-full bg-yellow-400/15 px-3 py-1.5 text-sm font-bold text-yellow-300">🪙 {meta.coins}</span>
              <button onClick={() => setPhase("shop")} className="rounded-full border border-violet-400/60 bg-violet-500/10 px-4 py-1.5 text-sm font-bold text-violet-200 hover:bg-violet-500/20">🛒 SHOP</button>
              <button onClick={() => setShowLocker(true)} className="rounded-full border border-white/20 px-4 py-1.5 text-sm font-bold text-white/80 hover:bg-white/10">🎒 LOCKER</button>
              <button onClick={() => setPhase("settings")} className="rounded-full border border-white/20 px-4 py-1.5 text-sm font-bold text-white/80 hover:bg-white/10">⚙️ SETTINGS</button>
            </div>
            <p className="mt-6 text-[11px] uppercase tracking-[0.3em] text-white/40">Mode</p>
            <div className="mt-2 flex flex-wrap justify-center gap-3"><ModeCard active={mode === "single"} onClick={() => setMode("single")} icon="🤖" title="Single Player" desc="10 bots — last one standing" /><ModeCard active={mode === "training"} onClick={() => setMode("training")} icon="🎯" title="Training" desc="Targets + dummies + accuracy" /><ModeCard active={false} onClick={() => setPhase("multiplayer")} icon="🌐" title="Multiplayer" desc="Online — coming soon" soon /></div>
            <p className="mt-5 text-[11px] uppercase tracking-[0.3em] text-white/40">Map</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">{MAPS.map((m, i) => (<button key={m.name} onClick={() => setMapIdx(i)} className={`w-40 rounded-lg border px-3 py-2 text-left transition ${mapIdx === i ? "border-cyan-400 bg-cyan-400/10" : "border-white/15 hover:border-white/40"}`}><div className="text-sm font-bold">{m.name}</div><div className="text-[11px] text-white/50">{m.desc}</div></button>))}</div>
            <button onClick={() => apiRef.current?.start(mode, mapIdx)} className="mt-7 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-14 py-3.5 text-2xl font-black tracking-wider text-black transition hover:scale-105 hover:brightness-110" style={{ boxShadow: "0 0 40px -8px rgba(0,200,255,0.8)" }}>▶ PLAY</button>
            <p className="mt-2 text-[11px] text-white/40">Click Play, then move your mouse to look around</p>
          </div>
        </Overlay>
      )}
      {phase === "shop" && (
        <div className="fade-in absolute inset-0 z-10 overflow-y-auto bg-black/85 backdrop-blur-sm">
          <div className="mx-auto max-w-4xl px-5 py-8">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black tracking-widest"><span className="text-violet-300">ITEM</span> <span className="text-cyan-300">SHOP</span></h2>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-yellow-400/15 px-4 py-1.5 text-lg font-bold text-yellow-300">🪙 {meta.coins}</span>
                <button onClick={() => { setCrateReveal(null); setPhase("menu"); }} className="rounded-lg border border-white/20 px-4 py-1.5 text-sm hover:bg-white/10">← Back</button>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              {(["crates", "skins", "potions", "coins"] as const).map((tb) => (
                <button key={tb} onClick={() => setShopTab(tb)} className={`rounded-lg px-4 py-2 text-sm font-bold uppercase transition ${shopTab === tb ? "bg-cyan-400 text-black" : "border border-white/15 hover:border-white/40"}`}>{tb === "coins" ? "Buy Coins" : tb}</button>
              ))}
            </div>

            {shopTab === "crates" && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(RARITY_ORDER).map((cr) => { const c = CRATES[cr]; const col = RARITY[cr].c; const afford = meta.coins >= c.price; return (
                  <div key={cr} className="rounded-2xl border-2 p-5 text-center" style={{ borderColor: col, background: "rgba(255,255,255,0.03)" }}>
                    <div className="mx-auto grid h-20 w-20 place-items-center rounded-xl text-4xl" style={{ background: `${col}22`, boxShadow: `0 0 30px -6px ${col}` }}>📦</div>
                    <div className="mt-3 font-bold" style={{ color: col }}>{c.name}</div>
                    <div className="text-[11px] text-white/50">{cr === "legendary" ? "Chance of a MYTHIC weapon!" : "Skins · potions · coins"}</div>
                    <button disabled={!afford} onClick={() => openCrate(cr)} className="mt-3 w-full rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 py-2 text-sm font-bold text-black disabled:opacity-40">🪙 {c.price} · OPEN</button>
                  </div>); })}
              </div>
            )}

            {shopTab === "skins" && (
              <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {Object.entries(SKINS).map(([id, s]) => { const owned = meta.skins.includes(id); const equipped = meta.skin === id; const col = RARITY[s.rarity].c; return (
                  <div key={id} className="relative rounded-2xl border-2 p-4 text-center" style={{ borderColor: col }}>{s.limited && <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-red-500 px-2 py-0.5 text-[9px] font-bold">⏳ LIMITED</span>}
                    <div className="mx-auto grid place-items-center rounded-xl py-2" style={{ boxShadow: `0 0 20px -6px ${col}` }}><SkinAvatar s={s} /></div>
                    <div className="mt-2 font-bold text-sm">{s.name}</div>
                    <div className="text-[10px] uppercase" style={{ color: col }}>{s.rarity}</div>
                    {equipped ? <div className="mt-2 rounded-lg bg-emerald-500/20 py-1.5 text-xs font-bold text-emerald-300">EQUIPPED</div>
                      : owned ? <button onClick={() => equipSkin(id)} className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-xs font-bold hover:bg-white/20">EQUIP</button>
                      : s.crateOnly ? <div className="mt-2 rounded-lg bg-white/5 py-1.5 text-[11px] text-white/40">🔒 Crate only</div>
                      : <button disabled={meta.coins < s.price} onClick={() => buySkin(id)} className="mt-2 w-full rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 py-1.5 text-xs font-bold text-black disabled:opacity-40">🪙 {s.price}</button>}
                  </div>); })}
              </div>
            )}

            {shopTab === "potions" && (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {Object.entries(POTIONS).map(([id, p]) => (
                  <div key={id} className="rounded-2xl border border-white/15 p-5 text-center">
                    <div className="text-4xl">{p.icon}</div>
                    <div className="mt-2 font-bold">{p.name}</div>
                    <div className="text-[11px] text-white/50">Owned: {meta.potions[id] || 0}</div>
                    <button disabled={meta.coins < p.price} onClick={() => buyPotion(id)} className="mt-3 w-full rounded-lg bg-gradient-to-r from-yellow-400 to-amber-500 py-2 text-sm font-bold text-black disabled:opacity-40">🪙 {p.price} · BUY</button>
                  </div>
                ))}
                <p className="col-span-full text-center text-xs text-white/45">In a match: press <b>8</b> ❤️ heal · <b>9</b> 🛡️ shield · <b>0</b> ⚡ speed</p>
              </div>
            )}

            {shopTab === "coins" && (
              <div className="mt-6 grid gap-3 sm:grid-cols-4">
                {COIN_PACKS.map((cp) => (
                  <div key={cp.coins} className="rounded-2xl border border-yellow-400/30 p-5 text-center">
                    <div className="text-3xl">🪙</div>
                    <div className="mt-2 text-2xl font-black text-yellow-300">{cp.coins}</div>
                    <button onClick={() => buyCoins(cp.coins)} className="mt-3 w-full rounded-lg bg-gradient-to-r from-emerald-400 to-green-500 py-2 text-sm font-bold text-black">{cp.price}</button>
                  </div>
                ))}
                <p className="col-span-full text-center text-xs text-white/45">⚠️ Demo — clicking adds coins instantly, <b>no real charge</b>. (Real payments would need a store/Stripe.)</p>
              </div>
            )}
          </div>

          {crateOpening && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90">
              <div className="relative grid place-items-center">
                <div className="crate-pulse absolute h-56 w-56 rounded-full" style={{ background: `radial-gradient(circle, ${RARITY[crateOpening].c}55, transparent 70%)` }} />
                <div className="crate-shake relative text-8xl">📦</div>
              </div>
              <div className="mt-10 text-sm uppercase tracking-[0.3em]" style={{ color: RARITY[crateOpening].c }}>opening {CRATES[crateOpening].name}…</div>
            </div>
          )}
          {crateReveal && !crateOpening && (
            <div className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden bg-black/90" onClick={() => setCrateReveal(null)}>
              <div className="rays-spin pointer-events-none absolute h-[700px] w-[700px] opacity-30" style={{ background: `conic-gradient(${RARITY[crateReveal.rarity].c} 0deg 12deg, transparent 12deg 30deg, ${RARITY[crateReveal.rarity].c} 30deg 42deg, transparent 42deg 60deg, ${RARITY[crateReveal.rarity].c} 60deg 72deg, transparent 72deg 90deg, ${RARITY[crateReveal.rarity].c} 90deg 102deg, transparent 102deg 120deg, ${RARITY[crateReveal.rarity].c} 120deg 132deg, transparent 132deg 150deg, ${RARITY[crateReveal.rarity].c} 150deg 162deg, transparent 162deg 180deg)` }} />
              <div className="reward-pop relative rounded-3xl border-4 bg-black/70 p-10 text-center" style={{ borderColor: RARITY[crateReveal.rarity].c, boxShadow: `0 0 90px -4px ${RARITY[crateReveal.rarity].c}` }}>
                <div className="text-7xl">🎁</div>
                <div className="mt-2 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: RARITY[crateReveal.rarity].c }}>{crateReveal.rarity}</div>
                <div className="float-up mt-1 text-3xl font-black" style={{ color: RARITY[crateReveal.rarity].c }}>{crateReveal.label}</div>
                <button onClick={() => setCrateReveal(null)} className="mt-6 rounded-lg bg-white px-8 py-2.5 font-bold text-black transition hover:scale-105">AWESOME!</button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === "settings" && (
        <div className="fade-in absolute inset-0 z-10 overflow-y-auto bg-black/92 backdrop-blur-sm">
          <div className="mx-auto max-w-2xl px-5 py-8">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-black tracking-widest">⚙️ SETTINGS</h2>
              <button onClick={() => { setRebind(null); setPhase("menu"); }} className="rounded-lg border border-white/20 px-4 py-1.5 text-sm hover:bg-white/10">← Back</button>
            </div>
            <Section title="🔊 Audio">
              <Slider label="Master volume" min={0} max={1} step={0.05} value={settings.volume} onChange={(v) => applySettings({ ...settings, volume: v })} fmt={(v) => `${Math.round(v * 100)}%`} />
              <Toggle label="Sound effects" on={settings.sfx} onClick={() => applySettings({ ...settings, sfx: !settings.sfx })} />
            </Section>
            <Section title="🎨 Graphics">
              <Toggle label="Shadows" on={settings.shadows} onClick={() => applySettings({ ...settings, shadows: !settings.shadows })} />
              <Toggle label="Bloom / glow" on={settings.bloom} onClick={() => applySettings({ ...settings, bloom: !settings.bloom })} />
              <Slider label="Field of view" min={60} max={110} step={1} value={settings.fov} onChange={(v) => applySettings({ ...settings, fov: v })} fmt={(v) => `${v}°`} />
            </Section>
            <Section title="🖱️ Mouse & Crosshair">
              <Slider label="Mouse sensitivity" min={0.2} max={3} step={0.1} value={settings.sens} onChange={(v) => applySettings({ ...settings, sens: v })} fmt={(v) => v.toFixed(1)} />
              <div className="flex items-center justify-between py-1.5"><span className="text-sm">Crosshair color</span><input type="color" value={settings.crosshair} onChange={(e) => applySettings({ ...settings, crosshair: e.target.value })} className="h-8 w-14 cursor-pointer rounded bg-transparent" /></div>
            </Section>
            <Section title="🎮 Controls — click a key to rebind">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {BIND_ACTIONS.map(([act, label]) => (
                  <button key={act} onClick={() => setRebind(act)} className="flex items-center justify-between rounded-lg border border-white/15 px-3 py-2 text-sm transition hover:border-cyan-400/60">
                    <span className="text-white/70">{label}</span>
                    <span className={`rounded px-2 py-0.5 font-bold ${rebind === act ? "animate-pulse bg-cyan-400 text-black" : "bg-white/10 text-cyan-200"}`}>{rebind === act ? "press a key…" : keyLabel(settings.binds[act])}</span>
                  </button>
                ))}
              </div>
            </Section>
            <button onClick={() => applySettings(defaultSettings())} className="mt-6 w-full rounded-lg border border-red-400/40 py-2.5 text-sm font-bold text-red-300 hover:bg-red-500/10">Reset all to defaults</button>
          </div>
        </div>
      )}

      {phase === "multiplayer" && (<Overlay><h2 className="text-3xl font-bold tracking-widest text-cyan-300">🌐 ONLINE MULTIPLAYER</h2><p className="mt-4 max-w-md text-center text-sm text-white/70">Real-time online play needs a dedicated game server (WebSockets + netcode) that Vercel can&apos;t host. It&apos;s <span className="text-yellow-300">coming soon</span> — needs a separate realtime backend (Colyseus/Socket.IO on Railway/Fly.io).</p><PlayButton label="← Back" onClick={() => setPhase("menu")} /></Overlay>)}
      {phase === "paused" && (<Overlay><h2 className="text-3xl font-bold tracking-widest">PAUSED</h2><Controls /><PlayButton label="▶ RESUME" onClick={() => apiRef.current?.start(mode, mapIdx)} /><button onClick={() => setPhase("menu")} className="mt-4 rounded-xl border border-white/25 bg-white/5 px-8 py-3 text-lg font-bold text-white/90 transition hover:scale-105 hover:bg-white/15">🏠 MAIN MENU</button></Overlay>)}
      {phase === "win" && (<Overlay><h2 className="text-5xl font-black tracking-widest text-yellow-300" style={{ textShadow: "0 0 30px rgba(255,200,40,0.6)" }}>🏆 VICTORY</h2><p className="mt-3 text-lg text-white/80">Last one standing!</p><p className="mt-1 text-base">Score <span className="font-bold text-yellow-300">{hud.score}</span> · {hud.kills} kills · {acc}% acc</p><p className="mt-3 rounded-full bg-yellow-400/15 px-4 py-1.5 text-lg font-bold text-yellow-300">+{winCoins} 🪙 coins earned!</p><div className="mt-6 flex gap-3"><PlayButton label="↻ PLAY AGAIN" onClick={() => apiRef.current?.start(mode, mapIdx)} /><button onClick={() => setPhase("shop")} className="mt-7 rounded-lg border border-violet-400/60 bg-violet-500/10 px-6 py-3.5 text-lg font-bold text-violet-200 hover:bg-violet-500/20">🛒 SHOP</button></div><button onClick={() => setPhase("menu")} className="mt-4 rounded-xl border border-white/25 bg-white/5 px-8 py-3 text-lg font-bold text-white/90 transition hover:scale-105 hover:bg-white/15">🏠 MAIN MENU</button></Overlay>)}
      {phase === "dead" && (<Overlay><h2 className="text-4xl font-black tracking-widest text-red-500">YOU DIED</h2><p className="mt-2 text-2xl font-bold">#{place} <span className="text-base font-normal text-white/60">place</span></p><p className="mt-2 text-lg">{hud.kills} kills · {acc}% acc</p><p className="mt-3 rounded-full bg-yellow-400/15 px-4 py-1.5 text-lg font-bold text-yellow-300">+{winCoins} 🪙 coins</p><div className="mt-6 flex gap-3"><PlayButton label="↻ PLAY AGAIN" onClick={() => apiRef.current?.start(mode, mapIdx)} /><button onClick={() => setPhase("shop")} className="mt-7 rounded-lg border border-violet-400/60 bg-violet-500/10 px-6 py-3.5 text-lg font-bold text-violet-200 hover:bg-violet-500/20">🛒 SHOP</button></div><button onClick={() => setPhase("menu")} className="mt-4 rounded-xl border border-white/25 bg-white/5 px-8 py-3 text-lg font-bold text-white/90 transition hover:scale-105 hover:bg-white/15">🏠 MAIN MENU</button></Overlay>)}

      {showControls && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowControls(false)}>
          <div className="rounded-2xl border border-white/15 p-7" style={{ background: "rgba(10,12,18,0.96)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-center text-xl font-bold tracking-widest">CONTROLS</h3>
            <Controls />
            <button onClick={() => setShowControls(false)} className="mt-6 w-full rounded-lg bg-white/10 py-2 text-sm font-bold hover:bg-white/20">Close</button>
          </div>
        </div>
      )}

      {showTeams && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-4" onClick={() => setShowTeams(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 p-6" style={{ background: "rgba(10,12,18,0.97)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-center text-2xl font-black tracking-widest">🏆 CHOOSE YOUR TEAM</h3>
            <p className="mt-1 text-center text-xs text-white/50">World Cup 2026 — who are you repping?</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TEAMS.map((t) => (
                <button key={t.id} onClick={() => { applyMeta({ ...meta, team: t.id }); setShowTeams(false); }} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${meta.team === t.id ? "border-cyan-400 bg-cyan-400/10" : "border-white/15 hover:border-white/40"}`}><span className="text-xl">{t.flag}</span> {t.name}</button>
              ))}
            </div>
            <button onClick={() => setShowTeams(false)} className="mt-5 w-full rounded-lg bg-white/10 py-2 text-sm font-bold hover:bg-white/20">Close</button>
          </div>
        </div>
      )}

      {showLocker && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-4" onClick={() => setShowLocker(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 p-6" style={{ background: "rgba(10,12,18,0.97)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-center text-2xl font-black tracking-widest">🎒 YOUR LOCKER</h3>
            <p className="mt-1 text-center text-xs text-white/50">{meta.skins.length} skin{meta.skins.length !== 1 ? "s" : ""} owned · click to equip</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {meta.skins.map((id) => { const s = SKINS[id]; if (!s) return null; const eq = meta.skin === id; const col = RARITY[s.rarity].c; return (
                <div key={id} className="rounded-2xl border-2 p-3 text-center" style={{ borderColor: col }}>
                  <div className="py-1"><SkinAvatar s={s} /></div>
                  <div className="mt-1 text-xs font-bold">{s.name}</div>
                  {eq ? <div className="mt-2 rounded bg-emerald-500/20 py-1 text-[11px] font-bold text-emerald-300">EQUIPPED</div> : <button onClick={() => applyMeta({ ...meta, skin: id })} className="mt-2 w-full rounded bg-white/10 py-1 text-[11px] font-bold hover:bg-white/20">EQUIP</button>}
                </div>); })}
            </div>
            <button onClick={() => setShowLocker(false)} className="mt-5 w-full rounded-lg bg-white/10 py-2 text-sm font-bold hover:bg-white/20">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><h3 className="mb-2 text-sm font-bold uppercase tracking-widest text-cyan-300/80">{title}</h3>{children}</div>; }
function Slider({ label, min, max, step, value, onChange, fmt }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void; fmt: (v: number) => string }) { return (<div className="py-1.5"><div className="mb-1 flex justify-between text-sm"><span className="text-white/70">{label}</span><span className="font-bold text-cyan-200">{fmt(value)}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="w-full accent-cyan-400" /></div>); }
function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) { return (<button onClick={onClick} className="flex w-full items-center justify-between py-2 text-sm"><span className="text-white/70">{label}</span><span className={`relative h-6 w-11 rounded-full transition ${on ? "bg-cyan-400" : "bg-white/15"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} /></span></button>); }
function Overlay({ children }: { children: React.ReactNode }) { return <div className="fade-in absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 px-4 backdrop-blur-sm">{children}</div>; }
function SkinAvatar({ s }: { s: Skin }) {
  const body = `#${s.color.toString(16).padStart(6, "0")}`;
  const accent = `#${(s.accent ?? 0xffffff).toString(16).padStart(6, "0")}`;
  return (
    <div className="relative mx-auto h-20 w-16">
      {s.acc === "crown" && <div className="absolute left-1/2 top-1 flex -translate-x-1/2 gap-0.5">{[0, 1, 2].map((i) => <div key={i} className="h-0 w-0 border-x-[5px] border-b-[9px] border-x-transparent" style={{ borderBottomColor: accent }} />)}</div>}
      {s.acc === "horns" && <><div className="absolute left-2 top-2 h-0 w-0 -rotate-[30deg] border-x-[4px] border-b-[10px] border-x-transparent" style={{ borderBottomColor: accent }} /><div className="absolute right-2 top-2 h-0 w-0 rotate-[30deg] border-x-[4px] border-b-[10px] border-x-transparent" style={{ borderBottomColor: accent }} /></>}
      {s.acc === "hood" && <div className="absolute left-1/2 top-2 h-8 w-11 -translate-x-1/2 rounded-t-full" style={{ background: "#0a0a0c" }} />}
      <div className="absolute left-1/2 top-4 h-7 w-7 -translate-x-1/2 rounded-md" style={{ background: "#c98d63" }}>
        {s.acc === "visor" && <div className="absolute left-1/2 top-3 h-1.5 w-6 -translate-x-1/2 rounded" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />}
      </div>
      <div className="absolute bottom-0 left-1/2 h-9 w-11 -translate-x-1/2 rounded-t-lg" style={{ background: body, boxShadow: s.emissive ? `0 0 14px ${accent}` : "none" }} />
    </div>
  );
}
function Title() { return <h1 className="text-center text-6xl font-black tracking-[0.2em] sm:text-8xl" style={{ textShadow: "0 0 40px rgba(0,200,255,0.4)" }}><span className="text-cyan-300">STRIKE</span><span className="text-red-500">ZONE</span></h1>; }
function ModeCard({ active, onClick, icon, title, desc, soon }: { active: boolean; onClick: () => void; icon: string; title: string; desc: string; soon?: boolean }) { return (<button onClick={onClick} className={`relative w-44 rounded-xl border p-4 text-left transition ${active ? "border-cyan-400 bg-cyan-400/10" : "border-white/15 hover:border-white/40"}`}>{soon && <span className="absolute right-2 top-2 rounded bg-yellow-400/20 px-1.5 py-0.5 text-[9px] font-bold text-yellow-300">SOON</span>}<div className="text-3xl">{icon}</div><div className="mt-2 font-bold">{title}</div><div className="text-[11px] text-white/55">{desc}</div></button>); }
function PlayButton({ label, onClick }: { label: string; onClick: () => void }) { return <button onClick={onClick} className="mt-7 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-8 py-3.5 text-lg font-bold text-black transition hover:scale-105 hover:brightness-110">{label}</button>; }
function Controls() { const rows = [["WASD", "Move"], ["Mouse", "Look"], ["LMB", "Shoot"], ["RMB", "Aim"], ["C / Ctrl", "Crouch"], ["Space", "Jump"], ["Shift", "Sprint"], ["1-7", "Weapons/items"], ["8 / 9 / 0", "Potions"], ["Scroll", "Swap gun"], ["E", "Open chest"], ["R", "Reload"], ["TAB", "1st/3rd view"]]; return (<div className="mt-7 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-4">{rows.map(([k, v]) => (<div key={k} className="flex items-center gap-2"><span className="rounded bg-white/10 px-2 py-0.5 font-bold text-cyan-200">{k}</span><span className="text-white/60">{v}</span></div>))}</div>); }
