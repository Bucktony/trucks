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

// ---------- world ----------
const COLORS = [
  ['red', '#e53935'], ['blue', '#1e88e5'], ['green', '#43a047'], ['pink', '#ff6fb5'],
  ['yellow', '#fdd835'], ['orange', '#fb8c00'], ['purple', '#8e44ad']];
const GARAGE = { x: 640, y: 270, w: 230, h: 150 };
const ST = {
  dirt:   { x: 165, y: 140, label: 'dirt' },
  hole:   { x: 1110, y: 140 },
  rocks:  { x: 165, y: 410 },
  tower:  { x: 1110, y: 410 },
  plant:  { x: 165, y: 665 },
  slab:   { x: 1110, y: 665 },
};
const JOBS = {
  dump:  { name: 'dump truck', from: 'dirt', to: 'hole', thing: 'road',
           get: 'Go get the dirt!', drop: 'Now dump it in the hole!', more: 'Go get more dirt!', built: 'Hooray! You built a road!' },
  loader:{ name: 'loader', from: 'rocks', to: 'tower', thing: 'tower',
           get: 'Go scoop up the rocks!', drop: 'Now drop the rocks here!', more: 'Go get more rocks!', built: 'Hooray! You built a tower!' },
  mixer: { name: 'cement mixer', from: 'plant', to: 'slab', thing: 'house',
           get: 'Go get the cement!', drop: 'Now pour it here!', more: 'Go get more cement!', built: 'Hooray! You built a house!' },
};
const VEH_ORDER = ['dump', 'loader', 'mixer'];
const TRIPS = 3;
const ARRIVE_R = 105, MAGNET_R = 200;
const OBST = [ // trees & cones: soft circles
  { x: 72, y: 275, r: 34, k: 'tree' }, { x: 1208, y: 275, r: 34, k: 'tree' },
  { x: 400, y: 540, r: 34, k: 'tree' }, { x: 880, y: 540, r: 34, k: 'tree' },
  { x: 640, y: 540, r: 22, k: 'cone' }, { x: 640, y: 760, r: 30, k: 'tree' },
];

let progress, carColor, player, mode, padArmed, particles, confetti, playerName, t0 = performance.now();
let anim = null; // {kind:'load'|'unload'|'build', t, dur, job}
let endTimer = 0;
function freshProgress() { return { dump: 0, loader: 0, mixer: 0 }; }
function reset() {
  progress = freshProgress();
  carColor = LS.get('colors', { dump: '#e53935', loader: '#e53935', mixer: '#e53935' });
  player = { x: GARAGE.x, y: GARAGE.y + 10, a: Math.PI / 2 * 0 + Math.PI, vx: 0, vy: 0, veh: 'dump', loaded: false, fill: 0, tilt: 0, drum: 0, bump: 0 };
  particles = []; confetti = []; anim = null; padArmed = false; endTimer = 0;
}
reset();

function target() {
  if (mode !== 'drive') return null;
  const j = JOBS[player.veh];
  if (progress[player.veh] < TRIPS) return ST[player.loaded ? j.to : j.from];
  if (allDone()) return null;
  return { x: GARAGE.x, y: GARAGE.y, garage: true };
}
const allDone = () => VEH_ORDER.every(v => progress[v] >= TRIPS);

// ---------- input ----------
const keys = {};
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.key.startsWith('Arrow')) { keys[e.key] = true; e.preventDefault(); ac(); }
});
addEventListener('keyup', e => { if (e.key.startsWith('Arrow')) keys[e.key] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
let pointerGoal = null;
function toLogical(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
cv.addEventListener('pointerdown', e => { ac(); pointerGoal = toLogical(e); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => { if (pointerGoal) pointerGoal = toLogical(e); });
const endPtr = () => { pointerGoal = null; };
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);

$('sayBtn').onclick = () => { ac(); SFX.pop(); if (lastLine) say(lastLine); };
function drawMute() { $('muteBtn').textContent = muted ? '🔇' : '🎵'; }
drawMute();
$('muteBtn').onclick = () => { muted = !muted; LS.set('muted', muted); drawMute(); if (muted) try { speechSynthesis.cancel(); } catch (e) {} else SFX.pop(); };

// ---------- overlays ----------
function show(id, on) { $(id).classList.toggle('show', on); }
function startName() {
  playerName = LS.get('name', '');
  if (playerName) { mode = 'pre'; beginPick(true); return; }
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
  const c = document.createElement('canvas'); c.width = 286; c.height = 236; b.appendChild(c);
  const ck = document.createElement('div'); ck.className = 'check'; ck.textContent = '✔'; b.appendChild(ck);
  b.onclick = () => { ac(); SFX.honk(); chooseVehicle(v); };
  b.onmouseenter = () => SFX.pop();
  vehRow.appendChild(b);
});
function iconVehicle(c, v, color, bed = 0) {
  const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
  const sc = c.width / 130; g.save(); g.translate(c.width / 2 - 8 * sc, c.height / 2); g.scale(sc, sc);
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
  player.veh = pendingVeh; player.loaded = false; player.fill = 0;
  show('colorOverlay', false); mode = 'drive'; padArmed = false;
  const j = JOBS[pendingVeh];
  if (progress[pendingVeh] >= TRIPS) say(allDone() ? 'Drive around and look at what you built!' : `You already built the ${j.thing}! Drive back to the garage for a new truck!`);
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

// ---------- site drawing ----------
function drawGround(t) {
  ctx.fillStyle = '#7cc95a'; ctx.fillRect(0, 0, W, H);
  // dirt work area
  ctx.fillStyle = '#e8c88f'; rr(ctx, 40, 40, W - 80, H - 80, 60); ctx.fill();
  ctx.fillStyle = 'rgba(160,110,60,.12)';
  for (let i = 0; i < 60; i++) { const x = (i * 197) % 1180 + 50, y = (i * 113) % 700 + 50; ctx.beginPath(); ctx.arc(x, y, 6 + (i % 5) * 2, 0, 7); ctx.fill(); }
  // tire tracks (lanes)
  ctx.strokeStyle = 'rgba(140,95,50,.18)'; ctx.lineWidth = 10; ctx.setLineDash([18, 14]);
  [140, 410, 665].forEach(y => { ctx.beginPath(); ctx.moveTo(240, y - 18); ctx.lineTo(1030, y - 18); ctx.moveTo(240, y + 18); ctx.lineTo(1030, y + 18); ctx.stroke(); });
  ctx.setLineDash([]);
  // fence posts around edge
  ctx.fillStyle = '#ff9800';
  for (let x = 70; x < W - 40; x += 70) { ctx.fillRect(x, 26, 22, 10); ctx.fillRect(x, H - 36, 22, 10); }
}
function drawObstacles() {
  OBST.forEach(o => {
    if (o.k === 'tree') {
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.arc(o.x + 6, o.y + 8, o.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#2e7d32'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#43a047'; ctx.beginPath(); ctx.arc(o.x - 9, o.y - 9, o.r * 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#66bb6a'; ctx.beginPath(); ctx.arc(o.x - 13, o.y - 13, o.r * 0.25, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.arc(o.x + 4, o.y + 5, o.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff6d00'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.62, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff6d00'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.35, 0, 7); ctx.fill();
    }
  });
}
function drawGarage(t) {
  const g = GARAGE;
  ctx.fillStyle = '#90a4ae'; rr(ctx, g.x - g.w / 2, g.y - g.h / 2, g.w, g.h, 24); ctx.fill();
  // stripes
  ctx.save(); rr(ctx, g.x - g.w / 2, g.y - g.h / 2, g.w, g.h, 24); ctx.clip();
  ctx.fillStyle = '#ffd54f';
  for (let i = -300; i < 300; i += 40) { ctx.beginPath(); ctx.moveTo(g.x + i, g.y - g.h / 2); ctx.lineTo(g.x + i + 20, g.y - g.h / 2); ctx.lineTo(g.x + i - 30, g.y + g.h / 2); ctx.lineTo(g.x + i - 50, g.y + g.h / 2); ctx.fill(); }
  ctx.fillStyle = '#78909c'; rr(ctx, g.x - g.w / 2 + 16, g.y - g.h / 2 + 16, g.w - 32, g.h - 32, 16); ctx.fill();
  ctx.restore();
  // roof building on top edge
  ctx.fillStyle = '#d84315'; rr(ctx, g.x - 90, g.y - g.h / 2 - 44, 180, 46, 12); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🔧 🚚 🔧', g.x, g.y - g.h / 2 - 20);
  // little parked icons for done jobs
  VEH_ORDER.forEach((v, i) => {
    if (progress[v] >= TRIPS) { ctx.font = '30px sans-serif'; ctx.fillText('✅', g.x - 60 + i * 60, g.y + g.h / 2 - 10); }
  });
}
function drawPile(s, col1, col2, n, sz) {
  for (let i = 0; i < n; i++) {
    const a = i * 2.39, r = Math.sqrt(i) * sz * 0.9;
    ctx.fillStyle = i % 3 ? col1 : col2;
    ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r * 0.85, sz * (1.15 - i / n * 0.5), 0, 7); ctx.fill();
  }
}
function drawStations(t) {
  const P = progress;
  // DIRT PILE
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(ST.dirt.x + 8, ST.dirt.y + 10, 80, 62, 0, 0, 7); ctx.fill();
  drawPile(ST.dirt, '#8d5a2b', '#a86d38', 22, 17);
  // HOLE -> ROAD
  const h = ST.hole, fp = Math.min(P.dump, TRIPS) / TRIPS;
  if (P.dump >= TRIPS) {
    ctx.fillStyle = '#455a64'; rr(ctx, h.x - 120, h.y - 55, 240, 110, 20); ctx.fill();
    ctx.fillStyle = '#fff'; for (let x = -100; x < 100; x += 50) ctx.fillRect(h.x + x, h.y - 6, 30, 12);
    ctx.fillStyle = '#ffeb3b'; ctx.fillRect(h.x - 120, h.y - 55, 240, 6); ctx.fillRect(h.x - 120, h.y + 49, 240, 6);
  } else {
    ctx.fillStyle = '#5d3a1a'; ctx.beginPath(); ctx.ellipse(h.x, h.y, 95, 62, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3e2610'; ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, 80 * (1 - fp * 0.6), 50 * (1 - fp * 0.6), 0, 0, 7); ctx.fill();
    if (fp > 0) { ctx.fillStyle = '#8d5a2b'; ctx.beginPath(); ctx.ellipse(h.x, h.y, 88 * fp + 6, 56 * fp + 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#3e2610'; ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, 80 * (1 - fp), 50 * (1 - fp), 0, 0, 7); ctx.fill(); }
  }
  // ROCK PILE
  ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(ST.rocks.x + 8, ST.rocks.y + 10, 80, 62, 0, 0, 7); ctx.fill();
  drawPile(ST.rocks, '#8a8f99', '#b0b6c0', 20, 17);
  // TOWER SPOT
  const tw = ST.tower, n = Math.min(P.loader, TRIPS);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.setLineDash([14, 10]); rr(ctx, tw.x - 70, tw.y - 70, 140, 140, 14); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 0; i < n; i++) { // stacked layers (top-down: shrinking squares, offset for 3D)
    const s = 130 - i * 30, o = -i * 8;
    ctx.fillStyle = 'rgba(0,0,0,.2)'; rr(ctx, tw.x - s / 2 + 6, tw.y - s / 2 + o + 8, s, s, 10); ctx.fill();
    ctx.fillStyle = ['#8a8f99', '#9ea4ad', '#b8bec6'][i]; rr(ctx, tw.x - s / 2, tw.y - s / 2 + o, s, s, 10); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(tw.x - s / 3 + k * s / 4.5, tw.y + o - s / 4 + (k % 2) * s / 3, 7, 0, 7); ctx.fill(); }
  }
  if (P.loader >= TRIPS) { // flag
    ctx.fillStyle = '#5d4037'; ctx.fillRect(tw.x - 3, tw.y - 95, 6, 70);
    ctx.fillStyle = '#e53935'; ctx.beginPath(); ctx.moveTo(tw.x + 3, tw.y - 95); ctx.lineTo(tw.x + 3 + 44 + Math.sin(t * 6) * 5, tw.y - 82); ctx.lineTo(tw.x + 3, tw.y - 68); ctx.fill();
  }
  // CEMENT PLANT
  const pl = ST.plant;
  ctx.fillStyle = 'rgba(0,0,0,.15)'; rr(ctx, pl.x - 62, pl.y - 52, 130, 114, 14); ctx.fill();
  ctx.fillStyle = '#b0bec5'; rr(ctx, pl.x - 70, pl.y - 60, 130, 114, 14); ctx.fill();
  ctx.fillStyle = '#eceff1'; ctx.beginPath(); ctx.arc(pl.x - 28, pl.y - 18, 36, 0, 7); ctx.fill();
  ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(pl.x - 28, pl.y - 18, 24, 0, 7); ctx.stroke();
  ctx.fillStyle = '#ffb300'; rr(ctx, pl.x + 10, pl.y - 6, 60, 22, 6); ctx.fill(); // chute
  ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🏭', pl.x - 28, pl.y + 34);
  // SLAB -> HOUSE
  const sb = ST.slab, sp = Math.min(P.mixer, TRIPS) / TRIPS;
  ctx.fillStyle = '#c8a26a'; ctx.fillRect(sb.x - 80, sb.y - 65, 160, 130);
  ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = 10; ctx.strokeRect(sb.x - 80, sb.y - 65, 160, 130);
  if (sp > 0) { ctx.fillStyle = '#bdbdbd'; ctx.fillRect(sb.x - 75, sb.y + 60 - 120 * sp, 150, 120 * sp); }
  if (P.mixer >= TRIPS) {
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(sb.x - 66, sb.y - 50, 140, 116);
    ctx.fillStyle = '#fff3e0'; ctx.fillRect(sb.x - 72, sb.y - 58, 140, 116);
    ctx.fillStyle = '#e53935'; // roof (top-down hip roof)
    ctx.beginPath(); ctx.moveTo(sb.x - 82, sb.y - 68); ctx.lineTo(sb.x + 78, sb.y - 68); ctx.lineTo(sb.x + 30, sb.y); ctx.lineTo(sb.x - 34, sb.y); ctx.fill();
    ctx.fillStyle = '#c62828';
    ctx.beginPath(); ctx.moveTo(sb.x - 82, sb.y + 68); ctx.lineTo(sb.x + 78, sb.y + 68); ctx.lineTo(sb.x + 30, sb.y); ctx.lineTo(sb.x - 34, sb.y); ctx.fill();
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath(); ctx.moveTo(sb.x - 82, sb.y - 68); ctx.lineTo(sb.x - 34, sb.y); ctx.lineTo(sb.x - 82, sb.y + 68); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sb.x + 78, sb.y - 68); ctx.lineTo(sb.x + 30, sb.y); ctx.lineTo(sb.x + 78, sb.y + 68); ctx.fill();
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(sb.x + 40, sb.y - 50, 16, 22); // chimney
    ctx.font = '34px sans-serif'; ctx.fillText('💛', sb.x - 2, sb.y + 2);
  }
}
function drawTarget(t) {
  const tg = target(); if (!tg) return;
  const p = (Math.sin(t * 5) + 1) / 2;
  ctx.save();
  ctx.shadowColor = '#fff176'; ctx.shadowBlur = 30;
  ctx.strokeStyle = `rgba(255,235,59,${0.55 + p * 0.45})`; ctx.lineWidth = 10 + p * 6;
  ctx.beginPath(); ctx.arc(tg.x, tg.y, ARRIVE_R - 6 + p * 12, 0, 7); ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${0.7 - p * 0.5})`; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(tg.x, tg.y, ARRIVE_R + 14 + p * 30, 0, 7); ctx.stroke();
  ctx.restore();
  // bouncing arrow above
  const by = tg.y - ARRIVE_R - 40 - Math.abs(Math.sin(t * 4)) * 26;
  const ay = Math.max(70, by);
  ctx.save(); ctx.translate(tg.x, ay);
  ctx.fillStyle = '#ff1744'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-30, -40); ctx.lineTo(30, -40); ctx.lineTo(30, -8); ctx.lineTo(46, -8); ctx.lineTo(0, 34); ctx.lineTo(-46, -8); ctx.lineTo(-30, -8); ctx.closePath();
  ctx.stroke(); ctx.fill(); ctx.restore();
  // little pointer next to the truck
  const dx = tg.x - player.x, dy = tg.y - player.y, d = Math.hypot(dx, dy);
  if (d > MAGNET_R) {
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
  const wob = sp > 20 ? Math.sin(t * 30) * 0.8 : 0;
  ctx.translate(0, wob); ctx.rotate(player.a);
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
  confetti = confetti.filter(p => (p.life -= dt) > 0 && p.y < H + 20);
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
    confetti.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 300, c: cols[i % cols.length], life: 3 + Math.random() * 1.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
  }
}

// ---------- physics ----------
let lastBoing = 0;
function boing(now) { player.bump = 1; if (now - lastBoing > 700) { lastBoing = now; SFX.boing(); } }
const PCOL = { dirt: ['#8d5a2b', '#a86d38'], rocks: ['#8a8f99', '#b0b6c0'], plant: ['#9e9e9e', '#bdbdbd'] };
function update(dt, now) {
  player.bump = Math.max(0, player.bump - dt * 4);
  if (player.veh === 'mixer') player.drum += dt * (player.loaded || anim ? 2.2 : 0.4);
  if (anim) { runAnim(dt, now); return; }
  if (mode !== 'drive') { player.vx *= 0.8; player.vy *= 0.8; return; }
  let ix = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  let iy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
  if (!ix && !iy && pointerGoal) {
    const dx = pointerGoal.x - player.x, dy = pointerGoal.y - player.y, d = Math.hypot(dx, dy);
    if (d > 30) { ix = dx / d; iy = dy / d; }
  }
  const il = Math.hypot(ix, iy); if (il > 0) { ix /= il; iy /= il; }
  const MAX = 270, ACC = 6;
  player.vx += (ix * MAX - player.vx) * Math.min(1, ACC * dt);
  player.vy += (iy * MAX - player.vy) * Math.min(1, ACC * dt);
  // magnet
  const tg = target();
  if (tg && !tg.garage) {
    const dx = tg.x - player.x, dy = tg.y - player.y, d = Math.hypot(dx, dy);
    if (d < MAGNET_R) { const pull = 140 * (1 - d / MAGNET_R) + 40; player.x += dx / d * pull * dt; player.y += dy / d * pull * dt; }
  }
  player.x += player.vx * dt; player.y += player.vy * dt;
  const sp = Math.hypot(player.vx, player.vy);
  if (sp > 25) { // turn smoothly to face motion
    const want = Math.atan2(player.vy, player.vx);
    let da = want - player.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    player.a += da * Math.min(1, 10 * dt);
  }
  // collisions (soft)
  const R = 38, m = 62;
  if (player.x < m) { player.x = m; if (player.vx < -60) boing(now); player.vx = 0; }
  if (player.x > W - m) { player.x = W - m; if (player.vx > 60) boing(now); player.vx = 0; }
  if (player.y < m) { player.y = m; if (player.vy < -60) boing(now); player.vy = 0; }
  if (player.y > H - m) { player.y = H - m; if (player.vy > 60) boing(now); player.vy = 0; }
  OBST.forEach(o => {
    const dx = player.x - o.x, dy = player.y - o.y, d = Math.hypot(dx, dy), md = o.r + R;
    if (d < md && d > 0.01) {
      const nx = dx / d, ny = dy / d; player.x = o.x + nx * md; player.y = o.y + ny * md;
      const vn = player.vx * nx + player.vy * ny;
      if (vn < 0) {
        if (vn < -90) boing(now);
        player.vx -= vn * nx; player.vy -= vn * ny; // slide around
        // head-on push: nudge sideways so he glides around instead of getting stuck
        if (il > 0) {
          const into = -(ix * nx + iy * ny);
          if (into > 0.6) { let cr = iy * nx - ix * ny; const sgn = Math.abs(cr) < 0.05 ? 1 : Math.sign(cr); player.vx += -ny * sgn * 160; player.vy += nx * sgn * 160; }
        }
      }
    }
  });
  // arrivals
  if (tg && !tg.garage) {
    if (Math.hypot(tg.x - player.x, tg.y - player.y) < ARRIVE_R) startAnim(player.loaded ? 'unload' : 'load');
  }
  // garage pad
  const g = GARAGE, onPad = Math.abs(player.x - g.x) < g.w / 2 && Math.abs(player.y - g.y) < g.h / 2;
  const offPad = Math.abs(player.x - g.x) > g.w / 2 + 30 || Math.abs(player.y - g.y) > g.h / 2 + 30;
  if (offPad && !player.loaded) padArmed = true;
  if (onPad && padArmed && !player.loaded && endTimer <= 0 && !(allDone() && mode !== 'drive')) { padArmed = false; SFX.ding(); beginPick(false); }
}
function startAnim(kind) {
  const j = JOBS[player.veh];
  player.vx = player.vy = 0;
  anim = { kind, t: 0, dur: kind === 'load' ? 1.8 : 2.2, job: player.veh, st: ST[kind === 'load' ? j.from : j.to] };
  if (kind === 'load') { player.veh === 'loader' ? SFX.rocks() : SFX.load(); }
  else { player.veh === 'mixer' ? SFX.pour() : player.veh === 'dump' ? SFX.dump() : SFX.rocks(); }
}
function runAnim(dt, now) {
  const a = anim; a.t += dt; const k = Math.min(1, a.t / a.dur);
  // ease truck toward the station a bit so it looks parked
  const st = a.st, dx = st.x - player.x, dy = st.y - player.y, d = Math.hypot(dx, dy);
  if (d > 60) { player.x += dx * dt * 1.5; player.y += dy * dt * 1.5; }
  const v = player.veh;
  if (a.kind === 'load') {
    player.fill = k;
    if (v === 'loader') player.tilt = Math.sin(k * Math.PI);
    if (Math.random() < 0.6) stream(st, player, PCOL[JOBS[v].from], 2);
  } else if (a.kind === 'unload') {
    player.fill = 1 - k;
    player.tilt = Math.sin(Math.min(1, k * 1.25) * Math.PI);
    if (k < 0.85 && Math.random() < 0.7) stream(player, st, PCOL[JOBS[v].from], 3, 8);
  }
  if (a.t >= a.dur) finishAnim();
}
function finishAnim() {
  const a = anim; anim = null; const v = a.job, j = JOBS[v];
  player.tilt = 0;
  if (a.kind === 'load') {
    player.loaded = true; player.fill = 1; SFX.ding(); say(j.drop);
  } else {
    player.loaded = false; player.fill = 0; progress[v]++;
    if (progress[v] >= TRIPS) {
      SFX.cheer(); setTimeout(() => SFX.horn(), 400); boom(a.st.x, a.st.y); boom(W / 2, H / 3, 80);
      if (allDone()) { say(j.built); endTimer = 4.2; }
      else { say(j.built + ' Go back to the garage and pick a new truck!'); padArmed = true; }
    } else {
      SFX.ding(); for (let i = 0; i < 30; i++) boom(a.st.x, a.st.y, 1);
      say(['Great job!', 'Yay!', 'Awesome!'][progress[v] % 3] + ' ' + j.more);
    }
  }
}
function showEnd() {
  mode = 'end';
  $('endTitle').innerHTML = playerName ? `You built it, ${escapeHtml(playerName)}!<br>Good job!` : 'You built it!<br>Good job!';
  show('endOverlay', true); SFX.horn(); SFX.cheer();
  say(playerName ? `You built it, ${playerName}! Good job!` : 'You built it! Good job!');
  boom(W / 2, H / 2, 220);
}
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (now - t0) / 1000;
  update(dt, now);
  if (endTimer > 0) { endTimer -= dt; if (endTimer <= 0) showEnd(); }
  drawGround(t); drawGarage(t); drawStations(t); drawObstacles(); drawTarget(t); drawPlayer(t); drawParticles(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
startName();

// test hook
window.__tg = { get mode() { return mode; }, get player() { return player; }, get progress() { return progress; }, target, get anim() { return anim; }, get lastLine() { return lastLine; } };
})();
