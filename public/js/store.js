import { DEFAULT_LIGHTING, clampLevel, normalizeHex, normalizeLighting } from './light-color.js';

// Settings, kept in localStorage when the browser allows it.

// v2: the look changed (square caps, corner legends, new colourways), so
// choices saved under v1 are not carried over.
const STORAGE_KEY = 'thock.settings.v2';

const DEFAULTS = {
  // sound
  switch: 'blackink',
  volume: 0.8,
  haptics: true,
  // keycaps
  profile: 'oem',
  colorway: 'rainy-purple',
  caseColor: 'auto',
  custom: { alpha: '#2a2b2f', mod: '#5c5f66', accent: '#d8d0ba' },
  legends: 'center',
  font: 'mono',
  // glow
  lit: 'off',       // legends lit from behind: off | solid | cycle | wave
  glow: 'off',      // light under the keys
  ...DEFAULT_LIGHTING,
  // controls
  sticky: true,
  repeat: true,
  layout: 'full',
  dock: 'off',
  rotate: 'auto',
  speed: 1.6,
  natural: true,
  fullscreen: true,
};

// The website shows the keyboard with ?demo in the address: nothing is paired
// or saved, and the address can choose the look (?demo&colorway=retro).
const params = new URLSearchParams(globalThis.location?.search ?? '');
export const demo = params.has('demo');
const fromAddress = {};
if (demo) for (const [key, value] of params) if (typeof DEFAULTS[key] === 'string') fromAddress[key] = value;

function read(key) {
  if (demo) return null;
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  if (demo) return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

const stored = read(STORAGE_KEY);
const saved = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
const { glowHue: legacyHue, ...current } = saved;
export const settings = {
  ...DEFAULTS, ...current, ...normalizeLighting(saved),
  custom: { ...DEFAULTS.custom, ...saved.custom },
  ...fromAddress,
};

const listeners = new Set();

/** Calls fn(key, value) after any setting changes. */
export function onChange(fn) { listeners.add(fn); }

// Dragging a slider changes a setting dozens of times a second; saving is
// left until things go quiet so it never competes with a key press.
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => write(STORAGE_KEY, settings), 250);
}
addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); write(STORAGE_KEY, settings); } });

export function set(key, value) {
  if (key === 'glowColor' || key === 'litColor') value = normalizeHex(value, settings[key]);
  if (key === 'glowLevel' || key === 'litLevel') value = clampLevel(value, settings[key]);
  if (settings[key] === value) return;
  settings[key] = value;
  save();
  for (const fn of listeners) fn(key, value);
}

// The pairing code is stored apart from settings so "forget" clears only it.
const CODE_KEY = 'thock.code';
export const pairing = {
  get: () => read(CODE_KEY),
  set: (code) => write(CODE_KEY, code),
  clear: () => { try { localStorage.removeItem(CODE_KEY); } catch { /* ignore */ } },
};
