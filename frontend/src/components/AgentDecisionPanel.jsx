import { useEffect, useState, useCallback } from 'react'
import { formatEther } from 'viem'

const API_URL = '/api/agent-status'
const STEP_DELAY_MS = 900

function fmtEth(weiStr) {
  if (weiStr == null) return '—'
  return `${Number(formatEther(BigInt(weiStr))).toFixed(4)} ETH`
}

// Human-readable version of the exact same logic bet-decision.js's makeBetDecision() uses to
// fall through to NO_TRADE (level/trend consistency gate) -- this file never re-derives the
// decision itself, only explains one that the API already computed.
function describeNoTradeReason(inputB) {
  if (!inputB) return 'No signal data available.'
  const { level, trend } = inputB
  if (trend === 'UNKNOWN') {
    return 'No prior snapshot for this symbol yet (trend = UNKNOWN) -- nothing to compare against.'
  }
  if (trend === 'FLAT') {
    return 'trend = FLAT -- no price movement since the last observation, no clear direction.'
  }
  if (level === 'NEUTRAL') {
    return 'percentileRank is in the mid-range (level = NEUTRAL) -- not extreme enough to act on.'
  }
  return `level (${level}) and trend (${trend}) disagree -- contradictory signal, defaulting to no action.`
}

export default function AgentDecisionPanel() {
  const [data, setData] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(API_URL)
      if (!res.ok) throw new Error(`agent-status API returned HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setFetchError(null)
    } catch (e) {
      setFetchError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const betDecision = data?.decision?.status === 'ok' ? data.decision.betDecision : null
  const isActionable = !!betDecision && betDecision.decision !== 'NO_TRADE'

  useEffect(() => {
    setRevealed(1)
    if (!isActionable) return
    const t1 = setTimeout(() => setRevealed(2), STEP_DELAY_MS)
    const t2 = setTimeout(() => setRevealed(3), STEP_DELAY_MS * 2)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [data?.timestamp, isActionable])

  return (
    <PanelShell onRefresh={load} refreshing={loading}>
      {fetchError && <ErrorNote message={fetchError} />}
      {!fetchError && !data && <LoadingNote />}
      {!fetchError && data && (
        <>
          <StepBlock visible>
            <Step1 decision={data.decision} marketId={data.marketId} />
          </StepBlock>

          {isActionable && (
            <StepBlock visible={revealed >= 2}>
              <Step2 betDecision={betDecision} />
            </StepBlock>
          )}

          {isActionable && revealed >= 2 && (
            <StepBlock visible={revealed >= 3}>
              <Step3
                agentBook={data.agentBook}
                agentAddress={data.agentAddress}
                betDecision={betDecision}
                marketId={data.marketId}
              />
            </StepBlock>
          )}
        </>
      )}
    </PanelShell>
  )
}

function PanelShell({ children, onRefresh, refreshing }) {
  return (
    <div className="bg-surface-container rounded-lg border border-outline-variant p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-data-md text-headline-md text-on-surface">agent://decision-transparency</h3>
        <div className="flex items-center gap-3">
          <span className="font-data-sm text-on-surface-variant uppercase tracking-widest text-xs inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
            live · TSLA
            <span className="inline-block w-2 h-3.5 bg-signal-bright ml-0.5 animate-blink motion-reduce:animate-none" />
          </span>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="font-data-sm text-xs uppercase tracking-widest px-3 py-1 rounded border border-outline-variant text-on-surface-variant hover:text-signal hover:border-signal transition-colors disabled:opacity-50"
          >
            {refreshing ? 'refreshing…' : 'refresh'}
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

function StepBlock({ visible, children }) {
  return (
    <div
      className={`transition-all duration-500 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 h-0 overflow-hidden pointer-events-none'
      }`}
    >
      {children}
    </div>
  )
}

function LoadingNote() {
  return (
    <div className="flex items-center gap-3 py-6">
      <div className="w-2 h-2 rounded-full bg-signal animate-pulse" />
      <span className="font-body-sm text-on-surface-variant">Querying live decision-engine state…</span>
    </div>
  )
}

function ErrorNote({ message }) {
  return (
    <div className="bg-error-container/20 border border-error/30 rounded-lg p-4">
      <p className="font-body-sm text-error">Failed to load agent status: {message}</p>
    </div>
  )
}

function Step1({ decision, marketId }) {
  return (
    <div>
      <StepHeader n={1} title="decision_snapshot" />
      {decision.status === 'query_failed' && (
        <Note tone="warn">
          Live subgraph query failed ({decision.reason}): {decision.error}
        </Note>
      )}
      {decision.status === 'no_data' && (
        <Note tone="neutral">No PriceRangeIndex data available for TSLA yet.</Note>
      )}
      {decision.status === 'ok' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="current_price" value={`$${decision.current.currentPrice.toFixed(2)}`} />
            <Metric label="moving_avg" value={`$${decision.current.movingAverage.toFixed(2)}`} />
            <Metric label="percentile_rank" value={`${decision.current.percentileRank.toFixed(1)}%`} />
            <Metric label="trend" value={decision.betDecision.inputB.trend} />
          </div>
          <DecisionBadge decision={decision.betDecision.decision} />
          {decision.betDecision.decision === 'NO_TRADE' && (
            <Note tone="neutral">{describeNoTradeReason(decision.betDecision.inputB)}</Note>
          )}
          {marketId != null && (
            <p className="font-data-sm text-on-surface-variant">Target market: TSLA #{marketId} (OPEN)</p>
          )}
        </div>
      )}
    </div>
  )
}

function Step2({ betDecision }) {
  const dirGlyph = betDecision.decision === 'BULL' ? '▲ ' : betDecision.decision === 'BEAR' ? '▼ ' : ''
  const dirColor = betDecision.decision === 'BULL' ? 'text-bull' : betDecision.decision === 'BEAR' ? 'text-bear' : 'text-on-surface'
  return (
    <div className="pt-4 border-t border-outline-variant">
      <StepHeader n={2} title="bet_sizing" />
      <div className="flex items-center gap-6">
        <div>
          <div className="font-label-caps text-on-surface-variant uppercase tracking-widest text-xs">direction</div>
          <div className={`font-data-md ${dirColor}`}>{dirGlyph}{betDecision.decision}</div>
        </div>
        <Metric label="confidence" value={`${(betDecision.confidence * 100).toFixed(0)}%`} />
        <Metric label="amount" value={fmtEth(betDecision.betAmountWei)} />
      </div>
      <p className="font-body-sm text-on-surface-variant mt-2">
        Linearly scaled between 0.001–0.005 ETH by confidence, per ADR-11.
      </p>
    </div>
  )
}

function Step3({ agentBook, agentAddress, betDecision, marketId }) {
  return (
    <div className="pt-4 border-t border-outline-variant">
      <StepHeader n={3} title="agentbook_verification" />
      {agentBook.status === 'backed' && (
        <Note tone="success">
          AgentBook confirms this agent (humanId {agentBook.humanId}) is human-backed. Signing
          the attestation and broadcasting placeAgentBet() for a {betDecision.decision} bet of{' '}
          {fmtEth(betDecision.betAmountWei)} on market #{marketId} is decision-engine's next step
          -- that autonomous execution runs server-side (see decision-engine/scripts/run-demo.mjs),
          not from this dashboard.
        </Note>
      )}
      {agentBook.status === 'unbacked' && (
        <Note tone="info">
          Blocked by AgentBook verification -- no bet was placed. AgentBook found no registered
          humanId for {agentAddress}. This is the safety gate working as designed (see ADR-08),
          not a system failure.
        </Note>
      )}
      {agentBook.status === 'unknown' && (
        <Note tone="warn">
          AgentBook query failed -- identity status could not be confirmed, so no bet was placed.
          This is different from "unbacked": the check itself couldn't run, not that verification
          was denied.
        </Note>
      )}
    </div>
  )
}

function StepHeader({ n, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="font-data-sm text-signal">{`[0${n}]`}</span>
      <h4 className="font-data-sm uppercase tracking-widest text-on-surface-variant">{title}</h4>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="font-label-caps text-on-surface-variant uppercase tracking-widest text-xs">{label}</div>
      <div className="font-data-md text-on-surface">{value}</div>
    </div>
  )
}

function DecisionBadge({ decision }) {
  const cls =
    decision === 'BULL'
      ? 'bg-bull-tint text-bull border-bull-deep'
      : decision === 'BEAR'
        ? 'bg-bear-tint text-bear border-bear-deep'
        : 'bg-surface-variant text-on-surface-variant border-outline-variant'
  const glyph = decision === 'BULL' ? '▲' : decision === 'BEAR' ? '▼' : null
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded font-label-caps border ${cls}`}>
      {glyph && <span aria-hidden="true">{glyph}</span>}
      {decision}
    </span>
  )
}

function Note({ tone, children }) {
  const cls =
    {
      success: 'bg-bull/10 border-bull/30 text-bull',
      info: 'bg-signal/10 border-signal/30 text-signal-dim',
      warn: 'bg-locked/10 border-locked/30 text-locked',
      neutral: 'bg-surface-variant/40 border-outline-variant text-on-surface-variant',
    }[tone] ?? 'bg-surface-variant/40 border-outline-variant text-on-surface-variant'
  return (
    <div className={`rounded-lg border p-4 font-data-sm ${cls}`}>
      <span className="text-signal mr-2" aria-hidden="true">&gt;</span>
      {children}
    </div>
  )
}
