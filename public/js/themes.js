import { hexToRgb } from './light-color.js';

// Keycap colourways, cases and profiles. Applied as CSS variables.
//
// A colourway is a case plus keycap colours. Most are three flat colours,
// split the way these boards split them: `alpha` for letters, `mod` for
// modifiers, `accent` for Esc, Enter, the space bar and the arrows.
// Gradient sets instead fade down the board, row by row and within each cap,
// like the side-printed versions of the Aula F75.
//
// The Rainy and F75 sets follow the stock versions of those keyboards; a few
// legend colours are darker than the originals so they stay readable on a
// phone screen.

const WHITE = '#ecebe7';
const BLACK = '#1b1c1e';

export const COLORWAYS = [
  // After the Aula F75 gradient (side-printed) versions.
  { id: 'f75-grad-black', set: 'F75 gradient', name: 'Black', case: BLACK, gradient: ['#c2c0bb', '#8d8c89', '#2c2d30'] },
  { id: 'f75-grad-blue', set: 'F75 gradient', name: 'Blue', case: WHITE, gradient: ['#f3f4f6', '#b9cdee', '#6e93d6'] },
  { id: 'f75-grad-pink', set: 'F75 gradient', name: 'Pink', case: '#f4d3d8', gradient: ['#fbf4f3', '#f7cfd6', '#ef9fb3'] },
  { id: 'f75-grad-blackpink', set: 'F75 gradient', name: 'Black Pink', case: BLACK, gradient: ['#2b2b2f', '#6b4d59', '#f2a5b3'] },
  { id: 'grad-violet', set: 'F75 gradient', name: 'Violet', case: WHITE, gradient: ['#f5f3fa', '#cdbdf0', '#8566cf'] },
  { id: 'grad-mint', set: 'F75 gradient', name: 'Mint', case: BLACK, gradient: ['#e9f3ee', '#9fd6c2', '#3f9c8a'] },
  // After the Aula F75 versions.
  { id: 'f75-black', set: 'F75', name: 'Black', case: WHITE, alpha: '#f1f0ec', alphaInk: '#1e1f22', mod: '#b3bcc8', modInk: '#1e1f22', accent: '#22252c', accentInk: '#eeeeea' },
  { id: 'f75-blue', set: 'F75', name: 'Light Blue', case: '#e4eaf3', alpha: '#eff1f4', alphaInk: '#506ba3', mod: '#b6c6e2', modInk: '#2f4477', accent: '#8ea3d8', accentInk: '#ffffff' },
  { id: 'f75-green', set: 'F75', name: 'Green', case: '#a3a1b6', alpha: '#e4dccb', alphaInk: '#2b2b2b', mod: '#8d96b3', modInk: '#f6f2e8', accent: '#6c8571', accentInk: '#f6f2e8' },
  // After the Wobkey Rainy75 versions (their cases are coloured aluminium).
  { id: 'rainy-black', set: 'Rainy', name: 'Black', case: '#232427', alpha: '#2a2b2f', alphaInk: '#e4e1d9', mod: '#5c5f66', modInk: '#eeece6', accent: '#d8d0ba', accentInk: '#2a2926' },
  { id: 'rainy-silver', set: 'Rainy', name: 'Silver', case: '#d6d8dc', alpha: '#f4f4f2', alphaInk: '#26272a', mod: '#f4f4f2', modInk: '#26272a', accent: '#26272b', accentInk: '#f1f1ef' },
  { id: 'rainy-blue', set: 'Rainy', name: 'Blue', case: '#a8c0ee', alpha: '#f5f6fa', alphaInk: '#3b82b8', mod: '#b3c6f0', modInk: '#2f4585', accent: '#8d7fd8', accentInk: '#ffffff' },
  { id: 'rainy-pink', set: 'Rainy', name: 'Pink', case: '#f0b4c5', alpha: '#fbece8', alphaInk: '#b9506c', mod: '#f2bfcd', modInk: '#86364f', accent: '#cc5c7b', accentInk: '#fff4f6' },
  { id: 'rainy-purple', set: 'Rainy', name: 'Purple', case: '#b8a9e4', alpha: '#f6f3fb', alphaInk: '#6450ad', mod: '#cabdf0', modInk: '#45357f', accent: '#7a62c8', accentInk: '#f6f3fb' },
  // Thock's own.
  { id: 'graphite', set: 'Thock', name: 'Graphite', case: BLACK, alpha: '#3b3e44', alphaInk: '#ebe8e1', mod: '#25272b', modInk: '#b4b1a9', accent: '#ff7a3d', accentInk: '#22110a' },
  { id: 'retro', set: 'Thock', name: 'Retro', case: '#cfc7b3', alpha: '#e8e1cf', alphaInk: '#3a3833', mod: '#b3ad9b', modInk: '#2f2e2a', accent: '#c4513d', accentInk: '#fff2e2' },
  { id: 'harbor', set: 'Thock', name: 'Harbor', case: BLACK, alpha: '#1e3152', alphaInk: '#f1e8cf', mod: '#131f38', modInk: '#f1c84b', accent: '#f1c84b', accentInk: '#131f38' },
  { id: 'terminal', set: 'Thock', name: 'Terminal', case: '#050706', alpha: '#111612', alphaInk: '#4dff88', mod: '#0a0e0b', modInk: '#2fc062', accent: '#4dff88', accentInk: '#05200f' },
  { id: 'laser', set: 'Thock', name: 'Laser', case: '#110923', alpha: '#2c1a4d', alphaInk: '#ff62d4', mod: '#190f31', modInk: '#3fe9ff', accent: '#ff3f9e', accentInk: '#1c0a2b' },
];

/** The case under the caps. "auto" keeps the one the colourway comes with. */
export const CASES = { white: WHITE, black: BLACK };

export const PROFILES = [
  { id: 'cherry', name: 'Cherry', note: 'low, sculpted' },
  { id: 'oem', name: 'OEM', note: 'taller front' },
  { id: 'sa', name: 'SA', note: 'tall, glossy' },
  { id: 'dsa', name: 'DSA', note: 'flat, uniform' },
  { id: 'slim', name: 'Low', note: 'laptop-thin' },
  { id: 'pudding', name: 'Pudding', note: 'clear sides' },
];

// ── Colour arithmetic ────────────────────────────────────────────────────────

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const hex = (channels) => '#' + channels.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function luminance(color) {
  const [r, g, b] = rgb(color).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Darkens (amount < 0) or lightens (amount > 0) a colour. */
const shade = (color, amount) => hex(rgb(color).map((v) => (amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));

/** The colour a fraction t (0–1) of the way along a list of stops. */
function along(stops, t) {
  const at = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(at));
  const a = rgb(stops[i]), b = rgb(stops[i + 1]);
  return hex(a.map((v, c) => v + (b[c] - v) * (at - i)));
}

const isLight = (color) => luminance(color) > 0.36;
const inkFor = (color) => (isLight(color) ? '#1c1c1c' : '#f1eee8');
/** How bright a lit legend is drawn: deeper on pale caps so it still reads. */
function litFor(color) {
  const l = luminance(color);
  if (l > 0.36) return '36%';          // pale cap: a deep colour reads best
  return l > 0.1 ? '74%' : '64%';      // mid grey needs a brighter one than black does
}

// ── Resolving a colourway ────────────────────────────────────────────────────

/** Builds a full colourway from three picked colours. */
export function customColorway({ alpha, mod, accent }) {
  return {
    id: 'custom', name: 'Custom', case: luminance(mod) < 0.2 ? BLACK : WHITE,
    alpha, alphaInk: inkFor(alpha), mod, modInk: inkFor(mod), accent, accentInk: inkFor(accent),
  };
}

export function resolveColorway(settings) {
  if (settings.colorway === 'custom') return customColorway(settings.custom);
  return COLORWAYS.find((c) => c.id === settings.colorway) ?? COLORWAYS[0];
}

/** Three colours that stand for a colourway in the settings list. */
export function chips(c) {
  return c.gradient ? [along(c.gradient, 0), along(c.gradient, 0.5), along(c.gradient, 1)] : [c.alpha, c.mod, c.accent];
}

// Every shade a keycap needs, worked out here once per theme change. Doing
// it in CSS (color-mix inside each cap's gradient) would redo it for every
// cap on every repaint.
function capShades(prefix, color, ink) {
  return {
    [`--${prefix}`]: color,
    [`--${prefix}-hi`]: shade(color, 0.14),    // top edge of the skirt, catching light
    [`--${prefix}-lo`]: shade(color, -0.2),    // front face of the cap
    [`--${prefix}-wall`]: shade(color, -0.42), // the side you only see before the key travels
    [`--${prefix}-ink`]: ink,
    [`--${prefix}-lit`]: litFor(color),
  };
}

/**
 * For gradient colourways: the CSS variables of one key, given how far down
 * the board it sits (t: 0 top row, 1 bottom row) and how tall a row is in the
 * same units (step). Returns null for flat colourways, which colour keys by
 * group in the stylesheet instead.
 */
export function keyTint(settings, t, step) {
  const c = resolveColorway(settings);
  if (!c.gradient) return null;
  const top = along(c.gradient, t - step * 0.15);
  const bottom = along(c.gradient, t + step * 0.6);
  const middle = along(c.gradient, t + step * 0.2);
  return {
    '--c': top, '--c2': bottom,
    '--c-hi': shade(top, 0.14), '--c-lo': shade(bottom, -0.2), '--c-wall': shade(bottom, -0.42),
    '--ink': inkFor(middle), '--ll': litFor(middle),
  };
}

export function applyTheme(root, settings) {
  const c = resolveColorway(settings);
  const body = CASES[settings.caseColor] ?? c.case;
  const light = isLight(body);
  // Flat sets colour keys by group; gradient sets get per-key colours from
  // keyTint, and these only serve the trackpad and other bits of chrome.
  const [alpha, mod, accent] = chips(c);
  const vars = {
    ...capShades('alpha', alpha, c.alphaInk ?? inkFor(alpha)),
    ...capShades('mod', mod, c.modInk ?? inkFor(mod)),
    ...capShades('accent', accent, c.accentInk ?? inkFor(accent)),
    '--case': body, '--case-hi': shade(body, 0.16), '--case-lo': shade(body, -0.22),
    '--case-ink': light ? '#1c1c1c' : '#f1eee8',
    // The plate under the switches: in shadow on a pale case, near black on a dark one.
    '--plate': shade(body, light ? -0.36 : -0.55),
    '--desk': shade(body, light ? -0.78 : -0.72),
    '--glow-rgb': hexToRgb(settings.glowColor).join(' '),
    '--glow-level': settings.glowLevel,
    '--lit-level': settings.litLevel,
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.dataset.profile = PROFILES.some((p) => p.id === settings.profile) ? settings.profile : 'cherry';
  root.dataset.legends = settings.legends;
  root.dataset.font = settings.font;
  root.dataset.glow = settings.glow;
  root.dataset.lit = settings.lit;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--desk']);
  document.documentElement.style.background = vars['--desk'];
}
