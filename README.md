# Xfer

**A blockchain-based fund allocation system for transparent government-to-district disbursement**, styled as an "official ledger" — paper, ink, brass, a wax-seal wordmark, Fraunces for display type.

Government funding is usually a black box: money leaves a treasury, and by the time it reaches (or doesn't reach) its destination, there's no public trail of who approved what, why, or when. Xfer puts that entire lifecycle on-chain — every application, every approval or rejection, every payout — so it's independently auditable by anyone, no login required. An AI layer helps the approving office spot risk and prioritize urgency, but every actual decision is still a human-signed transaction. Built as a self-directed project exploring Solidity, ethers.js, and serverless AI integration on a real (if simulated) government workflow.

---

## Why this exists

- **No trust required.** Anyone can verify fund allocation without asking an official — the public audit dashboard reads directly from the contract.
- **Decisions are permanent and attributable.** Once a head office approves or rejects an application on-chain, that decision — and the reasoning behind it — can't be quietly edited or deleted later.
- **AI assists, never decides.** Gemini scores applications for priority and risk and drafts justification text, but only a wallet-signed transaction from the head office actually moves funds.

## Features

- **District portal** — registered districts submit funding requests and track their status in real time.
  
- **Head office panel** — review pending applications, run an AI evaluation, approve/reject with a reason, and release reserved funds.
  
- **Public audit dashboard** — every application and outcome, filterable and searchable, with no wallet connection needed.
  
- **AI-assisted review** — Gemini scores each application on priority and risk, ranks the full pending queue, and drafts a plain-English public justification when something is approved.
  
- **Live protocol stats** on the landing page, pulled straight from the contract, plus a rotating ticker of recently funded applications.

## How it works

```
District submits application
        │
        ▼
Head office reviews  ──▶  (optional) AI evaluation: priority + risk score
        │
        ├── Reject (reason recorded on-chain)
        │
        └── Approve (allocated amount + AI-drafted justification recorded)
                │
                ▼
        Funds reserved on-chain
                │
                ▼
        Head office releases funds ──▶ District receives payout
                │
                ▼
        Entire history visible on the public audit dashboard
```

## Tech stack

| Layer | Tech |
|---|---|
| Smart contract | Solidity, deployed on Ethereum Sepolia (testnet) |
| Frontend | Static HTML/CSS/JS, [ethers.js](https://docs.ethers.org/v6/) v6 |
| AI scoring | Google Gemini 1.5 Flash, via Vercel serverless functions |
| Hosting | Vercel |

No frontend framework, no build step — plain HTML/CSS/JS by design, kept deliberately simple for a project this size.

## Pages

| Page | Purpose | Wallet needed? |
|---|---|---|
| `index.html` | Landing page with live protocol stats | No |
| `Pages/dashboard.html` | Public audit dashboard — every application, filterable | No |
| `Pages/district.html` | Submit & track a district's own applications | Yes, registered district wallet |
| `Pages/admin.html` | Review, AI-evaluate, approve/reject, release funds | Yes, contract owner wallet |

---

## Getting started

### Prerequisites
- [MetaMask](https://metamask.io/) with a Sepolia testnet account
- A free [Google Gemini API key](https://aistudio.google.com/app/apikey)
- A [Vercel](https://vercel.com) account (for the serverless AI functions)

### 1 — Deploy the smart contract
1. Open [Remix IDE](https://remix.ethereum.org) and paste in `Xfer.sol`.
2. Compile with Solidity `0.8.0`.
3. Deploy to **Sepolia** via MetaMask (Injected Provider).
4. Copy the deployed contract address.

### 2 — Point the frontend at your contract
In `JavaScripts/contract.js`, replace `CONTRACT_ADDRESS` and `CONTRACT_ABI`
with your deployment's address and ABI (Remix → Compilation Details → ABI).
This file loads on every page, so it's the only place you need to change it.

`JavaScripts/public.js` holds a fixed Sepolia RPC URL so read-only pages
(landing, audit dashboard) work without a wallet — swap in your own
Alchemy/Infura URL if you don't want to reuse the bundled one.

### 3 — Set up the AI functions
1. Copy `.env.example` to `.env.local` and add your `GEMINI_API_KEY` (get one free at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey),).
2. On Vercel, add the same `GEMINI_API_KEY` under **Project Settings → Environment Variables**.

> `.env.local` is git-ignored — never commit real keys. Rotate immediately
> if one is ever exposed.

### 4 — Deploy
Push to GitHub and import the repo on [vercel.com](https://vercel.com). No `vercel.json` is needed — Vercel auto-detects the `api/` folder at the project root as serverless functions (`rank-application`, `suggest-priority`, `write-justification`) and serves everything else as static files. This only works because `api/` lives at the repo root; if it ever ends up nested under `Pages/` or another subfolder, Vercel won't pick the functions up and every AI feature will silently fail.

## Project structure

```
.
├── index.html               Landing page
├── Pages/
│   ├── admin.html            Head office panel (tabbed: Applications / AI Tools / Treasury & Districts)
│   ├── district.html         District portal
│   └── dashboard.html        Public audit dashboard
├── CSS/style.css             Shared "official ledger" design system
├── JavaScripts/
│   ├── contract.js            Contract address/ABI (single source of truth) + wallet-connected provider
│   ├── public.js              Read-only provider for wallet-free pages, built on contract.js
│   ├── sidebar.js             Shared nav, seal wordmark, theme toggle, toasts, tx-confirmation helper
│   └── pages/                 Per-page logic (index, district, admin, dashboard)
├── api/                      Vercel serverless functions (AI scoring) — must stay at the repo root
├── .env.example              Template for GEMINI_API_KEY
└── .gitignore
```

All icons are inline SVG using `currentColor`, so they follow the ledger/terminal theme automatically — there's no separate `images/` folder to keep in sync.

## Contract interface

Key reads: `getFullApplication(id)`, `totalApplications()`, `getBalance()`, `availableBalance()`, `reservedFunds()`, `districtName(addr)`, `isRegistered(addr)`, `owner()`.

Key writes: `submit(purpose, requested)` (district), `approve(id, allocated, reason)`, `reject(id, reason)`, `release(id)`, `setAIRecommendation(id, priority, risk, reason)`, `registerDistrict(addr, name)`, `deposit()` (payable) — all head-office-only except `submit` and `deposit`.

## Status

Built and tested on Sepolia testnet as a learning/portfolio project — not audited, not intended for mainnet or real fund custody as-is.

## License

Add a license (MIT is a common default for portfolio projects) if you plan to make this repo public.
