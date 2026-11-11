import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'win', 'helper.ps1');

// KeyboardEvent.code -> Windows virtual-key code.
const VK = {
  Escape: 0x1b, Backquote: 0xc0, Minus: 0xbd, Equal: 0xbb, Backspace: 0x08,
  Tab: 0x09, BracketLeft: 0xdb, BracketRight: 0xdd, Backslash: 0xdc,
  CapsLock: 0x14, Semicolon: 0xba, Quote: 0xde, Enter: 0x0d,
  ShiftLeft: 0xa0, ShiftRight: 0xa1, Comma: 0xbc, Period: 0xbe, Slash: 0xbf,
  ControlLeft: 0xa2, ControlRight: 0xa3, MetaLeft: 0x5b, AltLeft: 0xa4, AltRight: 0xa5,
  Space: 0x20, ContextMenu: 0x5d,
  ArrowLeft: 0x25, ArrowUp: 0x26, ArrowRight: 0x27, ArrowDown: 0x28,
  Insert: 0x2d, Delete: 0x2e, Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22,
  PrintScreen: 0x2c,
  AudioVolumeMute: 0xad, AudioVolumeDown: 0xae, AudioVolumeUp: 0xaf,
  MediaTrackNext: 0xb0, MediaTrackPrevious: 0xb1, MediaPlayPause: 0xb3,
};
for (let i = 0; i < 26; i++) VK['Key' + String.fromCharCode(65 + i)] = 0x41 + i;
for (let i = 0; i < 10; i++) VK['Digit' + i] = 0x30 + i;
for (let i = 1; i <= 12; i++) VK['F' + i] = 0x6f + i;

const VK_CAPITAL = 0x14;

export class WindowsDriver extends EventEmitter {
  name = 'windows';
  #proc = null;
  #closing = false;
  #restarts = 0;
  #lastError = 0;

  constructor() {
    super();
    this.ready = new Promise((resolve) => this.once('ready', resolve));
    this.#start();
  }

  #start() {
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HELPER],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    this.#proc = proc;
    proc.stdin.on('error', () => {});

    createInterface({ input: proc.stdout }).on('line', (line) => {
      if (line === 'ready') {
        this.#restarts = 0;
        this.emit('ready');
      } else if (line.startsWith('s ')) {
        const [, vk, down, toggled] = line.split(' ');
        this.emit('state', Number(vk), down === '1', toggled === '1');
        if (Number(vk) === VK_CAPITAL) this.emit('caps', toggled === '1');
      } else if (line.startsWith('e ')) {
        // One blocked event usually means hundreds; say it once every few seconds.
        const now = Date.now();
        if (now - this.#lastError > 5000) {
          this.#lastError = now;
          this.emit('warn', `Input ${line.slice(2)}. Windows blocks injected input into apps running as administrator.`);
        }
      }
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });

    proc.on('exit', (code) => {
      if (this.#closing) return;
      if (this.#restarts++ < 3) {
        this.emit('warn', `Input helper stopped (code ${code}); restarting.`);
        setTimeout(() => this.#start(), 400);
      } else {
        this.emit('fatal', new Error(`Input helper keeps stopping.\n${stderr.trim()}`));
      }
    });
  }

  #write(line) {
    if (this.#proc?.stdin.writable) this.#proc.stdin.write(line + '\n');
  }

  hasKey(code) { return Object.hasOwn(VK, code); }
  key(code, down) { this.#write(`k ${VK[code]} ${down ? 1 : 0}`); }
  move(dx, dy) { this.#write(`m ${dx} ${dy}`); }
  button(index, down) { this.#write(`b ${index} ${down ? 1 : 0}`); }
  wheel(dy, dx = 0) { this.#write(`w ${dy} ${dx}`); }
  queryCaps() { this.#write(`q ${VK_CAPITAL}`); }
  /** Raw key-state query, used by the self-test. */
  query(vk) { this.#write(`q ${vk}`); }
  rawKey(vk, down) { this.#write(`k ${vk} ${down ? 1 : 0}`); }

  close() {
    this.#closing = true;
    this.#proc?.stdin.end();
  }
}

export const WINDOWS_KEYS = Object.keys(VK);
