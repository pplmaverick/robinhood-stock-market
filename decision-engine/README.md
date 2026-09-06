# AI Decision Engine

Reads `PriceRangeIndex` output from the Graph computation layer (`subgraph/`) and decides
`BULL` / `BEAR` / `NO_TRADE`. For a directional decision, self-signs an AgentKit request and
submits it to the (unmodified) relayer (`relayer/`) to attach a World ID attestation status.

**Scope for this round**: produces the full decision JSON, including a verified
`worldIdAttestationStatus`. Does **not** call `placeBet()` or touch
`StockPredictionMarket.sol` — see `relayer/README.md` for the same boundary on its side.

Full factor/threshold definitions and the momentum-vs-mean-reversion disclosure are in
`docs/spec.md`, "AI Decision Engine" — read that before changing any threshold in
`src/config.js`, since `verification/decision/reference_model.py` must be kept in sync with it.

## Pipeline

1. `query-decision.js` — Step 1: is a Graph query worth issuing right now (volatility anomaly
   + throttle)? Informational only in this round; the Graph query itself already runs
   independently.
2. `bet-decision.js` — Step 2: the core decision. Produces the frozen output shape:
   `{ inputA, inputB, decision, confidence, worldIdAttestationStatus }` (plus `marketId` /
   `betAmountWei` when non-`NO_TRADE`).
3. `attestation-bridge.js` — Step 3: only called for non-`NO_TRADE` decisions. Self-signs a
   SIWE AgentKit payload and submits it to `relayer/src/relayer.js`'s `handleAgentRequest`
   unmodified, then maps the result into `backed` / `unbacked` / `unknown`.
4. `decision-engine.js` — orchestrator: `runPureDecisionsOverHistory()` (Steps 1+2, pure,
   no network) and `attachAttestations()` (Step 3, live network).

## Running

```bash
npm install
npm test        # deterministic unit tests, Steps 1+2 only, plus the live-pipeline modules below
npm run demo    # live pipeline against the one real market that exists (StockPredictionMarketV2
                 # marketId 0, TSLA): dynamic market lookup, live subgraph query, Step 1+2, and
                 # (if non-NO_TRADE) a real relayer attestation call. Never broadcasts a bet.
npm run demo -- --manual-decision=BULL --manual-amount=0.002   # bypass Step 1+2, use this
                 # direction/amount instead -- for exercising attestation/nonce/calldata while
                 # live data is frozen (e.g. over the weekend) and would otherwise be NO_TRADE.
```

`run-demo.mjs` requires both `AGENT_PRIVATE_KEY` and `RELAYER_PRIVATE_KEY` in `.env` (the latter
must be the SAME key `relayer/.env` uses, since this engine calls `relayer/src/relayer.js`
in-process rather than over a network — a mismatched key produces a signature that would never
recover to the deployed contract's `relayerAddress`). It also requires `GRAPH_NODE_URL` /
`GRAPH_NODE_USER` / `GRAPH_NODE_PASSWORD` for the live subgraph query (see `decision-engine/src/
graph-client.js`; the URL has a safe default, the credentials do not). Missing any of these fails
loudly at startup rather than silently falling back to a fixture or a throwaway key.

The historical/reference-model comparison over the full 89-row fixture no longer lives here — see
`verification/decision/run_typescript.mjs`, which reads the fixture directly and is unaffected by
any of the above.

## Reference model

`verification/decision/` independently re-implements Steps 1+2 in Python and compares it
against this package's output row-by-row on the same real historical data, SHA-256-sealed —
same methodology as `verification/settlement/` and `verification/graph-computation/`. Step 3
is out of scope there (live network calls, nothing deterministic to mirror).
