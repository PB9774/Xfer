const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

// Animates a stat's displayed value from 0 up to its real value once
// fetched, using an ease-out curve. Skips straight to the final
// value if the user has asked for reduced motion.
function animateValue(el, endValue, formatter, duration = 900) {
  if (prefersReducedMotion || !el) {
    if (el) el.textContent = formatter(endValue);
    return;
  }
  const start = performance.now();
  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatter(endValue * eased);
    if (progress < 1) requestAnimationFrame(frame);
    else el.textContent = formatter(endValue);
  }
  requestAnimationFrame(frame);
}

// ── Public stats — load immediately, no wallet needed ──────────────
async function loadPublicStats() {
  const refreshBtn = document.getElementById("statsRefreshBtn");
  if (refreshBtn) refreshBtn.textContent = "↻ Refreshing...";
  try {
    const [balance, total, reserved] = await Promise.all([
      publicContract.getBalance(),
      publicContract.totalApplications(),
      publicContract.reservedFunds(),
    ]);

    const balanceEth = parseFloat(ethers.formatEther(balance));
    const reservedEth = parseFloat(ethers.formatEther(reserved));
    const totalApps = Number(total);

    animateValue(document.getElementById("statBalance"), balanceEth, (v) => v.toFixed(2) + " ETH");
    animateValue(document.getElementById("statApps"), totalApps, (v) => Math.round(v).toLocaleString());
    animateValue(document.getElementById("statReserved"), reservedEth, (v) => v.toFixed(2) + " ETH");
  } catch (err) {
    console.error(err);
    ["statBalance", "statApps", "statReserved"].forEach((id) => {
      document.getElementById(id).textContent = "—";
    });
    showToast("Unable to load blockchain data.", "error");
  } finally {
    if (refreshBtn) refreshBtn.textContent = "↻ Refresh live data";
  }
}

function initScrollReveal() {
  const revealEls = document.querySelectorAll(".reveal");
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 },
  );
  revealEls.forEach((el) => io.observe(el));
}

// Gives the sticky nav a slightly deeper shadow once the page has
// scrolled, so it reads as "lifted" above the content beneath it.
function initNavScrollShadow() {
  const nav = document.querySelector(".landing-nav");
  if (!nav) return;
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  document.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// Rotating strip of the most recently funded applications, reading real
// on-chain data — real district names and real amounts, not placeholders —
// to reinforce that the whole site is a live chain read, not a mock.
async function loadLedgerTicker() {
  const el = document.getElementById("ledgerTicker");
  if (!el) return;
  try {
    const total = Number(await publicContract.totalApplications());
    const recent = [];
    for (let i = total - 1; i >= 0 && recent.length < 5; i--) {
      const app = await publicContract.applications(i);
      if (Number(app.status) !== 3) continue; // only Funded entries
      const name = await publicContract.districtName(app.district);
      recent.push(
        `⛓ #${i} · ${name || "Unknown District"} funded ${parseFloat(ethers.formatEther(app.allocated)).toFixed(2)} ETH`
      );
    }
    if (!recent.length) {
      el.innerHTML = `<span class="hash">⛓ verified on Sepolia — view full history in Public Audit</span>`;
      return;
    }
    let idx = 0;
    const show = () => {
      el.innerHTML = `<span class="hash">${recent[idx]}</span>`;
      idx = (idx + 1) % recent.length;
    };
    show();
    if (recent.length > 1) setInterval(show, 3500);
  } catch (err) {
    console.error(err);
    el.innerHTML = `<span class="hash">⛓ verified on Sepolia — view full history in Public Audit</span>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadPublicStats();
  loadLedgerTicker();
  initScrollReveal();
  initNavScrollShadow();
});
