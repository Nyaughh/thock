import { settings, set, onChange, pairing, demo } from './store.js';
import { LAYOUTS, rowUnits } from './layouts.js';
import { applyTheme, keyTint } from './themes.js';
import { Keyboard } from './keyboard.js';
import { Trackpad } from './trackpad.js';
import { Sound, SWITCHES, DEFAULT_SWITCH } from './sound.js';
import { Link, DemoLink } from './net.js';
import { NativeLink, isNative } from './native.js';
import { initBluetoothPairing } from './bt-pair.js';
import { LegendLight } from './lit.js';
import { buildSettings } from './settings-ui.js';

const $ = (selector) => document.querySelector(selector);
const stage = $('#stage');
const deck = $('#deck');
const drawer = $('#drawer');
const pairEl = $('#pair');
const toast = $('#toast');

let rotated = false;    // UI drawn sideways on an upright phone
let padFull = false;    // trackpad covering the whole screen
let drawerOpen = false;
let code = null;        // pairing code in use

// A switch saved by an older version may no longer exist.
if (!SWITCHES.some((s) => s.id === settings.switch)) set('switch', DEFAULT_SWITCH);

const sound = new Sound();
// Inside the Android app the phone is a Bluetooth keyboard; in a browser it
// talks to the desktop program over Wi-Fi. Everything else is shared.
const link = isNative ? new NativeLink() : demo ? new DemoLink() : new Link();

const keyboard = new Keyboard({
  el: $('#keys'),
  glowEl: $('#glow'),
  sound,
  send: (key, down) => link.send([down ? 'kd' : 'ku', key]),
  onAction: (key) => {
    if (key === '$settings') return drawerOpen ? closeDrawer() : openDrawer();
    if (key === '$pad') { padFull = true; layout(); }
  },
});

const trackpad = new Trackpad({
  surface: $('#surface'),
  buttons: [...document.querySelectorAll('.pad-btn[data-button]')],
  sound,
  send: (message) => { if (!drawerOpen) link.send(message); },
  rotated: () => rotated,
});

$('#padBack').addEventListener('click', () => {
  sound.tick(1);
  trackpad.reset();
  padFull = false;
  layout();
});

// ── Layout ──────────────────────────────────────────────────────────────────
// Fill the screen with keys. Leftover height (tablets) becomes a trackpad.

function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  rotated = settings.rotate === 'auto' && vh > vw && vw < 600;
  stage.classList.toggle('rot', rotated);
  stage.style.width = `${rotated ? vh : vw}px`;
  stage.style.height = `${rotated ? vw : vh}px`;

  const W = deck.clientWidth, H = deck.clientHeight;
  // 75% wherever sixteen keys across are still wide enough to hit.
  const id = settings.layout === 'auto' ? (W >= 600 && H >= 300 ? 'full' : 'compact') : settings.layout;
  const { cols } = LAYOUTS[id];
  const rows = rowUnits(LAYOUTS[id]);
  const bezel = Math.max(4, Math.min(12, W * 0.007));

  // Real caps are square; on glass a little taller is easier to hit. Past
  // 1.3 times the width they stop looking like keys, so spare height becomes
  // a trackpad (or stays empty desk) instead.
  const wide = W / cols;
  let dock = 'none';
  if (padFull) dock = 'full';
  else if (settings.dock === 'on' || (settings.dock === 'auto' && H - rows * wide * 1.3 >= 150)) {
    dock = H - rows * wide * 1.12 >= 140 ? 'top' : 'side';
  }
  const boardW = dock === 'side' ? W * 0.72 : W;
  const unit = (boardW - 2 * bezel) / cols;
  const boardH = dock === 'top'
    ? Math.max(rows * unit * 1.12, Math.min(rows * unit * 1.3, H - 260))
    : Math.min(H, rows * unit * 1.3 + 2 * bezel);

  deck.dataset.dock = dock;
  stage.style.setProperty('--bezel', `${bezel}px`);
  stage.style.setProperty('--kb-h', `${Math.round(boardH)}px`);
  stage.style.setProperty('--u', `${unit}px`);
  if (keyboard.setLayout(id)) legendLight.refresh();
}

let layoutTimer = null;
function queueLayout() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(layout, 60); // rotation fires several resizes in a row
}
window.addEventListener('resize', queueLayout);
window.addEventListener('orientationchange', queueLayout);
window.visualViewport?.addEventListener('resize', queueLayout);

// ── Theme ───────────────────────────────────────────────────────────────────

const legendLight = new LegendLight($('#keys'));
let tinted = null;

function theme() {
  applyTheme(stage, settings);
  // Per-key colours only need redoing when the colourway itself changed.
  const look = `${settings.colorway}|${JSON.stringify(settings.custom)}`;
  if (look !== tinted) {
    tinted = look;
    keyboard.tint((t, step) => keyTint(settings, t, step));
    legendLight.refresh();
  }
  legendLight.set(settings.lit, settings.litColor, settings.litLevel);
  // Other places that draw keycaps follow the chosen profile.
  for (const el of document.querySelectorAll('[data-theme-scope]')) el.dataset.profile = settings.profile;
}

onChange((key) => {
  theme();
  if (key === 'layout' || key === 'dock' || key === 'rotate') layout();
});

// ── Settings drawer ─────────────────────────────────────────────────────────

const ui = buildSettings({
  root: drawer,
  rotated: () => rotated,
  sound,
  link,
  onClose: () => closeDrawer(),
  onForget: () => {
    link.disconnect();
    closeDrawer();
    if (isNative || demo) return; // the Bluetooth pairing screen comes back by itself
    pairing.clear();
    code = null;
    showPair('Forgotten. Type the code to pair again.');
  },
});

let deviceTimer = null;
function openDrawer() {
  drawerOpen = true;
  drawer.classList.add('open');
  keyboard.setTestMode(true); // keys still click, but nothing reaches the desktop
  trackpad.reset();
  ui.refreshDevice();
  deviceTimer = setInterval(ui.refreshDevice, 1500);
}
function closeDrawer() {
  drawerOpen = false;
  drawer.classList.remove('open');
  keyboard.setTestMode(false);
  clearInterval(deviceTimer);
}

// ── Pairing ─────────────────────────────────────────────────────────────────

const slots = [...document.querySelectorAll('#slots span')];
const pairMsg = $('#pairMsg');
const numpad = $('#numpad');
let typed = '';

function drawSlots() {
  slots.forEach((slot, i) => {
    slot.textContent = typed[i] ?? '';
    slot.classList.toggle('next', i === typed.length);
  });
}

function showPair(message, bad = false) {
  typed = '';
  drawSlots();
  if (message) pairMsg.textContent = message;
  pairMsg.classList.toggle('bad', bad);
  if (bad) {
    $('#slots').classList.remove('shake');
    void $('#slots').offsetWidth; // restart the animation
    $('#slots').classList.add('shake');
  }
  pairEl.hidden = false;
}

function connect(newCode) {
  code = newCode;
  link.connect(code);
}

function buildNumpad() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0'];
  keys.forEach((label, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `key ${label === 'back' ? 'mod' : 'alpha'}${label === '0' ? ' wide' : ''}`;
    el.setAttribute('aria-label', label === 'back' ? 'Delete' : label);
    el.innerHTML = `<span class="cap"><span class="top"></span><span class="lg ${label === 'back' ? 'word' : 'glyph'}">${label === 'back' ? 'Del' : label}</span></span>`;
    const x = (i % 3) / 2, row = Math.floor(i / 3);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch { /* gone */ }
      el.classList.add('is-down');
      sound.down(label === '0' ? 'big' : 'normal', x, row);
      if (settings.haptics) navigator.vibrate?.(6);
      if (label === 'back') typed = typed.slice(0, -1);
      else if (typed.length < 6) typed += label;
      drawSlots();
    });
    const up = () => {
      if (!el.classList.contains('is-down')) return;
      el.classList.remove('is-down');
      sound.up('normal', x, row);
      if (typed.length === 6) {
        pairMsg.classList.remove('bad');
        pairMsg.textContent = 'Connecting…';
        connect(typed);
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    numpad.append(el);
  });
}

// ── Connection ──────────────────────────────────────────────────────────────

function showToast(message) {
  toast.textContent = message ?? toast.textContent;
  toast.classList.toggle('show', !!message);
}

link.onState = (state, detail) => {
  stage.dataset.link = state;
  switch (state) {
    case 'open':
      if (!isNative) pairing.set(code);
      pairEl.hidden = true;
      showToast(null);
      break;
    case 'closed':
      keyboard.releaseAll();
      trackpad.reset();
      break;
    case 'connecting':
      if (pairEl.hidden) showToast('Looking for your computer…');
      break;
    case 'retrying':
      keyboard.releaseAll();
      trackpad.reset();
      showToast('Reconnecting…');
      break;
    case 'rejected':
      // A lockout says nothing about this phone's code, so keep it.
      if (detail?.reason !== 'locked') pairing.clear();
      code = null;
      showToast(null);
      showPair(detail?.reason === 'locked'
        ? 'Too many wrong codes. Wait a minute, then try again.'
        : 'That code did not match. Check the computer and type it again.', true);
      break;
  }
  ui.refreshDevice();
};

link.onMessage = ([type, value]) => {
  if (type === 'caps') keyboard.setCaps(!!value);
};

// ── Page-level behaviour ────────────────────────────────────────────────────

// Browsers only allow audio and full screen after a finished tap.
let triedFullscreen = false;
function onGesture() {
  sound.unlock();
  const root = document.documentElement;
  if (isNative || demo || triedFullscreen || !settings.fullscreen || !root.requestFullscreen) return;
  triedFullscreen = true;
  if (matchMedia('(pointer: coarse)').matches && !document.fullscreenElement) {
    root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
}
window.addEventListener('pointerup', onGesture, true);
window.addEventListener('touchend', onGesture, true);

// Leaving the app must not leave keys held down on the desktop.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keyboard.releaseAll(); trackpad.reset(); }
  else link.wake();
});
window.addEventListener('pagehide', () => keyboard.releaseAll());

// No pinch zoom, rubber-banding or long-press menus over the keys.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  const scrollsNatively = !rotated && e.target.closest?.('.drawer-body');
  if (!scrollsNatively) e.preventDefault();
}, { passive: false });

// ── Start ───────────────────────────────────────────────────────────────────

theme();
layout();
buildNumpad();

// The QR code carries the pairing code after "#"; take it out of the address bar.
const fromLink = location.hash.match(/^#(\d{6})$/)?.[1];
if (fromLink) history.replaceState(null, '', location.pathname);

if (isNative) {
  initBluetoothPairing({ root: $('#bt'), link, sound });
  link.connect();
  // Android's Back button: close whatever is open before leaving the app.
  window.__thockBack = () => {
    if (drawerOpen) { closeDrawer(); return true; }
    if (padFull) { trackpad.reset(); padFull = false; layout(); return true; }
    return false;
  };
} else if (demo) {
  link.connect();
  // The website's buttons change the switch and the colourway of its demo.
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || typeof e.data?.thock !== 'object') return;
    for (const [key, value] of Object.entries(e.data.thock)) {
      set(key, value);
      if (key === 'switch') sound.demo();
    }
  });
} else {
  const known = fromLink ?? pairing.get();
  if (known) connect(String(known));
  else showPair();
}
