// Key sounds: recordings of real switches, played back with no decoding or
// scheduling in the way of a key press.
//
// Each switch is one WAV (sounds/<id>.wav) holding its clips back to back: a
// press for each row of the board, separate presses for space, enter and
// backspace, and the sound of each coming back up. The recordings are from
// kbsim (MIT); tools/build-sounds.py cuts and levels them.

import { settings } from './store.js';
import { SWITCHES, SAMPLE_RATE } from './sound-packs.js';

export { SWITCHES };
export const DEFAULT_SWITCH = 'blackink';

const WAV_HEADER = 44; // bytes before the samples in the files this app builds
const rand = (spread) => 1 + (Math.random() * 2 - 1) * spread;
const find = (id) => SWITCHES.find((s) => s.id === id) ?? SWITCHES.find((s) => s.id === DEFAULT_SWITCH);

export class Sound {
  #ctx = null;
  #master = null;
  #files = new Map();   // switch id -> Promise<ArrayBuffer>
  #bank = null;         // clip name -> AudioBuffer, for the switch in use
  #bankId = null;
  #wanted = null;

  constructor() {
    // Start downloading before the first touch, so the first key already clicks.
    this.#fetch(find(settings.switch).id);
  }

  #fetch(id) {
    if (!this.#files.has(id)) {
      const file = fetch(`sounds/${id}.wav`).then((response) => {
        if (!response.ok) throw new Error(`sounds/${id}.wav: ${response.status}`);
        return response.arrayBuffer();
      });
      file.catch(() => this.#files.delete(id)); // allow another try later
      this.#files.set(id, file);
    }
    return this.#files.get(id);
  }

  /** Call from a touch handler: browsers only start audio on a gesture. */
  unlock() {
    if (!this.#ctx) this.#create();
    if (this.#ctx.state !== 'running') this.#ctx.resume().catch(() => {});
  }

  #create() {
    const Ctx = window.AudioContext ?? window.webkitAudioContext;
    const ctx = (this.#ctx = new Ctx({ latencyHint: 'interactive' }));
    // On iOS, play even when the ringer switch is on silent.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }

    // master -> soft clip -> out. The clip only matters when many keys land
    // at once; a single key passes through untouched.
    const master = (this.#master = ctx.createGain());
    const clip = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.abs(x) < 0.6 ? x : Math.sign(x) * (0.6 + 0.4 * Math.tanh((Math.abs(x) - 0.6) / 0.4));
    }
    clip.curve = curve;
    master.connect(clip).connect(ctx.destination);

    this.setVolume(settings.volume);
    this.setSwitch(settings.switch);
  }

  setVolume(volume) {
    if (this.#master) this.#master.gain.value = volume ** 1.6;
  }

  /** Switch to another set of recordings. Keeps the current one until the new one is ready. */
  async setSwitch(id) {
    const pack = find(id);
    this.#wanted = pack.id;
    if (!this.#ctx || pack.id === this.#bankId) return;
    let file;
    try { file = await this.#fetch(pack.id); } catch { return; }
    if (this.#wanted !== pack.id) return; // another switch was picked meanwhile

    // The files are plain 16-bit PCM, so there is nothing to decode: read the
    // samples and hand each clip to the audio engine as its own buffer.
    const pcm = new Int16Array(file, WAV_HEADER);
    const bank = {};
    for (const [name, [start, length]] of Object.entries(pack.clips)) {
      const buffer = this.#ctx.createBuffer(1, length, SAMPLE_RATE);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = pcm[start + i] / 32768;
      bank[name] = buffer;
    }
    this.#bank = bank;
    this.#bankId = pack.id;
  }

  #play(buffer, gain, pan, rate, delay = 0) {
    const ctx = this.#ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    let tail = source.connect(amp);
    if (pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      tail = tail.connect(panner);
    }
    tail.connect(this.#master);
    source.start(delay ? ctx.currentTime + delay : 0);
  }

  // No two real key presses are identical; a few percent of pitch and level
  // keeps one recording from sounding like a machine gun.
  #voice(clip, x, gain = 1, delay = 0) {
    if (settings.volume <= 0) return;
    this.unlock();
    const buffer = this.#bank?.[clip];
    if (buffer) this.#play(buffer, gain * rand(0.1), (x - 0.5) * 0.7, rand(0.03), delay);
  }

  /** size: 'normal' | 'big' | 'space'. x: 0–1 across the board. row: 0 at the top, 4 at the bottom. */
  down(size, x, row, isEnter = false) {
    this.#voice(isEnter ? 'enter' : size === 'space' ? 'space' : size === 'big' ? 'back' : `p${Math.max(0, Math.min(4, row))}`, x);
  }

  up(size, x, row, isEnter = false) {
    this.#voice(isEnter ? 'renter' : size === 'space' ? 'rspace' : size === 'big' ? 'rback' : 'r', x);
  }

  /** Small click for the trackpad and settings: the current switch's release, lighter. */
  tick(strength = 1) {
    if (settings.volume <= 0) return;
    this.unlock();
    const buffer = this.#bank?.r;
    if (buffer) this.#play(buffer, 0.45 * strength, 0, 1.12 * rand(0.03));
  }

  /** A short burst of typing, so a switch can be judged from the settings. */
  async demo() {
    if (settings.volume <= 0) return;
    this.unlock();
    await this.setSwitch(this.#wanted ?? settings.switch);
    const strokes = [[0.2, 'p1'], [0.55, 'p2'], [0.4, 'p2'], [0.7, 'p3'], [0.5, 'space']];
    strokes.forEach(([x, clip], i) => {
      const at = i * 0.11 + Math.random() * 0.02;
      this.#voice(clip, x, 1, at);
      this.#voice(clip === 'space' ? 'rspace' : 'r', x, 1, at + 0.075);
    });
  }
}
