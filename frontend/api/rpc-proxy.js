// Server-to-server proxy for Robinhood Chain's RPC, to work around a real, reproducible bug in
// its own edge (Cloudflare-fronted) infrastructure: real browsers (confirmed with both
// Playwright's Chromium and real Chrome, against this project's own production domain) get an
// Access-Control-Allow-Origin header with a duplicate value ("*,*"), which browsers correctly
// reject per the CORS spec. This could NOT be reproduced via curl or Node's own fetch at up to
// 40-way concurrency -- only via an actual browser's request pattern once a wallet is connected.
// Proxying reads through this same-origin serverless function sidesteps browser CORS enforcement
// entirely (server-to-server fetches are never subject to CORS), without needing Robinhood
// Chain's own team to fix their edge config.
//
// Scope: this only replaces the wagmi *public client* transport (reads: useReadContract(s),
// balance checks, waiting for a transaction receipt). It does NOT touch how a connected wallet
// (MetaMask etc.) sends transactions -- that always goes straight from the wallet extension to
// whatever RPC URL the wallet itself is configured with for this chain (set via
// wallet_addEthereumChain in Navbar.jsx), entirely independent of this file.
const ROBINHOOD_RPC_URL = process.env.ROBINHOOD_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed, expected POST' })
    return
  }

  let upstream
  try {
    upstream = await fetch(ROBINHOOD_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })
  } catch (e) {
    res.status(502).json({ error: `rpc-proxy: upstream request failed: ${e instanceof Error ? e.message : String(e)}` })
    return
  }

  const text = await upstream.text()
  res.status(upstream.status)
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json')
  res.send(text)
}
