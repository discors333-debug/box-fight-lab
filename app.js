(() => {
'use strict';
const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;

/* ---------- constants ---------- */
// Fortnite proportions: 512 x 384 unit build tiles (1 unit = 1 cm)
const T = 5.12, H = 3.84;       // grid cell width and level height
const WT = 0.25, FT = 0.25, RT = 0.3, CH = 1.92; // wall/floor/ramp thickness, cone height
const PR = 0.42, PH = 1.8, EYE = 1.6, STEP = 0.55;
const GRAV = 26, JUMP = 8.6, SPEED = 7.4, WORLD = 150;
const COST = 10;
const MATS = {
  wood:  { name: 'Wood',  hp: 150, time: 5 },
  brick: { name: 'Brick', hp: 300, time: 12 },
  metal: { name: 'Metal', hp: 500, time: 20 },
};
const MAT_ORDER = ['wood', 'brick', 'metal'];
const TYPE_NAME = { wall: 'Wall', floor: 'Floor', ramp: 'Stairs', cone: 'Cone' };
const SLOTS = ['pickaxe', 'rifle', 'wall', 'floor', 'ramp', 'cone'];
const RAMP_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const SPAWN = [2, 0, 10];

const settings = { sens: 1, padSens: 1, invertY: false, editRelease: true, turrets: true, fpsCap: 0, showFps: true, renderScale: 100, shadows: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('bfl-settings') || '{}')); } catch (e) {}
function saveSettings() { try { localStorage.setItem('bfl-settings', JSON.stringify(settings)); } catch (e) {} }

const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space',
  pickaxe: 'Digit1', rifle: 'Digit2', wall: 'KeyQ', floor: 'KeyF', ramp: 'KeyC', cone: 'KeyV',
  edit: 'KeyG', resetEdit: 'KeyR', material: 'KeyT', mute: 'KeyM',
};
const BIND_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Move left', right: 'Move right', jump: 'Jump',
  pickaxe: 'Pickaxe', rifle: 'Assault rifle', wall: 'Wall', floor: 'Floor', ramp: 'Stairs', cone: 'Cone',
  edit: 'Edit / confirm edit', resetEdit: 'Rotate build / reset edit', material: 'Switch material', mute: 'Mute sound',
};
const binds = Object.assign({}, DEFAULT_BINDS);
try { Object.assign(binds, JSON.parse(localStorage.getItem('bfl-binds2') || '{}')); } catch (e) {}
function saveBinds() { try { localStorage.setItem('bfl-binds2', JSON.stringify(binds)); } catch (e) {} }
function keyName(code) {
  if (!code) return 'Unbound';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const named = { Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[',
    BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
    Mouse1: 'Middle mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5' };
  return named[code] || code.replace(/^Arrow/, '').replace(/(Left|Right)$/, '');
}

/* ---------- renderer ---------- */
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
function applyRenderScale() { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * settings.renderScale / 100); }
applyRenderScale();
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe4ff, 90, 270);
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 700);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// sky dome
const sky = (() => {
  const geo = new THREE.SphereGeometry(500, 32, 16);
  const pos = geo.attributes.position, cols = [];
  const lo = new THREE.Color(0xd8f1ff), hi = new THREE.Color(0x3d8be6), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, pos.getY(i) / 500);
    c.copy(lo).lerp(hi, Math.pow(t, 0.6)); cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(m); return m;
})();

scene.add(new THREE.HemisphereLight(0xe4f4ff, 0x4f6f33, 0.75));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 160 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
sun.castShadow = settings.shadows;
scene.add(sun, sun.target);

/* ---------- textures ---------- */
function rnd(a, b) { return a + Math.random() * (b - a); }
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const woodTex = canvasTex(256, (g, s) => {
  const rows = 4, rh = s / rows;
  for (let i = 0; i < rows; i++) {
    g.fillStyle = `hsl(${rnd(26, 31)},${rnd(48, 56)}%,${rnd(40, 50)}%)`; g.fillRect(0, i * rh, s, rh);
    for (let k = 0; k < 36; k++) {
      g.strokeStyle = `rgba(80,40,10,${rnd(.05, .2)})`; g.lineWidth = rnd(.6, 2);
      const y = i * rh + rnd(3, rh - 3);
      g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * .3, y + rnd(-3, 3), s * .6, y + rnd(-3, 3), s, y + rnd(-2, 2)); g.stroke();
    }
    g.fillStyle = 'rgba(45,22,6,.6)'; g.fillRect(0, i * rh, s, 3);
    g.fillStyle = 'rgba(35,28,24,.85)';
    [14, s - 14].forEach(x => { g.beginPath(); g.arc(x, i * rh + rh / 2, 3, 0, 7); g.fill(); });
  }
  g.strokeStyle = 'rgba(40,20,5,.75)'; g.lineWidth = 8; g.strokeRect(0, 0, s, s);
});
const brickTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#cbbda9'; g.fillRect(0, 0, s, s);
  const rows = 8, bh = s / rows, bw = s / 4;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let c = -1; c < 5; c++) {
      const x = c * bw + off;
      g.fillStyle = `hsl(${rnd(6, 16)},${rnd(45, 60)}%,${rnd(35, 46)}%)`; g.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6);
      g.fillStyle = 'rgba(255,255,255,.09)'; g.fillRect(x + 3, r * bh + 3, bw - 6, 3);
    }
  }
  g.strokeStyle = 'rgba(70,40,30,.7)'; g.lineWidth = 8; g.strokeRect(0, 0, s, s);
});
const metalTex = canvasTex(256, (g, s) => {
  const grd = g.createLinearGradient(0, 0, s, s); grd.addColorStop(0, '#b3bec9'); grd.addColorStop(1, '#7b8792');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,.2)';
  for (let y = 10, row = 0; y < s; y += 22, row++)
    for (let x = (row % 2) * 11 + 10; x < s; x += 22) { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-7, -2, 14, 4); g.restore(); }
  g.strokeStyle = 'rgba(40,48,58,.95)'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10);
  g.fillStyle = '#4a545f';
  [[18, 18], [s - 18, 18], [18, s - 18], [s - 18, s - 18]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); });
});
const grassTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#5f9d3b'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = `hsla(${rnd(78, 112)},${rnd(35, 55)}%,${rnd(30, 50)}%,.55)`;
    g.fillRect(rnd(0, s), rnd(0, s), rnd(1, 3), rnd(2, 6));
  }
});
grassTex.repeat.set(90, 90);
const TEX = { wood: woodTex, brick: brickTex, metal: metalTex };

function stdMat(tex, metal, side) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: metal ? 0.45 : 0.9, metalness: metal ? 0.35 : 0, side: side || THREE.FrontSide });
}
const PMAT = {};
for (const m of MAT_ORDER) {
  const rampTex = TEX[m].clone(); rampTex.needsUpdate = true; rampTex.center.set(.5, .5); rampTex.rotation = Math.PI / 2;
  PMAT[m] = { solid: stdMat(TEX[m], m === 'metal'), double: stdMat(TEX[m], m === 'metal', THREE.DoubleSide), ramp: stdMat(rampTex, m === 'metal') };
}
const ghostMats = {
  ok:  new THREE.MeshBasicMaterial({ color: 0x3aa6ff, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
  bad: new THREE.MeshBasicMaterial({ color: 0xff4a5c, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }),
  okLine: new THREE.LineBasicMaterial({ color: 0xbfe3ff }),
  badLine: new THREE.LineBasicMaterial({ color: 0xffb3bc }),
};
const tileMats = {
  base:  new THREE.MeshBasicMaterial({ color: 0x2f8fff, transparent: true, opacity: 0.5, depthWrite: false }),
  hover: new THREE.MeshBasicMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.7, depthWrite: false }),
  sel:   new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }),
  path:  new THREE.MeshBasicMaterial({ color: 0xffcb2f, transparent: true, opacity: 0.65, depthWrite: false }),
  bad:   new THREE.MeshBasicMaterial({ color: 0xff4a5c, transparent: true, opacity: 0.6, depthWrite: false }),
  line:  new THREE.LineBasicMaterial({ color: 0xdff0ff }),
};

/* ---------- ground ---------- */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
ground.userData.owner = { kind: 'ground' };
scene.add(ground);

/* ---------- world objects ---------- */
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const srand = mulberry32(90210);
const worldSolids = [], resources = [], dummies = [], turrets = [];
const occupied = [[0, 0, 14]];
function addBoxSolid(min, max, owner) { worldSolids.push({ box: true, min, max, owner: owner || null, piece: null }); }
function freeSpot(minR, maxR, rad) {
  for (let k = 0; k < 60; k++) {
    const a = srand() * Math.PI * 2, r = minR + srand() * (maxR - minR);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (occupied.every(o => Math.hypot(o[0] - x, o[1] - z) > o[2] + rad)) { occupied.push([x, z, rad]); return [x, z]; }
  }
  return null;
}
function shade(obj) { obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); }

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a4f2c, roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.9, flatShading: true });
const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x4fa044, roughness: 0.9, flatShading: true });
const rockMat = new THREE.MeshStandardMaterial({ color: 0x9a9ea6, roughness: 0.95, flatShading: true });
function makeTree(x, z) {
  const s = 0.85 + srand() * 0.5, g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 3, 7), trunkMat); trunk.position.y = 1.5;
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.2, 8), leafMat); f1.position.y = 3.8;
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.6, 8), leafMat2); f2.position.y = 5.4;
  g.add(trunk, f1, f2); g.scale.setScalar(s); g.position.set(x, 0, z); g.rotation.y = srand() * 6;
  const res = { kind: 'res', type: 'wood', label: 'Tree', hp: 100, maxHp: 100, gain: 12, alive: true, group: g, respawnAt: 0, wobble: 0 };
  g.userData.owner = res; shade(g); scene.add(g); resources.push(res);
  addBoxSolid([x - .45 * s, 0, z - .45 * s], [x + .45 * s, 3 * s, z + .45 * s], res);
}
function makeRock(x, z) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), rockMat);
  m.scale.set(1.3, 0.85, 1.1); m.rotation.set(srand(), srand() * 6, srand()); m.position.y = 0.6; g.add(m);
  g.position.set(x, 0, z);
  const res = { kind: 'res', type: 'brick', label: 'Rock', hp: 120, maxHp: 120, gain: 10, alive: true, group: g, respawnAt: 0, wobble: 0 };
  g.userData.owner = res; shade(g); scene.add(g); resources.push(res);
  addBoxSolid([x - 1.5, 0, z - 1.3], [x + 1.5, 1.6, z + 1.3], res);
}
const crateMat = stdMat(metalTex, true);
function makeCrate(x, z) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.4), crateMat); m.position.y = 0.7; g.add(m);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.15, 1.5), new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: .6 }));
  lid.position.y = 1.45; g.add(lid);
  const rot = srand() > .5 ? 0 : Math.PI / 2; g.rotation.y = rot; g.position.set(x, 0, z);
  const res = { kind: 'res', type: 'metal', label: 'Scrap crate', hp: 120, maxHp: 120, gain: 10, alive: true, group: g, respawnAt: 0, wobble: 0 };
  g.userData.owner = res; shade(g); scene.add(g); resources.push(res);
  const hx = rot ? .75 : 1.25, hz = rot ? 1.25 : .75;
  addBoxSolid([x - hx, 0, z - hz], [x + hx, 1.5, z + hz], res);
}
const dummyBody = new THREE.MeshStandardMaterial({ color: 0xf07a2b, roughness: .7 });
const dummyWhite = new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: .7 });
const poleMat = new THREE.MeshStandardMaterial({ color: 0x565d6b, roughness: .6, metalness: .3 });
function makeDummy(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .9, 8), poleMat); pole.position.y = .45;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.5, .6, .15, 16), poleMat); base.position.y = .075;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.36, .42, 1.1, 14), dummyBody); body.position.y = 1.45;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .18, 14), dummyWhite); band.position.y = 1.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 14, 10), dummyWhite); head.position.y = 2.27; head.userData.part = 'head';
  const pivot = new THREE.Group(); pivot.add(pole, body, band, head); g.add(base, pivot);
  g.position.set(x, 0, z);
  const d = { kind: 'dummy', label: 'Target dummy', hp: 150, maxHp: 150, alive: true, group: g, pivot, respawnAt: 0 };
  g.userData.owner = d; shade(g); scene.add(g); dummies.push(d);
  addBoxSolid([x - .45, 0, z - .45], [x + .45, 2.55, z + .45], null);
}
const turretEye = new THREE.MeshBasicMaterial({ color: 0xff3b5c });
const turretShell = new THREE.MeshStandardMaterial({ color: 0x2b3145, roughness: .5, metalness: .5 });
const turretPillarOwner = { get alive() { return settings.turrets; } };
function makeTurret(x, z) {
  const g = new THREE.Group();
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3, 1.4), crateMat); pillar.position.y = 1.5;
  const head = new THREE.Group(); head.position.y = 3.7;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.75, 16, 12), turretShell);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.26, 12, 8), turretEye); eye.position.z = .62;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 1.1, 8), turretShell); barrel.rotation.x = Math.PI / 2; barrel.position.z = .9;
  head.add(ball, eye, barrel); g.add(pillar, head); g.position.set(x, 0, z);
  const t = { kind: 'turret', label: 'Sentry', hp: 200, maxHp: 200, alive: true, group: g, head, cd: 1 + Math.random() * 2, respawnAt: 0 };
  g.userData.owner = t; shade(g); scene.add(g); turrets.push(t);
  addBoxSolid([x - .7, 0, z - .7], [x + .7, 4.5, z + .7], turretPillarOwner);
}

for (let i = 0; i < 48; i++) { const p = freeSpot(16, 120, 3); if (p) makeTree(p[0], p[1]); }
for (let i = 0; i < 18; i++) { const p = freeSpot(16, 115, 3.5); if (p) makeRock(p[0], p[1]); }
for (let i = 0; i < 12; i++) { const p = freeSpot(18, 110, 3.5); if (p) makeCrate(p[0], p[1]); }
[-6, -2, 2, 6].forEach(x => makeDummy(x + 2, -16));
[[40, -30], [-42, -22], [8, 52]].forEach(([x, z]) => makeTurret(x, z));

/* ---------- player model ---------- */
const player = (() => {
  const g = new THREE.Group();
  const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: .75 });
  const skin = M(0xf0c09a), shirt = M(0x2e7fe0), pants = M(0x2c3552), boot = M(0x1b1e2b), hair = M(0x5a3a20);
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const torso = box(.62, .72, .34, shirt); torso.position.y = 1.16;
  const headM = box(.42, .42, .42, skin); headM.position.y = 1.75;
  const hairM = box(.45, .14, .45, hair); hairM.position.y = 1.95;
  const legs = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * .16, .8, 0);
    const l = box(.25, .66, .28, pants); l.position.y = -.33; const b = box(.27, .14, .32, boot); b.position.set(0, -.73, -.02);
    p.add(l, b); g.add(p); return p;
  });
  const arms = [-1, 1].map(s => {
    const p = new THREE.Group(); p.position.set(s * .42, 1.46, 0);
    const a = box(.2, .62, .22, shirt); a.position.y = -.28; const h = box(.18, .16, .18, skin); h.position.y = -.64;
    p.add(a, h); g.add(p); return p;
  });
  // pickaxe held in right hand
  const pick = new THREE.Group();
  const handle = box(.07, .95, .07, M(0x6b4a2d)); handle.position.y = .2;
  const blade = box(.75, .1, .1, M(0x9ad0ff)); blade.position.y = .65;
  pick.add(handle, blade); pick.position.set(0, -.62, -.05); pick.rotation.x = -Math.PI / 2; arms[1].add(pick);
  // rifle
  const rifle = new THREE.Group();
  const rb = box(.12, .16, .9, M(0x2a2f3a)); const mag = box(.08, .22, .1, M(0x3c4252)); mag.position.set(0, -.16, -.1);
  const stock = box(.1, .14, .28, M(0x4a3a2a)); stock.position.z = .55;
  rifle.add(rb, mag, stock); rifle.position.set(0, -.95, .05); rifle.rotation.x = -Math.PI / 2; arms[1].add(rifle);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -.48); rifle.add(muzzle);
  g.add(torso, headM, hairM); g.rotation.order = 'YXZ'; shade(g); scene.add(g);
  return { g, legs, arms, pick, rifle, muzzle, torso, parts: [torso, headM, hairM] };
})();

/* ---------- builds ---------- */
const pieces = new Map();        // key -> piece
const pointIndex = new Map();    // lattice point -> Set(piece)
let solids = [], solidsDirty = true;

const keyOf = d => d.type[0] + ':' + d.x + ',' + d.y + ',' + d.z + (d.type === 'wall' ? ',' + d.a : '');
const fullMask = type => type === 'wall' ? 511 : 15;

function tileUV(geo, u0, v0, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * su, v0 + uv.getY(i) * sv);
  uv.needsUpdate = true;
}
// Cones: each corner is down (0) or flipped up (CH). Editing a tile flips its corner, so two
// tiles on one side make a sloped roof and all four turn the cone upside down.
function coneCorners(flip) { return [0, 1, 2, 3].map(q => (flip >> q & 1) ? CH : 0); }   // q = u + 2v
function coneCenter(h) { return CH - (h[0] + h[1] + h[2] + h[3]) / 4; }
function bary(px, py, a, b, c) {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  const w1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d;
  const w2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d;
  return w1 * a[2] + w2 * b[2] + (1 - w1 - w2) * c[2];
}
function coneHeightAt(flip, u, v) {
  const h = coneCorners(flip), c = [.5, .5, coneCenter(h)];
  if (Math.abs(v - .5) >= Math.abs(u - .5)) return v < .5 ? bary(u, v, [0, 0, h[0]], [1, 0, h[1]], c) : bary(u, v, [0, 1, h[2]], [1, 1, h[3]], c);
  return u < .5 ? bary(u, v, [0, 0, h[0]], [0, 1, h[2]], c) : bary(u, v, [1, 0, h[1]], [1, 1, h[3]], c);
}
function coneGeo(flip) {
  const h = coneCorners(flip), cy = coneCenter(h);
  const ring = [[0, 0, h[0]], [1, 0, h[1]], [1, 1, h[3]], [0, 1, h[2]]];
  const pos = [], uv = [];
  for (let i = 0; i < 4; i++) for (const [u, v, y] of [ring[i], ring[(i + 1) % 4], [.5, .5, cy]]) { pos.push(u * T, y, v * T); uv.push(u, v); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals(); return geo;
}
const RAMP_LEN = Math.hypot(T, H), RAMP_ANG = Math.atan2(H, T);

function filletShape(cx, cy, ix, iy, r) {
  const pts = [new THREE.Vector2(cx, cy)];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 - Math.PI / 2 * i / 10;
    pts.push(new THREE.Vector2(cx + ix * (r + r * Math.cos(a)), cy + iy * (r + r * Math.sin(a))));
  }
  return new THREE.Shape(pts);
}
function filletGeo(shape, depth, su, sv) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / su, pos.getY(i) / sv);
  return geo;
}
// Fortnite rounds only arches: an opening that reaches the ground and is 2+ tiles wide gets a
// curved top corner on each side that still has wall. Windows and doors stay square.
function fillets(cols, rows, mask, tw, th) {
  const inb = (u, v) => u >= 0 && v >= 0 && u < cols && v < rows;
  const has = (u, v) => inb(u, v) && (mask >> (u + cols * v) & 1) === 1;
  const out = [];
  for (let v = 0; v < rows; v++) for (let u = 0; u < cols; u++) {
    if (has(u, v)) continue;
    for (const cu of [0, 1]) for (const cv of [0, 1]) {
      const sx = cu ? 1 : -1, sy = cv ? 1 : -1;
      if (!has(u + sx, v) || !has(u, v + sy)) continue;
      if (cv !== 1) continue;
      let open = true;
      for (let k = 0; k <= v; k++) if (has(u, k)) open = false;
      if (!open || !inb(u - sx, v) || has(u - sx, v)) continue;
      out.push({ x: (u + cu) * tw, y: (v + cv) * th, ix: -sx, iy: -sy, r: Math.min(tw, th) * 0.96 });
    }
  }
  return out;
}
// Every wall edit Fortnite allows. Patterns list kept tiles, top row first. 'mirror' and 'dihedral'
// add the flipped/rotated versions the chart marks; window and door list their shifted positions.
const WALL_EDITS = {};
(() => {
  const parse = str => {
    let m = 0;
    str.split('/').forEach((row, r) => [...row].forEach((c, u) => { if (c === '1') m |= 1 << (u + 3 * (2 - r)); }));
    return m;
  };
  const xf = (m, f) => {
    let o = 0;
    for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) if (m >> (u + 3 * v) & 1) { const [a, b] = f(u, v); o |= 1 << (a + 3 * b); }
    return o;
  };
  const same = (u, v) => [u, v], mirror = (u, v) => [2 - u, v];
  const dihedral = [same, mirror, (u, v) => [u, 2 - v], (u, v) => [2 - u, 2 - v],
    (u, v) => [v, u], (u, v) => [2 - v, u], (u, v) => [v, 2 - u], (u, v) => [2 - v, 2 - u]];
  const add = (name, pats, mode) => {
    const fs = mode === 'dihedral' ? dihedral : mode === 'mirror' ? [same, mirror] : [same];
    for (const str of pats) for (const f of fs) { const k = xf(parse(str), f); if (!(k in WALL_EDITS)) WALL_EDITS[k] = name; }
  };
  add('Wall', ['111/111/111']);
  add('Window', ['111/101/111', '111/011/111', '111/110/111']);
  add('Door', ['111/101/101', '111/011/011', '111/110/110']);
  add('Half wall', ['000/111/111']);
  add('Double window', ['111/010/111']);
  add('Half wall door', ['000/110/110', '000/101/101'], 'mirror');
  add('Low wall', ['000/000/111']);
  add('Small low wall', ['000/000/110'], 'dihedral');
  add('Door + window', ['111/010/110'], 'mirror');
  add('Side wall', ['100/100/100'], 'dihedral');
  add('Small side wall', ['000/100/100'], 'dihedral');
  add('Triangle', ['100/110/111'], 'dihedral');
  add('Arch', ['111/101/000']);
  add('Half arch', ['111/100/100'], 'mirror');
})();
const wallFamily = m => WALL_EDITS[m] || null;
const DOOR_EDITS = new Set(['Door', 'Half wall door', 'Door + window']);
// The door sits in the column cut from the ground up two tiles with wall on both sides.
function doorColumn(mask) {
  if (!DOOR_EDITS.has(wallFamily(mask))) return -1;
  const has = i => (mask >> i & 1) === 1;
  for (let u = 0; u < 3; u++) {
    if (has(u) || has(u + 3)) continue;
    let ok = true;
    for (const nu of [u - 1, u + 1]) if (nu >= 0 && nu < 3 && (!has(nu) || !has(nu + 3))) ok = false;
    if (ok) return u;
  }
  return -1;
}
const ARCH_LEG = .32;
function archShape() {
  const sh = new THREE.Shape(), sy = H / 3, rx = T / 2 - ARCH_LEG, ry = H / 3;
  sh.moveTo(0, 0); sh.lineTo(ARCH_LEG, 0); sh.lineTo(ARCH_LEG, sy);
  for (let i = 1; i <= 24; i++) { const a = Math.PI - Math.PI * i / 24; sh.lineTo(T / 2 + rx * Math.cos(a), sy + ry * Math.sin(a)); }
  sh.lineTo(T - ARCH_LEG, 0); sh.lineTo(T, 0); sh.lineTo(T, H); sh.lineTo(0, H); sh.lineTo(0, 0);
  return sh;
}
function triangleShape(mask) {
  const has = (u, v) => (mask >> (u + 3 * v) & 1) === 1;
  const col = [0, 2].find(u => has(u, 0) && has(u, 1) && has(u, 2));
  const row = [0, 2].find(v => has(0, v) && has(1, v) && has(2, v));
  const kx = col === 0 ? 0 : T, ky = row === 0 ? 0 : H;
  return new THREE.Shape([new THREE.Vector2(kx, ky), new THREE.Vector2(T - kx, ky), new THREE.Vector2(kx, H - ky)]);
}
const FLOOR_NAMES = { 4: 'Floor', 3: '3/4 floor', 1: 'Corner' };
function floorName(m) { const n = [0, 1, 2, 3].filter(q => m >> q & 1).length; return n === 2 ? (m === 9 || m === 6 ? 'Bridge' : 'Half floor') : FLOOR_NAMES[n]; }
function coneName(f) { const n = [0, 1, 2, 3].filter(q => f >> q & 1).length; return ['Pyramid', '1/4 pyramid', f === 9 || f === 6 ? 'Half inverted pyramid' : 'Ramp pyramid', '1/4 inverted pyramid', 'Inverted pyramid'][n]; }

// Stairs: a full ramp, or a path of 2-4 tiles (half, L-shaped, U-shaped) climbing along the drag.
const stepDir = (a, b) => { const du = (b & 1) - (a & 1), dv = (b >> 1) - (a >> 1); return du > 0 ? 0 : du < 0 ? 2 : dv > 0 ? 1 : 3; };
function rampTiles(p) {
  const out = [null, null, null, null];
  if (!p.rpath) {
    for (let q = 0; q < 4; q++) { const k = [q & 1, q >> 1, 1 - (q & 1), 1 - (q >> 1)][p.a]; out[q] = { dir: p.a, h0: k * H / 2, h1: (k + 1) * H / 2 }; }
    return out;
  }
  const path = p.rpath, n = path.length;
  for (let i = 0; i < n; i++) {
    const dir = i < n - 1 ? stepDir(path[i], path[i + 1]) : stepDir(path[i - 1], path[i]);
    out[path[i]] = { dir, h0: i * H / n, h1: (i + 1) * H / n };
  }
  return out;
}
function rampHeight(tiles, lu, lv) {
  const qu = lu < .5 ? 0 : 1, qv = lv < .5 ? 0 : 1, tl = tiles[qu + 2 * qv];
  if (!tl) return null;
  const su = Math.min(1, Math.max(0, lu * 2 - qu)), sv = Math.min(1, Math.max(0, lv * 2 - qv));
  return tl.h0 + (tl.h1 - tl.h0) * [su, sv, 1 - su, 1 - sv][tl.dir];
}

function buildMesh(d, mats, lineMat) {
  const g = new THREE.Group(), pivot = new THREE.Group(), content = new THREE.Group();
  g.add(pivot); pivot.add(content); g.userData.pivot = pivot;
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); content.add(m);
    if (lineMat) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), lineMat));
    return m;
  };
  let c;
  if (d.type === 'wall') {
    const fam = wallFamily(d.mask);
    if (fam === 'Arch') add(filletGeo(archShape(), WT, T, H), mats.solid, 0, 0, 0);
    else if (fam === 'Triangle') add(filletGeo(triangleShape(d.mask), WT, T, H), mats.solid, 0, 0, 0);
    else {
      for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) {
        if (!(d.mask >> (u + 3 * v) & 1)) continue;
        const geo = new THREE.BoxGeometry(T / 3, H / 3, WT); tileUV(geo, u / 3, v / 3, 1 / 3, 1 / 3);
        add(geo, mats.solid, u * T / 3 + T / 6, v * H / 3 + H / 6, 0);
      }
      if (fam === 'Half arch') for (const f of fillets(3, 3, d.mask, T / 3, H / 3)) add(filletGeo(filletShape(f.x, f.y, f.ix, f.iy, f.r), WT, T, H), mats.solid, 0, 0, 0);
    }
    const du = doorColumn(d.mask);
    if (du >= 0 && !lineMat) {
      const hinge = new THREE.Group(); hinge.position.set(du * T / 3 + .03, 0, 0);
      const geo = new THREE.BoxGeometry(T / 3 - .06, H * 2 / 3 - .04, .1); tileUV(geo, du / 3, 0, 1 / 3, 2 / 3);
      const panel = new THREE.Mesh(geo, mats.solid); panel.position.set((T / 3 - .06) / 2, H / 3 - .02, 0);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), poleMat); knob.position.set(T / 3 - .3, H / 3 - .1, 0);
      hinge.add(panel, knob); content.add(hinge);
      g.userData.door = { hinge, center: new V3(du * T / 3 + T / 6, H / 3, 0) };
    }
    g.position.set(d.x * T, d.y * H, d.z * T);
    if (d.a === 'z') g.rotation.y = -Math.PI / 2;
    c = [T / 2, H / 2, 0];
  } else if (d.type === 'floor' && [1, 2, 4, 8].includes(d.mask)) {
    // Corner: a quarter circle in the kept tile's corner
    const q = Math.log2(d.mask), cx = (q & 1) * T, cz = (q >> 1) * T, ix = q & 1 ? -1 : 1, iz = q >> 1 ? -1 : 1;
    const pts = [new THREE.Vector2(cx, cz)];
    for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 * i / 16; pts.push(new THREE.Vector2(cx + ix * T / 2 * Math.cos(a), cz + iz * T / 2 * Math.sin(a))); }
    const geo = filletGeo(new THREE.Shape(pts), FT, T, T); geo.rotateX(Math.PI / 2);
    add(geo, mats.solid, 0, 0, 0);
    g.position.set(d.x * T, d.y * H, d.z * T);
    c = [T / 2, 0, T / 2];
  } else if (d.type === 'floor' && (d.mask === 9 || d.mask === 6)) {
    // Bridge: a diagonal plank between the two kept corners
    const m = add(new THREE.BoxGeometry(T * Math.SQRT2 - T * .3, FT, T * .5), mats.solid, T / 2, 0, T / 2);
    m.rotation.y = d.mask === 9 ? -Math.PI / 4 : Math.PI / 4;
    g.position.set(d.x * T, d.y * H, d.z * T);
    c = [T / 2, 0, T / 2];
  } else if (d.type === 'floor') {
    for (let q = 0; q < 4; q++) {
      if (!(d.mask >> q & 1)) continue;
      const qu = q & 1, qv = q >> 1;
      const geo = new THREE.BoxGeometry(T / 2, FT, T / 2); tileUV(geo, qu / 2, qv / 2, .5, .5);
      add(geo, mats.solid, qu * T / 2 + T / 4, 0, qv * T / 2 + T / 4);
    }
    g.position.set(d.x * T, d.y * H, d.z * T);
    c = [T / 2, 0, T / 2];
  } else if (d.type === 'ramp' && d.rpath) {
    const tiles = rampTiles(d);
    for (let q = 0; q < 4; q++) {
      const tl = tiles[q]; if (!tl) continue;
      const sub = new THREE.Group(); sub.position.set((q & 1) * T / 2 - T / 4, 0, (q >> 1) * T / 2 - T / 4); sub.rotation.y = RAMP_ROT[tl.dir]; content.add(sub);
      const run = T / 2, rise = tl.h1 - tl.h0, ang = Math.atan2(rise, run);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(run, rise), RT, T / 2), mats.ramp);
      slab.rotation.z = ang; slab.position.set(Math.sin(ang) * RT / 2, (tl.h0 + tl.h1) / 2 - Math.cos(ang) * RT / 2, 0);
      slab.visible = false; sub.add(slab);
      for (let i = 0; i < 5; i++) {
        const tr = new THREE.Mesh(new THREE.BoxGeometry(run / 5 * .86, .09, T / 2 - .08), mats.solid);
        tr.position.set(-run / 2 + (i + .5) * run / 5, tl.h0 + (i + .5) * rise / 5 - .02, 0); sub.add(tr);
      }
    }
    g.position.set(d.x * T + T / 2, d.y * H, d.z * T + T / 2);
    c = [0, H / 2, 0];
  } else if (d.type === 'ramp') {
    const m = add(new THREE.BoxGeometry(RAMP_LEN, RT, T), mats.ramp, Math.sin(RAMP_ANG) * RT / 2, H / 2 - Math.cos(RAMP_ANG) * RT / 2, 0);
    m.rotation.z = RAMP_ANG;
    if (!lineMat) {
      m.visible = false;   // still blocks shots and camera, like the solid stairs in Fortnite
      const N = 10, run = T / N, rise = H / N;
      for (let i = 0; i < N; i++) {
        const geo = new THREE.BoxGeometry(run * .86, .09, T - .3); tileUV(geo, 0, i / N, 1, 1 / N);
        add(geo, mats.solid, -T / 2 + (i + .5) * run, (i + .5) * rise - .02, 0);
      }
      for (const side of [-1, 1]) {
        const str = add(new THREE.BoxGeometry(RAMP_LEN + .1, .42, .14), mats.ramp, 0, H / 2 - .2, side * (T / 2 - .1));
        str.rotation.z = RAMP_ANG;
      }
    }
    g.position.set(d.x * T + T / 2, d.y * H, d.z * T + T / 2);
    g.rotation.y = RAMP_ROT[d.a];
    c = [0, H / 2, 0];
  } else {
    add(coneGeo(d.flip || 0), mats.double, 0, 0, 0);
    g.position.set(d.x * T, d.y * H, d.z * T);
    c = [T / 2, CH / 2, T / 2];
  }
  pivot.position.set(c[0], c[1], c[2]); content.position.set(-c[0], -c[1], -c[2]);
  return g;
}
const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

function pieceSolids(p) {
  const out = [], y0 = p.y * H, x0 = p.x * T, z0 = p.z * T;
  if (p.type === 'wall') {
    for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) {
      if (!(p.mask >> (u + 3 * v) & 1)) continue;
      const ya = y0 + v * H / 3, yb = ya + H / 3;
      if (p.a === 'x') out.push({ box: true, min: [x0 + u * T / 3, ya, z0 - WT / 2], max: [x0 + (u + 1) * T / 3, yb, z0 + WT / 2], piece: p });
      else out.push({ box: true, min: [x0 - WT / 2, ya, z0 + u * T / 3], max: [x0 + WT / 2, yb, z0 + (u + 1) * T / 3], piece: p });
    }
    if (wallFamily(p.mask) === 'Arch') for (const [a0, a1] of [[0, ARCH_LEG], [T - ARCH_LEG, T]]) {
      if (p.a === 'x') out.push({ box: true, min: [x0 + a0, y0, z0 - WT / 2], max: [x0 + a1, y0 + H / 3, z0 + WT / 2], piece: p });
      else out.push({ box: true, min: [x0 - WT / 2, y0, z0 + a0], max: [x0 + WT / 2, y0 + H / 3, z0 + a1], piece: p });
    }
    const du = doorColumn(p.mask);
    if (du >= 0) {
      const a0 = du * T / 3, a1 = a0 + T / 3, top = y0 + H * 2 / 3;
      if (p.a === 'x') out.push({ box: true, door: true, min: [x0 + a0, y0, z0 - .08], max: [x0 + a1, top, z0 + .08], piece: p });
      else out.push({ box: true, door: true, min: [x0 - .08, y0, z0 + a0], max: [x0 + .08, top, z0 + a1], piece: p });
    }
  } else if (p.type === 'floor') {
    for (let q = 0; q < 4; q++) {
      if (!(p.mask >> q & 1)) continue;
      const qu = q & 1, qv = q >> 1;
      out.push({ box: true, min: [x0 + qu * T / 2, y0 - FT / 2, z0 + qv * T / 2], max: [x0 + (qu + 1) * T / 2, y0 + FT / 2, z0 + (qv + 1) * T / 2], piece: p });
    }
    if (p.mask === 9 || p.mask === 6) out.push({ box: true, min: [x0 + T * .3, y0 - FT / 2, z0 + T * .3], max: [x0 + T * .7, y0 + FT / 2, z0 + T * .7], piece: p });
  } else if (p.type === 'ramp') {
    const tiles = rampTiles(p);
    out.push({ box: false, x0, x1: x0 + T, z0, z1: z0 + T, piece: p, h: (x, z) => {
      const r = rampHeight(tiles, (x - x0) / T, (z - z0) / T);
      return r === null ? null : y0 + r;
    } });
  } else {
    out.push({ box: false, x0, x1: x0 + T, z0, z1: z0 + T, piece: p, h: (x, z) => {
      const u = (x - x0) / T, v = (z - z0) / T;
      return y0 + coneHeightAt(p.flip || 0, u, v);
    } });
  }
  return out;
}

// Structural lattice points (half-cell resolution). Pieces sharing a point are connected.
function piecePoints(d) {
  const pts = [], X = 2 * d.x, Y = 2 * d.y, Z = 2 * d.z;
  const add = (a, b, c) => pts.push(a + ',' + b + ',' + c);
  for (let s = 0; s <= 2; s++) for (let k = 0; k <= 2; k++) {
    if (d.type === 'floor' || d.type === 'cone') add(X + s, Y, Z + k);
    else if (d.type === 'wall') { if (d.a === 'x') add(X + s, Y + k, Z); else add(X, Y + k, Z + s); }
    else {
      const px = d.a === 0 ? X + s : d.a === 2 ? X + 2 - s : X + k;
      const pz = d.a === 1 ? Z + s : d.a === 3 ? Z + 2 - s : Z + k;
      add(px, Y + s, pz);
    }
  }
  return pts;
}
function indexPoints(p, on) {
  for (const pt of p.points) {
    let set = pointIndex.get(pt);
    if (on) { if (!set) pointIndex.set(pt, set = new Set()); set.add(p); }
    else if (set) { set.delete(p); if (!set.size) pointIndex.delete(pt); }
  }
}

function attachPiece(p) {
  p.group = buildMesh(p, PMAT[p.mat]);
  p.group.userData.owner = p; shade(p.group); scene.add(p.group);
  if (p.popT < 1) p.group.userData.pivot.scale.setScalar(Math.max(.01, easeOutBack(p.popT)));
  p.group.updateMatrixWorld(true);
  p.solids = pieceSolids(p);
  p.points = piecePoints(p); indexPoints(p, true);
  pieces.set(p.key, p); solidsDirty = true;
}
function disposeGroup(g) { g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
function detachPiece(p) {
  scene.remove(p.group); disposeGroup(p.group);
  indexPoints(p, false); pieces.delete(p.key); solidsDirty = true;
}
function rebuildPiece(p) {
  scene.remove(p.group); disposeGroup(p.group); indexPoints(p, false);
  attachPiece(p);
}
function makePiece(d, mat, extra) {
  const p = Object.assign({ kind: 'piece', type: d.type, x: d.x, y: d.y, z: d.z, a: d.a, mask: fullMask(d.type), mat,
    maxHp: MATS[mat].hp, hp: MATS[mat].hp * 0.1, building: true, popT: 1 }, extra || {});
  p.key = keyOf(p);
  Object.defineProperty(p, 'label', { get() { return MATS[this.mat].name + ' ' + TYPE_NAME[this.type]; } });
  return p;
}
function supported(d, pts) {
  if (d.y === 0) return true;
  return pts.some(pt => pointIndex.has(pt));
}
function checkSupport() {
  const seen = new Set(), q = [];
  for (const p of pieces.values()) if (p.y === 0) { seen.add(p); q.push(p); }
  while (q.length) {
    const p = q.pop();
    for (const pt of p.points) {
      const set = pointIndex.get(pt); if (!set) continue;
      for (const o of set) if (!seen.has(o)) { seen.add(o); q.push(o); }
    }
  }
  const fall = [];
  for (const p of pieces.values()) if (!seen.has(p)) fall.push(p);
  for (const p of fall) destroyPiece(p, false);
}
function destroyPiece(p, cascade = true) {
  if (!pieces.has(p.key)) return;
  debris(p); detachPiece(p);
  if (edit && edit.piece === p) exitEdit();
  sfx('break');
  if (cascade) checkSupport();
}
function damagePiece(p, dmg) {
  p.hp -= dmg;
  if (p.hp <= 0) destroyPiece(p);
}

function rebuildSolids() {
  solids = [];
  for (const s of worldSolids) if (!s.owner || s.owner.alive) solids.push(s);
  for (const p of pieces.values()) for (const s of p.solids) solids.push(s);
  solidsDirty = false;
}

/* ---------- physics ---------- */
const P = { x: SPAWN[0], y: 0, z: SPAWN[2], vy: 0, vx: 0, vz: 0, grounded: true, groundPiece: null, hp: 100, shield: 100, lastHit: -99, phase: 0, moving: false };
const SAMPLES = [[0, 0], [PR * .9, 0], [-PR * .9, 0], [0, PR * .9], [0, -PR * .9]];
function slopeH(s, x, z) { if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) return null; return s.h(x, z); }
function blockers(x, y, z, out) {
  out.length = 0;
  for (const s of solids) {
    if (s.box) {
      const m = s.min, M = s.max;
      if (s.door && s.piece.doorOpen > .3) continue;
      if (M[1] <= y + STEP || m[1] >= y + PH) continue;
      if (x + PR <= m[0] || x - PR >= M[0] || z + PR <= m[2] || z - PR >= M[2]) continue;
      out.push(s);
    } else {
      for (const [ox, oz] of SAMPLES) {
        const h = slopeH(s, x + ox, z + oz);
        if (h !== null && h > y + STEP && h - RT < y + PH) { out.push(s); break; }
      }
    }
  }
  return out;
}
const bufA = [], bufB = [];
function tryMove(dx, dz) {
  const before = blockers(P.x, P.y, P.z, bufA);
  const after = blockers(P.x + dx, P.y, P.z + dz, bufB);
  for (const s of after) if (!before.includes(s)) return false;
  P.x += dx; P.z += dz; return true;
}
function groundAt(x, y, z) {
  let g = 0, gp = null; const r = PR * .8;
  for (const s of solids) {
    if (s.box) {
      const m = s.min, M = s.max;
      if (s.door && s.piece.doorOpen > .3) continue;
      if (M[1] > y + STEP || M[1] <= g) continue;
      if (x + r <= m[0] || x - r >= M[0] || z + r <= m[2] || z - r >= M[2]) continue;
      g = M[1]; gp = s.piece;
    } else {
      const h = slopeH(s, x, z);
      if (h !== null && h <= y + STEP && h > g) { g = h; gp = s.piece; }
    }
  }
  return [g, gp];
}
function ceilingAt(x, y, z, ny) {
  let c = null; const top = y + PH, ntop = ny + PH;
  for (const s of solids) {
    let b = null;
    if (s.box) {
      if (s.door && s.piece.doorOpen > .3) continue;
      if (x + PR <= s.min[0] || x - PR >= s.max[0] || z + PR <= s.min[2] || z - PR >= s.max[2]) continue;
      b = s.min[1];
    } else { const h = slopeH(s, x, z); if (h !== null) b = h - RT; }
    if (b !== null && b >= top - 0.02 && b < ntop && (c === null || b < c)) c = b;
  }
  return c;
}

function movePlayer(dt) {
  let ix = 0, iz = 0;
  if (held('forward')) iz += 1; if (held('back')) iz -= 1; if (held('right')) ix += 1; if (held('left')) ix -= 1;
  ix += pad.lx; iz -= pad.ly;
  const len = Math.hypot(ix, iz), sy = Math.sin(yaw), cy = Math.cos(yaw);
  if (len > 1) { ix /= len; iz /= len; }
  const sp = SPEED * (1 - .45 * adsT) * dt;
  const mx = (-sy * iz + cy * ix) * sp, mz = (-cy * iz - sy * ix) * sp;
  P.moving = len > .1;
  const x0 = P.x, z0 = P.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.2));
  for (let i = 0; i < steps; i++) { tryMove(mx / steps, 0); tryMove(0, mz / steps); }
  P.x = Math.max(-WORLD, Math.min(WORLD, P.x)); P.z = Math.max(-WORLD, Math.min(WORLD, P.z));
  P.vx = (P.x - x0) / dt; P.vz = (P.z - z0) / dt;

  if ((held('jump') || pad.jump) && P.grounded) { P.vy = JUMP; P.grounded = false; }
  const [g, gp] = groundAt(P.x, P.y, P.z);
  P.vy = Math.max(-45, P.vy - GRAV * dt);
  let ny = P.y + P.vy * dt;
  if (P.vy > 0) { const c = ceilingAt(P.x, P.y, P.z, ny); if (c !== null) { ny = c - PH; P.vy = 0; } }
  if (ny <= g || (P.grounded && P.vy <= 0 && P.y - g < 0.75)) { if (!P.grounded && P.vy < -7) P.landT = .22; ny = g; P.vy = 0; P.grounded = true; P.groundPiece = gp; }
  else { P.grounded = false; P.groundPiece = null; }
  P.y = ny;
}

/* ---------- input & state ---------- */
const keys = {};
let yaw = 0, pitch = -0.05;
let mode = 'pickaxe', buildType = 'wall', matIdx = 0;
const mats = { wood: 300, brick: 200, metal: 100 };
const stats = { elims: 0, builds: 0 };
let mouseL = false, mouseR = false, playing = false, paused = true, locked = false, fallbackLook = false;
let buildRot = 0, adsT = 0, lastWeapon = 'pickaxe', lastBuild = 'wall', rebinding = null;
const pad = { lx: 0, ly: 0, rx: 0, ry: 0, jump: false, primary: false, ads: false, prev: [] };
const held = a => !!keys[binds[a]];
const primaryHeld = () => mouseL || pad.primary;
let now = 0, lastShot = -1, lastSwing = -1, lastPlace = -1, swingT = 0, lastDeny = -1;
let edit = null, aimHit = null;

/* ---------- camera ---------- */
const fwd = new V3(), right = new V3(), head = new V3(), camTmp = new V3();
const raycaster = new THREE.Raycaster();
function cast(origin, dir, targets, far, near = 0) {
  raycaster.set(origin, dir); raycaster.near = near; raycaster.far = far;
  const hits = raycaster.intersectObjects(targets, true);
  return hits.length ? hits[0] : null;
}
function ownerOf(o) { while (o) { if (o.userData.owner) return o.userData.owner; o = o.parent; } return null; }
function pieceGroups() { const a = []; for (const p of pieces.values()) if (p.group.visible) a.push(p.group); return a; }
function worldGroups() {
  const a = [];
  for (const r of resources) if (r.alive) a.push(r.group);
  for (const d of dummies) a.push(d.group);
  if (settings.turrets) for (const t of turrets) a.push(t.group);
  return a;
}
let aimNear = 0;
function updateCamera() {
  fwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  head.set(P.x, P.y + EYE, P.z);
  const want = camTmp.copy(head).addScaledVector(right, .8 - .1 * adsT).add(new V3(0, .3 - .05 * adsT, 0)).addScaledVector(fwd, -(3.8 - 2.1 * adsT));
  const dir = want.clone().sub(head); const len = dir.length(); dir.divideScalar(len);
  const hit = cast(head, dir, pieceGroups().concat(resources.filter(r => r.alive).map(r => r.group)), len);
  const dist = hit ? Math.max(.25, hit.distance - .25) : len;
  camera.position.copy(head).addScaledVector(dir, dist);
  if (camera.position.y < .25) camera.position.y = .25;
  camera.lookAt(camTmp.copy(camera.position).add(fwd));
  aimNear = Math.max(0, head.clone().sub(camera.position).dot(fwd));
  const close = dist < 1;
  player.parts.forEach(m => m.visible = !close);
  player.g.visible = !close;
}

/* ---------- build targeting ---------- */
function quantDir() {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 2) : (fz > 0 ? 1 : 3);
}
const DIRV = [[1, 0], [0, 1], [-1, 0], [0, -1]];
// Fortnite-style targeting: follow the crosshair ray out to build reach, then snap to the grid.
// Builds land in your own cell or one of the 8 around it; the level comes from where you look.
const BUILD_REACH = T * 1.5;
function aimPoint() {
  const far = aimNear + BUILD_REACH;
  const hit = cast(camera.position, fwd, pieceGroups().concat([ground]), far, aimNear);
  const t = hit ? Math.max(aimNear, hit.distance - .05) : far;
  return camera.position.clone().addScaledVector(fwd, t);
}
function computeTarget(type) {
  const bl = Math.max(0, Math.floor((P.y + 0.3) / H));
  const cx = Math.floor(P.x / T), cz = Math.floor(P.z / T);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const pt = aimPoint();
  let dx = clamp(Math.floor(pt.x / T) - cx, -1, 1), dz = clamp(Math.floor(pt.z / T) - cz, -1, 1);
  const lvlAt = y => Math.floor((y + H * .25) / H);
  const yd = quantDir();
  let d;
  if (type === 'wall') {
    if (dx && dz) { if (yd === 0 || yd === 2) dz = 0; else dx = 0; }   // diagonal: keep the axis you face
    if (!dx && !dz) { dx = DIRV[yd][0]; dz = DIRV[yd][1]; }           // aiming into your own cell: wall in front
    let a, x = cx, z = cz, t;
    if (dx) { a = 'z'; x = cx + (dx > 0 ? 1 : 0); t = (x * T - camera.position.x) / fwd.x; }
    else { a = 'x'; z = cz + (dz > 0 ? 1 : 0); t = (z * T - camera.position.z) / fwd.z; }
    let lvl = bl;
    if (isFinite(t) && t > 0 && t < 40) lvl = clamp(Math.floor((camera.position.y + fwd.y * t) / H), bl - 1, bl + 1);
    d = { type, a, x, y: Math.max(0, lvl), z };
  } else if (type === 'floor') {
    d = { type, x: cx + dx, z: cz + dz, y: Math.max(0, clamp(lvlAt(pt.y), bl, bl + 2)) };
  } else if (type === 'ramp') {
    const dir = (yd + buildRot) % 4;
    let lvl = clamp(lvlAt(pt.y), bl, bl + 1);
    const gp = P.groundPiece;
    if (gp && gp.type === 'ramp' && (dx || dz) && pitch < .6)
      lvl = gp.a === dir ? gp.y + 1 : gp.a === (dir + 2) % 4 ? gp.y - 1 : gp.y;
    d = { type, a: dir, x: cx + dx, y: Math.max(0, lvl), z: cz + dz };
  } else {
    if (pitch > .25) d = { type, x: cx, z: cz, y: bl + 1 };
    else d = { type, x: cx + dx, z: cz + dz, y: Math.max(0, clamp(lvlAt(pt.y), bl, bl + 1)) };
  }
  d.mask = fullMask(type);
  return d;
}
function canPlace(d) {
  const key = keyOf(d);
  if (pieces.has(key)) return { ok: false, exists: true };
  if (Math.abs(d.x * T) > WORLD || Math.abs(d.z * T) > WORLD || d.y > 40) return { ok: false, reason: 'Edge of the map' };
  const m = MAT_ORDER[matIdx];
  if (mats[m] < COST) return { ok: false, reason: 'Not enough ' + MATS[m].name.toLowerCase() };
  if (!supported(d, piecePoints(d))) return { ok: false, reason: 'Needs support' };
  return { ok: true };
}
let ghost = null, ghostKey = '';
function showGhost(d, res) {
  const k = res.exists ? '' : keyOf(d) + '|' + res.ok;
  if (k === ghostKey) return;
  hideGhost(); ghostKey = k;
  if (res.exists) return;
  const gm = res.ok ? ghostMats.ok : ghostMats.bad;
  ghost = buildMesh(d, { solid: gm, double: gm, ramp: gm }, res.ok ? ghostMats.okLine : ghostMats.badLine);
  ghost.renderOrder = 5; scene.add(ghost);
}
function hideGhost() { if (ghost) { scene.remove(ghost); disposeGroup(ghost); ghost = null; } ghostKey = ''; }

function tryBuild() {
  const d = computeTarget(buildType), res = canPlace(d);
  showGhost(d, res);
  if (!primaryHeld()) return;
  if (res.ok && now - lastPlace > 0.04) {
    const m = MAT_ORDER[matIdx];
    attachPiece(makePiece(d, m, { popT: 0 }));
    mats[m] -= COST; stats.builds++; lastPlace = now; P.buildT = .18; sfx('build');
  } else if (!res.ok && !res.exists && res.reason && now - lastDeny > 0.8) {
    toast(res.reason); sfx('deny'); lastDeny = now;
  }
}

/* ---------- editing ---------- */
function startEdit() {
  const hit = aimHit;
  const o = hit && ownerOf(hit.object);
  if (!o || o.kind !== 'piece' || hit.point.distanceTo(head) > 7) { toast('Aim at a build to edit it'); return; }
  hideGhost();
  const p = o;
  edit = { piece: p, sel: new Set(), path: [], drag: false, add: true, hover: -1, prevMode: mode === 'edit' ? 'pickaxe' : mode };
  selFromPiece(p, edit.sel);
  edit.overlay = makeOverlay(p);
  p.group.visible = false;
  mode = 'edit'; mouseL = false; sfx('edit'); refreshHud(true);
}
function makeOverlay(p) {
  const g = new THREE.Group(); g.position.copy(p.group.position); g.rotation.copy(p.group.rotation);
  const tiles = [];
  const tile = (parent, w, h, d, x, y, z, idx) => {
    const geo = new THREE.BoxGeometry(w, h, d), m = new THREE.Mesh(geo, tileMats.base);
    m.position.set(x, y, z); m.userData.idx = idx; m.renderOrder = 6;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), tileMats.line); edges.raycast = () => {};
    m.add(edges);
    parent.add(m); tiles.push(m); return m;
  };
  if (p.type === 'wall') {
    for (let v = 0; v < 3; v++) for (let u = 0; u < 3; u++) tile(g, T / 3 * .92, H / 3 * .92, WT + .12, u * T / 3 + T / 6, v * H / 3 + H / 6, 0, u + 3 * v);
  } else if (p.type === 'floor' || p.type === 'cone') {
    const th = p.type === 'cone' ? .08 : FT + .12;
    for (let q = 0; q < 4; q++) {
      const u = (q & 1) * .5 + .25, v = (q >> 1) * .5 + .25;
      const y = p.type === 'cone' ? coneHeightAt(p.flip || 0, u, v) + .05 : 0;
      tile(g, T / 2 * .92, th, T / 2 * .92, u * T, y, v * T, q);
    }
  } else {
    g.position.set(p.x * T, p.y * H, p.z * T); g.rotation.set(0, 0, 0);
    const rt = rampTiles(p);
    for (let q = 0; q < 4; q++) {
      const u = (q & 1) * .5 + .25, v = (q >> 1) * .5 + .25, h = rampHeight(rt, u, v);
      tile(g, T / 2 * .92, .08, T / 2 * .92, u * T, h === null ? .1 : h + .15, v * T, q);
    }
  }
  g.userData.tiles = tiles; scene.add(g); return g;
}
function paintTiles() {
  for (const t of edit.overlay.userData.tiles) {
    const i = t.userData.idx;
    if (edit.piece.type === 'ramp') t.material = edit.path.includes(i) ? tileMats.path : i === edit.hover ? tileMats.hover : tileMats.base;
    else if (edit.piece.type === 'cone') t.material = edit.sel.has(i) || i === edit.hover ? tileMats.hover : tileMats.base;
    else t.material = edit.sel.has(i) ? (i === edit.hover ? tileMats.hover : tileMats.sel) : i === edit.hover ? tileMats.hover : tileMats.base;
    if (edit.flash > 0) t.material = tileMats.bad;
    t.userData.pop = Math.max(0, (t.userData.pop || 0) - .12);
    t.scale.setScalar(1 + .14 * t.userData.pop);
  }
  edit.flash = Math.max(0, (edit.flash || 0) - .03);
}
function updateEdit() {
  const p = edit.piece;
  if (!pieces.has(p.key) || head.distanceTo(edit.overlay.position) > 14) { exitEdit(); return; }
  const hit = cast(camera.position, fwd, edit.overlay.userData.tiles, 30, 0);
  const idx = hit ? hit.object.userData.idx : -1;
  if (idx !== edit.hover) { edit.hover = idx; if (idx >= 0) sfx('tick'); }
  if (edit.drag && idx >= 0) {
    if (p.type === 'ramp') { if (!edit.path.includes(idx)) { edit.path.push(idx); popTile(idx); sfx('edit'); } }
    else if (edit.add ? !edit.sel.has(idx) : edit.sel.has(idx)) { if (edit.add) edit.sel.add(idx); else edit.sel.delete(idx); popTile(idx); sfx('edit'); }
  }
  paintTiles();
}
function editPress() {
  if (edit.hover < 0) return;
  edit.drag = true;
  if (edit.piece.type === 'ramp') edit.path = [edit.hover];
  else { edit.add = !edit.sel.has(edit.hover); if (edit.add) edit.sel.add(edit.hover); else edit.sel.delete(edit.hover); }
  popTile(edit.hover); sfx('edit');
}
function popTile(idx) { for (const t of edit.overlay.userData.tiles) if (t.userData.idx === idx) t.userData.pop = 1; }
function selFromMask() {
  edit.sel.clear(); selFromPiece(edit.piece, edit.sel);
}
function selFromPiece(p, sel) {
  if (p.type === 'cone') { for (let i = 0; i < 4; i++) if ((p.flip || 0) >> i & 1) sel.add(i); return; }
  if (p.type === 'ramp') return;
  const n = p.type === 'wall' ? 9 : 4;
  for (let i = 0; i < n; i++) if (!(p.mask >> i & 1)) sel.add(i);
}
function editRelease() {
  if (!edit || !edit.drag) return;
  edit.drag = false;
  if (settings.editRelease) confirmEdit();
}
function confirmEdit() {
  const p = edit.piece;
  if (p.type === 'ramp') {
    const path = edit.path, n = path.length;
    if (!n) { exitEdit(); return; }
    const adj = (a, b) => Math.abs((b & 1) - (a & 1)) + Math.abs((b >> 1) - (a >> 1)) === 1;
    let chain = true;
    for (let i = 0; i < n - 1; i++) if (!adj(path[i], path[i + 1])) chain = false;
    if (n === 4 && !chain) {
      // Full ramp: cut through all four tiles with a diagonal; it climbs away from where the drag started.
      const a = path[0], b = path[n - 1], yd = quantDir();
      let dir;
      if ((path[0] >> 1) === (path[1] >> 1)) { const dv = (b >> 1) - (a >> 1); dir = dv > 0 ? 1 : dv < 0 ? 3 : (yd % 2 ? yd : 1); }
      else { const du = (b & 1) - (a & 1); dir = du > 0 ? 0 : du < 0 ? 2 : (yd % 2 ? 0 : yd); }
      if (p.rpath || dir !== p.a) { p.rpath = null; p.a = dir; rebuildPiece(p); checkSupport(); }
      toast('Ramp');
    } else if (n >= 2 && chain) {
      p.rpath = path.slice(); p.a = stepDir(path[0], path[1]); rebuildPiece(p); checkSupport();
      toast(n === 2 ? 'Half ramp' : n === 3 ? 'L-shaped ramp' : 'U-shaped ramp');
    } else {
      toast("Can't make that edit"); sfx('deny'); edit.flash = 1; edit.path = []; return;
    }
    sfx('confirm');
  } else if (p.type === 'cone') {
    let flip = 0;
    for (const i of edit.sel) flip |= 1 << i;
    if (flip !== (p.flip || 0)) { p.flip = flip; rebuildPiece(p); sfx('confirm'); toast(coneName(flip)); }
  } else {
    const n = p.type === 'wall' ? 9 : 4; let mask = (1 << n) - 1;
    for (const i of edit.sel) mask &= ~(1 << i);
    // Walls only accept the edits on Fortnite's chart; floors need at least one tile.
    if (!mask || (p.type === 'wall' && !wallFamily(mask))) {
      toast(mask ? "Can't make that edit" : 'Keep at least one tile'); sfx('deny');
      selFromMask(); edit.flash = 1; edit.path = []; return;
    }
    if (mask !== p.mask) { p.mask = mask; p.doorOpen = 0; rebuildPiece(p); sfx('confirm'); toast(p.type === 'wall' ? wallFamily(mask) : floorName(mask)); }
  }
  exitEdit();
}
function resetEdit() {
  const p = edit.piece;
  if (p.type === 'cone' && p.flip) { p.flip = 0; rebuildPiece(p); }
  else if (p.type === 'ramp' && p.rpath) { p.rpath = null; rebuildPiece(p); checkSupport(); }
  else if (p.type !== 'ramp' && p.type !== 'cone' && p.mask !== fullMask(p.type)) { p.mask = fullMask(p.type); p.doorOpen = 0; rebuildPiece(p); }
  sfx('confirm'); exitEdit();
}
function exitEdit() {
  if (!edit) return;
  scene.remove(edit.overlay); disposeGroup(edit.overlay);
  if (pieces.has(edit.piece.key)) edit.piece.group.visible = true;
  mode = edit.prevMode; edit = null; refreshHud(true);
}

/* ---------- combat ---------- */
const fxList = [], projectiles = [];
const chunkGeo = new THREE.BoxGeometry(.35, .35, .35), sparkGeo = new THREE.BoxGeometry(.09, .09, .09);
function burst(pos, mat, geo, n, speed, life, box) {
  for (let i = 0; i < n; i++) {
    if (fxList.length > 260) break;
    const m = new THREE.Mesh(geo, mat);
    if (box) m.position.set(rnd(box.min.x, box.max.x), rnd(box.min.y, box.max.y), rnd(box.min.z, box.max.z));
    else m.position.copy(pos);
    m.rotation.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
    scene.add(m);
    fxList.push({ obj: m, vel: new V3(rnd(-1, 1) * speed, rnd(.3, 1.2) * speed, rnd(-1, 1) * speed), life, max: life, spin: rnd(-8, 8) });
  }
}
const sparkMats = {};
function sparkMat(c) { return sparkMats[c] || (sparkMats[c] = new THREE.MeshBasicMaterial({ color: c })); }
function debris(p) {
  const box = new THREE.Box3().setFromObject(p.group);
  burst(null, PMAT[p.mat].solid, chunkGeo, p.type === 'wall' ? 10 : 7, 4, 1.1, box);
}
function tracer(a, b) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mat = new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: .9 });
  const line = new THREE.Line(geo, mat); scene.add(line);
  fxList.push({ obj: line, life: .06, max: .06, fade: mat });
}
function updateFx(dt) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i]; f.life -= dt;
    if (f.vel) {
      f.vel.y -= 18 * dt; f.obj.position.addScaledVector(f.vel, dt);
      if (f.obj.position.y < .1) { f.obj.position.y = .1; f.vel.multiplyScalar(.5); f.vel.y = Math.abs(f.vel.y) * .3; }
      f.obj.rotation.x += f.spin * dt; f.obj.scale.setScalar(Math.max(.01, f.life / f.max));
    }
    if (f.fade) f.fade.opacity = Math.max(0, f.life / f.max);
    if (f.life <= 0) {
      scene.remove(f.obj);
      if (f.fade) { f.obj.geometry.dispose(); f.fade.dispose(); }
      fxList.splice(i, 1);
    }
  }
}

// floating numbers
const nums = [];
function popNumber(pos, text, cls) {
  const el = document.createElement('div'); el.className = 'dmg ' + (cls || ''); el.textContent = text;
  $('fx').appendChild(el);
  nums.push({ el, pos: pos.clone().add(new V3(rnd(-.3, .3), .3, rnd(-.3, .3))), t: 0 });
}
function updateNumbers(dt) {
  const w = window.innerWidth, h = window.innerHeight, v = new V3();
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i]; n.t += dt; n.pos.y += dt * 1.2;
    v.copy(n.pos).project(camera);
    if (n.t > .9) { n.el.remove(); nums.splice(i, 1); continue; }
    n.el.style.display = v.z > 1 ? 'none' : '';
    n.el.style.left = ((v.x * .5 + .5) * w) + 'px';
    n.el.style.top = ((-v.y * .5 + .5) * h) + 'px';
    n.el.style.opacity = String(Math.min(1, (0.9 - n.t) * 4));
  }
}

let hitTimer = null;
function hitmark() {
  const c = $('crosshair'); c.classList.add('hit'); sfx('hit');
  clearTimeout(hitTimer); hitTimer = setTimeout(() => c.classList.remove('hit'), 110);
}
function applyHit(hit, weapon) {
  const o = ownerOf(hit.object);
  if (!o || o.kind === 'ground') { burst(hit.point, sparkMat(0xd8d2b0), sparkGeo, 4, 2, .3); return; }
  if (o.kind === 'piece') {
    damagePiece(o, weapon === 'rifle' ? 30 : 50);
    burst(hit.point, PMAT[o.mat].solid, sparkGeo, 5, 3, .35);
  } else if (o.kind === 'res') {
    if (weapon !== 'pick') { burst(hit.point, sparkMat(0xd8d2b0), sparkGeo, 4, 2, .3); return; }
    o.hp -= 25; o.wobble = .12;
    mats[o.type] = Math.min(999, mats[o.type] + o.gain); bumpMat(o.type);
    popNumber(hit.point, '+' + o.gain, 'gain');
    burst(hit.point, o.type === 'wood' ? PMAT.wood.solid : o.type === 'brick' ? rockMat : crateMat, sparkGeo, 6, 3, .4);
    if (o.hp <= 0) { o.alive = false; o.group.visible = false; o.respawnAt = now + 40; solidsDirty = true; sfx('break'); }
  } else if (o.kind === 'dummy' || o.kind === 'turret') {
    if (!o.alive) return;
    const isHead = hit.object.userData.part === 'head';
    const dmg = weapon === 'rifle' ? (isHead ? 45 : 30) : 20;
    o.hp -= dmg; popNumber(hit.point, String(dmg), isHead ? 'crit' : ''); hitmark();
    burst(hit.point, sparkMat(o.kind === 'turret' ? 0xff3b5c : 0xf07a2b), sparkGeo, 5, 3, .35);
    if (o.hp <= 0) {
      o.alive = false; stats.elims++;
      if (o.kind === 'dummy') o.respawnAt = now + 3;
      else { o.respawnAt = now + 25; o.head.visible = false; burst(o.head.getWorldPosition(new V3()), turretShell, chunkGeo, 10, 5, 1.2); toast('Sentry destroyed'); }
      sfx('break');
    }
  }
}
function allTargets() { return pieceGroups().concat(worldGroups(), [ground]); }
function fireRifle() {
  const first = now - lastShot > .35;
  const spread = (P.grounded ? (P.moving ? .02 : .008) : .04) * (first ? .15 : 1) * (1 - .8 * adsT);
  const dir = fwd.clone().add(new V3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(spread)).normalize();
  const hit = cast(camera.position, dir, allTargets(), 250, aimNear);
  const from = player.muzzle.getWorldPosition(new V3());
  tracer(from, hit ? hit.point : camera.position.clone().addScaledVector(dir, 250));
  if (hit) applyHit(hit, 'rifle');
  pitch = Math.min(1.45, pitch + .004 * (1 - .5 * adsT)); P.recoil = 1;
  sfx('shoot');
}
function swingPick() {
  swingT = .3; sfx('swing');
  const hit = cast(camera.position, fwd, allTargets(), 60, aimNear);
  if (hit && hit.point.distanceTo(head) < 3.4) { applyHit(hit, 'pick'); sfx('pick'); }
}

/* turrets */
const projGeo = new THREE.SphereGeometry(.22, 10, 8);
const projMat = new THREE.MeshBasicMaterial({ color: 0xff3b6b });
function updateTurrets(dt) {
  const chest = new V3(P.x, P.y + 1.2, P.z), hp = new V3();
  for (const t of turrets) {
    t.group.visible = settings.turrets;
    if (!settings.turrets) continue;
    if (!t.alive) { if (now >= t.respawnAt) { t.alive = true; t.hp = t.maxHp; t.head.visible = true; } continue; }
    t.head.getWorldPosition(hp);
    const dist = hp.distanceTo(chest);
    if (dist > 80) continue;
    t.head.lookAt(chest);
    t.cd -= dt;
    if (t.cd > 0) continue;
    const dir = chest.clone().sub(hp).normalize();
    const block = cast(hp, dir, pieceGroups().concat(resources.filter(r => r.alive).map(r => r.group)), dist);
    if (block && block.distance < dist - .6) { t.cd = .5; continue; }
    t.cd = 1.5 + Math.random() * .8;
    const lead = chest.clone().add(new V3(P.vx, 0, P.vz).multiplyScalar(dist / 30 * .6));
    const m = new THREE.Mesh(projGeo, projMat); m.position.copy(hp).addScaledVector(dir, 1.1); scene.add(m);
    projectiles.push({ mesh: m, dir: lead.sub(m.position).normalize(), speed: 30, life: 4 });
    sfx('turret', Math.max(.15, 1 - dist / 80));
  }
}
function updateProjectiles(dt) {
  const targets = pieceGroups().concat(resources.filter(r => r.alive).map(r => r.group));
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i], step = pr.speed * dt, pos = pr.mesh.position;
    pr.life -= dt;
    const hit = cast(pos, pr.dir, targets, step);
    let gone = false;
    if (hit) {
      const o = ownerOf(hit.object);
      if (o && o.kind === 'piece') damagePiece(o, 40);
      burst(hit.point, sparkMat(0xff6b8b), sparkGeo, 7, 3, .35); gone = true;
    } else {
      pos.addScaledVector(pr.dir, step);
      const cy = Math.max(P.y + .3, Math.min(P.y + 1.6, pos.y));
      if (Math.hypot(pos.x - P.x, pos.y - cy, pos.z - P.z) < .65) { hurtPlayer(14); gone = true; }
      else if (pos.y < 0 || pr.life <= 0) { burst(pos, sparkMat(0xff6b8b), sparkGeo, 4, 2, .3); gone = true; }
    }
    if (gone) { scene.remove(pr.mesh); projectiles.splice(i, 1); }
  }
}
function clearProjectiles() { for (const pr of projectiles) scene.remove(pr.mesh); projectiles.length = 0; }
let vigTimer = null;
function hurtPlayer(d) {
  P.lastHit = now; let r = d;
  if (P.shield > 0) { const s = Math.min(P.shield, r); P.shield -= s; r -= s; }
  P.hp -= r; sfx('hurt');
  const v = $('vignette'); v.style.opacity = '.6'; clearTimeout(vigTimer); vigTimer = setTimeout(() => v.style.opacity = '0', 180);
  if (P.hp <= 0) {
    toast('Eliminated. Back to spawn.');
    Object.assign(P, { x: SPAWN[0], y: 0, z: SPAWN[2], vy: 0, hp: 100, shield: 100 });
    clearProjectiles(); if (edit) exitEdit();
  }
}

function updateWorld(dt) {
  for (const r of resources) {
    if (!r.alive && now >= r.respawnAt) { r.alive = true; r.hp = r.maxHp; r.group.visible = true; solidsDirty = true; }
    if (r.wobble > .001) { r.group.rotation.z = Math.sin(now * 45) * r.wobble; r.wobble *= Math.pow(.02, dt); }
    else r.group.rotation.z = 0;
  }
  for (const d of dummies) {
    if (!d.alive && now >= d.respawnAt) { d.alive = true; d.hp = d.maxHp; }
    const target = d.alive ? 0 : -Math.PI / 2 + .1;
    d.pivot.rotation.x += (target - d.pivot.rotation.x) * Math.min(1, dt * 10);
  }
  for (const p of pieces.values()) {
    if (p.popT < 1) { p.popT = Math.min(1, p.popT + dt / .22); p.group.userData.pivot.scale.setScalar(Math.max(.01, easeOutBack(p.popT))); }
    const door = p.group.userData.door;
    if (door) {
      const local = p.group.worldToLocal(new V3(P.x, P.y + 1, P.z));
      const dist = Math.hypot(local.x - door.center.x, local.z);
      const near = dist < 2.6 && Math.abs(local.y - door.center.y) < 2.5;
      p.doorOpen = p.doorOpen || 0;
      if (near && p.doorOpen < .05) door.side = local.z > 0 ? 1 : -1;
      const was = p.doorOpen;
      p.doorOpen = Math.max(0, Math.min(1, p.doorOpen + (near ? 1 : -1) * dt * 4));
      if ((was === 0 && p.doorOpen > 0) || (was > .95 && p.doorOpen <= .95 && !near)) sfx('door');
      door.hinge.rotation.y = (door.side || 1) * p.doorOpen * 1.75;
    }
    if (!p.building) continue;
    p.hp += p.maxHp * .9 / MATS[p.mat].time * dt;
    if (p.hp >= p.maxHp) { p.hp = p.maxHp; p.building = false; }
  }
  if (now - P.lastHit > 5) {
    if (P.hp < 100) P.hp = Math.min(100, P.hp + 12 * dt);
    else if (P.shield < 100) P.shield = Math.min(100, P.shield + 12 * dt);
  }
}

function animatePlayer(dt) {
  const g = player.g, [ll, rl] = player.legs, [la, ra] = player.arms;
  P.run = (P.run || 0) + ((P.moving && P.grounded ? 1 : 0) - (P.run || 0)) * Math.min(1, dt * 10);
  P.phase += dt * 11 * P.run;
  P.landT = Math.max(0, (P.landT || 0) - dt);
  P.buildT = Math.max(0, (P.buildT || 0) - dt);
  P.recoil = Math.max(0, (P.recoil || 0) - dt * 12);
  swingT = Math.max(0, swingT - dt);
  const run = P.run, sw = Math.sin(P.phase) * .75 * run;
  const bob = Math.abs(Math.sin(P.phase)) * .07 * run;
  const land = P.landT > 0 ? Math.sin(P.landT / .22 * Math.PI) * .1 : 0;
  g.position.set(P.x, P.y + bob - land, P.z);
  g.rotation.set(run * .12 + land, yaw, 0);
  player.torso.scale.y = 1 + Math.sin(now * 2.2) * .015 * (1 - run);
  // positive x rotation swings a limb forward
  if (!P.grounded) { const tuck = P.vy > 0 ? .8 : .4; ll.rotation.x = tuck; rl.rotation.x = -tuck * .5; }
  else { ll.rotation.x = sw; rl.rotation.x = -sw; }
  const aim = pitch * .8;
  if (mode === 'rifle') {
    const k = P.recoil * .18;
    ra.rotation.set(1.45 + aim - k, 0, -.05);
    la.rotation.set(1.3 + aim - k, 0, .55);
  } else if (mode === 'pickaxe') {
    la.rotation.set(-sw * .8 + .1, 0, .08);
    let a = .35 - sw * .5;
    if (swingT > 0) { const t = 1 - swingT / .3; a = t < .4 ? .35 + t / .4 * 2.4 : 2.75 - (t - .4) / .6 * 2.6; }
    ra.rotation.set(a, 0, -.08);
  } else if (mode === 'edit') {
    ra.rotation.set(1.5 + aim, 0, -.1);
    la.rotation.set(.2 - sw * .5, 0, .1);
  } else {
    const push = P.buildT > 0 ? Math.sin(P.buildT / .18 * Math.PI) * .45 : 0;
    la.rotation.set(1.1 + aim * .7, 0, .35);
    ra.rotation.set(1.1 + aim * .7 + push, 0, -.35);
  }
  player.pick.visible = mode === 'pickaxe';
  player.rifle.visible = mode === 'rifle';
}

/* ---------- HUD ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}
const hudCache = {};
function bumpMat(m) {
  const el = document.querySelector('.mat[data-mat="' + m + '"]'); if (!el) return;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
function cycleMaterial(dir) {
  matIdx = (matIdx + dir + 3) % 3; ghostKey = '#'; sfx('tick'); bumpMat(MAT_ORDER[matIdx]); refreshHud(true);
}
function updateSlotKeys() {
  document.querySelectorAll('.slot').forEach(s => { s.querySelector('.k').textContent = keyName(binds[s.dataset.slot]); });
}
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function refreshHud(force) {
  const active = mode === 'build' ? buildType : mode;
  document.querySelectorAll('.slot').forEach(s => s.classList.toggle('on', s.dataset.slot === active));
  document.querySelectorAll('.mat').forEach(s => s.classList.toggle('on', s.dataset.mat === MAT_ORDER[matIdx]));
  const ml = $('modeLabel');
  if (mode === 'build') ml.innerHTML = 'Build · <b>' + TYPE_NAME[buildType] + '</b> · ' + MATS[MAT_ORDER[matIdx]].name + ' <span style="opacity:.7">(right-click to switch)</span>';
  else if (mode === 'edit') ml.innerHTML = '<b>Editing ' + TYPE_NAME[edit.piece.type] + '</b> · ' + (edit.piece.type === 'ramp' ? 'drag a path: 2 tiles half, 3 L-shape, 4 U-shape, diagonal through all 4 full' : edit.piece.type === 'cone' ? 'select corners to flip them up' : 'drag across tiles to cut them');
  else if (mode === 'rifle') ml.innerHTML = '<b>Assault rifle</b> · hold to fire';
  else ml.innerHTML = '<b>Pickaxe</b> · harvest trees, rocks and crates';
  $('crosshair').classList.toggle('build', mode === 'build' || mode === 'edit');
  updateSlotKeys();
}
function updateHud() {
  setText('shieldNum', String(Math.ceil(P.shield))); setText('hpNum', String(Math.ceil(P.hp)));
  $('shieldFill').style.width = P.shield + '%'; $('hpFill').style.width = P.hp + '%';
  setText('mWood', String(mats.wood)); setText('mBrick', String(mats.brick)); setText('mMetal', String(mats.metal));
  document.querySelectorAll('.mat').forEach(s => s.classList.toggle('low', mats[s.dataset.mat] < COST));
  setText('stElims', String(stats.elims)); setText('stBuilds', String(stats.builds));
  // aim info
  const o = aimHit && mode !== 'edit' ? ownerOf(aimHit.object) : null;
  const info = $('aimInfo');
  const show = o && o.kind !== 'ground' && (o.alive !== false) && aimHit.point.distanceTo(head) < 40;
  info.hidden = !show;
  if (show) {
    setText('aimName', o.label);
    setText('aimHp', Math.max(0, Math.ceil(o.hp)) + ' / ' + o.maxHp);
    const bar = $('aimBar'); bar.style.width = Math.max(0, o.hp / o.maxHp * 100) + '%';
    bar.style.background = o.kind === 'piece' ? 'var(--build)' : o.kind === 'res' ? 'var(--gold)' : 'var(--danger)';
  }
  let hint = '';
  const ek = keyName(binds.edit);
  if (mode === 'edit') hint = settings.editRelease ? 'Release to confirm · ' + ek + ' confirm · Right-click reset' : ek + ' confirm · Right-click reset';
  else if (o && o.kind === 'piece' && aimHit.point.distanceTo(head) < 7) hint = keyName(binds.edit) + '  Edit';
  setText('hint', hint);
}

/* ---------- slots ---------- */
function setSlot(s) {
  if (edit) confirmEdit();
  if (s === 'pickaxe' || s === 'rifle') lastWeapon = s; else lastBuild = s;
  if (s === 'pickaxe' || s === 'rifle') { mode = s; hideGhost(); }
  else { mode = 'build'; buildType = s; }
  sfx('tick'); refreshHud(true);
}

/* ---------- audio ---------- */
let actx = null, noiseBuf = null, muted = false;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const len = actx.sampleRate * .5; noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { actx = null; }
}
function tone(freq, dur, type, vol, slide) {
  const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, vol, freq, q, type) {
  const t = actx.currentTime, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || .7;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f).connect(g).connect(actx.destination); s.start(t); s.stop(t + dur + .02);
}
function sfx(k, v = 1) {
  if (!actx || muted) return;
  switch (k) {
    case 'build': tone(420, .07, 'square', .04, 1.6); noise(.06, .12, 2600); break;
    case 'tick': tone(1200, .03, 'triangle', .04); break;
    case 'edit': tone(880, .05, 'triangle', .07); break;
    case 'confirm': tone(620, .08, 'square', .04, 1.5); break;
    case 'shoot': noise(.09, .3, 900, .6, 'lowpass'); tone(150, .06, 'sawtooth', .07, .5); break;
    case 'hit': tone(1500, .05, 'sine', .08); break;
    case 'swing': noise(.12, .05, 1800, 2); break;
    case 'pick': noise(.08, .25, 600, 1); tone(220, .06, 'triangle', .1, .6); break;
    case 'break': noise(.35, .3, 420, .5, 'lowpass'); break;
    case 'hurt': tone(200, .18, 'sawtooth', .1, .5); break;
    case 'turret': tone(900, .12, 'square', .03 * v, .4); break;
    case 'deny': tone(170, .1, 'square', .05); break;
    case 'door': noise(.18, .08, 300, 1.5); tone(140, .12, 'triangle', .05, 1.3); break;
  }
}

/* ---------- events ---------- */
function toggleEdit() { if (edit) confirmEdit(); else startEdit(); }
function primaryDown() { if (edit) editPress(); }
function primaryUp() { editRelease(); }
function runAction(a) {
  switch (a) {
    case 'pickaxe': case 'rifle': case 'wall': case 'floor': case 'ramp': case 'cone': setSlot(a); break;
    case 'edit': toggleEdit(); break;
    case 'resetEdit':
      if (edit) resetEdit();
      else if (mode === 'build') { buildRot = (buildRot + 1) % 4; ghostKey = '#'; sfx('tick'); }
      break;
    case 'material': cycleMaterial(1); break;
    case 'mute': muted = !muted; toast(muted ? 'Sound off' : 'Sound on'); break;
  }
}
function inputDown(code, repeat) {
  keys[code] = true;
  if (repeat) return;
  for (const a in binds) if (binds[a] === code) runAction(a);
}
document.addEventListener('keydown', e => {
  if (rebinding) { e.preventDefault(); assignBind(e.code === 'Escape' ? null : e.code); return; }
  if (e.code === 'Escape' && playing && !paused && !locked) { pause(); return; }
  if (paused) return;
  if (e.code === 'Space' || e.code === 'Tab' || Object.values(binds).includes(e.code)) e.preventDefault();
  inputDown(e.code, e.repeat);
});
document.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseL = false; mouseR = false; });
document.addEventListener('mousedown', e => {
  if (rebinding && e.button !== 0 && e.button !== 2) { e.preventDefault(); assignBind('Mouse' + e.button); }
}, true);
canvas.addEventListener('mousedown', e => {
  if (!playing || paused) return;
  if (!locked && !fallbackLook) { requestLock(); return; }
  if (e.button === 0) { mouseL = true; primaryDown(); }
  else if (e.button === 2) {
    mouseR = true;
    if (edit) resetEdit();
    else if (mode === 'build') cycleMaterial(1);
  } else { e.preventDefault(); inputDown('Mouse' + e.button, false); }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) { mouseL = false; primaryUp(); }
  else if (e.button === 2) mouseR = false;
  else { keys['Mouse' + e.button] = false; if (e.button > 2) e.preventDefault(); }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  if (!playing || paused || edit) return;
  e.preventDefault();
  const cur = SLOTS.indexOf(mode === 'build' ? buildType : mode);
  setSlot(SLOTS[(cur + (e.deltaY > 0 ? 1 : -1) + SLOTS.length) % SLOTS.length]);
}, { passive: false });
document.addEventListener('mousemove', e => {
  if (!(locked || (fallbackLook && playing && !paused))) return;
  const s = .0022 * settings.sens * (1 - .45 * adsT);
  yaw -= (e.movementX || 0) * s;
  pitch = Math.max(-1.45, Math.min(1.45, pitch - (e.movementY || 0) * s));
});

function requestLock() {
  fallbackLook = false;
  if (!canvas.requestPointerLock) { fallbackLook = true; return; }
  try {
    const r = canvas.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => { fallbackLook = true; });
  } catch (err) { fallbackLook = true; }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && playing && !paused && !fallbackLook) pause();
});
document.addEventListener('pointerlockerror', () => { fallbackLook = true; });

const menu = $('menu');
function pause() {
  paused = true; mouseL = false; mouseR = false; for (const k in keys) keys[k] = false;
  if (edit) exitEdit();
  menu.hidden = false; $('play').textContent = 'Resume';
}
function resume() { playing = true; paused = false; menu.hidden = true; refreshHud(true); }
$('play').addEventListener('click', () => { initAudio(); resume(); requestLock(); });
$('clear').addEventListener('click', () => {
  if (edit) exitEdit();
  for (const p of [...pieces.values()]) detachPiece(p);
  toast('All builds cleared');
});
const sensEl = $('sens'), relEl = $('editRelease'), turEl = $('turretsOn');
sensEl.value = settings.sens; relEl.checked = settings.editRelease; turEl.checked = settings.turrets;
sensEl.addEventListener('input', () => { settings.sens = +sensEl.value; saveSettings(); });
relEl.addEventListener('change', () => { settings.editRelease = relEl.checked; saveSettings(); });
turEl.addEventListener('change', () => { settings.turrets = turEl.checked; solidsDirty = true; if (!turEl.checked) clearProjectiles(); saveSettings(); });
const padSensEl = $('padSens'), invEl = $('invertY');
padSensEl.value = settings.padSens; invEl.checked = settings.invertY;
padSensEl.addEventListener('input', () => { settings.padSens = +padSensEl.value; saveSettings(); });
invEl.addEventListener('change', () => { settings.invertY = invEl.checked; saveSettings(); });
function showTab(pad) {
  $('tabKeys').classList.toggle('on', !pad); $('tabPad').classList.toggle('on', pad);
  $('tabKeys').setAttribute('aria-selected', String(!pad)); $('tabPad').setAttribute('aria-selected', String(pad));
  $('paneKeys').hidden = pad; $('panePad').hidden = !pad;
  rebinding = null; renderBinds();
}
$('tabKeys').addEventListener('click', () => showTab(false));
$('tabPad').addEventListener('click', () => showTab(true));
let flashBind = null;
function renderBinds() {
  const list = $('bindList'); list.textContent = '';
  for (const a of Object.keys(DEFAULT_BINDS)) {
    const label = document.createElement('span'); label.textContent = BIND_LABELS[a];
    const b = document.createElement('button'); b.type = 'button'; b.className = 'bind'; b.id = 'bind-' + a;
    b.textContent = rebinding === a ? 'Press a key' : keyName(binds[a]);
    if (rebinding === a) b.classList.add('wait');
    if (flashBind === a) b.classList.add('flash');
    b.addEventListener('click', () => { rebinding = rebinding === a ? null : a; flashBind = null; renderBinds(); });
    list.append(label, b);
  }
  updateSlotKeys();
}
function assignBind(code) {
  const a = rebinding; rebinding = null;
  if (a && code) {
    const other = Object.keys(binds).find(k => k !== a && binds[k] === code);
    if (other) { binds[other] = binds[a]; toast(BIND_LABELS[other] + ' moved to ' + keyName(binds[a])); }
    binds[a] = code; saveBinds(); flashBind = a;
  }
  renderBinds();
  if (a) { const el = $('bind-' + a); if (el) el.focus(); }
}
$('resetBinds').addEventListener('click', () => { Object.assign(binds, DEFAULT_BINDS); saveBinds(); rebinding = null; renderBinds(); toast('Keybinds reset'); });
renderBinds();

/* ---------- controller (Builder Pro layout) ---------- */
const deadzone = v => Math.abs(v) < .15 ? 0 : Math.sign(v) * (Math.abs(v) - .15) / .85;
function pollPad(dt) {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null;
  for (const g of list) if (g && g.connected) { gp = g; break; }
  $('padNote').hidden = !gp || !paused;
  if (!gp) { Object.assign(pad, { lx: 0, ly: 0, rx: 0, ry: 0, jump: false, primary: false, ads: false }); return; }
  const cur = [];
  for (let i = 0; i < gp.buttons.length; i++) { const b = gp.buttons[i]; cur[i] = !!b && (b.pressed || b.value > .35); }
  const pressed = i => cur[i] && !pad.prev[i], released = i => !cur[i] && pad.prev[i];
  pad.prev = cur;
  if (paused) { if (pressed(0) || pressed(9)) { initAudio(); resume(); } return; }
  if (pressed(9)) { pause(); return; }
  pad.lx = deadzone(gp.axes[0] || 0); pad.ly = deadzone(gp.axes[1] || 0);
  pad.rx = deadzone(gp.axes[2] || 0); pad.ry = deadzone(gp.axes[3] || 0);
  const ls = 3.4 * settings.padSens * (1 - .45 * adsT) * dt;
  yaw -= Math.sign(pad.rx) * pad.rx * pad.rx * ls * 1.25;
  pitch = Math.max(-1.45, Math.min(1.45, pitch - (settings.invertY ? -1 : 1) * Math.sign(pad.ry) * pad.ry * pad.ry * ls));
  pad.jump = cur[0];
  if (pressed(1)) setSlot(mode === 'build' || mode === 'edit' ? lastWeapon : lastBuild);
  if (pressed(2)) toggleEdit();
  pad.ads = false;
  if (edit) {
    pad.primary = cur[7];
    if (pressed(7)) primaryDown();
    if (released(7)) primaryUp();
    if (pressed(3)) resetEdit();
    return;
  }
  if (mode === 'build') {
    let any = false;
    for (const [i, t] of [[7, 'wall'], [6, 'ramp'], [5, 'floor'], [4, 'cone']]) {
      if (pressed(i) && buildType !== t) setSlot(t);
      if (cur[i] && buildType === t) any = true;
    }
    pad.primary = any;
    if (pressed(14)) cycleMaterial(-1);
    if (pressed(15)) cycleMaterial(1);
  } else {
    if (pressed(4)) setSlot('pickaxe');
    if (pressed(5)) setSlot('rifle');
    pad.primary = cur[7]; pad.ads = cur[6];
  }
}
window.addEventListener('gamepadconnected', () => toast('Controller connected'));

const capEl = $('fpsCap'), showFpsEl = $('showFps'), rsEl = $('renderScale'), shEl = $('shadowsOn');
capEl.value = String(settings.fpsCap); showFpsEl.checked = settings.showFps; rsEl.value = settings.renderScale; shEl.checked = settings.shadows;
$('renderScaleOut').value = settings.renderScale + '%';
$('fps').hidden = !settings.showFps;
capEl.addEventListener('change', () => { settings.fpsCap = +capEl.value; saveSettings(); });
showFpsEl.addEventListener('change', () => { settings.showFps = showFpsEl.checked; $('fps').hidden = !settings.showFps; saveSettings(); });
rsEl.addEventListener('input', () => { settings.renderScale = +rsEl.value; $('renderScaleOut').value = rsEl.value + '%'; applyRenderScale(); resize(); saveSettings(); });
shEl.addEventListener('change', () => { settings.shadows = shEl.checked; sun.castShadow = shEl.checked; saveSettings(); });

if (window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('touchNote').hidden = false;

/* ---------- starter fort so the first frame shows the mechanics ---------- */
function seedBuilds(list) {
  for (const b of list) {
    const p = makePiece(b, b.m, { mask: b.mask != null && b.type !== 'cone' ? b.mask : fullMask(b.type), flip: b.flip || 0, rpath: b.rpath || null, hp: MATS[b.m].hp, building: false });
    if (!pieces.has(p.key)) attachPiece(p);
  }
}
const starter = [
  { type: 'wall', a: 'x', x: -2, y: 0, z: -1, m: 'wood' },
  { type: 'wall', a: 'x', x: -1, y: 0, z: -1, m: 'wood', mask: 511 & ~(1 << 1) & ~(1 << 4) },
  { type: 'wall', a: 'z', x: 0, y: 0, z: -1, m: 'brick', mask: 511 & ~(1 << 0 | 1 << 1 | 1 << 3 | 1 << 4) },
  { type: 'wall', a: 'x', x: 1, y: 0, z: -1, m: 'wood', mask: 511 & ~(1 << 0 | 1 << 1 | 1 << 2 | 1 << 4) },
  { type: 'wall', a: 'z', x: -2, y: 0, z: -1, m: 'brick' },
  { type: 'wall', a: 'z', x: -2, y: 0, z: -2, m: 'brick' },
  { type: 'floor', x: -2, y: 1, z: -2, m: 'wood' },
  { type: 'floor', x: -1, y: 1, z: -2, m: 'wood', mask: 15 & ~(1 << 0) },
  { type: 'wall', a: 'x', x: -2, y: 1, z: -1, m: 'metal', mask: 511 & ~(1 << 4) },
  { type: 'ramp', a: 3, x: 0, y: 0, z: -2, m: 'wood' },
  { type: 'cone', x: -2, y: 1, z: -2, m: 'brick', flip: 0b0011 },
  { type: 'wall', a: 'z', x: -2, y: 1, z: -2, m: 'metal' },
];

/* ---------- loop ---------- */
let lastT = performance.now(), fpsFrames = 0, fpsStart = performance.now(), worstMs = 0;
function frame(t) {
  requestAnimationFrame(frame);
  // frame rate limit: skip this refresh if the next frame isn't due yet (1 ms slack for timer jitter)
  if (settings.fpsCap && t - lastT < 1000 / settings.fpsCap - 1) return;
  const rawMs = t - lastT;
  const dt = Math.min(.05, rawMs / 1000); lastT = t;
  fpsFrames++; worstMs = Math.max(worstMs, rawMs);
  if (t - fpsStart >= 500) {
    const fps = Math.round(fpsFrames * 1000 / (t - fpsStart));
    if (settings.showFps) {
      const n = $('fpsNum'); n.textContent = fps;
      n.className = fps >= 55 ? '' : fps >= 30 ? 'mid' : 'low';
      $('fpsMs').textContent = (1000 / Math.max(1, fps)).toFixed(1) + ' ms · worst ' + worstMs.toFixed(0);
    }
    fpsFrames = 0; fpsStart = t; worstMs = 0;
  }
  pollPad(dt);
  if (solidsDirty) rebuildSolids();
  const adsOn = !paused && mode === 'rifle' && (mouseR || pad.ads);
  adsT += ((adsOn ? 1 : 0) - adsT) * Math.min(1, dt * 14);
  const fov = 75 - 32 * adsT;
  if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  $('crosshair').classList.toggle('ads', adsT > .5);
  $('scope').classList.toggle('on', adsT > .5);
  ghostMats.ok.opacity = .26 + Math.sin(t / 160) * .07;
  if (!paused) {
    now += dt;
    movePlayer(dt);
  }
  updateCamera();
  if (!paused) {
    aimHit = cast(camera.position, fwd, allTargets(), 120, aimNear);
    if (mode === 'build') tryBuild(); else hideGhost();
    if (edit) updateEdit();
    if (mode === 'rifle' && primaryHeld() && now - lastShot >= .11) { fireRifle(); lastShot = now; }
    if (mode === 'pickaxe' && primaryHeld() && now - lastSwing >= .42) { swingPick(); lastSwing = now; }
    updateTurrets(dt); updateProjectiles(dt); updateWorld(dt);
    updateFx(dt);
    updateHud();
  }
  animatePlayer(paused ? 0 : dt);
  updateNumbers(paused ? 0 : dt);
  sun.position.set(P.x + 30, P.y + 55, P.z + 22); sun.target.position.set(P.x, P.y, P.z);
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}

function snapshot() {
  return {
    builds: [...pieces.values()].map(p => ({ type: p.type, a: p.a, x: p.x, y: p.y, z: p.z, m: p.mat, mask: p.mask, flip: p.flip || 0, rpath: p.rpath || null })),
    mats: { ...mats }, stats: { ...stats }, pos: [P.x, P.y, P.z], yaw, pitch,
  };
}
function start(data) {
  data = data || {};
  seedBuilds(Array.isArray(data.builds) ? data.builds : starter);
  if (data.mats) Object.assign(mats, data.mats);
  if (data.stats) Object.assign(stats, data.stats);
  if (Array.isArray(data.pos)) { P.x = data.pos[0]; P.y = data.pos[1]; P.z = data.pos[2]; }
  if (typeof data.yaw === 'number') { yaw = data.yaw; pitch = data.pitch || 0; }
  else { yaw = 0.35; pitch = -0.12; }
  refreshHud(true); updateHud();
  requestAnimationFrame(frame);
}
const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') { try { hot.snapshot(snapshot); } catch (e) {} }
// Live reload: when the page comes from the local dev server (and through the tunnel), poll its
// /__version and reload on change, carrying builds, materials and position across the reload.
function takeReloadState() {
  try { const d = sessionStorage.getItem('bfl-reload'); if (d) { sessionStorage.removeItem('bfl-reload'); return JSON.parse(d); } } catch (e) {}
  return null;
}
let servedVersion = null;
async function pollVersion() {
  try {
    const r = await fetch('__version', { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.text()).trim();
    if (servedVersion && v !== servedVersion) {
      try { sessionStorage.setItem('bfl-reload', JSON.stringify(snapshot())); } catch (e) {}
      location.reload(); return;
    }
    servedVersion = v;
  } catch (e) {}
  setTimeout(pollVersion, 1500);
}
const reloaded = takeReloadState();
if (hot && typeof hot.ready === 'function') hot.ready(start); else start((hot && hot.data) || reloaded);
if (reloaded) toast('Updated to the latest version');
pollVersion();
})();
