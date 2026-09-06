// Live pipeline runner for the one real market that exists right now
// (StockPredictionMarketV2 marketId 0, TSLA). Two modes:
//
//   node scripts/run-demo.mjs
//     Real mode: warms up from the historical fixture's last TSLA row, queries the live
//     subgraph for TSLA's current PriceRangeIndex, runs Step 1+2 on that one live row, and (if
//     non-NO_TRADE) signs an attestation and prints the placeAgentBet() calldata that WOULD be
//     sent. Never calls placeAgentBet() itself.
//
//   node scripts/run-demo.mjs --manual-decision=BULL --manual-amount=0.002 [--manual-symbol=TSLA]
//     Manual test mode: skips the decision-engine's own judgment entirely and uses the given
//     direction/amount instead, so the attestation -> agent-tx pipeline can be exercised
//     end-to-end (nonce, signature, calldata) while the real subgraph data is frozen over the
//     weekend and would otherwise deterministically produce NO_TRADE. Still does a real market
//     lookup and a real attestation request through the real relayer -- only the BULL/BEAR/
//     amount choice is manual, nothing else is faked.
//
// Historical batch demo (Steps 1+2+3 over all 89 fixture rows, for reference-model-adjacent
// stress-testing) moved out of this script's scope -- that comparison is
// verification/decision/run_typescript.mjs's job, which reads the fixture directly and is
// unaffected by anything below.
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { warmupLastRow, runLiveDecisionStep } from '../src/decision-engine.js'
import { createAttestationBridge } from '../src/attestation-bridge.js'
import { fetchLatestPriceRangeIndex } from '../src/graph-client.js'
import { findOpenMarketId, createContractReader } from '../src/market-lookup.js'
import { buildPlaceAgentBetCalldata } from '../src/agent-tx.js'
import { resolveManualOverride } from '../src/manual-override.js'
import { NonceStore } from '../../relayer/src/nonce-store.js'
import {
  GRAPH_NODE_URL,
  GRAPH_NODE_USER,
  GRAPH_NODE_PASSWORD,
  ROBINHOOD_RPC_URL,
  ROBINHOOD_CHAIN_ID,
  STOCK_PREDICTION_MARKET_V2_ADDRESS,
} from '../src/config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(__dirname, '../../verification/decision/raw_data/price_range_index.json')
const RESOURCE_URI = 'https://robinhood-stock-market.example/decision-engine/attest'

function parseArgs(argv) {
  const args = {}
  for (const raw of argv) {
    const m = raw.match(/^--([a-zA-Z0-9-]+)=(.*)$/)
    if (m) args[m[1]] = m[2]
  }
  return args
}

function jsonSafe(value) {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`[run-demo] Missing required env var ${name}. Set it in decision-engine/.env.`)
    process.exit(1)
  }
  return value
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const symbol = args['manual-symbol'] ?? 'TSLA'
  const isManual = args['manual-decision'] !== undefined || args['manual-amount'] !== undefined

  // --- Market lookup (Phase C) -- real for both modes, never trusts the old hardcoded map ---
  const reader = createContractReader({
    rpcUrl: ROBINHOOD_RPC_URL,
    chainId: ROBINHOOD_CHAIN_ID,
    contractAddress: STOCK_PREDICTION_MARKET_V2_ADDRESS,
  })
  console.log(`Looking up the newest OPEN market for ${symbol} on ${STOCK_PREDICTION_MARKET_V2_ADDRESS}...`)
  const marketId = await findOpenMarketId(symbol, reader)
  if (marketId === null) {
    console.log(`No OPEN market found for ${symbol}. Nothing to bet on -- stopping here.`)
    return
  }
  console.log(`Found OPEN market: marketId=${marketId}\n`)

  let decision
  let confidence = null
  let betAmountWei

  if (isManual) {
    console.log('=== MANUAL TEST MODE -- decision-engine judgment skipped ===')
    let manual
    try {
      manual = resolveManualOverride({ decision: args['manual-decision'], amountEth: args['manual-amount'] })
    } catch (e) {
      console.error(`[run-demo] ${e.message}`)
      process.exit(1)
    }
    decision = manual.decision
    betAmountWei = manual.betAmountWei
    console.log(`Manual decision: ${decision}, amount: ${args['manual-amount']} ETH (${betAmountWei} wei)\n`)
  } else {
    // --- Warm-up (Phase A) -- from historical fixture data only; real-time data starts from
    // the first live query onward. The warmed row is never scored, only used as "previous". ---
    const fixtureRows = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
    const warmedPrevious = warmupLastRow(fixtureRows, symbol)
    console.log(
      warmedPrevious
        ? `Warmed up "previous" for ${symbol} from fixture: blockNumber=${warmedPrevious.blockNumber}, movingAverage=${warmedPrevious.movingAverage}`
        : `No fixture rows for ${symbol} -- starting cold (first live row will read as trend=UNKNOWN).`
    )

    console.log(`Querying live subgraph for ${symbol}'s latest PriceRangeIndex...`)
    const liveResult = await fetchLatestPriceRangeIndex(symbol, {
      url: GRAPH_NODE_URL,
      user: GRAPH_NODE_USER,
      password: GRAPH_NODE_PASSWORD,
    })
    if (!liveResult.ok) {
      console.error(`[run-demo] Live subgraph query failed (${liveResult.reason}): ${liveResult.error}`)
      console.error('[run-demo] Stopping -- not falling back to stale/fixture data silently.')
      process.exitCode = 1
      return
    }
    if (liveResult.row === null) {
      console.log(`No PriceRangeIndex data for ${symbol} on the live subgraph yet. Stopping here.`)
      return
    }

    console.log('\nLive row from subgraph:')
    console.log(jsonSafe(liveResult.row))

    const { current, queryDecision, betDecision } = runLiveDecisionStep({
      liveRawRow: liveResult.row,
      previousRow: warmedPrevious,
    })

    console.log('\nNormalized current row:')
    console.log(jsonSafe(current))
    console.log('\nqueryDecision (Step 1, informational only):')
    console.log(jsonSafe(queryDecision))
    console.log('\nbetDecision (Step 2):')
    console.log(jsonSafe(betDecision))

    if (betDecision.decision === 'NO_TRADE') {
      console.log(
        `\nNO_TRADE -- ${betDecision.inputB.level}/${betDecision.inputB.trend} does not clear the BULL/BEAR bar. ` +
          'This is the expected outcome while weekend data is frozen (current row likely equals the warm-up row, ' +
          'so trend=FLAT), not a bug. Stopping here -- nothing to attest or bet on.'
      )
      return
    }

    decision = betDecision.decision
    confidence = betDecision.confidence
    betAmountWei = BigInt(betDecision.betAmountWei)
    console.log(`\nLive decision: ${decision}, confidence=${confidence}, betAmountWei=${betAmountWei}\n`)
  }

  // --- Attestation (Step 3) -- real relayer pipeline, real AgentBook lookup ---
  const AGENT_PRIVATE_KEY = requireEnv('AGENT_PRIVATE_KEY')
  const RELAYER_PRIVATE_KEY = requireEnv('RELAYER_PRIVATE_KEY')

  const bridge = createAttestationBridge({
    agentPrivateKeyHex: AGENT_PRIVATE_KEY,
    relayerPrivateKeyHex: RELAYER_PRIVATE_KEY,
    resourceUri: RESOURCE_URI,
  })
  console.log(`Agent address: ${bridge.agentAddress}`)

  const direction = decision === 'BULL' ? 0 : 1
  const nonceStore = new NonceStore()
  const robinhoodNonce = BigInt(Date.now())

  const { worldIdAttestationStatus, detail } = await bridge.checkAndAttest(
    { marketId, direction, amount: betAmountWei, robinhoodNonce },
    nonceStore
  )

  console.log(`\nworldIdAttestationStatus: ${worldIdAttestationStatus}`)

  if (worldIdAttestationStatus !== 'backed') {
    console.log(`Detail: ${jsonSafe(detail)}`)
    console.log(
      '\nNo valid attestation was produced, so there is no calldata to build. This is a real ' +
        "relayer refusal (e.g. this agent address isn't currently registered as human-backed in " +
        'AgentBook on World Chain), not a bug in this script. Stopping here.'
    )
    return
  }

  console.log('\nAttestation (signed by relayer):')
  console.log(jsonSafe(detail.attestation))
  console.log('\nSignature:')
  console.log(jsonSafe(detail.signature))

  const calldata = buildPlaceAgentBetCalldata({
    attestation: detail.attestation,
    v: detail.signature.v,
    r: detail.signature.r,
    s: detail.signature.s,
  })

  console.log('\n=== Ready-to-send placeAgentBet() calldata (NOT sent) ===')
  console.log(`to:    ${STOCK_PREDICTION_MARKET_V2_ADDRESS}`)
  console.log(`value: ${betAmountWei} wei`)
  console.log(`data:  ${calldata}`)
  console.log('\nThis script never calls submitPlaceAgentBet() -- broadcasting requires a separate, explicitly-confirmed step.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
