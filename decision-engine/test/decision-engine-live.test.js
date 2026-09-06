import { test } from 'node:test'
import assert from 'node:assert/strict'
import { warmupLastRow, runLiveDecisionStep } from '../src/decision-engine.js'

function fixtureRow(overrides = {}) {
  return {
    symbol: 'TSLA',
    currentPrice: '100',
    movingAverage: '100',
    volatility: '1',
    percentileRank: '50',
    actualWindowSize: 5,
    isFullWindow: false,
    roundId: '1',
    blockNumber: '100',
    blockTimestamp: '1000',
    ...overrides,
  }
}

test('warmupLastRow: picks the highest-blockNumber row for the requested symbol', () => {
  const fixture = [
    fixtureRow({ blockNumber: '100', movingAverage: '90' }),
    fixtureRow({ blockNumber: '300', movingAverage: '95' }), // newest -- should win
    fixtureRow({ blockNumber: '200', movingAverage: '92' }),
    fixtureRow({ symbol: 'AMD', blockNumber: '999', movingAverage: '999' }), // different symbol, ignored
  ]
  const warmed = warmupLastRow(fixture, 'TSLA')
  assert.equal(warmed.blockNumber, '300')
  assert.equal(warmed.movingAverage, 95)
})

test('warmupLastRow: no rows for that symbol -> null (caller must handle this as cold-start)', () => {
  const fixture = [fixtureRow({ symbol: 'AMD' })]
  assert.equal(warmupLastRow(fixture, 'TSLA'), null)
})

test('runLiveDecisionStep: warmed previous + identical live row (frozen weekend data) -> trend FLAT -> NO_TRADE', () => {
  const warmed = warmupLastRow([fixtureRow({ percentileRank: '85', movingAverage: '110' })], 'TSLA')
  const liveRawRow = fixtureRow({ percentileRank: '85', movingAverage: '110' }) // same snapshot, nothing new
  const { betDecision } = runLiveDecisionStep({ liveRawRow, previousRow: warmed })
  assert.equal(betDecision.inputB.trend, 'FLAT')
  assert.equal(betDecision.decision, 'NO_TRADE')
})

test('runLiveDecisionStep: warmed previous + a genuinely new higher live row -> trend UP, can reach BULL', () => {
  const warmed = warmupLastRow([fixtureRow({ percentileRank: '85', movingAverage: '100' })], 'TSLA')
  const liveRawRow = fixtureRow({ percentileRank: '85', movingAverage: '110', blockNumber: '101' })
  const { betDecision } = runLiveDecisionStep({ liveRawRow, previousRow: warmed })
  assert.equal(betDecision.inputB.trend, 'UP')
  assert.equal(betDecision.decision, 'BULL')
})

test('runLiveDecisionStep: no warm-up available -> trend UNKNOWN -> NO_TRADE, never crashes', () => {
  const liveRawRow = fixtureRow({ percentileRank: '100' })
  const { betDecision } = runLiveDecisionStep({ liveRawRow, previousRow: null })
  assert.equal(betDecision.inputB.trend, 'UNKNOWN')
  assert.equal(betDecision.decision, 'NO_TRADE')
})

test('runLiveDecisionStep: queryDecision is computed cold (Step 1 stats not warmed) and never gates betDecision', () => {
  const liveRawRow = fixtureRow({ percentileRank: '85', movingAverage: '110', volatility: '50' })
  const { queryDecision, betDecision } = runLiveDecisionStep({ liveRawRow, previousRow: null })
  assert.equal(queryDecision.shouldQuery, false) // no historical average yet -> not anomalous by design
  assert.equal(queryDecision.reason, 'volatility_not_anomalous')
  // betDecision is unaffected by queryDecision either way -- it's UNKNOWN-trend NO_TRADE, not a
  // volatility-driven one.
  assert.equal(betDecision.decision, 'NO_TRADE')
})
