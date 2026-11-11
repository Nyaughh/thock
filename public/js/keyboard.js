import { LAYOUTS, FN, MODIFIERS, LABELS, legendHTML, keyGroup, rowUnits, rowTemplate, rowLine } from './layouts.js';
import { settings } from './store.js';

const REPEAT_DELAY = 400;
const REPEAT_EVERY = 33;
const MAX_RIPPLES = 8;
const TINT_VARS = ['--c', '--c2', '--c-hi', '--c-lo', '--c-wall', '--ink', '--ll'];

/**
 * The on-screen keyboard: draws a layout, tracks every finger, and turns
 * presses into key-down / key-up messages.
 *
 *   send(code, down)   called for every key event that should reach the desktop
 *   onAction(code)     called when a "$" key (settings, trackpad) is tapped
 *
 * The press path is kept short on purpose: one map lookup, one class change
 * (which only moves an already-composited layer), one message, one sound.
 */
export class Keyboard {
  constructor({ el, glowEl, sound, send, onAction }) {
    this.el = el;
    this.glowEl = glowEl;
    this.sound = sound;
    this.send = send;
    this.onAction = onAction;

    this.layoutId = null;
    this.keys = new Map();        // code -> key
    this.byEl = new WeakMap();    // button element -> key
    this.pointers = new Map();    // pointerId -> key
    this.mods = new Map();        // code -> { held, used, latched, justUnlatched }
    this.fnOn = false;
    this.testMode = false;        // settings open: sounds and motion, nothing sent
    this.repeatKey = null;
    this.ripples = 0;
    this.tintFn = null;           // per-key colours, for gradient colourways

    // touch-action: none on the keys means nothing here needs preventDefault,
    // so the listeners can be passive and never hold up the browser.
    const passive = { passive: true };
    el.addEventListener('pointerdown', (e) => this.#pointerDown(e), passive);
    el.addEventListener('pointerup', (e) => this.#pointerUp(e), passive);
    el.addEventListener('pointercancel', (e) => this.#pointerUp(e), passive);
    el.addEventListener('lostpointercapture', (e) => this.#pointerUp(e), passive);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Draws a layout. Returns true if the keys were rebuilt. */
  setLayout(id) {
    if (id === this.layoutId) return false;
    this.releaseAll();
    this.layoutId = id;
    const layout = LAYOUTS[id];
    const rows = rowUnits(layout);
    this.el.style.setProperty('--cols', layout.cols * 4);
    this.el.style.setProperty('--rows', rowTemplate(layout));
    this.el.classList.remove('fn-on');
    this.fnOn = false;
    this.keys.clear();
    this.mods.clear();

    const fragment = document.createDocumentFragment();
    layout.rows.forEach((row, r) => {
      let x = 0;
      for (const item of row) {
        if (item.gap) { x += item.gap; continue; }
        const { code, w } = item;
        const knob = code === '$settings' && layout.split;
        const fn = FN[code];
        const hasLed = code === 'CapsLock' || code === '$settings' || MODIFIERS.has(code);

        const el = document.createElement('button');
        el.type = 'button';
        el.tabIndex = -1;
        el.className = `key ${keyGroup(code)}${knob ? ' knob' : ''}${fn ? ' has-fn' : ''}${MODIFIERS.has(code) ? ' is-mod' : ''}`;
        el.dataset.code = code;
        el.style.gridRow = rowLine(layout, r);
        el.style.gridColumn = `${Math.round(x * 4) + 1} / span ${Math.round(w * 4)}`;
        el.setAttribute('aria-label', LABELS[code] ?? code.replace(/^(Key|Digit)/, ''));
        // Both legends are drawn once; holding Fn only flips a class.
        el.innerHTML = '<span class="cap"><span class="top"></span>'
          + legendHTML(code) + (fn ? legendHTML(fn, 'alt') : '')
          + (hasLed ? '<span class="led"></span>' : '') + '</span>';

        // Where the key sits across the board; the lit legends' colour wave runs along this.
        el.style.setProperty('--kx', ((x + w / 2) / layout.cols).toFixed(3));

        const key = {
          code, el, holds: 0, sent: null,
          // Recordings exist for five rows; the function row shares the number row's.
          row: layout.split ? Math.max(0, r - 1) : r,
          ty: r / (layout.rows.length - 1),
          cx: (x + w / 2) / layout.cols,
          cy: (r + 0.5 + (layout.split && r > 0 ? rows - layout.rows.length : 0)) / rows,
          size: w >= 5 ? 'space' : (w >= 2 || code === 'Enter' ? 'big' : 'normal'),
        };
        if (MODIFIERS.has(code)) this.mods.set(code, { held: false, used: false, latched: false, justUnlatched: false });
        this.keys.set(code, key);
        this.byEl.set(el, key);
        fragment.append(el);
        x += w;
      }
    });
    this.el.replaceChildren(fragment);
    this.#tintAll();
    return true;
  }

  /**
   * Colours keys one by one instead of by group. fn(t, step) gets how far down
   * the board a key is (0 top row, 1 bottom) and the height of a row in the
   * same units, and returns CSS variables, or null to go back to group colours.
   */
  tint(fn) {
    this.tintFn = fn;
    this.#tintAll();
  }

  #tintAll() {
    const layout = LAYOUTS[this.layoutId];
    if (!layout) return;
    const step = 1 / (layout.rows.length - 1);
    for (const key of this.keys.values()) {
      const vars = this.tintFn?.(key.ty, step);
      for (const name of TINT_VARS) {
        if (vars) key.el.style.setProperty(name, vars[name]);
        else key.el.style.removeProperty(name);
      }
    }
  }

  /** Lights the Caps Lock LED to match the desktop. */
  setCaps(on) { this.keys.get('CapsLock')?.el.classList.toggle('led-on', on); }

  setTestMode(on) {
    // Release under the old mode: real key-ups when entering test mode,
    // nothing when leaving it (those presses were never sent).
    this.releaseAll();
    this.testMode = on;
  }

  /** Lets go of everything, e.g. when the app is backgrounded. */
  releaseAll() {
    this.#stopRepeat();
    for (const key of this.keys.values()) {
      if (key.sent) { this.#emit(key.sent, false); key.sent = null; }
      if (key.holds || MODIFIERS.has(key.code)) key.el.classList.remove('is-down', 'is-latched');
      key.holds = 0;
    }
    for (const [code, mod] of this.mods) {
      if (mod.held || mod.latched) this.#setMod(code, false);
      mod.held = mod.used = mod.latched = mod.justUnlatched = false;
    }
    this.pointers.clear();
  }

  // ── Fingers ───────────────────────────────────────────────────────────────

  #pointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Everything inside a key ignores pointers, so the target is the key itself.
    const key = this.byEl.get(e.target);
    if (!key) return;
    // Touches stay with the key they landed on by default; a mouse needs asking.
    if (e.pointerType === 'mouse') { try { key.el.setPointerCapture(e.pointerId); } catch { /* already gone */ } }
    this.pointers.set(e.pointerId, key);
    if (key.holds++ === 0) this.#press(key);
  }

  #pointerUp(e) {
    const key = this.pointers.get(e.pointerId);
    if (!key) return;
    this.pointers.delete(e.pointerId);
    if (--key.holds <= 0) { key.holds = 0; this.#release(key); }
  }

  #press(key) {
    const { code } = key;
    // Tell the computer first; picture and sound follow in the same task.
    if (!MODIFIERS.has(code) && code[0] !== '$') {
      for (const mod of this.mods.values()) if (mod.held) mod.used = true;
      key.sent = (this.fnOn && FN[code]) || code;
      this.#emit(key.sent, true);
      this.#startRepeat(key);
    }
    key.el.classList.add('is-down');
    this.sound.down(key.size, key.cx, key.row, code === 'Enter');
    if (settings.haptics) navigator.vibrate?.(6);
    if (settings.glow === 'reactive') this.#ripple(key);
    if (MODIFIERS.has(code)) this.#modDown(code);
  }

  #release(key) {
    const { code } = key;

    if (MODIFIERS.has(code)) {
      this.sound.up(key.size, key.cx, key.row);
      this.#modUp(code);
      const { latched } = this.mods.get(code);
      key.el.classList.toggle('is-down', latched);
      key.el.classList.toggle('is-latched', latched);
      return;
    }

    if (key.sent) { this.#emit(key.sent, false); key.sent = null; }
    key.el.classList.remove('is-down');
    this.sound.up(key.size, key.cx, key.row, code === 'Enter');
    if (code[0] === '$') return this.onAction(code);

    if (this.repeatKey === key) this.#stopRepeat();
    this.#unlatchAll();
  }

  // ── Modifiers ─────────────────────────────────────────────────────────────
  // Held with another key, a modifier behaves like the real thing. Tapped on
  // its own (with "sticky modifiers" on) it stays down for the next key, so
  // Ctrl+C works with one thumb. Tap it again to let go.

  #modDown(code) {
    const mod = this.mods.get(code);
    mod.held = true;
    mod.used = false;
    mod.justUnlatched = mod.latched;
    if (mod.latched) {
      mod.latched = false;
      this.#setMod(code, false);
    } else {
      this.#setMod(code, true);
    }
  }

  #modUp(code) {
    const mod = this.mods.get(code);
    mod.held = false;
    if (mod.justUnlatched) return;
    if (settings.sticky && !mod.used) mod.latched = true;
    else this.#setMod(code, false);
  }

  #unlatchAll() {
    for (const [code, mod] of this.mods) {
      if (!mod.latched || mod.held) continue;
      mod.latched = false;
      this.#setMod(code, false);
      this.keys.get(code).el.classList.remove('is-down', 'is-latched');
    }
  }

  #setMod(code, on) {
    if (code !== '$fn') return this.#emit(code, on);
    this.fnOn = on;
    this.el.classList.toggle('fn-on', on);
  }

  // ── Output ────────────────────────────────────────────────────────────────

  #emit(code, down) {
    if (!this.testMode) this.send(code, down);
  }

  // The desktop does not auto-repeat injected keys, so the phone does it.
  #startRepeat(key) {
    this.#stopRepeat();
    if (!settings.repeat) return;
    this.repeatKey = key;
    this.repeatTimer = setTimeout(() => {
      this.repeatTimer = setInterval(() => { if (key.sent) this.#emit(key.sent, true); }, REPEAT_EVERY);
    }, REPEAT_DELAY);
  }

  #stopRepeat() {
    clearTimeout(this.repeatTimer);
    clearInterval(this.repeatTimer);
    this.repeatKey = null;
  }

  #ripple(key) {
    if (this.ripples >= MAX_RIPPLES) return; // fast typing must not pile up layers
    this.ripples++;
    const dot = document.createElement('i');
    dot.className = 'ripple';
    dot.style.left = `${key.cx * 100}%`;
    dot.style.top = `${key.cy * 100}%`;
    dot.addEventListener('animationend', () => { dot.remove(); this.ripples--; }, { once: true });
    this.glowEl.append(dot);
  }
}
