'use strict';
(() => {
const W = 1280, H = 800;
const stage = document.getElementById('stage');
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);

// ---------- fit to screen ----------
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(${(innerWidth - W * s) / 2}px,${(innerHeight - H * s) / 2}px) scale(${s})`;
}
addEventListener('resize', fit); fit();

// ---------- storage ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem('trucks.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('trucks.' + k, JSON.stringify(v)); } catch (e) {} }
};

// ---------- audio ----------
let AC = null, muted = LS.get('muted', false);
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.2, f0 = 800, f1 = 200, when = 0, q = 1) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime + when, n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t); s.stop(t + dur + 0.05);
}
const SFX = {
  honk() { tone(392, 0.18, 'square', 0.12); tone(494, 0.18, 'square', 0.1); tone(392, 0.28, 'square', 0.12, 0.24); tone(494, 0.28, 'square', 0.1, 0.24); },
  horn() { tone(330, 0.9, 'sawtooth', 0.09); tone(415, 0.9, 'sawtooth', 0.08); tone(494, 0.9, 'sawtooth', 0.06); },
  boing() { tone(180, 0.25, 'sine', 0.18, 0, 420); tone(420, 0.2, 'sine', 0.08, 0.12, 220); },
  pop() { tone(660, 0.1, 'triangle', 0.15, 0, 990); },
  load() { noise(1.2, 0.25, 300, 900, 0, 0.8); for (let i = 0; i < 5; i++) tone(200 + i * 60, 0.08, 'triangle', 0.08, i * 0.22); },
  dump() { noise(1.3, 0.35, 1200, 150, 0, 0.7); tone(300, 0.6, 'sine', 0.12, 0.2, 90); },
  pour() { noise(1.5, 0.2, 500, 300, 0, 2); for (let i = 0; i < 8; i++) tone(300 + Math.random() * 400, 0.06, 'sine', 0.1, i * 0.17); },
  rocks() { for (let i = 0; i < 7; i++) { noise(0.12, 0.3, 1500, 600, i * 0.15, 3); } },
  cheer() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.12)); noise(1.4, 0.12, 2500, 1500, 0.1, 0.5); tone(1047, 0.6, 'triangle', 0.12, 0.5); },
  clank() { for (let i = 0; i < 4; i++) { tone(900 - i * 80, 0.12, 'square', 0.07, i * 0.28); tone(1350 - i * 90, 0.1, 'triangle', 0.06, i * 0.28 + 0.03); } },
  ding() { tone(880, 0.15, 'triangle', 0.15); tone(1320, 0.3, 'triangle', 0.12, 0.12); },
};

// ---------- voice ----------
let lastLine = '', voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
  voice = vs.find(v => /samantha|google us english|zira|jenny|aria|female/i.test(v.name)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text, remember = true) {
  if (remember) lastLine = text;
  if (muted || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice; u.rate = 0.95; u.pitch = 1.25; u.volume = 1;
    speechSynthesis.speak(u);
  } catch (e) {}
}

// ---------- world (v2: big map, roads, roundabout, camera) ----------
const WW = 2200, WH = 1440;
const COLORS = [
  ['red', '#e53935'], ['blue', '#1e88e5'], ['green', '#43a047'], ['pink', '#ff6fb5'],
  ['yellow', '#fdd835'], ['orange', '#fb8c00'], ['purple', '#8e44ad']];
const C = { x: 1100, y: 720 }, RING_R = 210, ROAD_W = 120, ISLAND_R = 148;
const RX = 900, RY = 520;
function spoke(deg) { const a = deg * Math.PI / 180; return { x: Math.round(C.x + RX * Math.cos(a)), y: Math.round(C.y + RY * Math.sin(a)) }; }
const ST = {
  garage: { ...spoke(-90), r: 0, icon: '🔧' },
  dirt:   { ...spoke(-54), r: 105, icon: '🟤' },
  rocks:  { ...spoke(-18), r: 105, icon: '🪨' },
  plant:  { ...spoke(18),  r: 105, icon: '🏭' },
  steel:  { ...spoke(54),  r: 105, icon: '🔩' },
  sand:   { ...spoke(90),  r: 105, icon: '🏖️' },
  hole:   { ...spoke(126), r: 105, icon: '🕳️' },
  wall:   { ...spoke(162), r: 105, icon: '🧱' },
  slab:   { ...spoke(198), r: 105, icon: '🏠' },
  play:   { ...spoke(234), r: 105, icon: '🛝' },
  tower:  { x: C.x, y: C.y, r: 232, icon: '🏗️' },
};
for (const k in ST) ST[k].id = k;
const GARAGE = { x: ST.garage.x, y: ST.garage.y + 15, w: 240, h: 150 };
const JOBS = {
  dump:  { from: 'dirt', to: 'hole', thing: 'road',
           get: 'Go get the dirt!', drop: 'Now dump it in the hole!', more: 'Go get more dirt!', built: 'Hooray! You fixed the road!' },
  loader:{ from: 'rocks', to: 'wall', thing: 'rock wall',
           get: 'Go scoop up the rocks!', drop: 'Now drop the rocks here!', more: 'Go get more rocks!', built: 'Hooray! You built a rock wall!' },
  mixer: { from: 'plant', to: 'slab', thing: 'house',
           get: 'Go get the cement!', drop: 'Now pour it here!', more: 'Go get more cement!', built: 'Hooray! You built a house!' },
  crane: { from: 'steel', to: 'tower', thing: 'big tower',
           get: 'Go get the steel!', drop: 'Now take it to the big tower!', more: 'Go get more steel!', built: 'Hooray! You built the big tower!' },
  digger:{ from: 'sand', to: 'play', thing: 'playground',
           get: 'Go dig some sand!', drop: 'Now drop the sand here!', more: 'Go dig more sand!', built: 'Hooray! You built a playground!' },
};
const VEH_ORDER = ['dump', 'loader', 'mixer', 'crane', 'digger'];
const TRIPS = 3;
const MAGNET_EXTRA = 95;
// road segments: each spoke from ring to station
const ROADS = Object.values(ST).filter(s => s.id !== 'tower').map(s => {
  const a = Math.atan2(s.y - C.y, s.x - C.x);
  return { a, x1: C.x + Math.cos(a) * RING_R, y1: C.y + Math.sin(a) * RING_R, x2: s.x, y2: s.y };
});
function segDist(px, py, r) {
  const dx = r.x2 - r.x1, dy = r.y2 - r.y1, L = dx * dx + dy * dy;
  let t = ((px - r.x1) * dx + (py - r.y1) * dy) / L; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (r.x1 + t * dx), py - (r.y1 + t * dy));
}
function onRoad(x, y) {
  const rc = Math.hypot(x - C.x, y - C.y);
  if (Math.abs(rc - RING_R) < ROAD_W / 2 + 10) return true;
  for (const s of Object.values(ST)) if (s.id !== 'tower' && Math.hypot(x - s.x, y - s.y) < 130) return true;
  return ROADS.some(r => segDist(x, y, r) < ROAD_W / 2 + 10);
}
// trees on the grass (seeded so the map is always the same)
const OBST = [{ x: C.x, y: C.y, r: 92, k: 'tower' }];
(function plantTrees() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let tries = 0;
  while (OBST.length < 46 && tries++ < 3000) {
    const x = 70 + rnd() * (WW - 140), y = 70 + rnd() * (WH - 140), r = 28 + rnd() * 14;
    const rc = Math.hypot(x - C.x, y - C.y);
    if (rc < RING_R + ROAD_W / 2 + 70) continue;
    if (ROADS.some(rd => segDist(x, y, rd) < ROAD_W / 2 + 75)) continue;
    if (Object.values(ST).some(s => Math.hypot(x - s.x, y - s.y) < 230)) continue;
    if (OBST.some(o => Math.hypot(x - o.x, y - o.y) < o.r + r + 40)) continue;
    OBST.push({ x, y, r, k: rnd() < 0.15 ? 'bush' : 'tree' });
  }
})();

let progress, carColor, player, mode, padArmed, particles, confetti, playerName, t0 = performance.now();
let anim = null, endTimer = 0;
const cam = { x: 0, y: 0, z: 1 };
let lap = { last: null, acc: 0 }, laps = 0;
function freshProgress() { const p = {}; VEH_ORDER.forEach(v => p[v] = 0); return p; }
function reset() {
  progress = freshProgress();
  const saved = LS.get('colors', {});
  carColor = {}; VEH_ORDER.forEach(v => carColor[v] = saved[v] || '#e53935');
  player = { x: GARAGE.x, y: GARAGE.y + 10, a: Math.PI / 2, vx: 0, vy: 0, veh: 'dump', loaded: false, fill: 0, tilt: 0, drum: 0, bump: 0 };
  particles = []; confetti = []; anim = null; padArmed = false; endTimer = 0; lap = { last: null, acc: 0 };
  snapCam();
}
const allDone = () => VEH_ORDER.every(v => progress[v] >= TRIPS);
function target() {
  if (mode !== 'drive') return null;
  const j = JOBS[player.veh];
  if (progress[player.veh] < TRIPS) return ST[player.loaded ? j.to : j.from];
  if (allDone()) return null;
  return { x: GARAGE.x, y: GARAGE.y, r: 0, garage: true, id: 'garage' };
}
// road-following waypoint toward the target (used by tests; handy for a future "guide me" helper)
function nextWaypoint() {
  const tg = target(); if (!tg) return null;
  const ang = (x, y) => Math.atan2(y - C.y, x - C.x);
  const rp = Math.hypot(player.x - C.x, player.y - C.y), rt = Math.hypot(tg.x - C.x, tg.y - C.y);
  const ap = ang(player.x, player.y), at = ang(tg.x, tg.y);
  let d = at - ap; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const ringPt = a => ({ x: C.x + Math.cos(a) * RING_R, y: C.y + Math.sin(a) * RING_R });
  if (tg.id === 'tower') return rp > RING_R + 70 ? ringPt(ap) : tg;
  if (Math.abs(d) < 0.3) return tg;
  if (rp > RING_R + 70) return ringPt(ap);
  return ringPt(ap + Math.sign(d) * Math.min(Math.abs(d), 0.6));
}
reset();

// ---------- camera ----------
function viewW() { return W / cam.z; } function viewH() { return H / cam.z; }
function clampCam() {
  cam.x = Math.max(0, Math.min(WW - viewW(), cam.x)); cam.y = Math.max(0, Math.min(WH - viewH(), cam.y));
  if (viewW() >= WW) cam.x = (WW - viewW()) / 2; if (viewH() >= WH) cam.y = (WH - viewH()) / 2;
}
function snapCam() { cam.z = 1; cam.x = player.x - W / 2; cam.y = player.y - H / 2; clampCam(); }
function updateCam(dt) {
  let tz = 1, tx, ty;
  if (mode === 'end' || endTimer > 0 && endTimer < 2.5) { tz = Math.min(W / WW, H / WH); tx = WW / 2 - W / tz / 2; ty = WH / 2 - H / tz / 2; }
  else { tx = player.x + player.vx * 0.45 - W / 2; ty = player.y + player.vy * 0.45 - H / 2; }
  cam.z += (tz - cam.z) * Math.min(1, 2.5 * dt);
  if (tz !== 1) { tx = WW / 2 - viewW() / 2; ty = WH / 2 - viewH() / 2; }
  const k = Math.min(1, 4 * dt);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; clampCam();
}

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.key.startsWith('Arrow')) { keys[e.key] = true; e.preventDefault(); ac(); }
});
addEventListener('keyup', e => { if (e.key.startsWith('Arrow')) keys[e.key] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
let pointerGoal = null;
function toWorld(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width / cam.z + cam.x, y: (e.clientY - r.top) * H / r.height / cam.z + cam.y }; }
let ptrScreen = null;
cv.addEventListener('pointerdown', e => { ac(); ptrScreen = e; cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => { if (ptrScreen) ptrScreen = e; });
const endPtr = () => { ptrScreen = null; };
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);

$('sayBtn').onclick = () => { ac(); SFX.pop(); if (lastLine) say(lastLine); };
function drawMute() { $('muteBtn').textContent = muted ? '🔇' : '🎵'; }
drawMute();
$('muteBtn').onclick = () => { muted = !muted; LS.set('muted', muted); drawMute(); if (muted) try { speechSynthesis.cancel(); } catch (e) {} else SFX.pop(); };

// ---------- overlays ----------
function show(id, on) { $(id).classList.toggle('show', on); }
function startName() {
  playerName = LS.get('name', '');
  if (playerName) { beginPick(true); return; }
  mode = 'name'; show('nameOverlay', true); setTimeout(() => $('nameInput').focus(), 50);
}
function submitName() {
  const v = $('nameInput').value.trim().slice(0, 16);
  playerName = v; LS.set('name', v); ac(); SFX.ding();
  show('nameOverlay', false); beginPick(true);
}
$('nameGo').onclick = submitName;
$('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); e.stopPropagation(); });

const vehRow = $('vehRow');
VEH_ORDER.forEach(v => {
  const b = document.createElement('button'); b.className = 'vbtn'; b.dataset.veh = v; b.id = 'pick-' + v;
  const c = document.createElement('canvas'); c.width = 186; c.height = 150; b.appendChild(c);
  const ck = document.createElement('div'); ck.className = 'check'; ck.textContent = '✔'; b.appendChild(ck);
  b.onclick = () => { ac(); SFX.honk(); chooseVehicle(v); };
  b.onmouseenter = () => SFX.pop();
  vehRow.appendChild(b);
});
function iconVehicle(c, v, color, bed = 0) {
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  const sc = Math.min(c.width / 135, c.height / 85);
  g.save(); g.translate(c.width / 2 - 8 * sc, c.height / 2); g.scale(sc, sc);
  drawVehicle(g, v, color, { fill: bed, tilt: 0, drum: 0 }); g.restore();
}
function beginPick(first) {
  mode = 'pick'; player.vx = player.vy = 0;
  vehRow.querySelectorAll('.vbtn').forEach(b => {
    const v = b.dataset.veh; b.classList.toggle('done', progress[v] >= TRIPS);
    iconVehicle(b.querySelector('canvas'), v, carColor[v], 0);
  });
  show('pickOverlay', true);
  say(first ? (playerName ? `Hi ${playerName}! Pick a truck!` : 'Hi! Pick a truck!') : 'Pick a truck!');
}
let pendingVeh = 'dump', pendingColor = '#e53935';
const swRow = $('swRow');
COLORS.forEach(([n, hex]) => {
  const s = document.createElement('button'); s.className = 'sw'; s.style.background = hex; s.dataset.hex = hex; s.id = 'sw-' + n; s.title = n;
  s.onclick = () => { ac(); SFX.honk(); pendingColor = hex; refreshColor(); say(n, false); };
  swRow.appendChild(s);
});
function refreshColor() {
  swRow.querySelectorAll('.sw').forEach(s => s.classList.toggle('sel', s.dataset.hex === pendingColor));
  iconVehicle($('colorPreview'), pendingVeh, pendingColor, 0);
}
function chooseVehicle(v) {
  pendingVeh = v; pendingColor = carColor[v] || '#e53935';
  show('pickOverlay', false); show('colorOverlay', true); mode = 'color'; refreshColor();
  say('Pick a color!');
}
$('colorGo').onclick = () => {
  ac(); SFX.honk();
  carColor[pendingVeh] = pendingColor; LS.set('colors', carColor);
  player.veh = pendingVeh; player.loaded = false; player.fill = 0; player.tilt = 0;
  show('colorOverlay', false); mode = 'drive'; padArmed = false;
  const j = JOBS[pendingVeh];
  if (progress[pendingVeh] >= TRIPS) say(`You already built the ${j.thing}! Drive back to the garage for a new truck!`);
  else say(j.get);
};
$('againBtn').onclick = () => { ac(); SFX.honk(); show('endOverlay', false); reset(); beginPick(false); };
// ---------- drawing helpers ----------
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return '#' + ((1 << 24) + (f(r) << 16) + (f(gg) << 8) + f(b)).toString(16).slice(1);
}
function wheels(g, xs, half) {
  g.fillStyle = '#2b2b2b';
  xs.forEach(x => { rr(g, x - 11, -half - 9, 22, 13, 5); g.fill(); rr(g, x - 11, half - 4, 22, 13, 5); g.fill(); });
}
function eyes(g, x) { // friendly eyes on windshield, facing +x
  [[-9], [9]].forEach(([oy]) => {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, oy, 5.5, 6.5, 0, 0, 7); g.fill();
    g.fillStyle = '#222'; g.beginPath(); g.arc(x + 2, oy, 3, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 3, oy - 1.5, 1.1, 0, 7); g.fill();
  });
}
// vehicle faces +x, centered at origin, ~100 long
function drawVehicle(g, v, color, st) {
  const dark = shade(color, -0.18), light = shade(color, 0.18);
  g.lineJoin = 'round';
  // shadow
  g.fillStyle = 'rgba(0,0,0,.18)'; rr(g, -50, -30, 104, 66, 16); g.fill();
  if (v === 'dump') {
    wheels(g, [-30, -10, 30], 28);
    g.fillStyle = '#555'; rr(g, -48, -22, 96, 44, 8); g.fill();
    // bed (tilts = drawn shorter & offset back)
    const tl = st.tilt || 0;
    g.save(); g.translate(-12 - tl * 10, 0); g.scale(1 - tl * 0.25, 1);
    g.fillStyle = color; g.strokeStyle = dark; g.lineWidth = 4;
    rr(g, -36, -28, 66, 56, 8); g.fill(); g.stroke();
    g.fillStyle = dark; for (let i = -24; i <= 18; i += 14) { g.fillRect(i, -24, 4, 48); }
    if (st.fill > 0.02) {
      g.fillStyle = '#8d5a2b'; g.beginPath(); g.ellipse(-3, 0, 30 * st.fill + 4, 22 * st.fill + 3, 0, 0, 7); g.fill();
      g.fillStyle = '#a86d38'; g.beginPath(); g.ellipse(-8, -5, 14 * st.fill + 2, 9 * st.fill + 2, 0, 0, 7); g.fill();
    }
    g.restore();
    // cab
    g.fillStyle = light; g.strokeStyle = dark; g.lineWidth = 4;
    rr(g, 24, -26, 30, 52, 12); g.fill(); g.stroke();
    g.fillStyle = '#bfe9ff'; rr(g, 38, -20, 12, 40, 5); g.fill();
    eyes(g, 44);
  } else if (v === 'loader') {
    wheels(g, [-24, 22], 30);
    g.fillStyle = color; g.strokeStyle = dark; g.lineWidth = 4;
    rr(g, -44, -26, 70, 52, 14); g.fill(); g.stroke();
    g.fillStyle = dark; rr(g, -42, -10, 16, 20, 4); g.fill(); // engine grille
    // cab
    g.fillStyle = light; rr(g, -12, -20, 32, 40, 10); g.fill(); g.stroke();
    g.fillStyle = '#bfe9ff'; rr(g, 4, -15, 12, 30, 4); g.fill();
    eyes(g, 10);
    // arms + bucket
    const lift = st.tilt || 0;
    g.fillStyle = '#666'; g.fillRect(24, -22, 22, 7); g.fillRect(24, 15, 22, 7);
    g.save(); g.translate(50 + lift * 4, 0);
    g.fillStyle = '#9e9e9e'; g.strokeStyle = '#555'; g.lineWidth = 4;
    rr(g, -6, -36, 22 - lift * 6, 72, 6); g.fill(); g.stroke();
    if (st.fill > 0.02) {
      g.fillStyle = '#8a8f99';
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(4, -24 + i * 12, 6 * st.fill + 1, 0, 7); g.fill(); }
      g.fillStyle = '#b0b6c0'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(9, -18 + i * 12, 4 * st.fill + 1, 0, 7); g.fill(); }
    }
    g.restore();
  } else if (v === 'crane') {
    wheels(g, [-32, -12, 30], 28);
    g.fillStyle = '#555'; rr(g, -50, -22, 100, 44, 8); g.fill();
    g.fillStyle = shade(color, -0.05); g.strokeStyle = dark; g.lineWidth = 4;
    rr(g, -48, -26, 70, 52, 8); g.fill(); g.stroke();
    if (st.fill > 0.02) { // steel beams on the bed
      g.globalAlpha = Math.min(1, st.fill * 1.5);
      g.fillStyle = '#546e7a'; rr(g, -46, -22, 62, 11, 3); g.fill(); rr(g, -46, 11, 62, 11, 3); g.fill();
      g.fillStyle = '#90a4ae'; g.fillRect(-46, -18, 62, 3); g.fillRect(-46, 15, 62, 3);
      g.globalAlpha = 1;
    }
    g.fillStyle = light; g.strokeStyle = dark; g.lineWidth = 4;
    rr(g, 24, -26, 30, 52, 12); g.fill(); g.stroke();
    g.fillStyle = '#bfe9ff'; rr(g, 38, -20, 12, 40, 5); g.fill();
    eyes(g, 44);
    // turret + boom (swings when unloading)
    g.save(); g.translate(-14, 0); g.rotate((st.tilt || 0) * 0.9);
    g.fillStyle = '#fbc02d'; g.strokeStyle = '#a07800'; g.lineWidth = 3;
    rr(g, -6, -8, 74, 16, 4); g.fill(); g.stroke();
    g.strokeStyle = '#a07800'; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x < 64; x += 10) { g.moveTo(x, -7); g.lineTo(x + 10, 7); }
    g.stroke();
    g.fillStyle = '#333'; g.beginPath(); g.arc(70, 0, 5, 0, 7); g.fill();
    g.fillStyle = color; g.strokeStyle = dark; g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fill(); g.stroke();
    g.restore();
  } else if (v === 'digger') {
    // tracks
    g.fillStyle = '#2b2b2b'; rr(g, -46, -36, 84, 17, 7); g.fill(); rr(g, -46, 19, 84, 17, 7); g.fill();
    g.strokeStyle = '#555'; g.lineWidth = 2; g.beginPath();
    for (let x = -42; x < 36; x += 8) { g.moveTo(x, -35); g.lineTo(x, -20); g.moveTo(x, 20); g.lineTo(x, 35); }
    g.stroke();
    g.save(); g.translate(-6, 0); g.rotate(Math.sin((st.tilt || 0) * Math.PI) * 0.35);
    g.fillStyle = color; g.strokeStyle = dark; g.lineWidth = 4;
    rr(g, -36, -24, 58, 48, 12); g.fill(); g.stroke();
    g.fillStyle = dark; rr(g, -36, -16, 12, 32, 5); g.fill(); // counterweight
    g.fillStyle = '#bfe9ff'; rr(g, 2, -22, 16, 18, 4); g.fill();
    eyes(g, 12);
    // arm + bucket
    const ext = (st.tilt || 0) * 8;
    g.fillStyle = '#fbc02d'; g.strokeStyle = '#a07800'; g.lineWidth = 3;
    rr(g, 14, 2, 40 + ext, 12, 4); g.fill(); g.stroke();
    g.fillStyle = '#9e9e9e'; g.strokeStyle = '#555';
    rr(g, 50 + ext, -12, 18, 34, 6); g.fill(); g.stroke();
    if (st.fill > 0.02) { g.fillStyle = '#e6c25a'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(59 + ext, -4 + i * 10, 4 + st.fill * 3, 0, 7); g.fill(); } }
    g.restore();
    return;
  } else { // mixer
    wheels(g, [-32, -12, 30], 28);
    g.fillStyle = '#555'; rr(g, -50, -22, 100, 44, 8); g.fill();
    // drum
    g.save(); g.translate(-14, 0);
    g.fillStyle = '#f5f5f5'; g.strokeStyle = '#999'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(0, 0, 38, 27, 0, 0, 7); g.fill(); g.stroke();
    g.save(); g.beginPath(); g.ellipse(0, 0, 36, 25, 0, 0, 7); g.clip();
    g.fillStyle = color;
    const off = ((st.drum || 0) % 1) * 24;
    for (let i = -60; i < 60; i += 24) { g.beginPath(); g.moveTo(i + off, -30); g.lineTo(i + off + 10, -30); g.lineTo(i + off - 6, 30); g.lineTo(i + off - 16, 30); g.fill(); }
    g.restore();
    g.fillStyle = '#777'; g.beginPath(); g.arc(-36, 0, 7, 0, 7); g.fill(); // chute
    g.restore();
    // cab
    g.fillStyle = color; g.strokeStyle = dark; g.lineWidth = 4;
    rr(g, 24, -26, 30, 52, 12); g.fill(); g.stroke();
    g.fillStyle = '#bfe9ff'; rr(g, 38, -20, 12, 40, 5); g.fill();
    eyes(g, 44);
    if (st.fill > 0.02) { g.fillStyle = '#9e9e9e'; g.beginPath(); g.arc(-50, 0, 5 + st.fill * 4, 0, 7); g.fill(); }
  }
  // headlights
  g.fillStyle = '#fff59d'; g.beginPath(); g.arc(54, -19, 4, 0, 7); g.arc(54, 19, 4, 0, 7); g.fill();
}

// ---------- site drawing (world coords) ----------
const DIRT = '#dcb27a', DIRT_EDGE = '#c49660', DIRT_LINE = 'rgba(255,240,210,.55)';
function drawGround(t) {
  ctx.fillStyle = '#7cc95a'; ctx.fillRect(0, 0, WW, WH);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  for (let i = 0; i < 160; i++) { const x = (i * 337) % WW, y = (i * 211) % WH; ctx.beginPath(); ctx.arc(x, y, 10 + (i % 4) * 4, 0, 7); ctx.fill(); }
  // flowers
  for (let i = 0; i < 70; i++) {
    const x = (i * 521 + 90) % WW, y = (i * 389 + 40) % WH; if (onRoad(x, y)) continue;
    ctx.fillStyle = ['#fff', '#ffeb3b', '#ff80ab'][i % 3]; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
  }
  // roads: edge, fill, center dashes
  ctx.lineCap = 'round';
  const pass = (w, col, dash) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []);
    ROADS.forEach(r => { ctx.beginPath(); ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); ctx.stroke(); });
    ctx.beginPath(); ctx.arc(C.x, C.y, RING_R, 0, 7); ctx.stroke();
  };
  pass(ROAD_W + 16, DIRT_EDGE); pass(ROAD_W, DIRT);
  // station pads
  Object.values(ST).forEach(s => { if (s.id === 'tower' || s.id === 'garage') return; ctx.fillStyle = DIRT_EDGE; ctx.beginPath(); ctx.arc(s.x, s.y, 128, 0, 7); ctx.fill(); ctx.fillStyle = DIRT; ctx.beginPath(); ctx.arc(s.x, s.y, 120, 0, 7); ctx.fill(); });
  ctx.lineCap = 'butt'; pass(8, DIRT_LINE, [24, 22]); ctx.setLineDash([]);
  // roundabout island + painted arrows
  ctx.fillStyle = '#69b84a'; ctx.beginPath(); ctx.arc(C.x, C.y, ISLAND_R, 0, 7); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.setLineDash([16, 12]); ctx.beginPath(); ctx.arc(C.x, C.y, ISLAND_R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4 + t * 0.15;
    ctx.save(); ctx.translate(C.x + Math.cos(a) * RING_R, C.y + Math.sin(a) * RING_R); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-8, -14); ctx.lineTo(-2, 0); ctx.lineTo(-8, 14); ctx.fill(); ctx.restore();
  }
  // fence around the world edge
  ctx.fillStyle = '#ff9800';
  for (let x = 30; x < WW; x += 80) { ctx.fillRect(x, 10, 26, 10); ctx.fillRect(x, WH - 20, 26, 10); }
  for (let y = 30; y < WH; y += 80) { ctx.fillRect(10, y, 10, 26); ctx.fillRect(WW - 20, y, 10, 26); }
}
function inView(x, y, m) { return x > cam.x - m && x < cam.x + viewW() + m && y > cam.y - m && y < cam.y + viewH() + m; }
function drawObstacles() {
  OBST.forEach(o => {
    if (o.k === 'tower' || !inView(o.x, o.y, 60)) return;
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.arc(o.x + 6, o.y + 8, o.r, 0, 7); ctx.fill();
    if (o.k === 'tree') {
      ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#43a047'; ctx.beginPath(); ctx.arc(o.x - 9, o.y - 9, o.r * 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#66bb6a'; ctx.beginPath(); ctx.arc(o.x - 13, o.y - 13, o.r * 0.25, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = '#558b2f'; [[-10, 0], [10, 2], [0, -10]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(o.x + dx, o.y + dy, o.r * 0.6, 0, 7); ctx.fill(); });
      ctx.fillStyle = '#e53935'; [[-8, -4], [9, 6], [2, -12]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(o.x + dx, o.y + dy, 4, 0, 7); ctx.fill(); });
    }
  });
}
function drawGarage(t) {
  const g = GARAGE;
  ctx.fillStyle = '#90a4ae'; rr(ctx, g.x - g.w / 2, g.y - g.h / 2, g.w, g.h, 24); ctx.fill();
  ctx.save(); rr(ctx, g.x - g.w / 2, g.y - g.h / 2, g.w, g.h, 24); ctx.clip();
  ctx.fillStyle = '#ffd54f';
  for (let i = -300; i < 300; i += 40) { ctx.beginPath(); ctx.moveTo(g.x + i, g.y - g.h / 2); ctx.lineTo(g.x + i + 20, g.y - g.h / 2); ctx.lineTo(g.x + i - 30, g.y + g.h / 2); ctx.lineTo(g.x + i - 50, g.y + g.h / 2); ctx.fill(); }
  ctx.fillStyle = '#78909c'; rr(ctx, g.x - g.w / 2 + 16, g.y - g.h / 2 + 16, g.w - 32, g.h - 32, 16); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#d84315'; rr(ctx, g.x - 110, g.y - g.h / 2 - 50, 220, 52, 12); ctx.fill();
  ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🔧 🚚 🔧', g.x, g.y - g.h / 2 - 24);
  VEH_ORDER.forEach((v, i) => { if (progress[v] >= TRIPS) { ctx.font = '26px sans-serif'; ctx.fillText('✅', g.x - 88 + i * 44, g.y + g.h / 2 - 22); } });
}
function drawPile(s, col1, col2, n, sz) {
  for (let i = 0; i < n; i++) {
    const a = i * 2.39, r = Math.sqrt(i) * sz * 0.9;
    ctx.fillStyle = i % 3 ? col1 : col2;
    ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r * 0.85, sz * (1.15 - i / n * 0.5), 0, 7); ctx.fill();
  }
}
function shadowEllipse(x, y, rx, ry) { ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(x + 8, y + 10, rx, ry, 0, 0, 7); ctx.fill(); }
function drawStations(t) {
  const P = progress;
  // pickups
  shadowEllipse(ST.dirt.x, ST.dirt.y, 80, 62); drawPile(ST.dirt, '#8d5a2b', '#a86d38', 22, 17);
  shadowEllipse(ST.rocks.x, ST.rocks.y, 80, 62); drawPile(ST.rocks, '#8a8f99', '#b0b6c0', 20, 17);
  shadowEllipse(ST.sand.x, ST.sand.y, 85, 62); drawPile(ST.sand, '#f2d16b', '#e6c25a', 22, 17);
  const pl = ST.plant;
  ctx.fillStyle = 'rgba(0,0,0,.15)'; rr(ctx, pl.x - 62, pl.y - 52, 130, 114, 14); ctx.fill();
  ctx.fillStyle = '#b0bec5'; rr(ctx, pl.x - 70, pl.y - 60, 130, 114, 14); ctx.fill();
  ctx.fillStyle = '#eceff1'; ctx.beginPath(); ctx.arc(pl.x - 28, pl.y - 18, 36, 0, 7); ctx.fill();
  ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(pl.x - 28, pl.y - 18, 24, 0, 7); ctx.stroke();
  ctx.fillStyle = '#ffb300'; rr(ctx, pl.x + 10, pl.y - 6, 60, 22, 6); ctx.fill();
  ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🏭', pl.x - 28, pl.y + 34);
  const sy = ST.steel; // steel yard: stacked beams
  ctx.fillStyle = 'rgba(0,0,0,.15)'; rr(ctx, sy.x - 70, sy.y - 50, 150, 110, 10); ctx.fill();
  for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? '#546e7a' : '#607d8b'; rr(ctx, sy.x - 75, sy.y - 55 + i * 22, 150, 16, 4); ctx.fill(); ctx.fillStyle = '#90a4ae'; ctx.fillRect(sy.x - 75, sy.y - 50 + i * 22, 150, 4); }
  ctx.fillStyle = '#ff6d00'; [[-85, -60], [80, -60], [-85, 50], [80, 50]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(sy.x + dx, sy.y + dy, 9, 0, 7); ctx.fill(); });
  // HOLE -> fixed road
  const h = ST.hole, fp = Math.min(P.dump, TRIPS) / TRIPS;
  if (P.dump >= TRIPS) {
    ctx.fillStyle = '#455a64'; rr(ctx, h.x - 100, h.y - 70, 200, 140, 24); ctx.fill();
    ctx.fillStyle = '#fff'; for (let x = -80; x < 80; x += 46) ctx.fillRect(h.x + x, h.y - 6, 28, 12);
    ctx.fillStyle = '#ffeb3b'; ctx.fillRect(h.x - 96, h.y - 64, 192, 6); ctx.fillRect(h.x - 96, h.y + 58, 192, 6);
  } else {
    ctx.fillStyle = '#5d3a1a'; ctx.beginPath(); ctx.ellipse(h.x, h.y, 95, 62, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3e2610'; ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, 80, 50, 0, 0, 7); ctx.fill();
    if (fp > 0) { ctx.fillStyle = '#8d5a2b'; ctx.beginPath(); ctx.ellipse(h.x, h.y, 88 * fp + 6, 56 * fp + 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#3e2610'; ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, 80 * (1 - fp), 50 * (1 - fp), 0, 0, 7); ctx.fill(); }
  }
  // ROCK WALL
  const wl = ST.wall, wn = Math.min(P.loader, TRIPS);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.setLineDash([14, 10]); rr(ctx, wl.x - 105, wl.y - 45, 210, 90, 14); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < wn; i++) {
    const bx = wl.x - 100 + i * 68;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; rr(ctx, bx + 6, wl.y - 38, 64, 84, 10); ctx.fill();
    ctx.fillStyle = ['#8a8f99', '#9ea4ad', '#b8bec6'][i]; rr(ctx, bx, wl.y - 42, 64, 84, 10); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(bx + 16 + k * 16, wl.y - 22 + (k % 2) * 30, 8, 0, 7); ctx.fill(); }
  }
  if (P.loader >= TRIPS) flag(wl.x, wl.y - 40, t);
  // SLAB -> HOUSE
  const sb = ST.slab, sp = Math.min(P.mixer, TRIPS) / TRIPS;
  ctx.fillStyle = '#c8a26a'; ctx.fillRect(sb.x - 80, sb.y - 65, 160, 130);
  ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 10; ctx.strokeRect(sb.x - 80, sb.y - 65, 160, 130);
  if (sp > 0) { ctx.fillStyle = '#bdbdbd'; ctx.fillRect(sb.x - 75, sb.y + 60 - 120 * sp, 150, 120 * sp); }
  if (P.mixer >= TRIPS) {
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(sb.x - 66, sb.y - 50, 140, 116);
    ctx.fillStyle = '#e53935';
    ctx.beginPath(); ctx.moveTo(sb.x - 82, sb.y - 68); ctx.lineTo(sb.x + 78, sb.y - 68); ctx.lineTo(sb.x + 30, sb.y); ctx.lineTo(sb.x - 34, sb.y); ctx.fill();
    ctx.fillStyle = '#c62828';
    ctx.beginPath(); ctx.moveTo(sb.x - 82, sb.y + 68); ctx.lineTo(sb.x + 78, sb.y + 68); ctx.lineTo(sb.x + 30, sb.y); ctx.lineTo(sb.x - 34, sb.y); ctx.fill();
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath(); ctx.moveTo(sb.x - 82, sb.y - 68); ctx.lineTo(sb.x - 34, sb.y); ctx.lineTo(sb.x - 82, sb.y + 68); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sb.x + 78, sb.y - 68); ctx.lineTo(sb.x + 30, sb.y); ctx.lineTo(sb.x + 78, sb.y + 68); ctx.fill();
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(sb.x + 40, sb.y - 50, 16, 22);
    ctx.font = '34px sans-serif'; ctx.fillText('💛', sb.x - 2, sb.y + 2);
  }
  // PLAYGROUND
  const pg = ST.play, pp = Math.min(P.digger, TRIPS) / TRIPS;
  ctx.fillStyle = '#8d6e63'; rr(ctx, pg.x - 90, pg.y - 70, 180, 140, 16); ctx.fill();
  ctx.fillStyle = '#6d4c41'; rr(ctx, pg.x - 78, pg.y - 58, 156, 116, 12); ctx.fill();
  if (pp > 0) { ctx.fillStyle = '#f2d16b'; rr(ctx, pg.x - 78, pg.y + 58 - 116 * pp, 156, 116 * pp, 12); ctx.fill(); }
  if (P.digger >= TRIPS) {
    ctx.fillStyle = '#1e88e5'; ctx.fillRect(pg.x - 70, pg.y - 50, 8, 60); ctx.fillRect(pg.x - 20, pg.y - 50, 8, 60); ctx.fillRect(pg.x - 70, pg.y - 54, 58, 8); // swing
    ctx.fillStyle = '#e53935'; const sw = Math.sin(t * 3) * 8; rr(ctx, pg.x - 50 + sw, pg.y - 10, 20, 10, 3); ctx.fill();
    ctx.fillStyle = '#fdd835'; rr(ctx, pg.x + 20, pg.y - 40, 26, 90, 8); ctx.fill(); ctx.fillStyle = '#fb8c00'; rr(ctx, pg.x + 14, pg.y - 52, 38, 22, 6); ctx.fill(); // slide
    ctx.font = '30px sans-serif'; ctx.fillText('⚽', pg.x - 40, pg.y + 38);
  }
  // BIG TOWER in the roundabout
  const tw = ST.tower, n = Math.min(P.crane, TRIPS);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.setLineDash([14, 10]); rr(ctx, tw.x - 95, tw.y - 95, 190, 190, 16); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#bdbdbd'; rr(ctx, tw.x - 88, tw.y - 88, 176, 176, 12); ctx.fill();
  for (let i = 0; i < n; i++) {
    const s = 170 - i * 34, o = -i * 12;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; rr(ctx, tw.x - s / 2 + 8 + i * 4, tw.y - s / 2 + o + 10 + i * 4, s, s, 6); ctx.fill();
    ctx.fillStyle = ['#607d8b', '#78909c', '#90a4ae'][i]; rr(ctx, tw.x - s / 2, tw.y - s / 2 + o, s, s, 6); ctx.fill();
    ctx.strokeStyle = '#37474f'; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(tw.x - s / 2, tw.y + o); ctx.lineTo(tw.x + s / 2, tw.y + o); ctx.moveTo(tw.x, tw.y - s / 2 + o); ctx.lineTo(tw.x, tw.y + s / 2 + o);
    ctx.moveTo(tw.x - s / 2, tw.y - s / 2 + o); ctx.lineTo(tw.x + s / 2, tw.y + s / 2 + o); ctx.stroke();
  }
  if (P.crane >= TRIPS) {
    ctx.fillStyle = '#e53935'; rr(ctx, tw.x - 40, tw.y - 76, 80, 80, 10); ctx.fill();
    ctx.fillStyle = Math.sin(t * 6) > 0 ? '#ffeb3b' : '#fff59d'; ctx.beginPath(); ctx.arc(tw.x, tw.y - 36, 14, 0, 7); ctx.fill();
    flag(tw.x + 20, tw.y - 70, t);
  }
}
function flag(x, y, t) {
  ctx.fillStyle = '#5d4037'; ctx.fillRect(x - 3, y - 70, 6, 70);
  ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(x + 3, y - 70); ctx.lineTo(x + 47 + Math.sin(t * 6) * 5, y - 57); ctx.lineTo(x + 3, y - 43); ctx.fill();
}
function drawTarget(t) {
  const tg = target(); if (!tg) return;
  const p = (Math.sin(t * 5) + 1) / 2, R = tg.garage ? 120 : tg.r;
  ctx.save();
  ctx.shadowColor = '#fff176'; ctx.shadowBlur = 30;
  ctx.strokeStyle = `rgba(255,235,59,${0.55 + p * 0.45})`; ctx.lineWidth = 10 + p * 6;
  ctx.beginPath(); ctx.arc(tg.x, tg.y, R - 6 + p * 12, 0, 7); ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.7 - p * 0.5})`; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(tg.x, tg.y, R + 14 + p * 30, 0, 7); ctx.stroke();
  ctx.restore();
  const ay = tg.y - (tg.id === 'tower' ? 150 : R) - 40 - Math.abs(Math.sin(t * 4)) * 26;
  ctx.save(); ctx.translate(tg.x, Math.max(60, ay));
  ctx.fillStyle = '#ff1744'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-30, -40); ctx.lineTo(30, -40); ctx.lineTo(30, -8); ctx.lineTo(46, -8); ctx.lineTo(0, 34); ctx.lineTo(-46, -8); ctx.lineTo(-30, -8); ctx.closePath();
  ctx.stroke(); ctx.fill(); ctx.restore();
  const dx = tg.x - player.x, dy = tg.y - player.y, d = Math.hypot(dx, dy);
  if (d > R + MAGNET_EXTRA) {
    const a = Math.atan2(dy, dx);
    ctx.save(); ctx.translate(player.x + Math.cos(a) * 80, player.y + Math.sin(a) * 80); ctx.rotate(a);
    ctx.globalAlpha = 0.6 + p * 0.4; ctx.fillStyle = '#ffeb3b'; ctx.strokeStyle = '#e65100'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-10, -14); ctx.lineTo(-4, 0); ctx.lineTo(-10, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
function drawPlayer(t) {
  ctx.save(); ctx.translate(player.x, player.y);
  const sp = Math.hypot(player.vx, player.vy);
  ctx.translate(0, sp > 20 ? Math.sin(t * 30) * 0.8 : 0); ctx.rotate(player.a);
  const sq = 1 + player.bump * 0.12; ctx.scale(sq, 2 - sq);
  drawVehicle(ctx, player.veh, carColor[player.veh], player);
  ctx.restore();
}
function drawParticles(dt) {
  particles = particles.filter(p => (p.life -= dt) > 0);
  particles.forEach(p => {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97;
    ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  });
  ctx.globalAlpha = 1;
  confetti = confetti.filter(p => (p.life -= dt) > 0);
  confetti.forEach(p => {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.99; p.rot += p.vr * dt;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-7, -4, 14, 8); ctx.restore();
  });
}
function stream(from, to, col, n, sz = 7) {
  for (let i = 0; i < n; i++) {
    const k = Math.random(), x = from.x + (Math.random() - 0.5) * 50, y = from.y + (Math.random() - 0.5) * 50;
    const life = 0.5 + Math.random() * 0.3;
    particles.push({ x, y, vx: (to.x - x) / life * (0.8 + k * 0.4), vy: (to.y - y) / life * (0.8 + k * 0.4), r: sz * (0.6 + Math.random() * 0.8), c: col[i % col.length], life });
  }
}
function boom(x, y, n = 160) {
  const cols = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ff6fb5', '#fb8c00', '#8e44ad', '#fff'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 250 + Math.random() * 500;
    confetti.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 300, c: cols[i % cols.length], life: 2.5 + Math.random() * 1.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
  }
}

// ---------- screen-space HUD: edge arrow + minimap ----------
const MM = { w: 240, h: 240 * WH / WW, x: W - 240 - 16, y: H - 240 * WH / WW - 16 };
function drawEdgeArrow(t) {
  const tg = target(); if (!tg) return;
  const sx = (tg.x - cam.x) * cam.z, sy = (tg.y - cam.y) * cam.z, m = 30;
  if (sx > m && sx < W - m && sy > m && sy < H - m) return;
  const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy, a = Math.atan2(dy, dx);
  const ins = 70, kx = (W / 2 - ins) / Math.abs(dx || 1e-6), ky = (H / 2 - ins) / Math.abs(dy || 1e-6), k = Math.min(kx, ky);
  const ex = cx + dx * k, ey = cy + dy * k, p = (Math.sin(t * 6) + 1) / 2;
  ctx.save(); ctx.translate(ex, ey);
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(0, 0, 44 + p * 4, 0, 7); ctx.fill();
  ctx.font = '40px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(tg.garage ? '🔧' : tg.icon, 0, 2);
  ctx.rotate(a); ctx.translate(52 + p * 10, 0);
  ctx.fillStyle = '#ff1744'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(-8, -26); ctx.lineTo(-8, 26); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}
function drawMinimap(t) {
  const s = MM.w / WW, X = wx => MM.x + wx * s, Y = wy => MM.y + wy * s;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; rr(ctx, MM.x - 8, MM.y - 8, MM.w + 16, MM.h + 16, 18); ctx.fill();
  ctx.fillStyle = '#7cc95a'; rr(ctx, MM.x, MM.y, MM.w, MM.h, 12); ctx.fill();
  ctx.strokeStyle = DIRT; ctx.lineWidth = ROAD_W * s; ctx.lineCap = 'round';
  ROADS.forEach(r => { ctx.beginPath(); ctx.moveTo(X(r.x1), Y(r.y1)); ctx.lineTo(X(r.x2), Y(r.y2)); ctx.stroke(); });
  ctx.beginPath(); ctx.arc(X(C.x), Y(C.y), RING_R * s, 0, 7); ctx.stroke();
  ctx.fillStyle = '#d84315'; ctx.fillRect(X(GARAGE.x) - 8, Y(GARAGE.y) - 6, 16, 12);
  const tg = target(), p = (Math.sin(t * 6) + 1) / 2;
  if (tg) { ctx.fillStyle = '#ffeb3b'; ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(tg.x), Y(tg.y), 9 + p * 4, 0, 7); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = carColor[player.veh]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(X(player.x), Y(player.y), 8, 0, 7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.strokeRect(X(cam.x), Y(cam.y), viewW() * s, viewH() * s);
  ctx.restore();
}

// ---------- physics ----------
let lastBoing = 0;
function boing(now) { player.bump = 1; if (now - lastBoing > 700) { lastBoing = now; SFX.boing(); } }
const PCOL = { dirt: ['#8d5a2b', '#a86d38'], rocks: ['#8a8f99', '#b0b6c0'], plant: ['#9e9e9e', '#bdbdbd'], steel: ['#546e7a', '#90a4ae'], sand: ['#f2d16b', '#e6c25a'] };
function update(dt, now) {
  player.bump = Math.max(0, player.bump - dt * 4);
  if (player.veh === 'mixer') player.drum += dt * (player.loaded || anim ? 2.2 : 0.4);
  if (anim) { runAnim(dt, now); return; }
  if (mode !== 'drive') { player.vx *= 0.8; player.vy *= 0.8; return; }
  let ix = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  let iy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
  if (!ix && !iy && ptrScreen) {
    const g = toWorld(ptrScreen), dx = g.x - player.x, dy = g.y - player.y, d = Math.hypot(dx, dy);
    if (d > 30) { ix = dx / d; iy = dy / d; }
  }
  const il = Math.hypot(ix, iy); if (il > 0) { ix /= il; iy /= il; }
  const road = onRoad(player.x, player.y);
  const MAX = road ? 300 : 235, ACC = 6;
  player.vx += (ix * MAX - player.vx) * Math.min(1, ACC * dt);
  player.vy += (iy * MAX - player.vy) * Math.min(1, ACC * dt);
  const tg = target();
  if (tg && !tg.garage) {
    const dx = tg.x - player.x, dy = tg.y - player.y, d = Math.hypot(dx, dy), MR = tg.r + MAGNET_EXTRA;
    if (d < MR) { const pull = 140 * (1 - d / MR) + 40; player.x += dx / d * pull * dt; player.y += dy / d * pull * dt; }
  }
  player.x += player.vx * dt; player.y += player.vy * dt;
  if (Math.hypot(player.vx, player.vy) > 25) {
    const want = Math.atan2(player.vy, player.vx);
    let da = want - player.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    player.a += da * Math.min(1, 10 * dt);
  }
  const R = 38, m = 50;
  if (player.x < m) { player.x = m; if (player.vx < -60) boing(now); player.vx = 0; }
  if (player.x > WW - m) { player.x = WW - m; if (player.vx > 60) boing(now); player.vx = 0; }
  if (player.y < m) { player.y = m; if (player.vy < -60) boing(now); player.vy = 0; }
  if (player.y > WH - m) { player.y = WH - m; if (player.vy > 60) boing(now); player.vy = 0; }
  OBST.forEach(o => {
    const dx = player.x - o.x, dy = player.y - o.y, d = Math.hypot(dx, dy), md = o.r + R;
    if (d < md && d > 0.01) {
      const nx = dx / d, ny = dy / d; player.x = o.x + nx * md; player.y = o.y + ny * md;
      const vn = player.vx * nx + player.vy * ny;
      if (vn < 0) {
        if (vn < -90) boing(now);
        player.vx -= vn * nx; player.vy -= vn * ny;
        if (il > 0) { // head-on push: glide around instead of getting stuck
          const into = -(ix * nx + iy * ny);
          if (into > 0.6) { const cr = iy * nx - ix * ny; const sgn = Math.abs(cr) < 0.05 ? 1 : Math.sign(cr); player.vx += -ny * sgn * 160; player.vy += nx * sgn * 160; }
        }
      }
    }
  });
  // roundabout laps: a little toot + sparkle for every full lap
  const rc = Math.hypot(player.x - C.x, player.y - C.y);
  if (Math.abs(rc - RING_R) < 85) {
    const a = Math.atan2(player.y - C.y, player.x - C.x);
    if (lap.last != null) { let da = a - lap.last; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; lap.acc += da; }
    lap.last = a;
    if (Math.abs(lap.acc) >= Math.PI * 2) { lap.acc = 0; laps++; SFX.honk(); boom(player.x, player.y, 40); say(['Round and round!', 'Wheee!', 'Zoom zoom!'][laps % 3], false); }
  } else { lap.last = null; lap.acc = 0; }
  if (tg && !tg.garage && Math.hypot(tg.x - player.x, tg.y - player.y) < tg.r) startAnim(player.loaded ? 'unload' : 'load');
  const g = GARAGE, onPad = Math.abs(player.x - g.x) < g.w / 2 && Math.abs(player.y - g.y) < g.h / 2;
  const offPad = Math.abs(player.x - g.x) > g.w / 2 + 30 || Math.abs(player.y - g.y) > g.h / 2 + 30;
  if (offPad && !player.loaded) padArmed = true;
  if (onPad && padArmed && !player.loaded && endTimer <= 0 && !allDone()) { padArmed = false; SFX.ding(); beginPick(false); }
}
function startAnim(kind) {
  const j = JOBS[player.veh];
  player.vx = player.vy = 0; lap.last = null; lap.acc = 0;
  anim = { kind, t: 0, dur: kind === 'load' ? 1.8 : 2.2, job: player.veh, st: ST[kind === 'load' ? j.from : j.to] };
  const v = player.veh;
  if (kind === 'load') { v === 'loader' ? SFX.rocks() : v === 'crane' ? SFX.clank() : SFX.load(); }
  else { v === 'mixer' ? SFX.pour() : v === 'loader' ? SFX.rocks() : v === 'crane' ? SFX.clank() : SFX.dump(); }
}
function runAnim(dt) {
  const a = anim; a.t += dt; const k = Math.min(1, a.t / a.dur);
  const st = a.st, dx = st.x - player.x, dy = st.y - player.y, d = Math.hypot(dx, dy);
  if (st.id !== 'tower' && d > 60) { player.x += dx * dt * 1.5; player.y += dy * dt * 1.5; }
  const v = player.veh;
  if (a.kind === 'load') {
    player.fill = k;
    if (v === 'loader' || v === 'digger' || v === 'crane') player.tilt = Math.sin(k * Math.PI);
    if (Math.random() < 0.6) stream(st, player, PCOL[JOBS[v].from], 2);
  } else {
    player.fill = 1 - k;
    player.tilt = Math.sin(Math.min(1, k * 1.25) * Math.PI);
    if (k < 0.85 && Math.random() < 0.7) stream(player, st, PCOL[JOBS[v].from], 3, 8);
  }
  if (a.t >= a.dur) finishAnim();
}
function finishAnim() {
  const a = anim; anim = null; const v = a.job, j = JOBS[v];
  player.tilt = 0;
  if (a.kind === 'load') { player.loaded = true; player.fill = 1; SFX.ding(); say(j.drop); return; }
  player.loaded = false; player.fill = 0; progress[v]++;
  if (progress[v] >= TRIPS) {
    SFX.cheer(); setTimeout(() => SFX.horn(), 400); boom(a.st.x, a.st.y); boom(player.x, player.y - 200, 80);
    if (allDone()) { say(j.built); endTimer = 4.5; }
    else { say(j.built + ' Go back to the garage and pick a new truck!'); padArmed = true; }
  } else {
    SFX.ding(); boom(a.st.x, a.st.y, 30);
    say(['Great job!', 'Yay!', 'Awesome!'][progress[v] % 3] + ' ' + j.more);
  }
}
function showEnd() {
  mode = 'end';
  $('endTitle').innerHTML = playerName ? `You built it, ${escapeHtml(playerName)}!<br>Good job!` : 'You built it!<br>Good job!';
  show('endOverlay', true); SFX.horn(); SFX.cheer();
  say(playerName ? `You built it, ${playerName}! Good job!` : 'You built it! Good job!');
  boom(WW / 2, WH / 2, 260);
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (now - t0) / 1000;
  update(dt, now);
  if (endTimer > 0) { endTimer -= dt; if (endTimer <= 0) showEnd(); }
  updateCam(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#5aa63e'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(cam.z, 0, 0, cam.z, -cam.x * cam.z, -cam.y * cam.z);
  drawGround(t); drawGarage(t); drawStations(t); drawObstacles(); drawTarget(t); drawPlayer(t); drawParticles(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (mode === 'drive') { drawEdgeArrow(t); drawMinimap(t); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
startName();

window.__tg = { get mode() { return mode; }, get player() { return player; }, get progress() { return progress; }, target, nextWaypoint, get anim() { return anim; }, get lastLine() { return lastLine; }, get cam() { return cam; }, get laps() { return laps; }, onRoad, ST, C, RING_R, WW, WH };
})();
