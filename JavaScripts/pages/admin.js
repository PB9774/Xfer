// ── State ──────────────────────────────────────────────────────────────
let allApps = [];
let currentReviewId = null;
let currentReviewApp = null;
let isOwner = false;
let currentAddress = null;

const STATUS_LABEL = {
  0: "Pending",
  1: "Approved",
  2: "Rejected",
  3: "Funded",
};
const STATUS_BADGE = {
  0: '<span class="badge badge-pending">Pending</span>',
  1: '<span class="badge badge-approved">Approved</span>',
  2: '<span class="badge badge-rejected">Rejected</span>',
  3: '<span class="badge badge-funded">Funded</span>',
};

// ── Small helpers ───────────────────────────────────────────────────────
function toEth(wei) {
  try { return parseFloat(ethers.formatEther(wei)).toFixed(2); }
  catch (e) { return "0.00"; }
}
function toNumber(x) {
  try { return Number(x); } catch (e) { return 0; }
}
function toDate(unixSeconds) {
  const n = Number(unixSeconds);
  if (!n) return "—";
  return new Date(n * 1000).toLocaleDateString("en-IN");
}
function showTableLoading(tbodyId, colspan) {
  const el = document.getElementById(tbodyId);
  if (!el) return;
  el.innerHTML = `<tr><td colspan="${colspan}"><div class="load-row" style="display:flex;align-items:center;justify-content:center;gap:10px;padding:40px 20px;color:var(--text-3);font-size:13px;">Loading blockchain data...</div></td></tr>`;
}

// ── Tabs ──────────────────────────────────────────────────────────────
function switchAdminTab(name) {
  document.querySelectorAll(".tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === name)
  );
  document.querySelectorAll(".tab-panel").forEach((p) =>
    p.classList.toggle("active", p.id === "tab-" + name)
  );
}

// ── Wallet UI (dot / address / connect button / owner panel) ──────────
function updateWalletUI(address, connected) {
  const dot  = document.getElementById("walletDot");
  const addrEl = document.getElementById("walletAddr");
  const btn  = document.getElementById("connectBtn");
  const info = document.getElementById("ownerInfo");

  if (connected && address) {
    addrEl.textContent = address.slice(0, 6) + "…" + address.slice(-4);
    dot.className = "wallet-dot connected";
    btn.style.display = "none";
    info.style.display = "block";
    document.getElementById("ownerRole").textContent = isOwner
      ? "Head Office (verified)"
      : "Not authorized";
    document.getElementById("ownerRole").style.color = isOwner
      ? "var(--green)"
      : "var(--red)";
  } else {
    dot.className = "wallet-dot disconnected";
    addrEl.textContent = "Not connected";
    btn.style.display = "flex";
    info.style.display = "none";
  }
}

// ── Access gate: show nothing until the wallet is a verified Head Office owner ──
function applyAccessGate(state) {
  // state: "disconnected" | "not-owner" | "owner"
  const gate = document.getElementById("accessGate");
  const content = document.getElementById("ownerContent");
  const msg = document.getElementById("gateMessage");
  const gateBtn = document.getElementById("gateConnectBtn");

  if (state === "owner") {
    gate.style.display = "none";
    content.style.display = "block";
    return;
  }

  content.style.display = "none";
  gate.style.display = "block";

  if (state === "not-owner") {
    msg.textContent =
      "This wallet is connected but is not the registered Head Office owner. Switch to the Head Office wallet in MetaMask and reconnect.";
    gateBtn.textContent = "Reconnect Wallet";
  } else {
    msg.textContent = "Connect the Head Office wallet to view and manage applications.";
    gateBtn.textContent = "Connect Wallet";
  }
}

// ── Wallet connection (real — verifies caller is the contract owner) ──
async function connectWallet() {
  if (!window.ethereum) {
    showToast("MetaMask not found — please install it", "error");
    return;
  }

  if (typeof CONTRACT_ADDRESS === "undefined" || typeof CONTRACT_ABI === "undefined") {
    console.error("CONTRACT_ADDRESS / CONTRACT_ABI missing — check that ../JavaScripts/contract.js loaded correctly.");
    showToast("Contract config failed to load — check contract.js", "error");
    return;
  }

  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await window.ethereum.request({ method: "eth_requestAccounts" });
    signer = await provider.getSigner();
    currentAddress = await signer.getAddress();

    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      showToast("Please switch MetaMask to Sepolia testnet", "error");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xaa36a7" }],
        });
        await connectWallet();
      } catch (e) {
        showToast("Could not switch network automatically", "error");
      }
      return;
    }

    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    // Verify this wallet is the registered Head Office owner.
    // isOwner defaults to false so the UI fails safe (read-only) if
    // the owner() call reverts or isn't present in the ABI.
    isOwner = false;
    try {
      const owner = await contract.owner();
      isOwner = owner.toLowerCase() === currentAddress.toLowerCase();
    } catch (ownerErr) {
      console.error("contract.owner() call failed:", ownerErr);
      showToast(
        "Connected, but couldn't verify Head Office ownership (owner() call failed). Check CONTRACT_ABI in contract.js includes an owner() view function.",
        "error"
      );
    }

    updateWalletUI(currentAddress, true);

    if (isOwner) {
      applyAccessGate("owner");
      await refreshAll();
      showToast("Wallet connected as Head Office", "success");
    } else {
      applyAccessGate("not-owner");
    }

    if (!window.walletEventsAdded) {
      window.walletEventsAdded = true;
      window.ethereum.on("accountsChanged", () => location.reload());
      window.ethereum.on("chainChanged", () => location.reload());
    }
  } catch (error) {
    console.error(error);
    if (error.code === 4001) {
      showToast("Wallet connection cancelled.", "error");
    } else {
      updateWalletUI(null, false);
      showToast(
        error.reason || error.shortMessage || error.message || "Connection failed.",
        "error"
      );
    }
  }
}

// ── Load treasury + applications together ──────────────────────────────
// Combined into one function because "Total Released" has to be derived
// from the applications list (see the comment below), so splitting
// treasury stats and applications into two independently-refreshable
// functions is what let them fall out of sync in the first place.
const districtNameCache = new Map();
async function resolveDistrictName(address) {
  const key = address.toLowerCase();
  if (districtNameCache.has(key)) return districtNameCache.get(key);
  let name;
  try {
    const raw = await contract.districtName(address);
    name = raw && raw.trim().length > 0 ? raw : "Unknown District";
  } catch (e) {
    name = "Unknown District";
  }
  districtNameCache.set(key, name);
  return name;
}

async function refreshAll() {
  if (!contract) {
    showToast("Connect your wallet first", "error");
    return;
  }
  showTableLoading("appsTable", 8);
  try {
    const [bal, avail, reserved, total] = await Promise.all([
      contract.getBalance(),
      contract.availableBalance(),
      contract.reservedFunds(),
      contract.totalApplications(),
    ]);

    const totalNum = Number(total);
    const indices = Array.from({ length: totalNum }, (_, i) => i);
    const rawApps = await Promise.all(indices.map((i) => contract.getFullApplication(i)));

    const uniqueAddresses = new Set(rawApps.map((r) => r[0].district.toLowerCase()));
    await Promise.all([...uniqueAddresses].map((addr) => resolveDistrictName(addr)));

    allApps = rawApps.map(([app, purpose, aiReason, approvalReason, rejectionReason], i) => ({
      id: i,
      district: districtNameCache.get(app.district.toLowerCase()) || "Unknown District",
      addr: app.district,
      purpose,
      aiReason,
      approvalReason,
      rejectionReason,
      requested: toEth(app.requested),
      allocated: toEth(app.allocated),
      allocatedWei: app.allocated,
      priority: toNumber(app.priorityScore),
      risk: toNumber(app.riskScore),
      status: toNumber(app.status),
      submitted: toDate(app.submittedAt),
    }));

    // "Total Released" bug fix: getBalance() / reservedFunds() /
    // availableBalance() are current-state snapshots, and balance already
    // drops when funds are released — so `balance + reserved - available`
    // doesn't recover a historical total at all (it reduces to
    // `2 * reserved`). The applications list is the only place a running
    // total actually exists: sum `allocated` for every Funded (status 3)
    // application, which we just fetched above.
    const released = allApps
      .filter((a) => a.status === 3)
      .reduce((sum, a) => sum + a.allocatedWei, 0n);

    const balStr      = parseFloat(ethers.formatEther(bal)).toFixed(2) + " ETH";
    const availStr    = parseFloat(ethers.formatEther(avail)).toFixed(2) + " ETH";
    const releasedStr = parseFloat(ethers.formatEther(released)).toFixed(2) + " ETH";

    document.getElementById("s-balance").textContent   = balStr;
    document.getElementById("s-available").textContent = availStr;
    document.getElementById("s-released").textContent  = releasedStr;
    document.getElementById("sideBalance").textContent = balStr;
    document.getElementById("sideAvail").textContent   = availStr;
    document.getElementById("s-pending").textContent   = allApps.filter((a) => a.status === 0).length;

    renderApps(allApps);
  } catch (e) {
    console.error(e);
    showToast("Failed to load data from the contract", "error");
    document.getElementById("appsTable").innerHTML =
      `<tr><td colspan="8"><div class="empty"><div class="empty-icon">⚠</div><h3>Couldn't load applications</h3><p>Check the console for details.</p></div></td></tr>`;
  }
}

// ── Sort + paginate ─────────────────────────────────────────────────────
const PAGE_SIZE = 30;
let currentPageApps = [];
let currentPage = 1;

// sortApps() itself now lives in sidebar.js — shared with dashboard.js so
// the Public Audit table and the Head Office table always agree on order.
function renderApps(apps) {
  currentPageApps = sortApps(apps);
  currentPage = 1;
  renderAppsPage();
}

function renderAppsPage() {
  const apps = currentPageApps;
  const totalPages = Math.max(1, Math.ceil(apps.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageApps = apps.slice(start, start + PAGE_SIZE);

  renderAppsTable(pageApps);

  const pag = document.getElementById("appsPagination");
  if (pag) {
    pag.style.display = apps.length > PAGE_SIZE ? "flex" : "none";
    document.getElementById("pageIndicator").textContent =
      `Page ${currentPage} of ${totalPages}`;
    document.getElementById("prevPageBtn").disabled = currentPage <= 1;
    document.getElementById("nextPageBtn").disabled = currentPage >= totalPages;
  }
}

function changePage(delta) {
  currentPage += delta;
  renderAppsPage();
}

// ── Render applications table ──────────────────────────────────────────
function renderAppsTable(apps) {
  if (!apps.length) {
    document.getElementById("appsTable").innerHTML =
      `<tr><td colspan="8"><div class="empty"><div class="empty-icon">📋</div><h3>No applications</h3></div></td></tr>`;
    return;
  }
  document.getElementById("appsTable").innerHTML = apps
    .map(
      (a) => `
<tr>
<td class="td-mono">#${a.id}</td>
<td class="td-primary">${a.district}</td>
<td class="text-2" style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.purpose}</td>
<td class="td-mono">${a.requested} ETH</td>
<td>
    <div style="display:flex;align-items:center;gap:6px;">
    <div style="width:40px;height:5px;background:var(--bg);border:1px solid var(--border);border-radius:3px;overflow:hidden;">
        <div style="width:${a.priority || 0}%;height:100%;background:var(--accent);border-radius:3px;"></div>
    </div>
    <span class="td-mono" style="font-size:11px;">${a.priority || "—"}</span>
    </div>
</td>
<td>
    <div style="display:flex;align-items:center;gap:6px;">
    <div style="width:40px;height:5px;background:var(--bg);border:1px solid var(--border);border-radius:3px;overflow:hidden;">
        <div style="width:${a.risk || 0}%;height:100%;background:var(--red);border-radius:3px;"></div>
    </div>
    <span class="td-mono" style="font-size:11px;">${a.risk || "—"}</span>
    </div>
</td>
<td>${STATUS_BADGE[a.status]}</td>
<td>
    <div style="display:flex;gap:6px;flex-wrap:wrap;">
    <button class="btn btn-ghost btn-sm" onclick="openReview(${a.id})">Review</button>
    ${a.status === 1 ? `<button class="btn btn-success btn-sm" onclick="quickRelease(${a.id})">Release</button>` : ""}
    </div>
</td>
</tr>
`,
    )
    .join("");
}

function filterTable(q) {
  const filtered = allApps.filter(
    (a) =>
      a.district.toLowerCase().includes(q.toLowerCase()) ||
      a.purpose.toLowerCase().includes(q.toLowerCase()),
  );
  renderApps(filtered);
}

function filterByStatus(s) {
  renderApps(
    s === "all" ? allApps : allApps.filter((a) => String(a.status) === s),
  );
}

// ── Review panel ───────────────────────────────────────────────────────
function openReview(id) {
  const a = allApps.find((x) => x.id === id);
  if (!a) return;
  currentReviewId = id;
  currentReviewApp = a;
  switchAdminTab("applications");
  document.getElementById("reviewId").textContent = "#" + id;
  document.getElementById("rev-district").textContent = a.district;
  document.getElementById("rev-addr").innerHTML =
    `<a class="hash-link" href="https://sepolia.etherscan.io/address/${a.addr}" target="_blank" rel="noopener">${a.addr}</a>`;
  document.getElementById("rev-amount").textContent =
    a.requested + " ETH";
  document.getElementById("rev-purpose").textContent = a.purpose;
  document.getElementById("rev-time").textContent = a.submitted || "—";
  document.getElementById("bar-priority").style.width =
    (a.priority || 0) + "%";
  document.getElementById("bar-risk").style.width = (a.risk || 0) + "%";
  document.getElementById("num-priority").textContent = a.priority || "—";
  document.getElementById("num-risk").textContent = a.risk || "—";
  document.getElementById("rev-aireason").textContent =
    a.aiReason || "Run AI evaluation to get scores for this application.";
  document.getElementById("aiEvalBadge").className = a.priority
    ? "badge badge-approved"
    : "badge badge-pending";
  document.getElementById("aiEvalBadge").textContent = a.priority
    ? "AI Evaluated"
    : "Not evaluated";
  document.getElementById("allocAmount").value = "";
  document.getElementById("approveReason").value = "";
  document.getElementById("rejectReason").value = "";
  document.getElementById("aiAppId").value = "";
  document.getElementById("aiPriority").value = "";
  document.getElementById("aiRisk").value = "";
  document.getElementById("aiReasonInput").value = "";
  ["aiPriority", "aiRisk", "aiReasonInput"].forEach((id) => {
    document.getElementById(id).readOnly = false;
  });
  document.getElementById("unlockAiFieldsBtn").style.display = "none";
  document.getElementById("decisionPanel").classList.remove("hidden");
  document.getElementById("decisionPanel").style.display = "block";
  document.getElementById("releaseSection").classList.add("hidden");
  document.getElementById("releaseSection").style.display = "none";
  document
    .getElementById("decisionPanel")
    .scrollIntoView({ behavior: "smooth" });
}

function closeReview() {
  document.getElementById("decisionPanel").style.display = "none";
  document.getElementById("decisionPanel").classList.add("hidden");
  currentReviewId = null;
}

function quickRelease(id) {
  switchAdminTab("applications");
  document.getElementById("releaseId").value = id;
  document.getElementById("releaseSection").classList.remove("hidden");
  document.getElementById("releaseSection").style.display = "block";
  document
    .getElementById("releaseSection")
    .scrollIntoView({ behavior: "smooth" });
}

// ── AI evaluation on current application ──────────────────────────────
// Running the evaluation now writes the result on-chain as its final
// step (via storeAIScoresOnChain below) instead of leaving that as a
// separate manual action the admin could forget to do.
async function runAIOnCurrent() {
  if (currentReviewId === null) return;
  const a = currentReviewApp;
  const btn = document.getElementById("runAiBtn");
  btn.textContent = "🤖 Evaluating...";
  btn.disabled = true;

  try {
    const res = await fetch("/api/rank-application", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose: a.purpose,
        requested: a.requested,
        districtName: a.district,
      }),
    });
    if (!res.ok) throw new Error("Server returned " + res.status);
    const { priorityScore, riskScore, reason } = await res.json();

    document.getElementById("bar-priority").style.width = priorityScore + "%";
    document.getElementById("bar-risk").style.width = riskScore + "%";
    document.getElementById("num-priority").textContent = priorityScore;
    document.getElementById("num-risk").textContent = riskScore;
    document.getElementById("rev-aireason").textContent = reason;

    const appIndex = allApps.findIndex((x) => x.id === currentReviewId);
    if (appIndex > -1) {
      allApps[appIndex].priority = priorityScore;
      allApps[appIndex].risk = riskScore;
      allApps[appIndex].aiReason = reason;
    }
    if (currentReviewApp) {
      currentReviewApp.priority = priorityScore;
      currentReviewApp.risk = riskScore;
      currentReviewApp.aiReason = reason;
    }

    // Sub-routine call: writes the scores on-chain immediately rather
    // than waiting for a separate manual "Store AI Scores" step.
    btn.textContent = "🤖 Confirm in wallet...";
    const stored = await storeAIScoresOnChain(currentReviewId, priorityScore, riskScore, reason);

    document.getElementById("aiEvalBadge").className = stored
      ? "badge badge-approved"
      : "badge badge-pending";
    document.getElementById("aiEvalBadge").textContent = stored
      ? "AI Evaluated · Stored On-Chain"
      : "AI Evaluated · Not Stored";

    // Keep the manual form in the AI Tools tab in sync, in case the admin
    // wants to review or override the values that were just stored.
    document.getElementById("aiAppId").value = currentReviewId;
    document.getElementById("aiPriority").value = priorityScore;
    document.getElementById("aiRisk").value = riskScore;
    document.getElementById("aiReasonInput").value = reason;
    lockAiFields();

    showToast(`AI scored Priority ${priorityScore}/100 · Risk ${riskScore}/100`, "success");
  } catch (err) {
    console.error(err);
    showToast("AI evaluation failed — check API function", "error");
  } finally {
    btn.textContent = "🤖 Run AI Evaluation";
    btn.disabled = false;
  }
}

// ── AI bulk ranking of all pending apps ───────────────────────────────
async function runAIRanking() {
  const pending = allApps.filter((a) => a.status === 0);
  if (!pending.length) {
    showToast("No pending applications to rank", "error");
    return;
  }

  const btn = document.getElementById("rankBtn");
  btn.textContent = "🤖 Ranking...";
  btn.disabled = true;

  try {
    const res = await fetch("/api/suggest-priority", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applications: pending.map((a) => ({
          id: a.id,
          district: a.district,
          purpose: a.purpose,
          requested: a.requested,
        })),
      }),
    });
    if (!res.ok) throw new Error("Server returned " + res.status);
    const { ranked } = await res.json();

    const actionColor = {
      Approve: "var(--green)",
      Review: "var(--amber)",
      Reject: "var(--red)",
    };
    document.getElementById("rankingList").innerHTML = ranked
      .map(
        (r) => `
<div style="display:flex; align-items:flex-start; gap:12px; padding:14px 0; border-bottom:1px solid var(--border);">
    <div style="width:28px; height:28px; border-radius:50%; background:var(--accent); color:var(--surface); display:grid; place-items:center; font-size:12px; font-weight:700; flex-shrink:0;">${r.rank}</div>
    <div style="flex:1;">
    <div style="font-weight:600; color:var(--text); font-size:13px;">Application #${r.id} — ${allApps.find((a) => a.id === r.id)?.district || ""}</div>
    <div style="font-size:12px; color:var(--text-2); margin-top:3px;">${r.reason}</div>
    </div>
    <div style="display:flex; gap:6px; align-items:center;">
    <span style="font-size:11px; font-weight:600; color:${actionColor[r.suggestedAction] || "var(--text-2)"}; background:${actionColor[r.suggestedAction] || "var(--text-2)"}18; padding:3px 10px; border-radius:20px;">${r.suggestedAction}</span>
    <button class="btn btn-ghost btn-sm" onclick="openReview(${r.id})">Review →</button>
    </div>
</div>
`,
      )
      .join("");

    document.getElementById("rankingResults").style.display = "block";
    showToast(`${ranked.length} applications ranked by AI`, "success");
  } catch (err) {
    console.error(err);
    showToast("AI ranking failed — check API function", "error");
  } finally {
    btn.textContent = "🤖 Rank All Pending Applications";
    btn.disabled = false;
  }
}

// ── Approve ────────────────────────────────────────────────────────────
async function approveApplication() {
  if (!isOwner) { showToast("Only the Head Office wallet can approve applications", "error"); return; }
  if (currentReviewId === null) return;

  const amount = document.getElementById("allocAmount").value;
  const reason = document.getElementById("approveReason").value.trim();
  if (!amount || !reason) {
    showToast("Fill in all fields", "error");
    return;
  }

  setLoading("approveBtn", true, "Approving...");
  try {
    // Step 1 — Ask the AI writer for a public-facing justification.
    // Falls back to the admin's own reason if the API isn't available.
    let justification = reason;
    try {
      const justRes = await fetch("/api/write-justification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          district: currentReviewApp.district,
          purpose: currentReviewApp.purpose,
          allocated: amount,
          requested: currentReviewApp.requested,
          priorityScore: currentReviewApp.priority,
          riskScore: currentReviewApp.risk,
          adminReason: reason,
        }),
      });
      if (justRes.ok) {
        const data = await justRes.json();
        if (data.justification) justification = data.justification;
      }
    } catch (justErr) {
      console.warn("write-justification API unavailable, using admin reason as-is:", justErr);
    }

    // Step 2 — Approve on-chain and reserve funds.
    await sendTx(
      contract.approve(currentReviewId, ethers.parseEther(amount), reason),
      `Approve #${currentReviewId}`
    );

    // Step 3 — write-justification usually returns a more polished
    // public-facing version of the reason than what runAIOnCurrent
    // already stored — re-store through the same shared subroutine so
    // the nicer text ends up on-chain, without duplicating the tx logic
    // here.
    if (currentReviewApp.priority && justification !== reason) {
      await storeAIScoresOnChain(
        currentReviewId,
        currentReviewApp.priority,
        currentReviewApp.risk,
        justification,
      );
    }

    await refreshAll();
    closeReview();
  } catch (err) {
    console.error(err);
    showToast("Transaction failed: " + (err.reason || err.message), "error");
  } finally {
    setLoading("approveBtn", false, "Approve & Reserve Funds");
  }
}

// ── Reject ─────────────────────────────────────────────────────────────
async function rejectApplication() {
  if (!isOwner) { showToast("Only the Head Office wallet can reject applications", "error"); return; }
  if (currentReviewId === null) return;

  const reason = document.getElementById("rejectReason").value.trim();
  if (!reason) {
    showToast("Provide a reason for rejection", "error");
    return;
  }

  setLoading("rejectBtn", true, "Rejecting...");
  try {
    await sendTx(contract.reject(currentReviewId, reason), `Reject #${currentReviewId}`);
    await refreshAll();
    closeReview();
  } catch (err) {
    console.error(err);
    showToast("Transaction failed: " + (err.reason || err.message), "error");
  } finally {
    setLoading("rejectBtn", false, "Reject Application");
  }
}

// ── Release funds ──────────────────────────────────────────────────────
async function releaseFunds() {
  if (!isOwner) { showToast("Only the Head Office wallet can release funds", "error"); return; }

  const id = document.getElementById("releaseId").value;
  if (!id) {
    showToast("Enter application ID", "error");
    return;
  }

  setLoading("releaseBtn", true, "Releasing...");
  try {
    await sendTx(contract.release(id), `Release funds for #${id}`);
    await refreshAll();
    document.getElementById("releaseSection").style.display = "none";
    document.getElementById("releaseSection").classList.add("hidden");
  } catch (err) {
    console.error(err);
    showToast("Transaction failed: " + (err.reason || err.message), "error");
  } finally {
    setLoading("releaseBtn", false, "Release Funds →");
  }
}

// ── Lock AI-generated scores so they can't be quietly edited before
// being stored on-chain. Unlockable via an explicit override button. ────
function lockAiFields() {
  ["aiPriority", "aiRisk", "aiReasonInput"].forEach((id) => {
    document.getElementById(id).readOnly = true;
  });
  document.getElementById("unlockAiFieldsBtn").style.display = "inline-flex";
}

function unlockAiFields() {
  if (!confirm("Override the AI's scores with your own values?")) return;
  ["aiPriority", "aiRisk", "aiReasonInput"].forEach((id) => {
    document.getElementById(id).readOnly = false;
  });
  document.getElementById("unlockAiFieldsBtn").style.display = "none";
}

// ── Store AI scores on chain ───────────────────────────────────────────
// Shared subroutine: does the actual on-chain write. Used automatically
// by runAIOnCurrent() right after evaluation, and by the manual form in
// the AI Tools tab (e.g. to store scores from Bulk Ranking, or to store
// an override). Returns true/false rather than throwing, since
// runAIOnCurrent needs to keep going either way.
async function storeAIScoresOnChain(id, priority, risk, reason) {
  if (!isOwner) { showToast("Only the Head Office wallet can store AI scores", "error"); return false; }
  if (priority > 100 || risk > 100) { showToast("Scores must be 0–100", "error"); return false; }

  try {
    await sendTx(
      contract.setAIRecommendation(id, Number(priority), Number(risk), reason),
      `Store AI scores for #${id}`
    );
    await refreshAll();
    return true;
  } catch (err) {
    console.error(err);
    showToast("Transaction failed: " + (err.reason || err.message), "error");
    return false;
  }
}

// Manual form handler (AI Tools tab) — reads the form and delegates the
// actual write to storeAIScoresOnChain().
async function storeAIOnChain() {
  const id = document.getElementById("aiAppId").value;
  const priority = document.getElementById("aiPriority").value;
  const risk = document.getElementById("aiRisk").value;
  const reason = document.getElementById("aiReasonInput").value.trim();
  if (!id || !priority || !risk || !reason) {
    showToast("Fill in all AI fields", "error");
    return;
  }

  setLoading("aiBtn", true, "Storing AI Scores...");
  await storeAIScoresOnChain(id, priority, risk, reason);
  setLoading("aiBtn", false, "Store AI Scores On-Chain →");
}

// ── Deposit ────────────────────────────────────────────────────────────
async function depositFunds() {
  if (!isOwner) { showToast("Only the Head Office wallet can deposit funds", "error"); return; }
  if (!contract) { showToast("Connect your wallet first", "error"); return; }

  const amount = document.getElementById("depositAmount").value;
  if (!amount || amount <= 0) {
    showToast("Enter a valid amount", "error");
    return;
  }

  setLoading("depositBtn", true, "Depositing...");
  try {
    await sendTx(contract.deposit({ value: ethers.parseEther(amount) }), `Deposit ${amount} ETH`);
    await refreshAll();
    document.getElementById("depositAmount").value = "";
  } catch (e) {
    console.error(e);
    showToast(e?.reason || e?.message || "Transaction failed", "error");
  } finally {
    setLoading("depositBtn", false, "Deposit ETH →");
  }
}

// ── Register district ──────────────────────────────────────────────────
async function registerDistrict() {
  if (!isOwner) { showToast("Only the Head Office wallet can register districts", "error"); return; }

  const addr = document.getElementById("distAddr").value.trim();
  const name = document.getElementById("distName").value.trim();
  if (!addr || !name) {
    showToast("Fill in both fields", "error");
    return;
  }
  if (!addr.startsWith("0x") || addr.length !== 42) {
    showToast("Invalid wallet address", "error");
    return;
  }

  setLoading("registerBtn", true, "Registering...");
  try {
    await sendTx(contract.registerDistrict(addr, name), `Register ${name}`);
    document.getElementById("distAddr").value = "";
    document.getElementById("distName").value = "";
  } catch (err) {
    console.error(err);
    showToast("Transaction failed: " + (err.reason || err.message), "error");
  } finally {
    setLoading("registerBtn", false, "Register District →");
  }
}

// ── Auto-reconnect on page load ───────────────
window.addEventListener("load", async () => {
  if (!window.ethereum) return;
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  if (accounts.length > 0) connectWallet();
});
