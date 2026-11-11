import { settings, set } from './store.js';
import { SWITCHES } from './sound.js';
import { COLORWAYS, PROFILES, chips } from './themes.js';

// Tiny DOM helper: h('div', { class: 'x', onclick: fn }, child, child)
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (name === 'class') el.className = value;
    else if (name === 'html') el.innerHTML = value;
    else if (name.startsWith('on')) el.addEventListener(name.slice(2), value);
    else el.setAttribute(name, value);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

const STEM = (color) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="1.5" fill="#0008"/><path d="M12 5v14M5 12h14" stroke="${color}" stroke-width="4.2"/></svg>`;

/**
 * Builds the settings drawer.
 *   rotated()   whether the UI is drawn sideways (changes drag directions)
 *   sound       for previews and feedback ticks
 *   link        connection, for the device tab
 *   onForget()  user asked to unpair
 */
export function buildSettings({ root, rotated, sound, link, onClose, onForget }) {
  const syncers = [];             // re-read settings into every control
  const sync = () => syncers.forEach((fn) => fn());
  const pick = (key, value) => { set(key, value); sound.tick(0.5); sync(); };

  // ── Controls ──────────────────────────────────────────────────────────────

  function row(label, control, hint) {
    return h('div', { class: 'row' },
      h('div', { class: 'row-text' }, h('span', { class: 'row-label' }, label), hint && h('span', { class: 'row-hint' }, hint)),
      control);
  }

  function toggle(key) {
    const el = h('button', { class: 'toggle', type: 'button', role: 'switch', onclick: () => pick(key, !settings[key]) }, h('i'));
    syncers.push(() => el.setAttribute('aria-checked', String(!!settings[key])));
    return el;
  }

  function segmented(key, options) {
    const buttons = options.map(([value, label]) =>
      h('button', { type: 'button', onclick: () => pick(key, value) }, label));
    syncers.push(() => buttons.forEach((b, i) => b.classList.toggle('on', settings[key] === options[i][0])));
    return h('div', { class: 'seg' }, buttons);
  }

  // A hand-rolled slider: native range inputs drag along the wrong axis when
  // the whole UI is rotated.
  function slider(key, { min, max, step, track, onInput }) {
    const el = h('div', { class: `slider ${track ?? ''}`, role: 'slider', 'aria-valuemin': min, 'aria-valuemax': max }, h('i'));
    const show = () => {
      el.style.setProperty('--p', (settings[key] - min) / (max - min));
      el.setAttribute('aria-valuenow', settings[key]);
    };
    const fromPointer = (e) => {
      const box = el.getBoundingClientRect();
      const along = rotated() ? (e.clientY - box.top) / box.height : (e.clientX - box.left) / box.width;
      const pad = 12 / (rotated() ? box.height : box.width); // thumb radius
      const p = Math.max(0, Math.min(1, (along - pad) / (1 - 2 * pad)));
      const value = Math.round((min + p * (max - min)) / step) * step;
      set(key, Number(value.toFixed(4)));
      show();
      onInput?.(settings[key]);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation(); // don't start a drag-scroll
      el.setPointerCapture(e.pointerId);
      fromPointer(e);
    });
    el.addEventListener('pointermove', (e) => { if (el.hasPointerCapture(e.pointerId)) fromPointer(e); });
    syncers.push(show);
    return el;
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const soundTab = () => [
    h('h3', {}, 'Switch'),
    h('div', { class: 'cards' }, SWITCHES.map((sw) => {
      const card = h('button', {
        class: 'card', type: 'button',
        onclick: () => { set('switch', sw.id); sound.setSwitch(sw.id); sound.demo(); sync(); },
      }, h('span', { class: 'stem', html: STEM(sw.stem) }), h('b', {}, sw.name), h('small', {}, sw.note));
      syncers.push(() => card.classList.toggle('on', settings.switch === sw.id));
      return card;
    })),
    row('Volume', slider('volume', { min: 0, max: 1, step: 0.05, onInput: (v) => { sound.setVolume(v); } })),
    'vibrate' in navigator && row('Vibrate on press', toggle('haptics')),
    h('p', { class: 'note' }, 'Keys left of this panel are live for testing. Nothing is sent to the computer while settings are open.'),
  ];

  const capsTab = () => {
    const colorInput = (part, label) => {
      const input = h('input', { type: 'color', 'aria-label': label });
      input.addEventListener('input', () => {
        set('custom', { ...settings.custom, [part]: input.value });
        if (settings.colorway !== 'custom') pick('colorway', 'custom');
      });
      syncers.push(() => { input.value = settings.custom[part]; });
      return h('label', { class: 'color' }, input, label);
    };

    return [
      h('h3', {}, 'Profile'),
      h('div', { class: 'cards tight' }, PROFILES.map((p) => {
        const card = h('button', { class: 'card', type: 'button', onclick: () => pick('profile', p.id) },
          h('span', { class: 'mini', 'data-profile': p.id, html: '<span class="key alpha"><span class="cap"><span class="top"></span><span class="lg glyph">A</span></span></span>' }),
          h('b', {}, p.name), h('small', {}, p.note));
        syncers.push(() => card.classList.toggle('on', settings.profile === p.id));
        return card;
      })),
      h('h3', {}, 'Colourway'),
      // Grouped by the keyboard each set is modelled on.
      [...new Set(COLORWAYS.map((c) => c.set))].map((group) => [
        h('h4', {}, group),
        h('div', { class: 'swatches' }, COLORWAYS.filter((c) => c.set === group).map((c) => {
          const [a, m, x] = chips(c);
          const swatch = h('button', { class: 'swatch', type: 'button', onclick: () => pick('colorway', c.id) },
            h('span', { class: 'chips', style: `--a:${a};--m:${m};--x:${x};--k:${c.case}` }, h('i'), h('i'), h('i')),
            c.name);
          syncers.push(() => swatch.classList.toggle('on', settings.colorway === c.id));
          return swatch;
        })),
      ]),
      row('Case', segmented('caseColor', [['auto', 'As sold'], ['white', 'White'], ['black', 'Black']]), 'The body under the caps'),
      row('Your own colours', h('div', { class: 'colors' }, colorInput('alpha', 'Letters'), colorInput('mod', 'Modifiers'), colorInput('accent', 'Accent'))),
      h('h3', {}, 'Legends'),
      row('Placement', segmented('legends', [['corner', 'Corner'], ['center', 'Centre'], ['side', 'Side'], ['none', 'Blank']]), 'Side prints them on the front face and leaves the tops blank; easiest to read on a tablet'),
      row('Typeface', segmented('font', [['sans', 'Sans'], ['mono', 'Mono'], ['serif', 'Serif']])),
    ];
  };

  const glowTab = () => [
    h('h3', {}, 'Legends'),
    segmented('lit', [['off', 'Off'], ['solid', 'Solid'], ['cycle', 'Cycle'], ['wave', 'Wave']]),
    h('p', { class: 'note' }, 'Lights the letters from behind, like shine-through caps. Cycle changes colour over time; Wave sends a rainbow across the board.'),
    h('h3', {}, 'Under the keys'),
    segmented('glow', [['off', 'Off'], ['static', 'Solid'], ['breathe', 'Breathe'], ['wave', 'Wave'], ['reactive', 'Reactive']]),
    h('p', { class: 'note' }, 'Light between the caps. Pick the Pudding profile to let it through the sides as well.'),
    h('h3', {}, 'Colour'),
    row('Hue', slider('glowHue', { min: 0, max: 360, step: 2, track: 'hue' }), 'For the Solid, Breathe and Reactive modes'),
    row('Brightness under the keys', slider('glowLevel', { min: 0.2, max: 1, step: 0.05 })),
  ];

  const feelTab = () => [
    h('h3', {}, 'Keys'),
    row('Sticky modifiers', toggle('sticky'), 'Tap Shift, Ctrl, Alt, Win or Fn once to hold it for the next key'),
    row('Hold to repeat', toggle('repeat')),
    row('Layout', segmented('layout', [['auto', 'Auto'], ['compact', '65%'], ['full', '75%']])),
    !link.native && row('Turn sideways', segmented('rotate', [['auto', 'Auto'], ['off', 'Never']]), 'Draws the keyboard in landscape on an upright phone'),
    !link.native && document.documentElement.requestFullscreen && row('Full screen', toggle('fullscreen'), 'Hides the browser bars on the first tap'),
    h('h3', {}, 'Trackpad'),
    row('Show beside keys', segmented('dock', [['auto', 'Auto'], ['on', 'Always'], ['off', 'Never']]), 'The trackpad key always opens it full screen'),
    row('Pointer speed', slider('speed', { min: 0.6, max: 3.2, step: 0.1 })),
    row('Natural scrolling', toggle('natural')),
    h('p', { class: 'note' }, 'Tap to click. Two-finger tap for right click, two-finger drag to scroll. Tap then drag to hold the button.'),
  ];

  const status = h('b', {});
  const detail = h('small', {});
  const refreshDevice = () => {
    status.textContent = link.isOpen ? `Connected to ${link.host ?? 'computer'}` : 'Not connected';
    if (link.native) detail.textContent = link.isOpen ? 'Over Bluetooth, as a keyboard and mouse' : 'Add this phone from the computer’s Bluetooth settings';
    else detail.textContent = link.isOpen && link.latency != null ? `${link.latency} ms round trip` : 'Check that Thock is running and both devices share a Wi-Fi network';
  };
  const linkTab = () => [
    h('h3', {}, 'Computer'),
    h('div', { class: 'device' }, h('span', { class: 'dot' }), h('div', {}, status, detail)),
    h('button', { class: 'plain', type: 'button', onclick: onForget }, link.native ? 'Disconnect' : 'Forget this computer'),
    link.native && h('p', { class: 'note' }, 'To unpair for good, remove this phone in the computer’s Bluetooth settings, and the computer in this phone’s.'),
    /iPhone|iPad|Macintosh/.test(navigator.userAgent) && !navigator.standalone &&
      h('p', { class: 'note' }, 'For a true full-screen keyboard on iPhone or iPad, use Share → Add to Home Screen and open Thock from there.'),
  ];

  const TABS = [['Sound', soundTab], ['Caps', capsTab], ['Light', glowTab], ['Feel', feelTab], ['Link', linkTab]];

  const body = h('div', { class: 'drawer-body' });
  const panes = TABS.map(([, build]) => h('div', { class: 'pane' }, build()));
  body.append(...panes);

  const tabButtons = TABS.map(([name], index) => h('button', { type: 'button', onclick: () => show(index) }, name));
  function show(index) {
    tabButtons.forEach((b, i) => b.classList.toggle('on', i === index));
    panes.forEach((p, i) => { p.hidden = i !== index; });
    body.scrollTop = 0;
    sound.tick(0.5);
  }

  root.append(
    h('header', { class: 'drawer-head' },
      h('nav', { class: 'tabs' }, tabButtons),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close settings', onclick: onClose, html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2"/></svg>' })),
    body);

  dragScroll(body, rotated);
  tabButtons.forEach((b, i) => b.classList.toggle('on', i === 0));
  panes.forEach((p, i) => { p.hidden = i !== 0; });
  sync();
  refreshDevice();

  return { sync, refreshDevice };
}

// Touch scrolling that still works when the UI is rotated 90°, where the
// browser's own scrolling would follow the wrong axis.
function dragScroll(el, rotated) {
  let last = null, velocity = 0, travelled = 0, coast = null;

  el.addEventListener('pointerdown', (e) => {
    // Upright, the browser scrolls natively; this only takes over when rotated.
    if (e.pointerType === 'mouse' || !rotated()) return;
    cancelAnimationFrame(coast);
    last = { pos: rotated() ? -e.clientX : e.clientY, t: e.timeStamp, id: e.pointerId };
    velocity = 0;
    travelled = 0;
  });
  el.addEventListener('pointermove', (e) => {
    if (!last || e.pointerId !== last.id) return;
    const pos = rotated() ? -e.clientX : e.clientY;
    const delta = pos - last.pos;
    travelled += Math.abs(delta);
    if (travelled > 6) {
      el.scrollTop -= delta;
      velocity = delta / Math.max(1, e.timeStamp - last.t);
    }
    last.pos = pos;
    last.t = e.timeStamp;
  });
  const end = (e) => {
    if (!last || e.pointerId !== last.id) return;
    last = null;
    const step = () => {
      if (Math.abs(velocity) < 0.02) return;
      el.scrollTop -= velocity * 16;
      velocity *= 0.94;
      coast = requestAnimationFrame(step);
    };
    step();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // A drag must not also press whatever was under the finger.
  el.addEventListener('click', (e) => {
    if (travelled > 6) { e.stopPropagation(); e.preventDefault(); travelled = 0; }
  }, true);
}
