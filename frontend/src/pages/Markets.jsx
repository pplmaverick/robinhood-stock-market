import { useState, useMemo, useEffect, useRef } from 'react'
import {
  useReadContract, useReadContracts, useWriteContract,
  useWaitForTransactionReceipt, useAccount, useBalance, usePublicClient,
} from 'wagmi'
import { formatEther, parseEther, formatUnits } from 'viem'
import {
  MARKET_ADDRESS, MARKET_ABI, PRICE_FEED_ABI, STOCKS, STATE, DIR, FEE_BPS,
} from '../constants'
import StatusBadge from '../components/StatusBadge'
import Countdown from '../components/Countdown'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(raw) {
  if (raw == null) return '—'
  return '$' + Number(formatUnits(raw < 0n ? -raw : raw, 8)).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

function fmtEth(wei) {
  if (wei == null) return '—'
  return Number(formatEther(wei)).toFixed(4) + ' ETH'
}

function payoutRatio(myPool, totalPool) {
  if (!myPool || myPool === 0n || !totalPool) return null
  const fee = (totalPool * FEE_BPS) / 10000n
  const net = totalPool - fee
  // ratio = net / myPool  (per 1 ETH bet)
  return Number((net * 1000n) / myPool) / 1000
}

function estimatedPayout(betWei, myPool, totalPool) {
  if (!betWei || betWei === 0n || !myPool || myPool === 0n) return 0n
  const newTotal = totalPool + betWei
  const newMy    = myPool + betWei
  const fee      = (newTotal * FEE_BPS) / 10000n
  return (newTotal - fee) * betWei / newMy
}

// ── component ────────────────────────────────────────────────────────────────

export default function Markets() {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [betSide, setBetSide]         = useState('BULL')
  const [betAmount, setBetAmount]     = useState('')
  const [logs, setLogs]               = useState([])
  const [nowSec, setNowSec]           = useState(() => Math.floor(Date.now() / 1000))
  const hasAutoSelected               = useRef(false)

  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  const { address, isConnected } = useAccount()
  const { data: balance }        = useBalance({ address })
  const publicClient             = usePublicClient()

  const selectedStock = STOCKS[selectedIdx]

  // ── on-chain reads ──────────────────────────────────────────────────────

  const { data: marketCount } = useReadContract({
    address: MARKET_ADDRESS,
    abi:     MARKET_ABI,
    functionName: 'marketCount',
    query: { refetchInterval: 12000 },
  })

  const marketIds = useMemo(
    () => marketCount ? Array.from({ length: Number(marketCount) }, (_, i) => BigInt(i)) : [],
    [marketCount]
  )

  const { data: marketsRaw, refetch: refetchMarkets } = useReadContracts({
    contracts: marketIds.map(id => ({
      address: MARKET_ADDRESS,
      abi:     MARKET_ABI,
      functionName: 'markets',
      args:    [id],
    })),
    query: { enabled: marketIds.length > 0, refetchInterval: 12000 },
  })

  const { data: pricesRaw } = useReadContracts({
    contracts: STOCKS.map(s => ({
      address: s.priceFeed,
      abi:     PRICE_FEED_ABI,
      functionName: 'latestRoundData',
    })),
    query: { refetchInterval: 15000 },
  })

  // ── process markets ──────────────────────────────────────────────────────

  const markets = useMemo(() => {
    if (!marketsRaw) return []
    return marketsRaw
      .map((d, i) => {
        if (d.status !== 'success' || !d.result) return null
        // viem returns an object for named outputs
        const r = d.result
        const stockToken = r.stockToken ?? r[0]
        const priceFeed  = r.priceFeed  ?? r[1]
        const symbol     = r.symbol     ?? r[2]
        const openTime   = r.openTime   ?? r[4]
        const closeTime  = r.closeTime  ?? r[5]
        const openPrice  = r.openPrice  ?? r[6]
        const closePrice = r.closePrice ?? r[7]
        const bullPool   = r.bullPool   ?? r[8]
        const bearPool   = r.bearPool   ?? r[9]
        const state      = Number(r.state ?? r[10] ?? 0)
        return { id: i, stockToken, priceFeed, symbol, openTime, closeTime,
                 openPrice, closePrice, bullPool, bearPool, state }
      })
      .filter(Boolean)
  }, [marketsRaw])

  // default tab selection to the first OPEN market on initial load; leave
  // manual tab clicks alone afterward and fall back to TSLA if none are open
  useEffect(() => {
    if (hasAutoSelected.current || markets.length === 0) return
    hasAutoSelected.current = true
    const openMarket = markets.find(m => m.state === STATE.OPEN)
    if (!openMarket) return
    const idx = STOCKS.findIndex(s => s.token.toLowerCase() === openMarket.stockToken.toLowerCase())
    if (idx !== -1) setSelectedIdx(idx)
  }, [markets])

  const stockMarkets = markets.filter(
    m => m.stockToken.toLowerCase() === selectedStock.token.toLowerCase()
  )
  const activeMarket =
    stockMarkets.filter(m => m.state === STATE.OPEN)
                .sort((a, b) => Number(b.closeTime - a.closeTime))[0]
    ?? stockMarkets.at(-1)

  const isExpired = activeMarket != null
    && activeMarket.state === STATE.OPEN
    && Number(activeMarket.closeTime) <= nowSec

  // ── prices ───────────────────────────────────────────────────────────────

  const prices = useMemo(() => {
    if (!pricesRaw) return STOCKS.map(() => null)
    return pricesRaw.map(d => {
      if (d.status !== 'success' || !d.result) return null
      // viem: named outputs → object; fallback to index
      return d.result.answer ?? d.result[1] ?? null
    })
  }, [pricesRaw])

  const currentPrice = prices[selectedIdx]

  // ── terminal logs (BetPlaced events) ─────────────────────────────────────

  useEffect(() => {
    if (!publicClient) return
    publicClient.getLogs({
      address: MARKET_ADDRESS,
      abi:     MARKET_ABI,
      eventName: 'BetPlaced',
      fromBlock: 0n,
      toBlock:   'latest',
    }).then(raw => {
      setLogs([...raw].filter(l => l.args != null).reverse().slice(0, 50))
    }).catch(() => {})
  }, [publicClient, activeMarket?.id])

  // ── write contract (place bet) ────────────────────────────────────────────

  const { writeContract, data: txHash, isPending, reset, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess: confirmed, error: receiptError } = useWaitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000,
    pollingInterval: 2_000,
    query: { enabled: !!txHash },
  })
  const txError = writeError || receiptError

  useEffect(() => {
    if (confirmed) {
      refetchMarkets()
      setBetAmount('')
      reset()
    }
  }, [confirmed])

  const handleBet = () => {
    if (!activeMarket || !betAmount || Number(betAmount) <= 0) return
    writeContract({
      address:      MARKET_ADDRESS,
      abi:          MARKET_ABI,
      functionName: 'placeBet',
      args:         [BigInt(activeMarket.id), betSide === 'BULL' ? 0 : 1],
      value:        parseEther(betAmount),
    })
  }

  // ── computed payout preview ───────────────────────────────────────────────

  const betWei        = betAmount && Number(betAmount) > 0 ? parseEther(betAmount) : 0n
  const chosenPool    = betSide === 'BULL' ? activeMarket?.bullPool ?? 0n : activeMarket?.bearPool ?? 0n
  const totalPool     = (activeMarket?.bullPool ?? 0n) + (activeMarket?.bearPool ?? 0n)
  const estPayout     = estimatedPayout(betWei, chosenPool, totalPool)

  // ── pool display ─────────────────────────────────────────────────────────

  const bullPool   = activeMarket?.bullPool ?? 0n
  const bearPool   = activeMarket?.bearPool ?? 0n
  const poolTotal  = bullPool + bearPool
  const bullPct    = poolTotal > 0n ? Number((bullPool * 100n) / poolTotal) : 50
  const bearPct    = 100 - bullPct
  const bullRatio  = payoutRatio(bullPool, poolTotal)
  const bearRatio  = payoutRatio(bearPool, poolTotal)

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Ticker bar */}
      <section className="border-b border-outline-variant bg-surface-container-lowest overflow-x-auto no-scrollbar">
        <div className="max-w-container-max mx-auto flex items-center">
          <div className="flex border-r border-outline-variant px-4 py-3 bg-surface-container-low shrink-0 items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>trending_up</span>
            <span className="font-label-caps text-on-surface-variant">LIVE TICKER</span>
          </div>
          <div className="flex divide-x divide-outline-variant">
            {STOCKS.map((s, i) => {
              const price = prices[i]
              const isActive = i === selectedIdx
              return (
                <button
                  key={s.symbol}
                  onClick={() => { setSelectedIdx(i); setBetAmount('') }}
                  className={`flex items-center gap-3 px-6 py-3 transition-colors ${
                    isActive
                      ? 'bg-surface-container-highest border-b-2 border-primary'
                      : 'hover:bg-surface-variant/20'
                  }`}
                >
                  <span className={`font-data-md ${isActive ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                    {s.symbol}
                  </span>
                  <span className="font-data-sm text-primary">
                    {price != null ? fmtPrice(price) : '…'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <main className="max-w-container-max mx-auto px-gutter py-8 space-y-8">

        {/* ── Selected Stock Hero Panel (Ticker Frame) ── */}
        <div className="relative overflow-hidden bg-surface-container rounded-lg border border-outline-variant p-6 lg:p-10">
          <div className="h-0.5 w-16 bg-signal mb-4" />
          <div className="flex items-center gap-2">
            <h1 className="font-headline-lg text-headline-lg">{selectedStock.name}</h1>
            <span className="px-2 py-0.5 bg-surface-container-highest border border-outline-variant font-data-sm rounded text-on-surface-variant">
              {selectedStock.symbol}
            </span>
          </div>
          <div className="mt-2">
            <span className="font-display-num text-display-num text-on-surface">
              {currentPrice != null ? fmtPrice(currentPrice) : '—'}
            </span>
          </div>

          {/* divided meta ledger row — no nested card, just border-t/border-r dividers */}
          <div className="mt-6 pt-4 border-t border-outline-variant flex flex-col sm:flex-row gap-4 sm:gap-0">
            <div className="sm:pr-6 sm:border-r border-outline-variant space-y-1">
              <span className="font-label-caps text-on-surface-variant">OPEN PRICE</span>
              <p className="font-data-md text-on-surface">
                {activeMarket?.openPrice ? fmtPrice(activeMarket.openPrice) : '—'}
              </p>
            </div>
            <div className="sm:px-6 sm:border-r border-outline-variant space-y-1">
              <span className="font-label-caps text-on-surface-variant">SETTLEMENT</span>
              {activeMarket
                ? activeMarket.state === STATE.OPEN
                  ? <Countdown closeTime={activeMarket.closeTime} />
                  : <span className="font-data-md text-on-surface-variant">
                      {new Date(Number(activeMarket.closeTime) * 1000).toLocaleString('en-US', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                : <span className="font-data-md text-on-surface-variant">—</span>}
            </div>
            <div className="sm:pl-6 space-y-1">
              <span className="font-label-caps text-on-surface-variant">STATUS</span>
              {activeMarket != null
                ? <StatusBadge state={activeMarket.state} />
                : <span className="font-data-sm text-on-surface-variant">No market</span>}
            </div>
          </div>
        </div>

        {/* ── Main Trading Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">

          {/* Left col: BULL/BEAR cards + terminal logs */}
          <div className="lg:col-span-6 space-y-6">

            {/* BULL / BEAR cards */}
            <div className="bg-surface-container rounded-lg border border-outline-variant p-6">
              <h2 className="font-headline-md text-headline-md mb-6">
                Will {selectedStock.symbol} close above the open price?
                {activeMarket?.openPrice ? ` (${fmtPrice(activeMarket.openPrice)})` : ''}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* BULL */}
                <button
                  onClick={() => setBetSide('BULL')}
                  className={`group relative flex flex-col items-center justify-center p-8 border-2 rounded-lg transition-all duration-300 ${
                    betSide === 'BULL'
                      ? 'border-primary bg-primary/10'
                      : 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                  }`}
                >
                  <span className="material-symbols-outlined text-primary mb-4 group-hover:scale-110 transition-transform"
                        style={{ fontSize: 48 }}>trending_up</span>
                  <span className="font-headline-md text-primary mb-2">BULLISH</span>
                  <div className="flex flex-col items-center">
                    <span className="font-data-lg text-on-surface">
                      {bullRatio != null ? `${bullRatio.toFixed(2)}x` : 'No bets yet'}
                    </span>
                    <span className="font-label-caps text-on-surface-variant">PAYOUT RATIO</span>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="material-symbols-outlined text-primary opacity-50 group-hover:opacity-100 transition-opacity">
                      add_circle
                    </span>
                  </div>
                </button>

                {/* BEAR */}
                <button
                  onClick={() => setBetSide('BEAR')}
                  className={`group relative flex flex-col items-center justify-center p-8 border-2 rounded-lg transition-all duration-300 ${
                    betSide === 'BEAR'
                      ? 'border-secondary bg-secondary/10'
                      : 'border-secondary/40 bg-secondary/5 hover:bg-secondary/10'
                  }`}
                >
                  <span className="material-symbols-outlined text-secondary mb-4 group-hover:scale-110 transition-transform"
                        style={{ fontSize: 48 }}>trending_down</span>
                  <span className="font-headline-md text-secondary mb-2">BEARISH</span>
                  <div className="flex flex-col items-center">
                    <span className="font-data-lg text-on-surface">
                      {bearRatio != null ? `${bearRatio.toFixed(2)}x` : 'No bets yet'}
                    </span>
                    <span className="font-label-caps text-on-surface-variant">PAYOUT RATIO</span>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="material-symbols-outlined text-secondary opacity-50 group-hover:opacity-100 transition-opacity">
                      remove_circle
                    </span>
                  </div>
                </button>
              </div>

              {/* Pool stats */}
              <div className="mt-8 pt-8 border-t border-outline-variant flex flex-col md:flex-row justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="space-y-1">
                    <span className="font-label-caps text-on-surface-variant">TOTAL POOL</span>
                    <div className="font-data-lg text-on-surface">{fmtEth(poolTotal)}</div>
                  </div>
                  <div className="h-10 w-px bg-outline-variant" />
                  <div className="space-y-1">
                    <span className="font-label-caps text-on-surface-variant">MARKET ID</span>
                    <div className="font-data-lg text-on-surface">
                      #{activeMarket?.id ?? '—'}
                    </div>
                  </div>
                </div>
                <div className="flex-1 max-w-xs space-y-2">
                  <div className="flex justify-between font-label-caps text-[10px]">
                    <span className="text-primary">BULL ({bullPct}%)</span>
                    <span className="text-secondary">BEAR ({bearPct}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden flex">
                    <div className="h-full bg-primary transition-all" style={{ width: `${bullPct}%` }} />
                    <div className="h-full bg-secondary transition-all" style={{ width: `${bearPct}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Terminal logs */}
            <div className="bg-surface-container-low rounded-lg border border-outline-variant overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant flex justify-between items-center">
                <span className="font-label-caps text-on-surface">TERMINAL LOGS</span>
                <span className="font-data-sm text-on-surface-variant">LAST 50 TRADES</span>
              </div>
              <div className="divide-y divide-outline-variant/50 max-h-64 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="px-6 py-8 text-center font-data-sm text-on-surface-variant">
                    No trades recorded yet.
                  </div>
                ) : logs.map((log, i) => {
                  const isBull = log.args?.direction === 0
                  // V2's BetPlaced event names this arg "bettor" (was "user" on the deprecated contract)
                  const user   = log.args?.bettor ?? log.args?.user ?? ''
                  return (
                    <div key={i} className="px-6 py-3 flex justify-between items-center hover:bg-surface-variant/10">
                      <div className="flex items-center gap-4">
                        <span className="font-data-sm text-on-surface-variant">
                          #{String(log.args?.marketId ?? '?')}
                        </span>
                        <span className="font-data-sm text-on-surface">
                          {user ? `${user.slice(0, 6)}…${user.slice(-4)}` : '?'}
                        </span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className={`font-data-sm font-bold ${isBull ? 'text-primary' : 'text-secondary'}`}>
                          {isBull ? 'BULL' : 'BEAR'}
                        </span>
                        <span className="font-data-sm text-on-surface">
                          {fmtEth(log.args?.amount)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right col: bet form */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-surface-container rounded-lg border border-outline-variant flex flex-col sticky top-24">
              <div className="p-6 border-b border-outline-variant">
                <h3 className="font-headline-md text-headline-md">Place Your Bet</h3>
              </div>
              <div className="p-6 space-y-6">
                {/* BULL/BEAR toggle */}
                <div className="flex p-1 bg-surface-container-low border border-outline-variant rounded-lg">
                  {['BULL', 'BEAR'].map(side => (
                    <button
                      key={side}
                      onClick={() => setBetSide(side)}
                      className={`flex-1 py-2 font-label-caps rounded transition-all ${
                        betSide === side
                          ? side === 'BULL'
                            ? 'bg-primary text-on-primary-container shadow-sm'
                            : 'bg-secondary text-on-secondary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {side}
                    </button>
                  ))}
                </div>

                {/* Amount input */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <label className="font-label-caps text-on-surface-variant">AMOUNT</label>
                    <span className="font-data-sm text-on-surface-variant">
                      Balance: {balance ? Number(balance.formatted).toFixed(4) : '—'} ETH
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      placeholder="0.001"
                      value={betAmount}
                      onChange={e => setBetAmount(e.target.value)}
                      className="w-full bg-transparent border border-outline-variant focus:border-primary focus:ring-0 rounded p-4 font-data-lg text-on-surface transition-colors outline-none"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                      <button
                        onClick={() => balance && setBetAmount(balance.formatted)}
                        className="font-label-caps text-tertiary-fixed-dim hover:text-primary transition-colors text-[10px]"
                      >
                        MAX
                      </button>
                      <span className="font-data-md text-on-surface-variant border-l border-outline-variant pl-3">ETH</span>
                    </div>
                  </div>
                </div>

                {/* Payout preview */}
                <div className="space-y-3 p-4 bg-surface-container-low border border-outline-variant rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-label-caps text-on-surface-variant">POTENTIAL PAYOUT</span>
                    <span className="font-data-md text-primary">
                      {betWei > 0n ? fmtEth(estPayout) : '+0.0000 ETH'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-label-caps text-on-surface-variant">PLATFORM FEE</span>
                    <span className="font-data-md text-on-surface">2%</span>
                  </div>
                  <div className="pt-2 border-t border-outline-variant flex justify-between">
                    <span className="font-label-caps text-on-surface">ESTIMATED TOTAL</span>
                    <span className="font-data-md text-tertiary-fixed-dim">
                      {betWei > 0n ? fmtEth(estPayout) : '0.0000 ETH'}
                    </span>
                  </div>
                </div>

                {/* Submit */}
                {!isConnected ? (
                  <p className="text-center font-body-sm text-on-surface-variant py-2">
                    Connect wallet to place a bet.
                  </p>
                ) : !activeMarket || activeMarket.state !== STATE.OPEN ? (
                  <p className="text-center font-body-sm text-secondary py-2">
                    No open market for {selectedStock.symbol}.
                  </p>
                ) : isExpired ? (
                  <p className="text-center font-body-sm text-secondary py-2">
                    Betting closed — awaiting settlement.
                  </p>
                ) : confirmed ? (
                  <div className="w-full py-4 bg-surface-container-high text-primary font-headline-md rounded-lg text-center flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined">check_circle</span>
                    Bet Confirmed!
                  </div>
                ) : txError ? (
                  <div className="space-y-2">
                    <div className="w-full py-3 bg-error-container text-on-error-container font-label-caps rounded-lg text-center text-sm px-4">
                      {txError.shortMessage ?? txError.message ?? 'Transaction failed'}
                    </div>
                    <button
                      onClick={reset}
                      className="w-full py-3 border border-outline-variant text-on-surface-variant font-label-caps rounded-lg hover:bg-surface-variant/20 transition-all"
                    >
                      Reset &amp; Try Again
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleBet}
                    disabled={isPending || isConfirming || isExpired || !betAmount || Number(betAmount) < 0.001}
                    className="w-full py-4 bg-primary text-on-primary-container font-headline-md rounded-lg hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPending || isConfirming ? (
                      <>
                        <span className="material-symbols-outlined animate-spin">progress_activity</span>
                        {isPending ? 'Confirm in wallet…' : 'Confirming…'}
                      </>
                    ) : (
                      <>
                        SUBMIT {betSide} BET
                        <span className="material-symbols-outlined">rocket_launch</span>
                      </>
                    )}
                  </button>
                )}

                <p className="text-center font-body-sm text-on-surface-variant">
                  Predicting {selectedStock.symbol} {betSide === 'BULL' ? '>' : '<'} open price by close.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
