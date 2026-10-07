// AEM Assets Library — DA custom library plugin.
// Renders a searchable grid of AEM published assets (from ./assets.json) and,
// on click, inserts the image into the current document via the DA App SDK.
//
// Because the DA org is outside the AEM-enabled IMS org, the live AEM Asset
// Selector cannot be used. This plugin instead references PUBLISHED asset URLs
// which are served publicly from the AEM publish tier — no AEM auth required.
// Maintain the list of assets in ./assets.json.

// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const MANIFEST_URL = '/tools/asset-library/assets.json';

function normalizeUrl(base, path) {
  if (/^https?:\/\//i.test(path)) return path;
  const b = (base || '').replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function fileName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop());
  } catch {
    return url.split('/').pop();
  }
}

// Build the markup inserted into the document. Mirrors DA's native image
// representation (picture > img) so it decorates like any authored image.
function assetHtml(url, alt) {
  const safeAlt = (alt || '').replace(/"/g, '&quot;');
  return `<picture><source srcset="${url}"><img src="${url}" alt="${safeAlt}" loading="lazy"></picture>`;
}

async function loadManifest(actions) {
  // Same-origin, public file — a plain fetch is enough. Fall back to the SDK's
  // authenticated daFetch if the file is ever moved to a protected location.
  try {
    const resp = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (resp.ok) return resp.json();
    if (actions?.daFetch) {
      const r2 = await actions.daFetch(MANIFEST_URL);
      if (r2.ok) return r2.json();
    }
  } catch {
    /* fall through to error state */
  }
  return null;
}

(async function init() {
  const { actions } = await DA_SDK;
  const grid = document.getElementById('al-grid');
  const status = document.getElementById('al-status');
  const search = document.querySelector('.al-search');

  const manifest = await loadManifest(actions);

  if (!manifest || !Array.isArray(manifest.assets)) {
    status.textContent = '';
    grid.innerHTML = `<div class="al-empty">
      Couldn't load <code>${MANIFEST_URL}</code>.<br>
      Make sure the file is deployed and contains an <code>assets</code> array.
    </div>`;
    return;
  }

  const base = manifest.base || '';
  const items = manifest.assets.map((a) => {
    const raw = typeof a === 'string' ? { path: a } : a;
    const url = normalizeUrl(base, raw.path || raw.url || '');
    return {
      url,
      name: raw.name || raw.title || fileName(url),
      alt: raw.alt != null ? raw.alt : (raw.name || raw.title || fileName(url)),
    };
  }).filter((a) => a.url);

  if (items.length === 0) {
    status.textContent = '';
    grid.innerHTML = `<div class="al-empty">
      No assets yet.<br>
      Add published AEM asset paths to <code>${MANIFEST_URL}</code> — for example:
      <br><br><code>{ "path": "/content/dam/wknd-shared/…/image.jpg", "name": "Image" }</code>
    </div>`;
    return;
  }

  function render(filter = '') {
    const q = filter.trim().toLowerCase();
    const matches = (a) => a.name.toLowerCase().includes(q) || a.url.toLowerCase().includes(q);
    const shown = q ? items.filter(matches) : items;
    grid.innerHTML = '';
    shown.forEach((a) => {
      const card = document.createElement('button');
      card.className = 'al-card';
      card.type = 'button';
      card.title = `${a.name}\n${a.url}`;

      const img = document.createElement('img');
      img.className = 'al-thumb';
      img.loading = 'lazy';
      img.src = a.url;
      img.alt = a.alt;
      img.addEventListener('error', () => {
        img.replaceWith(Object.assign(document.createElement('div'), {
          className: 'al-thumb is-broken',
          textContent: 'Preview unavailable (is it published?)',
        }));
      });

      const name = document.createElement('div');
      name.className = 'al-name';
      name.textContent = a.name;

      card.append(img, name);
      card.addEventListener('click', () => {
        actions.sendHTML(assetHtml(a.url, a.alt));
      });
      grid.append(card);
    });
    status.textContent = `${shown.length} asset${shown.length === 1 ? '' : 's'}${q ? ` matching “${filter}”` : ''}`;
  }

  search.addEventListener('input', () => render(search.value));
  render();
}());
