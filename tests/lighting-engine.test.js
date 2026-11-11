import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LIGHTING, dimColor, normalizeLighting } from '../public/js/light-color.js';
import { LegendLight } from '../public/js/lit.js';
import { applyTheme } from '../public/js/themes.js';

test('legacy hue upgrades to independent RGB values without losing brightness', () => {
  const migrated = normalizeLighting({ glowHue: 120, glowLevel: 0.35 });
  assert.deepEqual(migrated, { glowColor: '#1fff1f', litColor: '#4bfb4b', glowLevel: 0.35, litLevel: 1 });
  assert.equal(normalizeLighting({ glowHue: 360 }).glowColor, normalizeLighting({ glowHue: 0 }).glowColor);
});

test('new RGB choices survive reload and malformed settings have safe defaults', () => {
  assert.deepEqual(normalizeLighting({ glowHue: 20, glowColor: '#AbC', litColor: '#808080', glowLevel: 0, litLevel: 0.4 }), {
    glowColor: '#aabbcc', litColor: '#808080', glowLevel: 0, litLevel: 0.4,
  });
  assert.deepEqual(normalizeLighting({ glowHue: Infinity, glowColor: 'url(x)', litColor: null, glowLevel: NaN, litLevel: 'wrong' }), DEFAULT_LIGHTING);
  assert.equal(normalizeLighting({ glowLevel: -2, litLevel: 5 }).glowLevel, 0);
  assert.equal(normalizeLighting({ glowLevel: -2, litLevel: 5 }).litLevel, 1);
});

test('RGB brightness supports white, grey and black without adding saturation', () => {
  assert.equal(dimColor('#ffffff', 1), '#ffffff');
  assert.equal(dimColor('#808080', 0.5), '#404040');
  assert.equal(dimColor('#abcdef', 0), '#000000');
  assert.equal(dimColor('#000000', 1), '#000000');
});

test('store migration, editing and reload preserve each lighting setting separately', async (t) => {
  const originals = { localStorage: globalThis.localStorage, addEventListener: globalThis.addEventListener };
  const entries = new Map([['thock.settings.v2', JSON.stringify({ glowHue: 120, glowLevel: 0.35, volume: 0.4 })]]);
  const flushers = [];
  globalThis.localStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  globalThis.addEventListener = (name, fn) => { if (name === 'pagehide') flushers.push(fn); };
  t.after(() => {
    flushers.forEach((fn) => fn());
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const initial = await import('../public/js/store.js?lighting-migration');
  assert.equal(initial.settings.glowColor, '#1fff1f');
  assert.equal(initial.settings.volume, 0.4, 'unrelated preferences survive the upgrade');
  initial.set('litColor', '#abcdef');
  initial.set('litLevel', 0.45);
  initial.set('glowColor', '#ffffff');
  initial.set('glowLevel', 0);
  initial.set('litColor', 'invalid');
  initial.set('litLevel', NaN);
  flushers[0]();
  const reloaded = await import('../public/js/store.js?lighting-reload');
  assert.equal(reloaded.settings.litColor, '#abcdef');
  assert.equal(reloaded.settings.glowColor, '#ffffff');
  assert.equal(reloaded.settings.litLevel, 0.45);
  assert.equal(reloaded.settings.glowLevel, 0);
  assert.equal(reloaded.settings.volume, 0.4);
  assert.equal('glowHue' in reloaded.settings, false);
});

function fixture(t) {
  const originals = Object.fromEntries(['document', 'getComputedStyle', 'setInterval', 'clearInterval'].map((key) => [key, globalThis[key]]));
  const callbacks = new Map();
  const timers = new Map();
  let nextId = 1;
  const css = () => ({
    color: '',
    values: new Map(),
    setProperty(key, value) { this.values.set(key, value); },
    removeProperty(key) { this[key] = ''; this.values.delete(key); },
  });
  globalThis.document = { hidden: false, addEventListener(name, fn) { callbacks.set(name, fn); }, querySelector() { return null; }, documentElement: { style: {} } };
  globalThis.getComputedStyle = (key) => ({ getPropertyValue(name) { return key.variables[name] ?? ''; } });
  globalThis.setInterval = (fn) => { const id = nextId++; timers.set(id, fn); return id; };
  globalThis.clearInterval = (id) => timers.delete(id);
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const makeKey = (kx, lightness) => {
    const el = { style: css(), classList: { toggle() {} } };
    return { variables: { '--kx': String(kx), '--ll': lightness }, querySelectorAll() { return [el]; }, el };
  };
  const keys = [makeKey(0, '74%'), makeKey(0.75, '36%')];
  const light = new LegendLight({ querySelectorAll() { return keys; } });
  light.refresh();
  return { light, keys, timers, callbacks, css };
}

test('solid legends retain the exact picked RGB on both dark and pale caps', (t) => {
  const { light, keys } = fixture(t);
  light.set('solid', '#7a91b3', 1);
  assert.deepEqual(keys.map((key) => key.el.style.color), ['#7a91b3', '#7a91b3']);
  light.set('solid', '#7a91b3', 0.5);
  assert.deepEqual(keys.map((key) => key.el.style.color), ['#3d495a', '#3d495a']);
  light.refresh();
  assert.equal(keys[0].el.style.color, '#3d495a', 'layout/profile refresh keeps the brightness');
  light.set('off', '#ffffff', 0);
  assert.deepEqual(keys.map((key) => key.el.style.color), ['', ''], 'Off restores colourway ink');
});

test('brightness dims animated legends, pauses at zero and respects visibility', (t) => {
  const { light, keys, timers, callbacks } = fixture(t);
  light.set('wave', '#123456', 0.5);
  assert.match(keys[0].el.style.color, /37\.00%/);
  assert.match(keys[1].el.style.color, /18\.00%/);
  assert.equal(timers.size, 1);
  light.set('wave', '#123456', 0);
  assert.equal(timers.size, 0);
  assert.match(keys[0].el.style.color, /0\.00%/);
  light.set('cycle', '#123456', 1);
  assert.equal(timers.size, 1);
  document.hidden = true;
  callbacks.get('visibilitychange')();
  assert.equal(timers.size, 0);
  document.hidden = false;
  callbacks.get('visibilitychange')();
  assert.equal(timers.size, 1);
});

test('backlight RGB and intensity are independent from shine-through settings', (t) => {
  const { light, keys, css } = fixture(t);
  const root = { style: css(), dataset: {} };
  const settings = {
    colorway: 'graphite', caseColor: 'auto', profile: 'cherry', legends: 'corner', font: 'sans',
    glow: 'static', glowColor: '#808080', glowLevel: 0.25,
    lit: 'solid', litColor: '#ff0000', litLevel: 1,
  };
  applyTheme(root, settings);
  light.set(settings.lit, settings.litColor, settings.litLevel);
  assert.equal(root.style.values.get('--glow-rgb'), '128 128 128');
  assert.equal(root.style.values.get('--glow-level'), 0.25);
  assert.equal(root.style.values.get('--lit-level'), 1);
  assert.equal(keys[0].el.style.color, '#ff0000');
  applyTheme(root, { ...settings, glowColor: '#0000ff', glowLevel: 0 });
  assert.equal(keys[0].el.style.color, '#ff0000');
  assert.equal(root.style.values.get('--glow-level'), 0);
});
