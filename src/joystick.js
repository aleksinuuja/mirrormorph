// Floating virtual joystick: touch anywhere, the base appears under the finger,
// the knob follows the thumb. Output is a velocity, so holding still keeps moving.
import { config } from './config.js';

export class Joystick {
  constructor(baseEl, knobEl) {
    this.base = baseEl;
    this.knob = knobEl;
    this.id = null;
    this.ox = 0; this.oy = 0;
    this.x = 0; this.y = 0; // output, y = up the screen
  }

  get active() { return this.id !== null; }

  start(ev) {
    if (this.id !== null) return false;
    this.id = ev.pointerId;
    this.ox = ev.clientX;
    this.oy = ev.clientY;
    this.base.style.left = `${this.ox}px`;
    this.base.style.top = `${this.oy}px`;
    this.base.classList.add('on');
    this.set(0, 0);
    return true;
  }

  move(ev) {
    if (ev.pointerId !== this.id) return;
    const R = config.controls.joystickRadius;
    let dx = ev.clientX - this.ox, dy = ev.clientY - this.oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    this.set(dx, dy);
  }

  end(ev) {
    if (ev && ev.pointerId !== this.id) return;
    this.id = null;
    this.base.classList.remove('on');
    this.set(0, 0);
  }

  set(dx, dy) {
    const R = config.controls.joystickRadius;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const m = Math.hypot(dx, dy) / R;
    const dz = config.controls.deadzone;
    if (m <= dz) { this.x = this.y = 0; return; }
    const k = Math.min(1, (m - dz) / (1 - dz)) / m; // rescale so output starts at 0 past the dead zone
    this.x = (dx / R) * k;
    this.y = (-dy / R) * k;
  }
}
