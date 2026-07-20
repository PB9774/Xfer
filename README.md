# Xfer

![Solidity](https://img.shields.io/badge/Solidity-^0.8.0-363636?style=flat&logo=solidity&logoColor=white)
![Ethereum](https://img.shields.io/badge/Ethereum-Sepolia%20Testnet-3C3C3D?style=flat&logo=ethereum&logoColor=white)
![Ethers.js](https://img.shields.io/badge/ethers.js-v6-2535A0?style=flat&logo=javascript&logoColor=white)
![Gemini AI](https://img.shields.io/badge/Gemini-3.5%20Flash-8E75B2?style=flat&logo=googlegemini&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6-F7DF1E?style=flat&logo=javascript&logoColor=black)
![MetaMask](https://img.shields.io/badge/Wallet-MetaMask-F6851B?style=flat&logo=metamask&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-000000?style=flat&logo=vercel&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

### Government fund allocation, decided by humans, verified by anyone, prioritized by AI.

Xfer puts a normally opaque process — a treasury office deciding who gets funded — fully on-chain, then layers an AI reviewer on top. **Blockchain guarantees no one can quietly rewrite the record; AI helps a human actually get through that record responsibly.**

---

## The core idea

Public fund allocation has two failure modes:

1. **Opacity** — no visible trail of who approved what, or why. Blockchain fixes this: every application, score, decision, and payout is a transaction, not an editable database row.
2. **Overload** — no approving office can deeply evaluate hundreds of applications by hand. AI fixes this: it scores every application for priority and risk before a human has to.

Neither replaces judgment. **Blockchain doesn't decide who gets funded — it makes the decision impossible to hide or alter. AI doesn't decide either — it recommends, and a human still signs a wallet transaction for anything to move.**

## Why this project stands out

- **AI and blockchain are structurally interdependent, not bolted together.** `setAIRecommendation()` writes the AI's scores into the smart contract itself — permanently, as part of the audit trail. You can see exactly what the model recommended and what the human decided, forever, on a public ledger.
- **The AI's boundary is enforced in code, not policy.** Every fund-moving action requires a wallet-signed transaction from an address verified against `contract.owner()`, not a UI role flag. The AI can be wrong or down entirely and still can't move a single wei.
- **Public and officials see identical, live data.** The audit dashboard and admin panel read the same contract state in real time — no separate "public" copy that could drift.
- **Built with real production discipline.** Surfaced and fixed genuine bugs along the way — a silently wrong treasury stat, an AI error path masking real failures as fake success. See [Problems Faced](#problems-faced-and-how-i-solved-them).

## How AI and blockchain work together

```
District submits application               (on-chain write)
        │
        ▼
Head office runs AI evaluation              (Gemini 3.5 Flash)
        │
        ▼
Score written on-chain automatically   ← AI output is a permanent public
        │                                 record the moment it's produced
        ▼
Head office reviews it, makes the call      (wallet-signed, owner-only)
        │
        ├── Reject → reason recorded on-chain
        │
        └── Approve → AI-drafted justification + funds reserved
                │
                ▼
        Funds released ──▶ District receives payout
                │
                ▼
        Full history — AI scores, decision, payout —
        visible on the public dashboard, no login required
```
## Tech stack

| Layer | Tech |
|---|---|
| Smart contract | Solidity `^0.8.0`, Ethereum Sepolia (testnet) |
| Blockchain client | [ethers.js](https://docs.ethers.org/v6/) v6 |
| Wallet | MetaMask (EIP-1193 `window.ethereum`) |
| AI scoring | Google Gemini 3.5 Flash, via Vercel serverless functions |
| Frontend | Static HTML5/CSS3, vanilla JS (ES6+) — no framework, no build step |
| Hosting | Vercel |

## Pages

| Page | Purpose | Wallet needed? |
|---|---|---|
| `index.html` | Landing page, live stats | No |
| `Pages/dashboard.html` | Public audit dashboard | No |
| `Pages/district.html` | Submit & track applications | Yes, district wallet |
| `Pages/admin.html` | Review, approve/reject, release funds | Yes, owner wallet |

---

## Getting started

### Prerequisites
- [MetaMask](https://metamask.io/) with a Sepolia testnet account
- A free [Google Gemini API key](https://aistudio.google.com/app/apikey)
- A [Vercel](https://vercel.com) account

### 1 — Deploy the smart contract
Open [Remix IDE](https://remix.ethereum.org), paste `Xfer.sol`, compile with Solidity `^0.8.0`, deploy to Sepolia via MetaMask, copy the address.

### 2 — Point the frontend at your contract
In `JavaScripts/contract.js`, set `CONTRACT_ADDRESS` and `CONTRACT_ABI`. Loads on every page — the only place you need to edit.

`JavaScripts/public.js` holds a fixed Sepolia RPC URL for wallet-free pages — swap in your own Alchemy/Infura URL if you don't want the bundled one.

### 3 — Set up the AI functions
Add `GEMINI_API_KEY` in Vercel → **Project Settings → Environment Variables**, for all environments.

### 4 — Deploy
Push to GitHub, import on [vercel.com](https://vercel.com). No `vercel.json` needed — Vercel auto-detects `api/` at the repo root as serverless functions.

## Project structure

```
.
├── index.html               Landing page
├── Pages/
│   ├── admin.html            Head office panel (tabbed)
│   ├── district.html         District portal
│   └── dashboard.html        Public audit dashboard
├── CSS/style.css             
├── JavaScripts/
│   ├── contract.js            Contract address/ABI + wallet-connected provider
│   ├── public.js              Read-only provider for wallet-free pages
│   ├── sidebar.js             Shared nav, seal wordmark, toasts, tx-feedback helper
│   └── pages/                 Per-page logic
├── api/                      Vercel serverless functions (Gemini) — must stay at root
└── .gitignore
```

## Contract interface

Reads: `getFullApplication(id)`, `totalApplications()`, `getBalance()`, `availableBalance()`, `reservedFunds()`, `districtName(addr)`, `isRegistered(addr)`, `owner()`.

Writes: `submit(purpose, requested)` (district), `approve(id, allocated, reason)`, `reject(id, reason)`, `release(id)`, `setAIRecommendation(id, priority, risk, reason)`, `registerDistrict(addr, name)`, `deposit()` — all head-office-only except `submit` and `deposit`.

## Problems Faced (and How I Solved Them)

- **How does a wallet-less citizen see the data?** Assumed every page needed a connected wallet to read the contract — defeats the purpose of public verifiability. Solved with RPC providers (Alchemy/Infura): a `JsonRpcProvider` reads public contract state with zero wallet, zero gas, zero login. Became `public.js` — a separate read-only provider for the landing page and audit dashboard.

- **The admin panel outgrew a single page fast.** Five workflows (review, AI tools, deposits, district registration) stacked vertically became a wall of scroll. Reorganized into tabs grouped by who's using them and when.

- **No framework means no automatic state sharing.** Four pages, no router — anything needing cross-page consistency (ABI, tx feedback, sort order) had to be deliberately shared or it silently drifted.

- **Letting AI recommend without letting it decide.** Easy to let "AI approved this" become the approval — faster, but defeats human accountability. Every fund-moving action is gated behind an on-chain `owner()` check, so AI can score and draft justifications but can't move funds itself.

- **Making blockchain transactions feel real, not like a generic spinner.** A tx has a genuine multi-second gap between "signed" and "mined" that a plain spinner hides. Built a shared tx-feedback helper showing the real hash the moment it's submitted (linked to Etherscan), updating live once mined.

- **No login system — so what stops anyone from opening the admin panel?** No username/password means "who's authorized" can't be a client-side check. Solved by making wallet connection *be* the authentication: on connect, the app calls `contract.owner()` and compares it to the connected address — only an exact match unlocks the panel, because the check lives on-chain, not in the browser. Fails safe by design: if the ownership check itself fails, the app defaults to unauthorized rather than assuming access.

## Status

Built and tested on Sepolia testnet as a learning/portfolio project — not audited, not intended for mainnet or real fund custody as-is.

## License

MIT License

Copyright (c) 2026 Piyush

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
