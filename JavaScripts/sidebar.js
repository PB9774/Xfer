// sidebar.js — loaded on every page. Handles the collapsible sidebar,
// active-nav-link highlighting, toasts, the seal wordmark, the shared
// application sort order, and a shared helper for showing transaction
// lifecycle feedback (submitted → confirmed) so every page that sends a
// transaction gets the same on-chain-native feedback without
// re-implementing it.

// ── Collapsible sidebar ──────────────────────────────────────────────────
function initSidebar() {
  const layout  = document.querySelector('.layout');
  const sidebar = document.querySelector('.sidebar');
  if (!layout || !sidebar) return;

  const saved = localStorage.getItem('xfer-sidebar');
  if (saved === 'collapsed') {
    layout.classList.add('collapsed');
    sidebar.classList.add('collapsed');
  }
}

function toggleSidebar() {
  const layout  = document.querySelector('.layout');
  const sidebar = document.querySelector('.sidebar');
  const isNowCollapsed = sidebar.classList.toggle('collapsed');
  layout.classList.toggle('collapsed', isNowCollapsed);
  localStorage.setItem('xfer-sidebar', isNowCollapsed ? 'collapsed' : 'expanded');
}

// ── Active nav link ───────────────────────────────────────────────────────
function initNav() {
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(l => {
    const href = l.getAttribute('href') || '';
    if (href.includes(current)) l.classList.add('active');
    else l.classList.remove('active');
  });
}

// ── Seal wordmark ─────────────────────────────────────────────────────────
// Authored once here and injected into every `.logo-mark` / `.hero-seal-
// watermark` element so the SVG markup isn't duplicated across four pages.
function sealSVG() {
  return `<svg class="seal" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18.5" stroke="currentColor" stroke-width="1.4"/>
    <circle cx="20" cy="20" r="14.5" stroke="currentColor" stroke-width="0.8"/>
    ${Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      const x1 = 20 + Math.cos(a) * 16.6, y1 = 20 + Math.sin(a) * 16.6;
      const x2 = 20 + Math.cos(a) * 18.2, y2 = 20 + Math.sin(a) * 18.2;
      return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="currentColor" stroke-width="0.8"/>`;
    }).join('')}
    <path d="M13 13L27 27M27 13L13 27" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function renderSeals() {
  document.querySelectorAll('.logo-mark, .hero-seal-watermark').forEach(el => {
    el.innerHTML = sealSVG();
  });
}

// ── Toast helper ──────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--accent)' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="color:${colors[type]};font-weight:700;">${icons[type]}</span> <span>${msg}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function setLoading(btnId, loading, label = '') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<div class="spinner"></div> Loading…'
    : label;
}

// ── Tx lifecycle helper ────────────────────────────────────────────────────
// Wraps a contract call so every write across the site shows the same
// submitted → confirmed feedback with a real, clickable tx hash instead of
// a single generic "success" toast — this is the bulk of requirement #5
// ("tx-confirmation feedback").
function shortHash(h) {
  return h ? h.slice(0, 10) + '…' + h.slice(-6) : '';
}

function etherscanTxUrl(hash) {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

// txPromise: the Promise returned by a contract write call (before .wait()).
// label: human label, e.g. "Approve #4".
async function sendTx(txPromise, label) {
  showToast(`${label} — waiting for wallet confirmation…`, 'info');
  const tx = await txPromise;
  const el = document.createElement('div');
  el.className = 'toast info';
  el.innerHTML = `<span style="color:var(--accent);font-weight:700;">⛓</span>
    <span>${label} submitted —
    <a class="hash-link" href="${etherscanTxUrl(tx.hash)}" target="_blank" rel="noopener">${shortHash(tx.hash)}</a>
    </span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 6000);

  const receipt = await tx.wait();
  showToast(`✓ ${label} confirmed in block ${receipt.blockNumber}`, 'success');
  return receipt;
}

// ── Shared application sort order ──────────────────────────────────────
// Pending/Approved (still "in flight") stay on top, newest first;
// Rejected/Funded (resolved) sink to the bottom, newest first within
// their own group. Used identically by the Head Office table and the
// Public Audit table so the two views read in the same order.
function sortApps(apps) {
  return [...apps].sort((a, b) => {
    const archived = (s) => (s === 2 || s === 3) ? 1 : 0;
    const diff = archived(a.status) - archived(b.status);
    return diff !== 0 ? diff : b.id - a.id;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initNav();
  renderSeals();
});
