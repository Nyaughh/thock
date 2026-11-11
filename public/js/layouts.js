// Physical layouts, in keycap units (1u = one letter key).
// Codes starting with "$" are handled on the phone and never sent.

const k = (code, w = 1) => ({ code, w });
const gap = (w) => ({ gap: w });
const run = (codes) => codes.split(' ').map((code) => k(code));

const NUMBERS = 'Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal';
const TOP = 'KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight';
const HOME = 'KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote';
const BOTTOM = 'KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash';

/** Space between the function row and the rest, in row heights. */
const SPLIT = 0.2;

export const LAYOUTS = {
  // 75%: the layout of a Rainy75 or F75. Function row in three blocks, a
  // navigation column, and a knob in the corner (here it opens settings).
  full: {
    cols: 16,
    split: true,
    rows: [
      [k('Escape'), gap(0.25), ...run('F1 F2 F3 F4'), gap(0.25), ...run('F5 F6 F7 F8'), gap(0.25),
        ...run('F9 F10 F11 F12'), gap(0.25), k('Delete'), k('$settings')],
      [k('Backquote'), ...run(NUMBERS), k('Backspace', 2), k('Home')],
      [k('Tab', 1.5), ...run(TOP), k('Backslash', 1.5), k('PageUp')],
      [k('CapsLock', 1.75), ...run(HOME), k('Enter', 2.25), k('PageDown')],
      [k('ShiftLeft', 2.25), ...run(BOTTOM), k('ShiftRight', 1.75), k('ArrowUp'), k('End')],
      [k('ControlLeft', 1.25), k('MetaLeft', 1.25), k('AltLeft', 1.25), k('Space', 6.25),
        k('AltRight'), k('$fn'), k('$pad'), k('ArrowLeft'), k('ArrowDown'), k('ArrowRight')],
    ],
  },
  // 65%: five rows, for screens too narrow to give 16 keys a usable width.
  compact: {
    cols: 15,
    split: false,
    rows: [
      [k('Escape'), ...run(NUMBERS), k('Backspace', 2)],
      [k('Tab', 1.5), ...run(TOP), k('Backslash', 1.5)],
      [k('CapsLock', 1.75), ...run(HOME), k('Enter', 2.25)],
      [k('ShiftLeft', 2), ...run(BOTTOM), k('ShiftRight'), k('ArrowUp'), k('Delete')],
      [k('ControlLeft', 1.25), k('MetaLeft', 1.25), k('AltLeft', 1.25), k('Space', 5.25),
        k('$fn'), k('$pad'), k('$settings'), k('ArrowLeft'), k('ArrowDown'), k('ArrowRight')],
    ],
  },
};

/** Height of a layout in row heights, counting the gap under the function row. */
export const rowUnits = (layout) => layout.rows.length + (layout.split ? SPLIT : 0);

/** CSS grid rows for a layout. */
export const rowTemplate = (layout) =>
  layout.rows.map((_, i) => (layout.split && i === 1 ? `${SPLIT}fr 1fr` : '1fr')).join(' ');

/** Grid line a row starts on (the split takes a line of its own). */
export const rowLine = (layout, row) => row + 1 + (layout.split && row > 0 ? 1 : 0);

/** What a key sends while Fn is held. */
export const FN = {
  Escape: 'Backquote',
  Digit1: 'F1', Digit2: 'F2', Digit3: 'F3', Digit4: 'F4', Digit5: 'F5', Digit6: 'F6',
  Digit7: 'F7', Digit8: 'F8', Digit9: 'F9', Digit0: 'F10', Minus: 'F11', Equal: 'F12',
  Backspace: 'Delete', Delete: 'Insert', Backslash: 'PrintScreen',
  ArrowLeft: 'Home', ArrowRight: 'End', ArrowUp: 'PageUp', ArrowDown: 'PageDown',
  KeyP: 'MediaPlayPause', BracketLeft: 'MediaTrackPrevious', BracketRight: 'MediaTrackNext',
  KeyM: 'AudioVolumeMute', Comma: 'AudioVolumeDown', Period: 'AudioVolumeUp',
};

export const MODIFIERS = new Set([
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', '$fn',
]);

// A string is one legend; a pair is [shifted, plain] stacked like a real cap.
const LEGENDS = {
  Escape: 'Esc', Backquote: ['~', '`'], Minus: ['_', '-'], Equal: ['+', '='], Backspace: 'Backspace',
  Digit1: ['!', '1'], Digit2: ['@', '2'], Digit3: ['#', '3'], Digit4: ['$', '4'], Digit5: ['%', '5'],
  Digit6: ['^', '6'], Digit7: ['&', '7'], Digit8: ['*', '8'], Digit9: ['(', '9'], Digit0: [')', '0'],
  Tab: 'Tab', BracketLeft: ['{', '['], BracketRight: ['}', ']'], Backslash: ['|', '\\'],
  CapsLock: 'Caps', Semicolon: [':', ';'], Quote: ['"', "'"], Enter: 'Enter',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', Comma: ['<', ','], Period: ['>', '.'], Slash: ['?', '/'],
  ControlLeft: 'Ctrl', MetaLeft: 'Win', AltLeft: 'Alt', AltRight: 'Alt', Space: '', $fn: 'Fn',
  ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', ArrowRight: '→',
  Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  PrintScreen: 'PrtSc',
  MediaPlayPause: 'Play', MediaTrackPrevious: 'Prev', MediaTrackNext: 'Next',
  AudioVolumeMute: 'Mute', AudioVolumeDown: 'Vol−', AudioVolumeUp: 'Vol+',
};

const ICONS = {
  // A trackpad with its two buttons.
  $pad: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 14.5h18M12 14.5v5" stroke="currentColor" stroke-width="1.8"/></svg>',
  // Three sliders (65% layout; on the 75% layout the knob stands in for this).
  $settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16M12 4v16M19 4v16" stroke="currentColor" stroke-width="1.8"/><path d="M2.6 7h4.8v4H2.6zM9.6 13h4.8v4H9.6zM16.600 6h4.8v4h-4.8z" fill="currentColor"/></svg>',
};

export const LABELS = { $pad: 'Trackpad', $settings: 'Settings', $fn: 'Function layer', Space: 'Space' };

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Legend markup for a key. `layer` is "base", or "alt" for what shows while Fn is held. */
export function legendHTML(code, layer = 'base') {
  if (ICONS[code]) return `<span class="lg icon ${layer}">${ICONS[code]}</span>`;
  let legend = LEGENDS[code];
  if (legend === undefined) legend = /^Key[A-Z]$/.test(code) ? code[3] : code; // letters, F1–F12
  if (Array.isArray(legend)) {
    return `<span class="lg dual ${layer}"><i>${escape(legend[0])}</i><b>${escape(legend[1])}</b></span>`;
  }
  const kind = legend.length > 1 ? 'word' : 'glyph';
  return `<span class="lg ${kind} ${layer}">${escape(legend)}</span>`;
}

/**
 * Which of the three colours a key takes. Same split as the boards this is
 * modelled on: letters in one, modifiers in a second, and a third on Esc,
 * Enter, the space bar and the arrows. The middle block of function keys
 * takes the modifier colour.
 */
export function keyGroup(code) {
  if (/^(Escape|Enter|Space|Arrow\w+)$/.test(code)) return 'accent';
  if (/^(Key[A-Z]|Digit\d|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/.test(code)) return 'alpha';
  if (/^F([1-4]|9|1[0-2])$/.test(code)) return 'alpha';
  return 'mod';
}
