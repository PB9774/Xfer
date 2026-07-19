// dashboard.js — Public Audit page logic.
// Read-only, no wallet required. Uses `publicContract` (declared in
// public.js, which itself relies on CONTRACT_ADDRESS/CONTRACT_ABI from
// contract.js) instead of re-declaring the ABI here — this used to be a
// ~250-line duplicate of contract.js that could silently drift out of
// sync with the real ABI.

const STATUS_LABEL = { 0: "Pending", 1: "Approved", 2: "Rejected", 3: "Funded" };
const STATUS_BADGE = {
  0: '<span class="badge badge-pending">Pending</span>',
  1: '<span class="badge badge-approved">Approved</span>',
  2: '<span class="badge badge-rejected">Rejected</span>',
  3: '<span class="badge badge-funded">Funded</span>',
};

let apps = [];
const districtNameCache = new Map();

function formatEthValue(weiValue) {
  try {
    return parseFloat(ethers.formatEther(weiValue)).toFixed(2) + " ETH";
  } catch (e) {
    return "— ETH";
  }
}

function formatDate(unixSeconds) {
  if (!unixSeconds || unixSeconds === 0) return "—";
  const d = new Date(unixSeconds * 1000);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

async function resolveDistrictName(address) {
  const key = address.toLowerCase();
  if (districtNameCache.has(key)) return districtNameCache.get(key);
  let name;
  try {
    const raw = await publicContract.districtName(address);
    name = raw && raw.trim().length > 0 ? raw : "Unknown District";
  } catch (e) {
    name = "Unknown District";
  }
  districtNameCache.set(key, name);
  return name;
}

function miniBar(value, colorVar) {
  const v = Math.max(0, Math.min(100, value));
  return `<div style="display:flex;align-items:center;gap:6px;">
      <div class="mini-bar"><div class="mini-bar-fill" style="width:${v}%;background:${colorVar};"></div></div>
      <span class="td-mono" style="font-size:11px;">${v}</span>
  </div>`;
}

function renderDistribution(list) {
  const total = list.length;
  document.getElementById("distTotalLabel").textContent = total + " total";
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0 };
  list.forEach((a) => counts[a.status]++);

  const barEl = document.getElementById("distBar");
  const legendEl = document.getElementById("distLegend");

  if (total === 0) {
    barEl.innerHTML = "";
    legendEl.innerHTML = `<span class="text-muted text-sm">No applications submitted yet.</span>`;
    return;
  }

  const order = [3, 1, 0, 2]; // Funded, Approved, Pending, Rejected
  const colors = { 3: "var(--green)", 1: "var(--accent)", 0: "var(--amber)", 2: "var(--red)" };

  barEl.innerHTML = order
    .filter((s) => counts[s] > 0)
    .map((s) => {
      const pct = ((counts[s] / total) * 100).toFixed(1);
      return `<div style="width:${pct}%;background:${colors[s]};" title="${STATUS_LABEL[s]} — ${counts[s]}"></div>`;
    })
    .join("");

  legendEl.innerHTML = order
    .filter((s) => counts[s] > 0)
    .map((s) => {
      const pct = ((counts[s] / total) * 100).toFixed(0);
      return `<div class="flex gap-8">
          <div style="width:10px;height:10px;border-radius:2px;background:${colors[s]};flex-shrink:0;"></div>
          <span class="text-muted text-sm">${STATUS_LABEL[s]} ${pct}% (${counts[s]})</span>
      </div>`;
    })
    .join("");
}

function renderTable(list) {
  const tbody = document.getElementById("allAppsTable");
  const sorted = sortApps(list);
  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty"><div class="empty-icon">📋</div><h3>No applications submitted yet.</h3><p>Applications will appear here once submitted on-chain.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = sorted
    .map((a) => {
      const reason = a.approvalReason || a.rejectionReason || "—";
      return `
      <tr onclick="openDetail(${a.id})" style="cursor:pointer;">
      <td class="td-mono">#${a.id}</td>
      <td class="td-primary">${escapeHtml(a.district)}</td>
      <td class="text-2" style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(a.purpose)}</td>
      <td class="td-mono">${formatEthValue(a.requested)}</td>
      <td class="td-mono" style="color:${a.status === 3 || a.status === 1 ? "var(--green)" : "var(--text-3)"};">${a.status === 1 || a.status === 3 ? formatEthValue(a.allocated) : "—"}</td>
      <td>${miniBar(a.priority, "var(--accent)")}</td>
      <td>${miniBar(a.risk, "var(--red)")}</td>
      <td>${STATUS_BADGE[a.status]}</td>
      <td class="text-muted" style="font-size:12px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(reason)}</td>
      <td class="text-muted text-sm">${formatDate(a.submittedAt)}</td>
      </tr>`;
    })
    .join("");
}

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function openDetail(id) {
  const a = apps.find((x) => x.id === id);
  if (!a) return;
  document.getElementById("det-id").textContent = "#" + id;
  document.getElementById("det-district").textContent = a.district;
  document.getElementById("det-requested").textContent = formatEthValue(a.requested);
  document.getElementById("det-allocated").textContent =
    a.status === 1 || a.status === 3 ? formatEthValue(a.allocated) : "Not allocated";
  document.getElementById("det-purpose").textContent = a.purpose;
  document.getElementById("det-aireason").textContent = a.aiReason && a.aiReason.trim().length > 0
    ? a.aiReason
    : "AI evaluation pending.";
  document.getElementById("det-priority-bar").style.width = a.priority + "%";
  document.getElementById("det-risk-bar").style.width = a.risk + "%";
  document.getElementById("det-priority-num").textContent = a.priority;
  document.getElementById("det-risk-num").textContent = a.risk;
  document.getElementById("det-status").innerHTML = STATUS_BADGE[a.status];
  document.getElementById("det-addr").innerHTML =
    `<a class="hash-link" href="https://sepolia.etherscan.io/address/${a.districtAddr}" target="_blank" rel="noopener">${a.districtAddr}</a>`;
  let reason;
  if (a.approvalReason && a.approvalReason.trim().length > 0) {
    reason = `✓ Approved: "${a.approvalReason}"`;
  } else if (a.rejectionReason && a.rejectionReason.trim().length > 0) {
    reason = `✕ Rejected: "${a.rejectionReason}"`;
  } else {
    reason = "Pending decision from head office.";
  }
  document.getElementById("det-decision").textContent = reason;
  document.getElementById("detailPanel").style.display = "block";
  document.getElementById("detailPanel").scrollIntoView({ behavior: "smooth" });
}

function closeDetail() {
  document.getElementById("detailPanel").style.display = "none";
}

function applyFilters() {
  const status = document.getElementById("statusFilter").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  let filtered = apps;
  if (status !== "all") {
    filtered = filtered.filter((a) => a.status === Number(status));
  }
  if (q.length > 0) {
    filtered = filtered.filter(
      (a) =>
        a.district.toLowerCase().includes(q) ||
        a.purpose.toLowerCase().includes(q) ||
        (a.approvalReason || "").toLowerCase().includes(q) ||
        (a.rejectionReason || "").toLowerCase().includes(q) ||
        (a.aiReason || "").toLowerCase().includes(q)
    );
  }
  renderTable(filtered);
}

function setStatsLoading() {
  ["s-balance", "s-total", "s-released", "s-reserved"].forEach((id) => {
    const el = document.getElementById(id);
    el.textContent = "—";
    el.classList.add("loading");
  });
  document.getElementById("s-districts").textContent = "—";
}

function showGlobalError(msg) {
  document.getElementById("globalError").innerHTML =
    `<div class="alert alert-error" style="margin-bottom:20px;">⚠ ${escapeHtml(msg)}</div>`;
}

function clearGlobalError() {
  document.getElementById("globalError").innerHTML = "";
}

async function loadAll() {
  const refreshBtn = document.getElementById("refreshBtn");
  refreshBtn.disabled = true;
  refreshBtn.textContent = "↻ Loading...";
  clearGlobalError();
  setStatsLoading();
  document.getElementById("allAppsTable").innerHTML =
    `<tr><td colspan="10"><div class="load-row"><div class="spinner"></div> Loading blockchain data...</div></td></tr>`;
  closeDetail();

  try {
    const [balance, reserved, total] = await Promise.all([
      publicContract.getBalance(),
      publicContract.reservedFunds(),
      publicContract.totalApplications(),
    ]);

    const totalNum = Number(total);
    const indices = Array.from({ length: totalNum }, (_, i) => i);
    const rawApps = await Promise.all(indices.map((i) => publicContract.getFullApplication(i)));

    const uniqueAddresses = new Set(rawApps.map((r) => r[0].district.toLowerCase()));
    await Promise.all([...uniqueAddresses].map((addr) => resolveDistrictName(addr)));

    apps = rawApps.map((r, i) => {
      const app = r[0];
      return {
        id: i,
        districtAddr: app.district,
        district: districtNameCache.get(app.district.toLowerCase()) || "Unknown District",
        purpose: r[1],
        aiReason: r[2],
        approvalReason: r[3],
        rejectionReason: r[4],
        requested: app.requested,
        allocated: app.allocated,
        priority: Number(app.priorityScore),
        risk: Number(app.riskScore),
        status: Number(app.status),
        submittedAt: Number(app.submittedAt),
      };
    });

    // "Funds Released" bug fix: getBalance()/reservedFunds()/availableBalance()
    // are all *current-state* snapshots — balance already reflects money that
    // has left the contract on release, so `balance + reserved - available`
    // never recovers a historical released total (it actually just collapses
    // to `2 * reserved`). The only correct source for a cumulative released
    // figure is the applications themselves: sum `allocated` across every
    // application whose status is Funded (3), which we already have fully
    // loaded above.
    const releasedWei = apps
      .filter((a) => a.status === 3)
      .reduce((sum, a) => sum + a.allocated, 0n);

    document.getElementById("s-balance").textContent = formatEthValue(balance);
    document.getElementById("s-balance").classList.remove("loading");
    document.getElementById("s-total").textContent = totalNum.toString();
    document.getElementById("s-total").classList.remove("loading");
    document.getElementById("s-released").textContent = formatEthValue(releasedWei);
    document.getElementById("s-released").classList.remove("loading");
    document.getElementById("s-reserved").textContent = formatEthValue(reserved);
    document.getElementById("s-reserved").classList.remove("loading");
    document.getElementById("s-districts").textContent =
      `across ${uniqueAddresses.size} district${uniqueAddresses.size === 1 ? "" : "s"}`;

    document.getElementById("statusFilter").value = "all";
    document.getElementById("searchInput").value = "";

    renderDistribution(apps);
    renderTable(apps);
    showToast("Data refreshed from blockchain", "success");
  } catch (err) {
    console.error(err);
    showGlobalError("Unable to load blockchain data.");
    document.getElementById("allAppsTable").innerHTML =
      `<tr><td colspan="10"><div class="empty"><div class="empty-icon">⚠</div><h3>Unable to load blockchain data.</h3><p>Check your connection and try refreshing.</p></div></td></tr>`;
    ["s-balance", "s-total", "s-released", "s-reserved"].forEach((id) => {
      document.getElementById(id).textContent = "—";
    });
    document.getElementById("s-districts").textContent = "—";
    document.getElementById("distBar").innerHTML = "";
    document.getElementById("distLegend").innerHTML = "";
    document.getElementById("distTotalLabel").textContent = "—";
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "↻ Live Refresh";
  }
}

function copyAddress() {
  navigator.clipboard.writeText(CONTRACT_ADDRESS);
  showToast("Contract address copied", "success");
}

document.addEventListener("DOMContentLoaded", loadAll);
