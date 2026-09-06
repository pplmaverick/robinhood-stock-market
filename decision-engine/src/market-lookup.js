// Phase C: replaces bet-decision.js's hardcoded SYMBOL_MARKET_ID for live use. Scans
// StockPredictionMarketV2.marketCount() and reads markets(id) from the newest id downward,
// returning the first OPEN market for the requested symbol -- never an older/settled one, and
// never a guess: if no OPEN market exists for that symbol right now, callers get null and must
// skip that symbol rather than betting on a stale id.
import { createPublicClient, http } from 'viem'

const MARKET_STATE = { OPEN: 0, LOCKED: 1, SETTLED: 2 }

const MARKET_ABI = [
  {
    name: 'marketCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'markets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { name: 'stockToken', type: 'address' },
      { name: 'priceFeed', type: 'address' },
      { name: 'symbol', type: 'string' },
      { name: 'roundId', type: 'uint256' },
      { name: 'openTime', type: 'uint256' },
      { name: 'closeTime', type: 'uint256' },
      { name: 'openPrice', type: 'int256' },
      { name: 'closePrice', type: 'int256' },
      { name: 'bullPool', type: 'uint256' },
      { name: 'bearPool', type: 'uint256' },
      { name: 'state', type: 'uint8' },
    ],
  },
]

/**
 * @param {{ rpcUrl: string, chainId: number, contractAddress: `0x${string}` }} args
 * @returns {{ readMarketCount: () => Promise<bigint>, readMarket: (id: bigint) => Promise<{ symbol: string, state: number }> }}
 */
function createContractReader({ rpcUrl, chainId, contractAddress }) {
  const client = createPublicClient({ chain: { id: chainId }, transport: http(rpcUrl) })
  return {
    readMarketCount: () =>
      client.readContract({ address: contractAddress, abi: MARKET_ABI, functionName: 'marketCount' }),
    readMarket: async (id) => {
      const m = await client.readContract({
        address: contractAddress,
        abi: MARKET_ABI,
        functionName: 'markets',
        args: [id],
      })
      return { symbol: m[2], state: m[10] }
    },
  }
}

/**
 * @param {string} symbol
 * @param {{ readMarketCount: () => Promise<bigint>, readMarket: (id: bigint) => Promise<{symbol: string, state: number}> }} reader injection point for tests
 * @returns {Promise<bigint | null>} newest OPEN marketId for this symbol, or null if none
 */
async function findOpenMarketId(symbol, reader) {
  const count = await reader.readMarketCount()
  for (let id = count - 1n; id >= 0n; id--) {
    const m = await reader.readMarket(id)
    if (m.symbol === symbol && m.state === MARKET_STATE.OPEN) return id
  }
  return null
}

export { findOpenMarketId, createContractReader, MARKET_STATE, MARKET_ABI }
