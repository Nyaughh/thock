// Lighting colours are stored as RGB, so white, pastels and grey work too.
export function normalizeHex(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const color = value.trim();
  if (/^#[\da-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[\da-f]{3}$/i.test(color)) return '#' + [...color.slice(1)].map((c) => c + c).join('').toLowerCase();
  return fallback;
}

export function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [value >> 16, (value >> 8) & 255, value & 255];
}

export const rgbToHex = (channels) => '#' + channels.map((value) =>
  Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('');

export function hslToHex(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360 / 60;
  const s = saturation / 100, l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(h % 2 - 1));
  const m = l - c / 2;
  const sectors = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]];
  return rgbToHex(sectors[Math.floor(h)].map((v) => (v + m) * 255));
}

export const clampLevel = (value, fallback) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

export const DEFAULT_LIGHTING = Object.freeze({
  glowColor: hslToHex(22, 100, 56),
  litColor: hslToHex(22, 96, 64),
  glowLevel: 0.8,
  litLevel: 1,
});

/** Retain v2's saved hue when upgrading to independent RGB colours. */
export function normalizeLighting(saved = {}) {
  const oldHue = typeof saved.glowHue === 'number' && Number.isFinite(saved.glowHue) ? saved.glowHue : 22;
  return {
    glowColor: normalizeHex(saved.glowColor, hslToHex(oldHue, 100, 56)),
    // Old legend lightness varied by cap. Use the dark-cap baseline as the
    // one stored RGB colour; cycle and wave still adapt to the colourway.
    litColor: normalizeHex(saved.litColor, hslToHex(oldHue, 96, 64)),
    glowLevel: clampLevel(saved.glowLevel, DEFAULT_LIGHTING.glowLevel),
    litLevel: clampLevel(saved.litLevel, DEFAULT_LIGHTING.litLevel),
  };
}

/** Brightness scales emitted RGB; at zero the key emits no light. */
export function dimColor(color, level) {
  return rgbToHex(hexToRgb(color).map((channel) => channel * level));
}
