import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'

export const robinhoodMainnet = {
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
}

export const config = createConfig({
  chains: [robinhoodMainnet],
  connectors: [injected()],
  transports: {
    // Reads only (useReadContract(s), balance checks, waiting for tx receipts) go through this
    // same-origin proxy (frontend/api/rpc-proxy.js) to work around a real, reproducible CORS bug
    // on Robinhood Chain's own RPC edge that only manifests in real browsers. A connected wallet
    // sending a transaction (writeContract) never touches this -- it uses the wallet extension's
    // own configured RPC for this chain (see robinhoodMainnet.rpcUrls above, used by
    // wallet_addEthereumChain in Navbar.jsx), unaffected by this transport.
    [robinhoodMainnet.id]: http('/api/rpc-proxy', {
      timeout: 30_000,
    }),
  },
  pollingInterval: 2_000,
})
