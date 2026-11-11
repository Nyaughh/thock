const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The page shown on the desktop: QR code, pairing code, who is connected. */
export function pairPage({ code, urls, qr, dryRun }) {
  const digits = [...code].map((d) => `<span class="cap"><b>${d}</b></span>`).join('');
  const primary = urls[0];
  const others = urls.slice(1).map((u) => `<li><code>${esc(u.url)}</code> <span>${esc(u.name)}</span></li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thock · pair a device</title>
<style>
  :root { --bg:#0c0d0f; --case:#17181b; --cap:#3a3d42; --ink:#e8e6e1; --dim:#8b8a85; --hot:#ff7a3d; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:
    radial-gradient(900px 500px at 70% -10%, #2a1a12 0%, transparent 60%), var(--bg);
    color:var(--ink); font:16px/1.5 ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; }
  main { display:grid; grid-template-columns:auto minmax(0, 26rem); gap:3.5rem; align-items:center; padding:2rem; }
  @media (max-width: 760px) { main { grid-template-columns:1fr; gap:2rem; justify-items:center; text-align:center; } }
  .qr { width:17rem; padding:1.1rem; background:#f4f1ea; border-radius:1.4rem;
    box-shadow:0 .5rem 0 #b9b4a8, 0 1.6rem 3rem rgba(0,0,0,.55); }
  .qr svg { display:block; width:100%; height:auto; }
  .none { width:17rem; padding:2rem; border:1px dashed #444; border-radius:1.4rem; color:var(--dim); }
  h1 { margin:0 0 .35rem; font-size:.8rem; letter-spacing:.32em; text-transform:uppercase; color:var(--hot); }
  h2 { margin:0 0 1.4rem; font-size:2.1rem; line-height:1.15; font-weight:650; letter-spacing:-.01em; text-wrap:balance; }
  p { margin:0 0 1rem; color:var(--dim); }
  code { font:500 .95em ui-monospace, "Cascadia Code", Consolas, monospace; color:var(--ink); }
  .code { display:flex; gap:.45rem; margin:.4rem 0 1.6rem; }
  @media (max-width: 760px) { .code { justify-content:center; } }
  .cap { width:3rem; height:3.4rem; border-radius:.5rem; background:linear-gradient(#4a4d53,#2b2d31);
    box-shadow:0 .28rem 0 #1b1c1f, 0 .6rem .9rem rgba(0,0,0,.5); display:grid; place-items:start center; padding-top:.22rem; }
  .cap:nth-child(4) { margin-left:.7rem; }
  .cap b { display:grid; place-items:center; width:2.3rem; height:2.45rem; border-radius:.38rem; background:var(--cap);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.14); font:600 1.45rem ui-monospace, "Cascadia Code", Consolas, monospace; }
  ul { list-style:none; margin:0 0 1rem; padding:0; color:var(--dim); font-size:.9rem; }
  li span { opacity:.7; }
  .status { display:inline-flex; align-items:center; gap:.6rem; padding:.5rem .9rem; border-radius:99px; background:var(--case); font-size:.9rem; }
  .led { width:.55rem; height:.55rem; border-radius:50%; background:#555; }
  .on .led { background:#5dff9b; box-shadow:0 0 .7rem #5dff9b; }
  .dry { color:var(--hot); }
</style>
</head>
<body>
<main>
  ${primary ? `<div class="qr">${qr}</div>` : '<div class="none">No network connection found. Join the same Wi-Fi as your phone and reload.</div>'}
  <div>
    <h1>Thock</h1>
    <h2>Point your phone camera at the code.</h2>
    <p>Phone and computer need to be on the same Wi-Fi. If the camera route is awkward, open
      ${primary ? `<code>${esc(primary.url)}</code>` : 'the address'} on the phone and type this code:</p>
    <div class="code" aria-label="Pairing code ${esc(code)}">${digits}</div>
    ${others ? `<p>Not loading? This computer has other addresses to try:</p><ul>${others}</ul>` : ''}
    ${dryRun ? '<p class="dry">Dry run: key presses are logged in the terminal, not typed.</p>' : ''}
    <div class="status" id="status"><span class="led"></span><span id="label">Waiting for a device</span></div>
  </div>
</main>
<script>
  const status = document.getElementById('status'), label = document.getElementById('label');
  async function poll() {
    try {
      const { devices } = await (await fetch('/pair/status')).json();
      status.classList.toggle('on', devices.length > 0);
      label.textContent = devices.length ? devices.join(', ') + ' connected' : 'Waiting for a device';
    } catch { status.classList.remove('on'); label.textContent = 'Thock is not running'; }
  }
  poll(); setInterval(poll, 2000);
</script>
</body>
</html>`;
}
