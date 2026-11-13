// thock.lh3k.dev: the demo's buttons, and the release section, which reads
// GitHub each visit so a new release shows up here without a redeploy.

const REPO = 'Nyaughh/thock';

// ── Demo ─────────────────────────────────────────────────────────────────────
// The keyboard in the phone is the app itself (/app/?demo). It takes setting
// changes as messages from this page.

const demo = document.getElementById('demo');
const tell = (changes) => demo.contentWindow?.postMessage({ thock: changes }, location.origin);

function choose(group, button) {
  for (const other of group.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other === button));
}

const switches = document.getElementById('switches');
switches.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button) return;
  choose(switches, button);
  tell({ switch: button.dataset.switch });
});

const looks = document.getElementById('looks');
looks.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (!button) return;
  choose(looks, button);
  tell(JSON.parse(button.dataset.look));
});

// On a phone the demo is too small for the app's own settings drawer. Its
// settings key points here instead: to the pickers under the phone.
const picker = document.querySelector('.picker');
addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== demo.contentWindow || e.data?.thock !== 'settings') return;
  picker.scrollIntoView({ block: 'center', behavior: 'smooth' });
  picker.classList.remove('nudge');
  void picker.offsetWidth; // so the nudge plays again
  picker.classList.add('nudge');
});

// ── Releases ─────────────────────────────────────────────────────────────────

const CACHE_KEY = 'thock.releases';
const CACHE_MS = 10 * 60 * 1000; // GitHub allows 60 anonymous requests an hour

async function fetchReleases() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.list;
  } catch { /* no storage, or nothing stored */ }

  const response = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=6`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const list = (await response.json())
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => {
      const apk = release.assets.find((asset) => asset.name.endsWith('.apk'));
      return {
        tag: release.tag_name,
        name: release.name || release.tag_name,
        date: release.published_at,
        notes: release.body || '',
        page: release.html_url,
        apk: apk ? { url: apk.browser_download_url, size: apk.size } : null,
        checksum: release.assets.find((asset) => asset.name.endsWith('.sha256'))?.browser_download_url ?? null,
      };
    });
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list })); } catch { /* private mode */ }
  return list;
}

const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const megabytes = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** **bold**, `code` and [links](https://…) inside one line of release notes. */
function inline(tag, text) {
  const node = document.createElement(tag);
  for (const part of text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/)) {
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (link) node.append(el('a', { href: link[2] }, link[1]));
    else if (part.startsWith('**')) node.append(el('b', {}, part.slice(2, -2)));
    else if (part.startsWith('`')) node.append(el('code', {}, part.slice(1, -1)));
    else if (part) node.append(part);
  }
  return node;
}

/** Release notes are Markdown; paragraphs and bullet lists are all they use. */
function renderNotes(markdown) {
  const out = document.createDocumentFragment();
  let list = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const item = line.match(/^[-*]\s+(.*)/);
    if (item) {
      if (!list) out.append(list = document.createElement('ul'));
      list.append(inline('li', item[1]));
    } else {
      list = null;
      if (line) out.append(inline('p', line.replace(/^#+\s*/, '')));
    }
  }
  return out;
}

function showReleases([latest, ...older]) {
  const size = latest.apk ? megabytes(latest.apk.size) : null;
  document.getElementById('relName').textContent = latest.name;
  document.getElementById('relMeta').textContent = [latest.tag, day(latest.date), size].filter(Boolean).join(' · ');
  document.getElementById('relNotes').replaceChildren(renderNotes(latest.notes));
  document.getElementById('heroMeta').textContent = [latest.tag, size, 'Android 9 or newer'].filter(Boolean).join(' · ');

  if (latest.apk) for (const link of document.querySelectorAll('[data-apk]')) link.href = latest.apk.url;
  const side = document.getElementById('relSum');
  side.href = latest.checksum ?? latest.page;
  side.textContent = latest.checksum ? 'SHA-256 checksum' : 'View on GitHub';

  document.getElementById('older').replaceChildren(...older.map((release) => el('li', {},
    el('span', { className: 'name' }, release.name),
    el('span', { className: 'meta' }, `${release.tag} · ${day(release.date)}`),
    release.apk ? el('a', { href: release.apk.url }, 'APK') : '',
    el('a', { href: release.page }, 'Notes'),
  )));
}

fetchReleases()
  .then((list) => {
    if (list.length) showReleases(list);
    else document.getElementById('relMeta').textContent = 'No release yet.';
  })
  .catch(() => {
    // The download buttons already point at GitHub's "latest" address.
    document.getElementById('relMeta').textContent = 'Could not reach GitHub for the version details. The download button still gets the newest one.';
  });
