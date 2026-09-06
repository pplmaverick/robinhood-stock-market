import { useMemo, useState } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatEther, formatUnits } from 'viem'
import { MARKET_ADDRESS, MARKET_ABI, STOCKS, STATE } from '../constants'
import StatusBadge from '../components/StatusBadge'

function fmtPrice(raw) {
  if (raw == null || raw === 0n) return '—'
  const abs = raw < 0n ? -raw : raw
  return '$' + Number(formatUnits(abs, 8)).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

function fmtEth(wei) {
  if (!wei) return '0.0000'
  return Number(formatEther(wei)).toFixed(4) + ' ETH'
}

function stockByToken(token) {
  return STOCKS.find(s => s.token.toLowerCase() === token?.toLowerCase()) ?? null
}

// financial tables right-align numeric columns so mono digits line up
const NUMERIC_COLUMNS = ['Open Price', 'Close Price', 'Bull Pool', 'Bear Pool', 'Total']

export default function MarketStatus() {
  const [showAll, setShowAll] = useState(false)

  const { data: marketCount } = useReadContract({
    address: MARKET_ADDRESS,
    abi:     MARKET_ABI,
    functionName: 'marketCount',
    query: { refetchInterval: 15000 },
  })

  const marketIds = useMemo(
    () => marketCount ? Array.from({ length: Number(marketCount) }, (_, i) => BigInt(i)) : [],
    [marketCount]
  )

  const { data: marketsRaw } = useReadContracts({
    contracts: marketIds.map(id => ({
      address: MARKET_ADDRESS, abi: MARKET_ABI,
      functionName: 'markets', args: [id],
    })),
    query: { enabled: marketIds.length > 0, refetchInterval: 15000 },
  })

  const markets = useMemo(() => {
    if (!marketsRaw) return []
    return marketsRaw
      .map((d, i) => {
        if (d.status !== 'success' || !d.result) return null
        const r = d.result
        return {
          id: i,
          stockToken: r.stockToken ?? r[0],
          symbol:     r.symbol     ?? r[2],
          openTime:   r.openTime   ?? r[4],
          closeTime:  r.closeTime  ?? r[5],
          openPrice:  r.openPrice  ?? r[6],
          closePrice: r.closePrice ?? r[7],
          bullPool:   r.bullPool   ?? r[8],
          bearPool:   r.bearPool   ?? r[9],
          state:      Number(r.state ?? r[10] ?? 0),
        }
      })
      .filter(Boolean)
  }, [marketsRaw])

  const countsByState = {
    open:     markets.filter(m => m.state === STATE.OPEN).length,
    locked:   markets.filter(m => m.state === STATE.LOCKED).length,
    settled:  markets.filter(m => m.state === STATE.SETTLED).length,
  }
  const totalEthLocked = markets.reduce((a, m) => a + m.bullPool + m.bearPool, 0n)

  const displayed = showAll ? markets : markets.filter(m => m.state === STATE.OPEN)

  return (
    <main className="max-w-container-max mx-auto px-gutter py-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg mb-1">Market Status</h1>
          <p className="font-body-sm text-on-surface-variant">
            All prediction markets on StockPredictionMarket · {markets.length} total
          </p>
        </div>
        {/* Stats row */}
        <div className="flex gap-3">
          {[
            { label: 'Open',    value: countsByState.open,    color: 'text-bull' },
            { label: 'Locked',  value: countsByState.locked,  color: 'text-locked' },
            { label: 'Settled', value: countsByState.settled, color: 'text-on-surface-variant' },
            { label: 'ETH Locked', value: fmtEth(totalEthLocked), color: 'text-primary' },
          ].map(s => (
            <div key={s.label} className="bg-surface-container border border-outline-variant p-3 min-w-[90px]">
              <div className="font-label-caps text-on-surface-variant mb-1">{s.label}</div>
              <div className={`font-data-lg ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Terminal-style table */}
      <div className="bg-surface-container-low border border-outline-variant overflow-hidden">
        {/* Table header bar */}
        <div className="px-6 py-3 border-b border-outline-variant bg-surface-container flex items-center gap-3">
          <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>terminal</span>
          <span className="font-label-caps text-on-surface">ALL MARKETS</span>
          <span className="font-data-sm text-on-surface-variant ml-auto">
            Contract: {MARKET_ADDRESS.slice(0, 10)}…
          </span>
          <button
            onClick={() => setShowAll(v => !v)}
            className="font-label-caps text-sm px-3 py-1 rounded border border-outline text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {showAll ? 'Show Open Only' : 'Show All'}
          </button>
        </div>

        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant">
                {['#', 'Stock', 'Symbol', 'Status', 'Open Price', 'Close Price',
                  'Bull Pool', 'Bear Pool', 'Total', 'Settlement'].map(h => (
                  <th key={h}
                      className={`px-4 py-3 font-label-caps text-on-surface-variant uppercase tracking-wider whitespace-nowrap ${
                        NUMERIC_COLUMNS.includes(h) ? 'text-right' : ''
                      }`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {markets.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-on-surface-variant font-body-sm">
                    {marketCount == null ? 'Loading…' : 'No markets found.'}
                  </td>
                </tr>
              ) : displayed.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-on-surface-variant font-body-sm">
                    No open markets.{' '}
                    <button
                      onClick={() => setShowAll(true)}
                      className="text-tertiary-fixed-dim hover:text-primary transition-colors underline"
                    >
                      Show all markets
                    </button>
                  </td>
                </tr>
              ) : [...displayed].reverse().map(m => {
                const s = stockByToken(m.stockToken)
                const closeDate = m.closeTime
                  ? new Date(Number(m.closeTime) * 1000).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })
                  : '—'

                return (
                  <tr key={m.id} className="hover:bg-surface-variant/10 transition-colors">
                    <td className="px-4 py-3 font-data-sm text-on-surface-variant">#{m.id}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>
                          {s?.icon ?? 'show_chart'}
                        </span>
                        <span className="font-data-md text-on-surface">{s?.symbol ?? '?'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-data-sm text-on-surface-variant">{m.symbol}</td>
                    <td className="px-4 py-3">
                      <StatusBadge state={m.state} />
                    </td>
                    <td className="px-4 py-3 font-data-sm text-on-surface text-right">
                      {fmtPrice(m.openPrice)}
                    </td>
                    <td className="px-4 py-3 font-data-sm text-on-surface text-right">
                      {m.state === STATE.SETTLED ? fmtPrice(m.closePrice) : '—'}
                    </td>
                    <td className="px-4 py-3 font-data-sm text-bull text-right">
                      {fmtEth(m.bullPool)}
                    </td>
                    <td className="px-4 py-3 font-data-sm text-bear text-right">
                      {fmtEth(m.bearPool)}
                    </td>
                    <td className="px-4 py-3 font-data-sm text-on-surface text-right">
                      {fmtEth(m.bullPool + m.bearPool)}
                    </td>
                    <td className="px-4 py-3 font-data-sm text-on-surface-variant whitespace-nowrap">
                      {closeDate}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contract info */}
      <div className="mt-6 p-4 bg-surface-container border border-outline-variant rounded-lg">
        <div className="font-label-caps text-on-surface-variant mb-2">CONTRACT</div>
        <a
          href={`https://robinhoodchain.blockscout.com/address/${MARKET_ADDRESS}`}
          target="_blank" rel="noreferrer"
          className="font-data-sm text-tertiary-fixed-dim hover:text-primary transition-colors break-all"
        >
          {MARKET_ADDRESS}
        </a>
      </div>
    </main>
  )
}
