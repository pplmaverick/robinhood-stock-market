// Phase A: fetch adapter for the self-hosted graph-node (VPS 46.62.246.244), fronted by nginx
// Basic Auth. Replaces reading verification/decision/raw_data/price_range_index.json as the
// live data source. Returns a discriminated result (never throws for an expected failure mode)
// so callers must handle "query failed" explicitly instead of the pipeline silently continuing
// on bad/missing data -- same three-state discipline as relayer/src/agent-book.js's
// lookupHumanBacking().
//
// GraphQL's own envelope ({ data, errors? }) is unwrapped here; callers never see it.

const PRICE_RANGE_INDEX_QUERY = `
  query LatestPriceRangeIndex($symbol: String!) {
    priceRangeIndexes(first: 1, where: { symbol: $symbol }, orderBy: blockTimestamp, orderDirection: desc) {
      symbol
      roundId
      currentPrice
      movingAverage
      volatility
      percentileRank
      actualWindowSize
      isFullWindow
      blockNumber
      blockTimestamp
    }
  }
`

/**
 * @param {string} symbol e.g. "TSLA"
 * @param {{ url: string, user?: string, password?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} options
 * @returns {Promise<
 *   | { ok: true, row: object | null }   // row is null when the subgraph has no PriceRangeIndex for this symbol yet
 *   | { ok: false, reason: 'config_missing' | 'network_error' | 'http_error' | 'graphql_error', error: string }
 * >}
 */
async function fetchLatestPriceRangeIndex(symbol, options) {
  const { url, user, password, fetchImpl = fetch, timeoutMs = 10_000 } = options

  if (!url || !user || !password) {
    return {
      ok: false,
      reason: 'config_missing',
      error: 'GRAPH_NODE_URL/GRAPH_NODE_USER/GRAPH_NODE_PASSWORD not set -- refusing to query without credentials',
    }
  }

  const auth = Buffer.from(`${user}:${password}`).toString('base64')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ query: PRICE_RANGE_INDEX_QUERY, variables: { symbol } }),
      signal: controller.signal,
    })
  } catch (e) {
    return { ok: false, reason: 'network_error', error: `graph-node request failed: ${e.message}` }
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    return { ok: false, reason: 'http_error', error: `graph-node returned HTTP ${response.status}` }
  }

  let body
  try {
    body = await response.json()
  } catch (e) {
    return { ok: false, reason: 'http_error', error: `graph-node response was not valid JSON: ${e.message}` }
  }

  if (body.errors && body.errors.length > 0) {
    return { ok: false, reason: 'graphql_error', error: body.errors.map((e) => e.message).join('; ') }
  }

  const rows = body.data?.priceRangeIndexes ?? []
  return { ok: true, row: rows[0] ?? null }
}

export { fetchLatestPriceRangeIndex, PRICE_RANGE_INDEX_QUERY }
