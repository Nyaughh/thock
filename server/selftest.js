// Checks that this computer accepts injected input, without typing anything
// visible: it presses F24 (a key nothing listens to), asks Windows whether it
// went down, releases it, and sends a zero-distance mouse move.
import { WindowsDriver } from './drivers/windows.js';

if (process.platform !== 'win32') {
  console.log('Self-test only applies to Windows.');
  process.exit(0);
}

const VK_F24 = 0x87;
const driver = new WindowsDriver();
const warnings = [];
driver.on('warn', (message) => warnings.push(message));
driver.on('fatal', (error) => { console.error('FAIL', error.message); process.exit(1); });

const nextState = () => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('no reply from input helper')), 5000);
  driver.once('state', (vk, down) => { clearTimeout(timer); resolve(down); });
});

const started = Date.now();
await driver.ready;
console.log(`helper ready in ${Date.now() - started} ms`);

driver.rawKey(VK_F24, true);
driver.query(VK_F24);
const wentDown = await nextState();

driver.rawKey(VK_F24, false);
driver.query(VK_F24);
const stillDown = await nextState();

driver.move(0, 0);
driver.query(VK_F24);
await nextState();

driver.close();
const ok = wentDown && !stillDown && warnings.length === 0;
console.log(`key down seen: ${wentDown}, released: ${!stillDown}, warnings: ${warnings.length ? warnings.join(' | ') : 'none'}`);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
