import { useMemo } from 'react'
import {
  useReadContract, useReadContracts, useWriteContract,
  useWaitForTransactionReceipt, useAccount, useChainId,
} from 'wagmi'
import { formatEther, formatUnits } from 'viem'
import { MARKET_ADDRESS, MARKET_ABI, STOCKS, STATE, FEE_BPS } from '../constants'
import StatusBadge from '../components/StatusBadge'

function fmtEth(wei) {
  if (!wei) return '0.0000'
  return Number(formatEther(wei)).toFixed(4)
}

function stockByToken(token) {
  return STOCKS.find(s => s.token.toLowerCase() === token?.toLowerCase()) ?? null
}

function calcPayout(bet, market) {
  const winPool   = market.state === STATE.SETTLED
    ? (bet.direction === 0 ? market.bullPool : market.bearPool)
    : (bet.direction === 0 ? market.bullPool : market.bearPool)
  const total = market.bullPool + market.bearPool
  if (winPool === 0n || total === 0n) return 0n
  const fee = (total * FEE_BPS) / 10000n
  return (total - fee) * bet.amount / winPool
}

function isWinner(bet, market) {
  if (market.state !== STATE.SETTLED) return null
  const bullWon = market.closePrice >= market.openPrice
  return (bet.direction === 0) === bullWon
}

// ── ClaimButton: isolated so it can track its own tx ─────────────────────────

function ClaimButton({ marketId, onSuccess }) {
  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess }     = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })
  const chainId = useChainId()

  if (isSuccess) {
    return (
      <span className="inline-flex items-center gap-1 font-label-caps text-primary">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
        Claimed
      </span>
    )
  }
  if (isPending || isConfirming) {
    return (
      <span className="inline-flex items-center gap-1 font-label-caps text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>progress_activity</span>
        {isPending ? 'Signing…' : 'Confirming…'}
      </span>
    )
  }
  return (
    <button
      onClick={() => {
        // 確保在正確鏈上才能 claim
        if (chainId !== 4663) {
          alert('Please switch to Robinhood Chain (Chain ID 4663) before claiming.')
          return
        }
        writeContract({
          address: MARKET_ADDRESS,
          abi:     MARKET_ABI,
          functionName: 'claimWinnings',
          args:    [BigInt(marketId)],
        })
      }}
      className="bg-tertiary-container text-on-tertiary-container font-label-caps px-4 py-1.5 hover:bg-tertiary-fixed transition-colors active:scale-95 rounded"
    >
      Claim
    </button>
  )
}

// ── main ─────────────────────────────────────────────────────────────────────

export default function MyBets() {
  const { address, isConnected } = useAccount()

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

  const { data: betsRaw, refetch } = useReadContracts({
    contracts: marketIds.map(id => ({
      address: MARKET_ADDRESS, abi: MARKET_ABI,
      functionName: 'bets', args: [id, address],
    })),
    query: { enabled: !!address && marketIds.length > 0, refetchInterval: 15000 },
  })

  // ── process ──────────────────────────────────────────────────────────────

  const rows = useMemo(() => {
    if (!marketsRaw || !betsRaw) return []
    return marketIds
      .map((id, i) => {
        const md = marketsRaw[i]
        const bd = betsRaw[i]
        if (md?.status !== 'success' || bd?.status !== 'success') return null
        if (!md.result || !bd.result) return null
        const mr = md.result
        const br = bd.result
        const stockToken = mr.stockToken ?? mr[0]
        const symbol     = mr.symbol     ?? mr[2]
        const openTime   = mr.openTime   ?? mr[4]
        const closeTime  = mr.closeTime  ?? mr[5]
        const openPrice  = mr.openPrice  ?? mr[6]
        const closePrice = mr.closePrice ?? mr[7]
        const bullPool   = mr.bullPool   ?? mr[8]
        const bearPool   = mr.bearPool   ?? mr[9]
        const state      = Number(mr.state ?? mr[10] ?? 0)
        // viem's decodeFunctionResult() does NOT attach named properties for a function with
        // multiple plain return values (only single-tuple/struct returns get that) -- confirmed
        // directly: br.amount/br.direction/br.claimed are always undefined here, so the `??`
        // "named" branch below is dead code and the index is what actually resolves every time.
        // V2's bets() outputs are (amount, direction, claimed) -- br[0]/br[1]/br[2] respectively,
        // the OPPOSITE order from the deprecated contract. Getting this index wrong silently
        // swaps amount and direction instead of erroring.
        const direction  = Number(br.direction ?? br[1] ?? 0)
        const amount     = br.amount  ?? br[0]
        const claimed    = br.claimed ?? br[2]
        if (!amount || amount === 0n) return null
        return {
          id: Number(id),
          stockToken, symbol, openPrice, closePrice, bullPool, bearPool,
          state, openTime, closeTime,
          bet: { direction, amount, claimed },
        }
      })
      .filter(Boolean)
  }, [marketsRaw, betsRaw, marketIds])

  // ── stats ─────────────────────────────────────────────────────────────────

  const totalStake   = rows.reduce((acc, r) => acc + r.bet.amount, 0n)
  const unclaimedAmt = rows
    .filter(r => r.state === STATE.SETTLED && !r.bet.claimed && isWinner(r.bet, r))
    .reduce((acc, r) => acc + calcPayout(r.bet, r), 0n)

  // ── render ────────────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <main className="max-w-container-max mx-auto px-gutter py-20 text-center">
        <span className="material-symbols-outlined text-outline-variant" style={{ fontSize: 48 }}>
          account_balance_wallet
        </span>
        <p className="font-headline-md text-on-surface-variant mt-4">Connect your wallet to view bets.</p>
      </main>
    )
  }

  return (
    <main className="max-w-container-max mx-auto px-gutter py-8 min-h-[calc(100vh-128px)]">

      {/* Title & stats */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface mb-1">My Active Bets</h1>
          <p className="text-on-surface-variant font-body-sm">
            Manage your open positions and claim settled payouts.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="bg-surface-container border border-outline-variant p-3 min-w-[120px]">
            <div className="font-label-caps text-on-surface-variant mb-1">Total Stake</div>
            <div className="font-data-lg text-primary">{fmtEth(totalStake)} ETH</div>
          </div>
          <div className="bg-surface-container border border-outline-variant p-3 min-w-[120px]">
            <div className="font-label-caps text-on-surface-variant mb-1">Unclaimed</div>
            <div className="font-data-lg text-tertiary">{fmtEth(unclaimedAmt)} ETH</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-low border border-outline-variant overflow-hidden">
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container">
                {['Stock', 'Position', 'Amount', 'Exp. Payout', 'Status', 'Action'].map(h => (
                  <th key={h} className="px-4 py-3 font-label-caps text-on-surface-variant uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-on-surface-variant font-body-sm">
                    No bets found for this wallet.
                  </td>
                </tr>
              ) : rows.map(r => {
                const s      = stockByToken(r.stockToken)
                const isBull = r.bet.direction === 0
                const winner = isWinner(r.bet, r)
                const payout = calcPayout(r.bet, r)
                const canClaim = r.state === STATE.SETTLED && !r.bet.claimed && winner === true

                return (
                  <tr key={r.id} className="hover:bg-surface-variant/20 transition-colors">
                    {/* Stock */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-surface-container-high rounded flex items-center justify-center border border-outline-variant">
                          <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>
                            {s?.icon ?? 'show_chart'}
                          </span>
                        </div>
                        <div>
                          <div className="font-body-md font-bold text-on-surface">
                            {s?.symbol ?? r.symbol}
                          </div>
                          <div className="text-[10px] text-on-surface-variant font-label-caps">
                            #{r.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Position */}
                    <td className="px-4 py-4 whitespace-nowrap text-center">
                      <span className={`font-data-md font-bold ${isBull ? 'text-primary' : 'text-secondary'}`}>
                        {isBull ? 'BULL' : 'BEAR'}
                      </span>
                    </td>
                    {/* Amount */}
                    <td className="px-4 py-4 whitespace-nowrap font-data-md text-on-surface">
                      {fmtEth(r.bet.amount)} ETH
                    </td>
                    {/* Exp Payout */}
                    <td className="px-4 py-4 whitespace-nowrap font-data-md text-tertiary">
                      {fmtEth(payout)} ETH
                    </td>
                    {/* Status */}
                    <td className="px-4 py-4 whitespace-nowrap">
                      <StatusBadge state={r.state} />
                      {r.state === STATE.SETTLED && winner === false && (
                        <span className="ml-2 text-[10px] text-secondary font-label-caps">LOST</span>
                      )}
                    </td>
                    {/* Action */}
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      {r.bet.claimed ? (
                        <span className="font-label-caps text-on-surface-variant opacity-50">Claimed</span>
                      ) : canClaim ? (
                        <ClaimButton marketId={r.id} onSuccess={refetch} />
                      ) : (
                        <button disabled
                          className="bg-surface-variant text-on-surface-variant font-label-caps px-4 py-1.5 opacity-40 cursor-not-allowed rounded">
                          Claim
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Empty state */}
        {rows.length === 0 && (
          <div className="hidden flex-col items-center justify-center py-20">
            <span className="material-symbols-outlined text-outline-variant" style={{ fontSize: 48 }}>
              account_balance_wallet
            </span>
            <p className="text-on-surface-variant font-headline-md mt-4">No active bets found</p>
          </div>
        )}
      </div>
    </main>
  )
}
