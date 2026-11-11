import { EventEmitter } from 'node:events';
import { WindowsDriver, WINDOWS_KEYS } from './windows.js';

/** Logs input instead of injecting it. Used by --dry-run. */
class DryDriver extends EventEmitter {
  name = 'dry-run';
  ready = Promise.resolve();
  #keys = new Set(WINDOWS_KEYS);
  #caps = false;
  #moved = 0;
  #moveTimer = null;

  hasKey(code) { return this.#keys.has(code); }
  key(code, down) {
    console.log(`  ${down ? '▼' : '▲'} ${code}`);
    if (code === 'CapsLock' && down) this.#caps = !this.#caps;
  }
  move(dx, dy) {
    this.#moved += Math.hypot(dx, dy);
    this.#moveTimer ??= setTimeout(() => {
      console.log(`  ↔ pointer moved ${Math.round(this.#moved)}px`);
      this.#moved = 0;
      this.#moveTimer = null;
    }, 500);
  }
  button(index, down) { console.log(`  ${down ? '▼' : '▲'} mouse ${['left', 'right', 'middle'][index]}`); }
  wheel(dy, dx) { console.log(`  ↕ wheel ${dy}${dx ? ` / ${dx}` : ''}`); }
  queryCaps() { this.emit('caps', this.#caps); }
  close() { clearTimeout(this.#moveTimer); }
}

export function createDriver({ dryRun }) {
  if (dryRun) return new DryDriver();
  if (process.platform === 'win32') return new WindowsDriver();
  throw new Error(
    `Typing into this computer is only implemented for Windows so far (this is ${process.platform}).\n` +
    '  Run with --dry-run to try the phone UI without controlling anything.',
  );
}
