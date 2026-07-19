// public.js — shared, read-only, no-wallet-required chain access.
// Used by pages that show public on-chain data (landing stats, public audit
// dashboard) without ever requiring MetaMask or any wallet connection.
//
// Requires CONTRACT_ADDRESS and CONTRACT_ABI to already be defined on the
// page (contract.js declares both) — load this script AFTER contract.js.
//
// Deliberately uses its own names (publicProvider / publicContract) instead
// of `provider` / `contract`, because contract.js already declares those
// with `let` for the wallet-connected (BrowserProvider) flow. Reusing the
// same names here would throw "Identifier has already been declared".

const PUBLIC_RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/HmSAURoCBY90VIeDz226b";

const publicProvider = new ethers.JsonRpcProvider(PUBLIC_RPC_URL);
const publicContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, publicProvider);