import { settings } from './store.js';

const TAP_MS = 240;        // longer than this is a press, not a tap
const TAP_SLOP = 7;        // px a finger may wander and still count as a tap
const DRAG_WINDOW = 300;   // tap, then touch again this soon = drag
const WHEEL_PER_PX = 3.2;  // 120 wheel units = one notch

/**
 * Laptop-style trackpad.
 *   one finger        move
 *   tap               left click
 *   two-finger tap    right click
 *   three-finger tap  middle click
 *   two-finger drag   scroll
 *   tap, then drag    drag (button held until you lift)
 * The two bars under the surface are plain left / right buttons.
 *
 * `rotated()` reports whether the UI is drawn sideways, so finger movement
 * can be turned to match.
 */
export class Trackpad {
  constructor({ surface, buttons, sound, send, rotated }) {
    this.surface = surface;
    this.sound = sound;
    this.send = send;
    this.rotated = rotated;

    this.touches = new Map(); // pointerId -> { x, y, dot }
    this.gesture = null;      // { start, fingers, moved, scrolled }
    this.dragging = false;
    this.lastTap = 0;
    this.pending = { mx: 0, my: 0, wy: 0, wx: 0 };
    this.frame = null;

    surface.addEventListener('pointerdown', (e) => this.#down(e));
    surface.addEventListener('pointermove', (e) => this.#move(e));
    surface.addEventListener('pointerup', (e) => this.#up(e));
    surface.addEventListener('pointercancel', (e) => this.#up(e));
    surface.addEventListener('contextmenu', (e) => e.preventDefault());

    buttons.forEach((el, index) => {
      const release = () => {
        if (!el.classList.contains('is-down')) return;
        el.classList.remove('is-down');
        this.send(['bu', index]);
        this.sound.tick(0.6);
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
        el.classList.add('is-down');
        this.send(['bd', index]);
        this.sound.tick(1);
        if (settings.haptics) navigator.vibrate?.(8);
      });
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  /** Screen movement -> movement in the UI's own frame. */
  #delta(dx, dy) { return this.rotated() ? [dy, -dx] : [dx, dy]; }

  #down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { this.surface.setPointerCapture(e.pointerId); } catch { /* gone */ }

    const dot = document.createElement('i');
    dot.className = 'touch';
    this.surface.append(dot);
    const touch = { x: e.clientX, y: e.clientY, t: e.timeStamp, dot };
    this.touches.set(e.pointerId, touch);
    this.#placeDot(touch);

    const now = performance.now();
    if (this.touches.size === 1) {
      this.gesture = { start: now, fingers: 1, travel: 0, scrolled: false };
      if (now - this.lastTap < DRAG_WINDOW) {
        this.dragging = true;
        this.send(['bd', 0]);
        this.surface.classList.add('is-dragging');
      }
    } else if (this.gesture) {
      this.gesture.fingers = Math.max(this.gesture.fingers, this.touches.size);
    }
  }

  #move(e) {
    const touch = this.touches.get(e.pointerId);
    if (!touch || !this.gesture) return;
    const [dx, dy] = this.#delta(e.clientX - touch.x, e.clientY - touch.y);
    const dt = Math.max(1, e.timeStamp - touch.t);
    touch.x = e.clientX;
    touch.y = e.clientY;
    touch.t = e.timeStamp;
    this.#placeDot(touch);

    const g = this.gesture;
    g.travel += Math.hypot(dx, dy);
    if (g.travel < TAP_SLOP) return; // don't jiggle the pointer on a tap

    if (this.touches.size >= 2) {
      // Each finger reports half the motion, so two fingers add up to one.
      const share = 1 / this.touches.size;
      const dir = settings.natural ? 1 : -1;
      this.pending.wy += dy * share * WHEEL_PER_PX * dir;
      this.pending.wx += -dx * share * WHEEL_PER_PX * dir;
      g.scrolled = true;
    } else if (!g.scrolled) {
      // Pointer acceleration: slow strokes are precise, fast ones cover ground.
      const speed = Math.hypot(dx, dy) / dt; // px per ms
      const gain = settings.speed * (0.7 + Math.min(speed, 3) * 0.9);
      this.pending.mx += dx * gain;
      this.pending.my += dy * gain;
    }
    this.frame ??= setTimeout(() => this.#flush(), 8);
  }

  #up(e) {
    const touch = this.touches.get(e.pointerId);
    if (!touch) return;
    touch.dot.remove();
    this.touches.delete(e.pointerId);
    if (this.touches.size > 0 || !this.gesture) return;

    const g = this.gesture;
    this.gesture = null;
    const now = performance.now();
    const tapped = g.travel < TAP_SLOP && now - g.start < TAP_MS;

    if (this.dragging) {
      this.dragging = false;
      this.surface.classList.remove('is-dragging');
      this.send(['bu', 0]);
      if (tapped) this.#click(0); // tap-tap = double click
      return;
    }
    if (!tapped) return;
    this.#click(Math.min(g.fingers, 3) - 1); // 1, 2, 3 fingers = left, right, middle
    if (g.fingers === 1) this.lastTap = now;
  }

  #click(button) {
    this.send(['bd', button]);
    this.send(['bu', button]);
    this.sound.tick(1);
    if (settings.haptics) navigator.vibrate?.(8);
  }

  // Batch into one move and one scroll every 8 ms, keeping the fractions.
  // (A timer, not requestAnimationFrame: frames stop when the page is covered.)
  #flush() {
    this.frame = null;
    const p = this.pending;
    const mx = Math.trunc(p.mx), my = Math.trunc(p.my);
    if (mx || my) { this.send(['m', mx, my]); p.mx -= mx; p.my -= my; }
    const wy = Math.trunc(p.wy), wx = Math.trunc(p.wx);
    if (wy || wx) { this.send(['w', wy, wx]); p.wy -= wy; p.wx -= wx; }
  }

  #placeDot(touch) {
    // Position within the surface, in the UI's own frame.
    const box = this.surface.getBoundingClientRect();
    let x = touch.x - box.left, y = touch.y - box.top;
    if (this.rotated()) [x, y] = [y, box.width - x];
    touch.dot.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Drop everything, e.g. when the pad is hidden mid-gesture. */
  reset() {
    for (const { dot } of this.touches.values()) dot.remove();
    this.touches.clear();
    this.gesture = null;
    if (this.dragging) { this.dragging = false; this.send(['bu', 0]); }
    this.surface.classList.remove('is-dragging');
  }
}
