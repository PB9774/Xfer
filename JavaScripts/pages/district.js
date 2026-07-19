let currentAddress = null; // stored so refresh button can use it

// ── Helpers called before connectWallet so declare them first ─────────

function updateWalletUI(address, connected, name = '—', received = 0n) {
  document.getElementById('walletAddr').textContent =
    address.slice(0, 6) + '…' + address.slice(-4);

  const dot  = document.getElementById('walletDot');
  const btn  = document.getElementById('connectBtn');
  const info = document.getElementById('districtInfo');

  if (connected) {
    dot.className      = 'wallet-dot connected';
    btn.style.display  = 'none';
    info.style.display = 'block';
    document.getElementById('districtName').textContent = name;
    document.getElementById('totalRec').textContent =
      parseFloat(ethers.formatEther(received)).toFixed(2) + ' ETH';
  } else {
    dot.className = 'wallet-dot disconnected';
  }
}

// Fetches every application once and hands back only the ones belonging
// to `address` — used by both loadStats and loadMyApplications so we
// don't walk the full on-chain list twice per page load.
async function fetchMyApplications(address) {
  const total = Number(await contract.totalApplications());
  const indices = Array.from({ length: total }, (_, i) => i);
  const all = await Promise.all(indices.map((i) => contract.getFullApplication(i)));
  return all
    .map(([app, purpose, aiReason, approvalReason, rejectionReason], i) => ({
      id: i, app, purpose, aiReason, approvalReason, rejectionReason,
    }))
    .filter((x) => x.app.district.toLowerCase() === address.toLowerCase());
}

function computeStats(myApps) {
  const submitted = myApps.length;
  const pending = myApps.filter((x) => Number(x.app.status) === 0).length;
  const approved = myApps.filter((x) => [1, 3].includes(Number(x.app.status))).length;
  return { submitted, pending, approved };
}

async function loadStats(address) {
  const myApps = await fetchMyApplications(address);
  const received = await contract.totalReceived(address);
  const { submitted, pending, approved } = computeStats(myApps);

  // s-total shows THIS district's submitted count, not the global total
  document.getElementById('s-total').textContent    = submitted;
  document.getElementById('s-pending').textContent  = pending;
  document.getElementById('s-approved').textContent = approved;
  document.getElementById('s-received').textContent =
    parseFloat(ethers.formatEther(received)).toFixed(2) + ' ETH';

  return myApps;
}

const STATUS_BADGE = {
  0: '<span class="badge badge-pending">Pending Review</span>',
  1: '<span class="badge badge-approved">Approved</span>',
  2: '<span class="badge badge-rejected">Rejected</span>',
  3: '<span class="badge badge-funded">Funded</span>',
};
const STEPS_DONE = { 0: 1, 1: 3, 2: 2, 3: 4 };
const STEP_NAMES = ['Submitted', 'AI Review', 'Decision', 'Funded'];

function renderApplications(rawApps) {
  if (!rawApps.length) {
    document.getElementById('appsList').innerHTML = `
      <div class="empty">
        <div class="empty-icon">📄</div>
        <h3>No applications yet</h3>
        <p>Submit your first funding application above.</p>
      </div>`;
    return;
  }

  const myApps = rawApps.map(({ id, app, purpose, approvalReason, rejectionReason }) => ({
    id, purpose, approvalReason, rejectionReason,
    requested: parseFloat(ethers.formatEther(app.requested)).toFixed(2),
    allocated: parseFloat(ethers.formatEther(app.allocated)).toFixed(2),
    status: Number(app.status),
    submitted: new Date(Number(app.submittedAt) * 1000).toLocaleDateString('en-IN'),
  })).sort((a, b) => b.id - a.id);

  document.getElementById('appsList').innerHTML = myApps.map(a => {
    const done = STEPS_DONE[a.status];

    const stepsHtml = STEP_NAMES.map((name, i) => {
      const n   = i + 1;
      const cls = n < done ? 'done' : n === done ? 'current' : '';
      return `
        <div class="flow-step ${cls}">
        <div class="flow-dot">${n < done ? '✓' : n}</div>
        <div class="flow-name">${name}</div>
        </div>`;
    }).join('');

    const footerHtml = a.status === 3
      ? `<div class="alert alert-success" style="margin-top:12px;margin-bottom:0">
            ✓ Approved: "${a.approvalReason}" — ${a.allocated} ETH transferred.
        </div>`
      : a.status === 2
      ? `<div class="alert alert-error" style="margin-top:12px;margin-bottom:0">
            ✕ Rejected: "${a.rejectionReason}"
        </div>`
      : '';

    return `
    <div style="padding:20px 22px;border-bottom:1px solid var(--border)">
        <div class="flex-between" style="margin-bottom:14px">
        <div class="flex gap-12">
            <span class="text-mono text-muted text-sm">#${a.id}</span>
            ${STATUS_BADGE[a.status]}
            <span class="text-muted text-sm">${a.submitted}</span>
        </div>
        <span class="text-mono"
            style="font-size:18px;font-weight:600; color:${a.status === 3 ? 'var(--green)' : 'var(--text)'}">
            ${a.requested} ETH
        </span>
        </div>
        <div class="flow-tracker">${stepsHtml}</div>
        <div class="purpose-box" style="margin-top:8px">
        <div class="form-label" style="margin-bottom:3px">Purpose</div>
        <div class="text-2" style="font-size:13px;line-height:1.6">${a.purpose}</div>
        </div>
        ${footerHtml}
    </div>`;
  }).join('');
}

// Refresh button uses stored address so it does not need a parameter
async function refreshApps() {
  if (!currentAddress) {
    showToast('Connect your wallet first', 'error');
    return;
  }
  const myApps = await loadStats(currentAddress);
  renderApplications(myApps);
  showToast('Refreshed', 'success');
}

// ── Connect wallet ────────────────────────────────────────────────────
async function connectWallet() {
  try {
    if (!window.ethereum) {
      showToast("Please install MetaMask.", "error");
      return;
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    await window.ethereum.request({ method: "eth_requestAccounts" });

    signer = await provider.getSigner();
    currentAddress = await signer.getAddress();
    const network = await provider.getNetwork();
    if (network.chainId !== 11155111n) {
      showToast('Please switch MetaMask to Sepolia testnet', 'error');
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
        await connectWallet();
      } catch (e) {
        showToast('Could not switch network automatically', 'error');
      }
      return;
    }

    contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    const registered = await contract.isRegistered(currentAddress);
    if (!registered) {
      document.getElementById("notRegistered").style.display = "block";
      showToast("This wallet is not registered as a District Office.", "error");
      updateWalletUI(currentAddress, false);
      return;
    }
    document.getElementById("notRegistered").style.display = "none";

    const districtName = await contract.districtName(currentAddress);
    const totalReceived = await contract.totalReceived(currentAddress);
    updateWalletUI(currentAddress, true, districtName, totalReceived);

    const myApps = await loadStats(currentAddress);
    renderApplications(myApps);

    showToast("Wallet connected successfully.", "success");

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
      showToast(
        error.reason || error.shortMessage || error.message || "Connection failed.",
        "error"
      );
    }
  }
}

// ── Submit application ────────────────────────────────────────────────
async function submitApplication() {
  const purpose  = document.getElementById('appPurpose').value.trim();
  const amount   = document.getElementById('appAmount').value;
  const category = document.getElementById('appCategory').value;

  if (!purpose)                { showToast('Describe the project purpose', 'error'); return; }
  if (!amount || amount <= 0)  { showToast('Enter a valid requested amount', 'error'); return; }
  if (!category)               { showToast('Select a category', 'error'); return; }
  if (!contract)                { showToast('Connect your wallet first', 'error'); return; }

  // The contract only stores a single `purpose` string — there's no
  // separate on-chain category field — so the category picked in the UI
  // used to be collected and then silently thrown away. Folding it into
  // the purpose text keeps it on-chain and visible in the public audit
  // trail instead of losing it.
  const fullPurpose = `[${category}] ${purpose}`;

  setLoading('submitBtn', true, 'Submit Application →');
  try {
    const receipt = await sendTx(
      contract.submit(fullPurpose, ethers.parseEther(amount)),
      'Application submission'
    );
    const myApps = await loadStats(currentAddress);
    renderApplications(myApps);
    document.getElementById('appPurpose').value  = '';
    document.getElementById('appAmount').value   = '';
    document.getElementById('appCategory').value = '';
  } catch (e) {
    showToast(e?.reason || e?.message || 'Transaction failed', 'error');
  } finally {
    setLoading('submitBtn', false, 'Submit Application →');
  }
}

// ── Auto-reconnect on page load ───────────────────────────────────────
window.addEventListener('load', async () => {
  if (!window.ethereum) return;
  const accounts = await window.ethereum.request({ method: 'eth_accounts' });
  if (accounts.length > 0) connectWallet();
});
