import { config } from './config.js';
import { rooms } from './rooms/index.js';
import { View } from './view.js';
import { World } from './world.js';
import { UI } from './ui.js';
import { buildDebugPanel } from './debug.js';

const canvas = document.getElementById('game');
const debugEl = document.getElementById('debug');
const view = new View(canvas);

let roomIndex = -1;
let drag = null;

const world = new World(view, (type, data) => {
  if (type === 'loaded' || type === 'dead') drag = null;
  ui.onEvent(type, data, world, roomIndex);
});

const ui = new UI({
  rooms,
  onSelectRoom: selectRoom,
  onFire: () => world.pressFire(),
  onBack: () => selectRoom(-1),
  onRestart: () => { if (world.room) world.load(world.room); },
  onToggleDebug: () => debugEl.classList.toggle('hidden'),
});

function selectRoom(i) {
  roomIndex = i;
  drag = null;
  if (i < 0) {
    world.room = null;
    view.clear();
    ui.showMenu();
    return;
  }
  ui.showHud();
  world.load(rooms[i]);
}

buildDebugPanel(debugEl, config, {
  onRestart: () => { if (world.room) world.load(world.room); },
  onClose: () => debugEl.classList.add('hidden'),
  onChange: (path) => { if (path.startsWith('camera')) view.applyCameraConfig(); },
});
if (new URLSearchParams(location.search).has('debug')) debugEl.classList.remove('hidden');

// ---------- Relative drag-to-move ----------
canvas.addEventListener('pointerdown', (ev) => {
  if (!world.room || world.state !== 'playing') return;
  const w = view.screenToWorld(ev.clientX, ev.clientY);
  if (!w) return;
  if (world.fire.mode === 'selecting') { world.selectAt(w.x, w.y); return; }
  if (drag) return;
  drag = { id: ev.pointerId, sx: w.x, sy: w.y, px: world.player.x, py: world.player.y };
  canvas.setPointerCapture?.(ev.pointerId);
});

canvas.addEventListener('pointermove', (ev) => {
  if (!drag || ev.pointerId !== drag.id || !world.room) return;
  const w = view.screenToWorld(ev.clientX, ev.clientY);
  if (!w) return;
  const s = config.player.dragSensitivity;
  world.setMoveTarget(drag.px + (w.x - drag.sx) * s, drag.py + (w.y - drag.sy) * s);
});

const endDrag = (ev) => {
  if (!drag || ev.pointerId !== drag.id) return;
  drag = null;
  if (world.room) world.holdPosition();
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
document.addEventListener('touchmove', (ev) => {
  if (!debugEl.contains(ev.target) && !document.getElementById('menu').contains(ev.target)) ev.preventDefault();
}, { passive: false });

// Desktop convenience: space = FIRE/STOP
window.addEventListener('keydown', (ev) => {
  if (ev.code === 'Space' && world.room && !(ev.target instanceof HTMLInputElement)) {
    ev.preventDefault();
    world.pressFire();
  }
});

// ---------- Loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
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
