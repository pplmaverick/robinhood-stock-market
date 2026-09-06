// Read-only Vercel serverless function: current TSLA decision-engine judgment + AgentBook
// human-backing status + the live OPEN marketId, for the frontend's agent-decision animation
// (Phase 2). Reuses decision-engine's and relayer's own pure/read-only modules directly --
// no reimplementation, no signing, no tx-sending. Never calls placeAgentBet() or placeBet().
//
// Dependency scope, deliberately checked before writing this file: graph-client.js,
// bet-decision.js, bet-sizing.js, decision-engine.js's live-path additions, and
// market-lookup.js have zero npm dependencies (pure functions + built-in fetch/viem is not
// even needed for those). agent-book.js's lookupHumanBacking() depends on viem only -- never
// @noble/curves or @worldcoin/agentkit-core (those live in attestation.js/verify-signature.js/
// attestation-bridge.js/agent-tx.js/manual-override.js, none of which are imported here).
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { warmupLastRow, runLiveDecisionStep } from '../../decision-engine/src/decision-engine.js'
import { fetchLatestPriceRangeIndex } from '../../decision-engine/src/graph-client.js'
import { findOpenMarketId, createContractReader } from '../../decision-engine/src/market-lookup.js'
import { lookupHumanBacking } from '../../relayer/src/agent-book.js'

const SYMBOL = 'TSLA'

const ROBINHOOD_RPC_URL = process.env.ROBINHOOD_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com'
const ROBINHOOD_CHAIN_ID = Number(process.env.ROBINHOOD_CHAIN_ID ?? 4663)
const STOCK_PREDICTION_MARKET_V2_ADDRESS =
  process.env.STOCK_PREDICTION_MARKET_V2_ADDRESS ?? '0x59DF30E22bdaC70764a5DbF8bBa51BC5a595759C'
// This engine's own AgentKit identity (decision-engine/.env's AGENT_PRIVATE_KEY derives this
// address) -- the address AgentBook is checked against. Not a secret; only the private key is.
const AGENT_ADDRESS = process.env.AGENT_ADDRESS ?? '0x7204524e4D6EE3B6D37eeF656Cb3B25951963b09'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(__dirname, '../../verification/decision/raw_data/price_range_index.json')

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  try {
    const reader = createContractReader({
      rpcUrl: ROBINHOOD_RPC_URL,
      chainId: ROBINHOOD_CHAIN_ID,
      contractAddress: STOCK_PREDICTION_MARKET_V2_ADDRESS,
    })
    const marketIdRaw = await findOpenMarketId(SYMBOL, reader)
    const marketId = marketIdRaw === null ? null : marketIdRaw.toString()

    const liveResult = await fetchLatestPriceRangeIndex(SYMBOL, {
      url: process.env.GRAPH_NODE_URL ?? 'http://46.62.246.244:8000/subgraphs/name/robinhood-stock-market/price-feeds',
      user: process.env.GRAPH_NODE_USER,
      password: process.env.GRAPH_NODE_PASSWORD,
    })

    let decision
    if (!liveResult.ok) {
      decision = { status: 'query_failed', reason: liveResult.reason, error: liveResult.error }
    } else if (liveResult.row === null) {
      decision = { status: 'no_data' }
    } else {
      const fixtureRows = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
      const warmedPrevious = warmupLastRow(fixtureRows, SYMBOL)
      const { current, queryDecision, betDecision } = runLiveDecisionStep({
        liveRawRow: liveResult.row,
        previousRow: warmedPrevious,
      })
      // betDecision.marketId (when present) is bet-decision.js's pure/historical-batch
      // placeholder (SYMBOL_MARKET_ID), not this endpoint's real dynamic lookup above, and it's
      // a BigInt that JSON.stringify can't serialize -- drop it so the real `marketId` field at
      // the top of this response is the only one callers should read.
      const { marketId: _placeholderMarketId, ...betDecisionForResponse } = betDecision
      decision = { status: 'ok', current, queryDecision, betDecision: betDecisionForResponse }
    }

    const agentBook = await lookupHumanBacking(AGENT_ADDRESS)

    res.status(200).json({
      symbol: SYMBOL,
      marketId,
      decision,
      agentBook,
      agentAddress: AGENT_ADDRESS,
      timestamp: Date.now(),
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
