import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchLatestPriceRangeIndex } from '../src/graph-client.js'

const BASE_OPTIONS = { url: 'http://example.test/subgraphs/name/x', user: 'u', password: 'p' }

test('success: unwraps data.priceRangeIndexes[0]', async () => {
  const row = { symbol: 'TSLA', blockNumber: '1', blockTimestamp: '1000' }
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ data: { priceRangeIndexes: [row] } }),
  })
  const result = await fetchLatestPriceRangeIndex('TSLA', { ...BASE_OPTIONS, fetchImpl })
  assert.deepEqual(result, { ok: true, row })
})

test('success but empty result set (e.g. AMZN/PLTR/AMD/NVDA with no market yet) -> row: null, not an error', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ data: { priceRangeIndexes: [] } }),
  })
  const result = await fetchLatestPriceRangeIndex('AMZN', { ...BASE_OPTIONS, fetchImpl })
  assert.deepEqual(result, { ok: true, row: null })
})

test('degraded: network failure (fetch rejects) is reported, not thrown', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED')
  }
  const result = await fetchLatestPriceRangeIndex('TSLA', { ...BASE_OPTIONS, fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'network_error')
  assert.match(result.error, /ECONNREFUSED/)
})

test('degraded: HTTP error status (e.g. 401 from a bad password) is reported', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401 })
  const result = await fetchLatestPriceRangeIndex('TSLA', { ...BASE_OPTIONS, fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'http_error')
  assert.match(result.error, /401/)
})

test('degraded: GraphQL-level errors (HTTP 200 but errors[] present) are reported, not silently ignored', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ errors: [{ message: 'Type `Query` has no field `priceRangeIndexes`' }] }),
  })
  const result = await fetchLatestPriceRangeIndex('TSLA', { ...BASE_OPTIONS, fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'graphql_error')
  assert.match(result.error, /no field/)
})

test('degraded: missing credentials refuses to query at all', async () => {
  let called = false
  const fetchImpl = async () => {
    called = true
    return { ok: true, json: async () => ({ data: { priceRangeIndexes: [] } }) }
  }
  const result = await fetchLatestPriceRangeIndex('TSLA', { url: 'http://x', fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'config_missing')
  assert.equal(called, false)
})

test('degraded: non-JSON response body is reported', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => {
      throw new SyntaxError('Unexpected token')
    },
  })
  const result = await fetchLatestPriceRangeIndex('TSLA', { ...BASE_OPTIONS, fetchImpl })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'http_error')
})
