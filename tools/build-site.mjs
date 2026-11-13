// Builds the website into dist/: the landing page from site/, the keyboard
// itself under /app (the page shows it live with ?demo), and the screenshots.
//   node tools/build-site.mjs

import { cp, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await cp('site', 'dist', { recursive: true });
await cp('public', 'dist/app', { recursive: true });
await cp('docs/screenshots', 'dist/shots', { recursive: true });
await cp('public/icon.svg', 'dist/icon.svg');
await cp('public/apple-touch-icon.png', 'dist/apple-touch-icon.png');
console.log('Built dist/');
