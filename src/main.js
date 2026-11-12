import { config } from './config.js';
import levels from './level.js';
import { View } from './view.js';
import { World } from './world.js';
import { UI } from './ui.js';
import { Joystick } from './joystick.js';
import { buildDebugPanel } from './debug.js';

const canvas = document.getElementById('game');
const debugEl = document.getElementById('debug');
const view = new View(canvas);
const stick = new Joystick(document.getElementById('joy'), document.getElementById('joy-knob'));

const world = new World(view, (type, data) => {
  if (type === 'loaded' || type === 'dead') stick.end();
  ui.onEvent(type, data, world);
});

const ui = new UI({
  levels,
  onPlay: play,
  onMenu: menu,
  onFirePress: () => world.firePress(),
  onFireRelease: () => world.fireRelease(),
  onRestart: () => { if (world.room) world.load(world.room); },
  onToggleDebug: () => debugEl.classList.toggle('hidden'),
});

function play(i = 0) {
  goFullscreen();
  ui.showHud();
  world.load(levels[i] || levels[0]);
}

// Fullscreen where the browser allows it (Android, iPad, desktop). iPhone Safari
// doesn't let pages go fullscreen; there the Home Screen web app is the way.
function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  try {
    if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch { /* not allowed here */ }
}

const standalone = navigator.standalone || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
if (!standalone && /iPhone|iPod/.test(navigator.userAgent)) {
  document.getElementById('ios-hint').classList.remove('hidden');
}

function menu() {
  stick.end();
  world.room = null;
  view.clear();
  ui.showMenu();
}

buildDebugPanel(debugEl, config, {
  onRestart: () => { if (world.room) world.load(world.room); },
  onClose: () => debugEl.classList.add('hidden'),
  onChange: (path) => { if (path.startsWith('camera')) view.applyCameraConfig(); },
});
if (new URLSearchParams(location.search).has('debug')) debugEl.classList.remove('hidden');

// ---------- Touch / mouse: joystick, or target selection during time-stop ----------
canvas.addEventListener('pointerdown', (ev) => {
  if (!world.room || world.state !== 'playing') return;
  if (stick.start(ev)) canvas.setPointerCapture?.(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => stick.move(ev));
canvas.addEventListener('pointerup', (ev) => stick.end(ev));
canvas.addEventListener('pointercancel', (ev) => stick.end(ev));
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
document.addEventListener('touchmove', (ev) => {
  if (!debugEl.contains(ev.target) && !document.getElementById('menu').contains(ev.target)) ev.preventDefault();
}, { passive: false });

// ---------- Keyboard (desktop) ----------
const keys = new Set();
window.addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement) return;
  if (ev.code === 'Space') {
    ev.preventDefault();
    if (world.room && !ev.repeat) world.firePress();
    return;
  }
  keys.add(ev.code);
});
window.addEventListener('keyup', (ev) => {
  if (ev.code === 'Space') world.fireRelease();
  keys.delete(ev.code);
});
window.addEventListener('blur', () => { keys.clear(); world.fireRelease(); });

function readInput() {
  if (stick.active) return [stick.x, stick.y];
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  const m = Math.hypot(x, y);
  return m > 0 ? [x / m, y / m] : [0, 0];
}

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (world.room) world.setMoveInput(...readInput());
  world.update(dt);
  view.sync(world, dt);
  ui.update(world);
  view.render();
  requestAnimationFrame(frame);
}
ui.showMenu();
requestAnimationFrame(frame);

// Handy for poking at the game from the console.
window.mm = { world, view, config };
