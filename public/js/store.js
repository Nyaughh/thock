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
  profile: 'cherry',
  colorway: 'f75-grad-black',
  caseColor: 'auto',
  custom: { alpha: '#2a2b2f', mod: '#5c5f66', accent: '#d8d0ba' },
  legends: 'corner',
  font: 'sans',
  // glow
  lit: 'wave',      // legends lit from behind: off | solid | cycle | wave
  glow: 'off',      // light under the keys
  glowHue: 22,
  glowLevel: 0.8,
  // controls
  sticky: true,
  repeat: true,
  layout: 'auto',
  dock: 'auto',
  rotate: 'auto',
  speed: 1.6,
  natural: true,
  fullscreen: true,
};

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

const saved = read(STORAGE_KEY) ?? {};
export const settings = { ...DEFAULTS, ...saved, custom: { ...DEFAULTS.custom, ...saved.custom } };

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
