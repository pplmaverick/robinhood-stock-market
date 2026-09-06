import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findOpenMarketId, MARKET_STATE } from '../src/market-lookup.js'

// Mock reader: `markets` is an array indexed by marketId, each { symbol, state }.
function mockReader(markets) {
  return {
    readMarketCount: async () => BigInt(markets.length),
    readMarket: async (id) => markets[Number(id)],
  }
}

test('single OPEN market for the symbol (current real-world case: TSLA=0)', async () => {
  const reader = mockReader([{ symbol: 'TSLA', state: MARKET_STATE.OPEN }])
  assert.equal(await findOpenMarketId('TSLA', reader), 0n)
})

test('markets exist but all SETTLED -> null', async () => {
  const reader = mockReader([
    { symbol: 'TSLA', state: MARKET_STATE.SETTLED },
    { symbol: 'TSLA', state: MARKET_STATE.SETTLED },
  ])
  assert.equal(await findOpenMarketId('TSLA', reader), null)
})

test('marketCount = 0 -> null, no calls into readMarket', async () => {
  let readMarketCalls = 0
  const reader = {
    readMarketCount: async () => 0n,
    readMarket: async () => {
      readMarketCalls++
      return { symbol: 'TSLA', state: MARKET_STATE.OPEN }
    },
  }
  assert.equal(await findOpenMarketId('TSLA', reader), null)
  assert.equal(readMarketCalls, 0)
})

test('same symbol has multiple markets, only the newest is OPEN -> returns the newest id', async () => {
  const reader = mockReader([
    { symbol: 'TSLA', state: MARKET_STATE.SETTLED }, // id 0, old
    { symbol: 'TSLA', state: MARKET_STATE.SETTLED }, // id 1, old
    { symbol: 'TSLA', state: MARKET_STATE.OPEN }, // id 2, current
  ])
  assert.equal(await findOpenMarketId('TSLA', reader), 2n)
})

test('an OPEN market exists but for a different symbol -> null for the requested symbol', async () => {
  const reader = mockReader([{ symbol: 'AMD', state: MARKET_STATE.OPEN }])
  assert.equal(await findOpenMarketId('TSLA', reader), null)
})

test('newest-first scan still finds an older OPEN market when a newer market for the same symbol exists but is not open', async () => {
  const reader = mockReader([
    { symbol: 'TSLA', state: MARKET_STATE.OPEN }, // id 0, the only currently-open one
    { symbol: 'TSLA', state: MARKET_STATE.SETTLED }, // id 1, newer but not open -- must not mask id 0
  ])
  assert.equal(await findOpenMarketId('TSLA', reader), 0n)
})
