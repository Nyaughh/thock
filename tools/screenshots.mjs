// Takes the screenshots in docs/screenshots/: just the keyboard, cut to the
// edge of its case, on a transparent background, at three times phone size.
//
//   npm run dev                     (the keyboard on http://localhost:4747)
//   node tools/screenshots.mjs [address of the keyboard]
//
// Needs Chrome and ffmpeg. Drives Chrome through its DevTools protocol, with
// the `ws` package this project already uses.

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const BASE = process.argv[2] ?? 'http://localhost:4747/';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const OUT = 'docs/screenshots';

// file name -> settings in the address (see ?demo in public/js/store.js)
const SHOTS = {
  purple: '',
  'black-rgb': 'colorway=f75-grad-black&lit=wave&legends=side',
  'retro-65': 'colorway=retro&layout=compact',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(join(tmpdir(), 'thock-shots-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

async function page() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const target = list.find((t) => t.type === 'page');
      if (target) return target.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await wait(200);
  }
  throw new Error('Chrome did not start');
}

const socket = new WebSocket(await page());
await new Promise((resolve) => socket.once('open', resolve));
let nextId = 0;
const pending = new Map();
socket.on('message', (data) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});
async function send(method, params = {}) {
  const id = ++nextId;
  const reply = await new Promise((resolve) => { pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  if (reply.error) throw new Error(`${method}: ${reply.error.message}`);
  return reply.result;
}

try {
  await send('Page.enable');
  // A phone on its side, as the app is used.
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

  for (const [name, query] of Object.entries(SHOTS)) {
    await send('Page.navigate', { url: `${BASE}?demo${query ? '&' + query : ''}` });
    await wait(2500); // fonts, layout, and a moment of lighting
    const { result } = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        // Only the keyboard: the desk around it goes transparent.
        for (const el of [document.documentElement, document.body, stage, deck]) el.style.background = 'transparent';
        const r = board.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()`,
    });
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { ...result.value, scale: 1 } });
    const png = join(profile, `${name}.png`);
    writeFileSync(png, Buffer.from(data, 'base64'));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '90', '-pix_fmt', 'yuva420p', join(OUT, `${name}.webp`)]);
    console.log(`${OUT}/${name}.webp  ${Math.round(result.value.width * 3)}×${Math.round(result.value.height * 3)}`);
  }
} finally {
  socket.close();
  chrome.kill();
  await wait(500);
  rmSync(profile, { recursive: true, force: true });
}
