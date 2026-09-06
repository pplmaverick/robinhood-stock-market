# Architectural Directive: Live Subgraph Data Source with Historical Warm-up

Decision Date: 2026-09-06

## Decision Context (Human Architect)

decision-engine's bet-decision logic was validated against a frozen
89-event historical dataset — 89/89 match against the independently
written Python reference model. That validation stands. But the logic
in production was still reading that same static file at runtime
instead of querying the self-hosted graph-node subgraph live, which
meant every real decision was technically a replay of old data, not a
live judgment.

Switching to a live query surfaced a problem the static-file setup had
been hiding. classifyTrend() determines direction by comparing the
current row's movingAverage against the previous row for the same
symbol. On a cold start there is no previous row, so trend resolves to
UNKNOWN — and UNKNOWN always falls through to NO_TRADE, regardless of
what percentileRank says. Without a fix, the very first live query
after any restart would be structurally incapable of producing a BULL
or BEAR call.

The fix under consideration was a warm-up step: seed the in-memory
lastRowBySymbol state with the last one or two rows from the historical
fixture before the first live query runs. This borrows from the
validated dataset only to give the trend calculation something to
compare against — it doesn't feed historical data into the decision
output itself.

## Core Directives Given to Claude Code

Point decision-engine's live path at the graph-node GraphQL endpoint
instead of the static fixture file. Add a warm-up function that runs
once at startup, populating lastRowBySymbol for TSLA from the last one
or two fixture rows, before any live query executes.

Mark the warm-up clearly in code comments — "warm-up from historical
fixture, real-time data starts from the first live query onward" — so
it reads as a bootstrap step, not as a live data point.

## Implementation & Trade-off Constraints

This introduces a hard dependency on the graph-node's Basic Auth
credentials (GRAPH_NODE_URL/USER/PASSWORD) being configured wherever
decision-engine runs. Missing credentials must fail closed with an
explicit status (query_failed / config_missing) rather than crashing or
silently falling back to the fixture — silent fallback would have
defeated the entire point of moving to live data.

A live query that fails at the network or GraphQL level returns null,
not a thrown exception. The caller treats "no data available" and
"NO_TRADE" as distinct states — a failed query should never be
misread as a directionless market.

Chainlink equity feeds don't publish new rounds outside market hours.
During a weekend or holiday, live queries will keep returning the same
row, and trend will correctly resolve to FLAT rather than UNKNOWN or
producing a false directional read. That's expected behavior given the
underlying data source, not a defect in this warm-up logic.
