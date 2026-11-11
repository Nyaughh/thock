#!/usr/bin/env node
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { createDriver } from './drivers/index.js';
import { pairPage } from './pair-page.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PAIRING_FILE = path.join(ROOT, 'data', 'pairing.json');

const { values: args } = parseArgs({
  options: {
    port: { type: 'string', default: '4747' },
    'dry-run': { type: 'boolean', default: false },
    'no-open': { type: 'boolean', default: false },
    'new-code': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (args.help) {
  console.log(`thock — phone keyboard + trackpad for this computer

  --port <n>    port to listen on (default 4747)
  --dry-run     log input instead of typing it
  --new-code    generate a fresh pairing code
  --no-open     don't open the pairing page in the browser`);
  process.exit(0);
}

// ── Pairing code ────────────────────────────────────────────────────────────
// Six digits, kept across restarts so a phone that paired once reconnects on
// its own. Guessing is throttled below.

function loadCode() {
  if (!args['new-code']) {
    try {
      const { code } = JSON.parse(fs.readFileSync(PAIRING_FILE, 'utf8'));
      if (/^\d{6}$/.test(code)) return code;
    } catch { /* first run */ }
  }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  fs.mkdirSync(path.dirname(PAIRING_FILE), { recursive: true });
  fs.writeFileSync(PAIRING_FILE, JSON.stringify({ code }, null, 2));
  return code;
}

const CODE = loadCode();
const MAX_FAILS_PER_MINUTE = 8;
let failures = [];

function checkCode(given) {
  const now = Date.now();
  failures = failures.filter((t) => now - t < 60_000);
  if (failures.length >= MAX_FAILS_PER_MINUTE) return 'locked';
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(CODE);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return 'ok';
  failures.push(now);
  return 'wrong';
}

// ── Network helpers ─────────────────────────────────────────────────────────

function lanAddresses() {
  const found = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal || addr.address.startsWith('169.254.')) continue;
      // Home networks first; VPN and virtual adapters are rarely what the
      // phone can reach, so they are only offered as alternatives.
      const home = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(addr.address);
      const virtual = /vEthernet|WSL|VirtualBox|VMware|Hyper-V|Docker|Loopback|Tailscale|ZeroTier|vpn|tun|tap/i.test(name);
      found.push({ name, address: addr.address, rank: (virtual ? 2 : 0) + (home ? 0 : 1) });
    }
  }
  return found.sort((a, b) => a.rank - b.rank);
}

const isLoopback = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

// Only answer requests addressed to this machine by IP or name. Stops a
// website from reaching the server through DNS rebinding.
function hostAllowed(header) {
  let hostname;
  try { hostname = new URL(`http://${header}`).hostname.replace(/^\[|\]$/g, '').toLowerCase(); }
  catch { return false; }
  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return true;
  if (lanAddresses().some((a) => a.address === hostname)) return true;
  const self = os.hostname().toLowerCase();
  return hostname === self || hostname === `${self}.local`;
}

function sameOrigin(req) {
  const { origin, host } = req.headers;
  if (!origin) return true; // not a browser; still needs the code
  try { return new URL(origin).host === host; } catch { return false; }
}

// ── HTTP ────────────────────────────────────────────────────────────────────

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function reply(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return reply(res, 400, 'Bad request'); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return reply(res, 403, 'Forbidden');
  try {
    const body = await fs.promises.readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; ` +
        `connect-src 'self' ws://${req.headers.host}; frame-ancestors 'none'`,
    });
    res.end(body);
  } catch {
    reply(res, 404, 'Not found');
  }
}

const clients = new Set();
let port = Number(args.port);

const server = http.createServer(async (req, res) => {
  if (!hostAllowed(req.headers.host)) return reply(res, 403, 'Forbidden');
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(res, 405, 'Method not allowed');
  const { pathname } = new URL(req.url, 'http://x');

  // The pairing page shows the code, so it is only served to this computer.
  if (pathname === '/pair' || pathname === '/pair/status') {
    if (!isLoopback(req)) return reply(res, 403, 'Open this page on the computer running Thock.');
    if (pathname === '/pair/status') {
      return reply(res, 200, JSON.stringify({ devices: [...clients].filter((c) => c.authed).map((c) => c.name) }), TYPES['.json']);
    }
    const urls = lanAddresses().map((a) => ({ ...a, url: `http://${a.address}:${port}/` }));
    const qr = urls[0] ? await QRCode.toString(`${urls[0].url}#${CODE}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) : '';
    return reply(res, 200, pairPage({ code: CODE, urls, qr, dryRun: args['dry-run'] }), TYPES['.html']);
  }

  serveStatic(req, res, pathname);
});

// ── Input ───────────────────────────────────────────────────────────────────

let driver;
try {
  driver = createDriver({ dryRun: args['dry-run'] });
} catch (error) {
  console.error(`\n  ${error.message}\n`);
  process.exit(1);
}
driver.on('warn', (message) => console.warn(`  ! ${message}`));
driver.on('fatal', (error) => { console.error(`\n  ${error.message}\n`); process.exit(1); });
driver.on('caps', (on) => broadcast(['caps', on]));

function broadcast(message) {
  const text = JSON.stringify(message);
  for (const client of clients) if (client.authed && client.ws.readyState === 1) client.ws.send(text);
}

const clamp = (value, limit) => Math.max(-limit, Math.min(limit, Math.round(value)));
const isNum = (value) => typeof value === 'number' && Number.isFinite(value);

function handleInput(client, message) {
  if (!Array.isArray(message)) return;
  const [op, a, b] = message;
  switch (op) {
    case 'kd':
      if (typeof a !== 'string' || !driver.hasKey(a)) return;
      if (!client.keys.has(a) && client.keys.size >= 24) return;
      client.keys.add(a);
      driver.key(a, true);
      break;
    case 'ku':
      if (typeof a !== 'string' || !client.keys.delete(a)) return;
      driver.key(a, false);
      if (a === 'CapsLock') setTimeout(() => driver.queryCaps(), 40);
      break;
    case 'm':
      if (isNum(a) && isNum(b)) driver.move(clamp(a, 3000), clamp(b, 3000));
      break;
    case 'bd':
      if (a === 0 || a === 1 || a === 2) { client.buttons.add(a); driver.button(a, true); }
      break;
    case 'bu':
      if (client.buttons.delete(a)) driver.button(a, false);
      break;
    case 'w':
      if (isNum(a)) driver.wheel(clamp(a, 2400), isNum(b) ? clamp(b, 2400) : 0);
      break;
    case 'ping':
      client.ws.send(JSON.stringify(['pong', a]));
      break;
  }
}

// A phone that drops off Wi-Fi mid-press must not leave Shift held forever.
function releaseAll(client) {
  for (const code of client.keys) driver.key(code, false);
  for (const button of client.buttons) driver.button(button, false);
  client.keys.clear();
  client.buttons.clear();
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname !== '/ws' || !hostAllowed(req.headers.host) || !sameOrigin(req)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  const client = { ws, authed: false, alive: true, name: 'device', keys: new Set(), buttons: new Set() };
  clients.add(client);
  const authTimer = setTimeout(() => { if (!client.authed) ws.close(4001, 'no code sent'); }, 8000);

  ws.on('pong', () => { client.alive = true; });
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    let message;
    try { message = JSON.parse(data.toString()); } catch { return; }

    if (client.authed) return handleInput(client, message);

    if (message?.t !== 'hello') return;
    const result = checkCode(message.code);
    if (result !== 'ok') {
      ws.send(JSON.stringify({ t: 'no', reason: result }));
      return ws.close(4003, result);
    }
    client.authed = true;
    client.name = String(message.name ?? 'device').replace(/[^\w .-]/g, '').slice(0, 24) || 'device';
    clearTimeout(authTimer);
    ws.send(JSON.stringify({ t: 'ok', host: os.hostname() }));
    driver.queryCaps();
    console.log(`  + ${client.name} connected`);
  });
  ws.on('close', () => {
    clearTimeout(authTimer);
    releaseAll(client);
    clients.delete(client);
    if (client.authed) console.log(`  − ${client.name} disconnected`);
  });
  ws.on('error', () => {});
});

setInterval(() => {
  for (const client of clients) {
    if (!client.alive) { client.ws.terminate(); continue; }
    client.alive = false;
    client.ws.ping();
  }
}, 10_000).unref();

// ── Start ───────────────────────────────────────────────────────────────────

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] :
    process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: true }).on('error', () => {}).unref();
}

async function banner() {
  const addrs = lanAddresses();
  const pairUrl = `http://localhost:${port}/pair`;
  const spaced = `${CODE.slice(0, 3)} ${CODE.slice(3)}`;
  console.log(`\n  THOCK${args['dry-run'] ? '  (dry run: nothing is typed)' : ''}\n`);
  if (!addrs.length) {
    console.log('  No Wi-Fi or network connection found. Connect this computer to the\n  same network as your phone, then start Thock again.\n');
  } else {
    const url = `http://${addrs[0].address}:${port}/`;
    console.log('  Scan with your phone camera (same Wi-Fi as this computer):\n');
    const qr = await QRCode.toString(`${url}#${CODE}`, { type: 'terminal', small: true });
    console.log(qr.split('\n').map((line) => `  ${line}`).join('\n'));
    console.log(`  or open  ${url}  and enter code  ${spaced}\n`);
  }
  console.log(`  Pairing page on this computer: ${pairUrl}`);
  console.log('  Press Ctrl+C to stop.\n');
  if (!args['no-open']) openBrowser(pairUrl);
}

let attempts = 0;
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && attempts++ < 10) return server.listen(++port, '0.0.0.0');
  console.error(`\n  Could not start: ${error.message}\n`);
  process.exit(1);
});
server.on('listening', banner);
await driver.ready;
server.listen(port, '0.0.0.0');

function shutdown() {
  for (const client of clients) releaseAll(client);
  driver.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
