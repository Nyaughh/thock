// Lit legends: the letters glow from behind, like shine-through caps, and can
// change colour. Not the same thing as the light under the keys (.glow).
//
//   off     legends are printed in the colourway's own ink
//   solid   one colour
//   cycle   one colour that drifts round the wheel
//   wave    a rainbow that travels across the board
//
// How it is done matters for speed. Driving this from one CSS variable on the
// keyboard makes the browser restyle every key on every step (measured: 7 ms
// or more). Writing the colour straight onto each legend, a quarter of them
// at a time, costs about 0.15 ms a step and leaves the main thread free for
// key presses.

const TICK_MS = 30;
const GROUPS = 4;                 // each legend is recoloured every TICK_MS * GROUPS
const DEGREES_PER_SECOND = 40;    // once round the wheel in nine seconds
const SPREAD = 300;               // hue difference between the two ends of the board (wave)

export class LegendLight {
  #keysEl;
  #legends = [];   // { el, kx, lightness }
  #mode = 'off';
  #hue = 0;
  #timer = null;
  #group = 0;

  constructor(keysEl) {
    this.#keysEl = keysEl;
    document.addEventListener('visibilitychange', () => this.#run());
  }

  /** Call after the keys were rebuilt or recoloured. */
  refresh() {
    this.#legends = [];
    for (const key of this.#keysEl.querySelectorAll('.key:not(.knob)')) {
      const style = getComputedStyle(key);
      const kx = parseFloat(style.getPropertyValue('--kx')) || 0;
      const lightness = style.getPropertyValue('--ll').trim() || '62%';
      // Pale caps get a deep colour and no dark edge; the rest get a bright
      // colour with a dark edge so blues and purples still read on grey.
      const pale = parseFloat(lightness) < 50;
      for (const el of key.querySelectorAll('.lg')) {
        el.classList.toggle('on-pale', pale);
        this.#legends.push({ el, kx, lightness });
      }
    }
    this.#paint(0, 1);
  }

  /** mode: off | solid | cycle | wave. hue: 0–360, used by solid. */
  set(mode, hue) {
    if (mode === 'solid') this.#hue = hue;
    this.#mode = mode;
    this.#paint(0, 1);
    this.#run();
  }

  #run() {
    const moving = (this.#mode === 'cycle' || this.#mode === 'wave') && !document.hidden;
    if (moving && !this.#timer) {
      this.#timer = setInterval(() => {
        this.#hue = (this.#hue + (DEGREES_PER_SECOND * TICK_MS) / 1000) % 360;
        this.#group = (this.#group + 1) % GROUPS;
        this.#paint(this.#group, GROUPS);
      }, TICK_MS);
    } else if (!moving && this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  #paint(first, step) {
    const legends = this.#legends;
    if (this.#mode === 'off') {
      for (const { el } of legends) el.style.removeProperty('color');
      return;
    }
    const wave = this.#mode === 'wave';
    for (let i = first; i < legends.length; i += step) {
      const { el, kx, lightness } = legends[i];
      const hue = wave ? (this.#hue - kx * SPREAD + 720) % 360 : this.#hue;
      el.style.color = `hsl(${hue.toFixed(0)} 96% ${lightness})`;
    }
  }
}
