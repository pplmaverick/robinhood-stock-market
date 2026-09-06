import { useEffect, useState, useCallback, useRef } from 'react'
import { formatEther } from 'viem'

const API_URL = '/api/agent-status'
const SCAN_MS = 2200  // node border-current duration (spec: 2000-2500ms -- confirmed 1400ms was genuinely deployed and measured on production via DOM timing, still felt too fast/abrupt, especially for NO_TRADE's single-node run)
const CONN_MS = 250   // connector light-up duration (spec: 150-250ms) -- plain dim/lit, no motion

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

// Node tone: which semantic color a settled node's indicator/header resolves to.
// 'neutral'/'warn' never carry a directional (BULL/BEAR) claim -- see DESIGN.md §1.1.
function toneFromDecision(decision) {
  if (!decision) return 'neutral'
  if (decision.status === 'query_failed') return 'warn'
  if (decision.status === 'no_data') return 'neutral'
  const d = decision.betDecision?.decision
  if (d === 'BULL') return 'bull'
  if (d === 'BEAR') return 'bear'
  return 'neutral' // NO_TRADE
}

function toneFromAgentBook(status) {
  if (status === 'backed') return 'bull'
  if (status === 'unbacked') return 'signal'
  return 'warn' // unknown
}

// Measures a node box's rendered pixel size so the border-trace SVG can draw its rect at the
// box's exact dimensions -- keeps the traced rectangle undistorted and the light moving at a
// constant visual speed around the perimeter, regardless of the box's actual aspect ratio.
function useElementSize() {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size]
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = e => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

export default function AgentDecisionPanel() {
  const [data, setData] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cycle, setCycle] = useState(0) // bumped on every successful fetch, drives a full replay

  // node/connector animation state -- purely presentational sequencing, layered on top of
  // `data`; never used to derive or branch on the actual decision.
  const [nodes, setNodes] = useState({ n1: 'idle', n2: 'idle', n3: 'idle' })
  const [conns, setConns] = useState({ c1: 'dim', c2: 'dim' })

  const reducedMotion = useReducedMotion()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(API_URL)
      if (!res.ok) throw new Error(`agent-status API returned HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setCycle(c => c + 1)
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

  // Drives the node-by-node border-current -> settle -> connector-lit -> next-node sequence.
  // Keyed on `cycle` (not data content) so Refresh always replays the full sequence even if the
  // API returns an identical decision. Data fetching itself lives entirely in `load()` above,
  // untouched. The connector is a plain dim/lit flash (no motion) -- the "current" treatment is
  // reserved for each node's own border, so node and connector don't compete visually.
  useEffect(() => {
    setNodes({ n1: 'idle', n2: 'idle', n3: 'idle' })
    setConns({ c1: 'dim', c2: 'dim' })
    if (!data) return undefined

    let cancelled = false
    let timeoutId = null
    const sleep = ms => new Promise(resolve => { timeoutId = setTimeout(resolve, ms) })

    async function run() {
      if (reducedMotion) {
        setNodes({
          n1: 'settled',
          n2: isActionable ? 'settled' : 'idle',
          n3: isActionable ? 'settled' : 'idle',
        })
        return
      }

      setNodes(prev => ({ ...prev, n1: 'scanning' }))
      await sleep(SCAN_MS)
      if (cancelled) return
      setNodes(prev => ({ ...prev, n1: 'settled' }))
      if (!isActionable) return // pipeline ends here -- node 2/3 stay idle, connectors stay dim

      setConns(prev => ({ ...prev, c1: 'lit' }))
      await sleep(CONN_MS)
      if (cancelled) return
      setConns(prev => ({ ...prev, c1: 'dim' }))
      setNodes(prev => ({ ...prev, n2: 'scanning' }))
      await sleep(SCAN_MS)
      if (cancelled) return
      setNodes(prev => ({ ...prev, n2: 'settled' }))

      setConns(prev => ({ ...prev, c2: 'lit' }))
      await sleep(CONN_MS)
      if (cancelled) return
      setConns(prev => ({ ...prev, c2: 'dim' }))
      setNodes(prev => ({ ...prev, n3: 'scanning' }))
      await sleep(SCAN_MS)
      if (cancelled) return
      setNodes(prev => ({ ...prev, n3: 'settled' }))
    }
    run()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [cycle, reducedMotion])

  const node1Tone = data ? toneFromDecision(data.decision) : 'neutral'
  const node2Tone = betDecision?.decision === 'BEAR' ? 'bear' : 'bull'
  const node3Tone = data?.agentBook ? toneFromAgentBook(data.agentBook.status) : 'neutral'

  return (
    <PanelShell onRefresh={load} refreshing={loading}>
      {fetchError && <ErrorNote message={fetchError} />}
      {!fetchError && !data && <LoadingNote />}
      {!fetchError && data && (
        <div>
          <Node index={1} title="decision_snapshot" state={nodes.n1} tone={node1Tone}>
            <Step1Content decision={data.decision} marketId={data.marketId} />
          </Node>
          <Connector state={conns.c1} />
          <Node index={2} title="bet_sizing" state={nodes.n2} tone={node2Tone}>
            {betDecision && <Step2Content betDecision={betDecision} />}
          </Node>
          <Connector state={conns.c2} />
          <Node index={3} title="agentbook_verification" state={nodes.n3} tone={node3Tone}>
            {data.agentBook && (
              <Step3Content
                agentBook={data.agentBook}
                agentAddress={data.agentAddress}
                betDecision={betDecision}
                marketId={data.marketId}
              />
            )}
          </Node>
        </div>
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
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse motion-reduce:animate-none" />
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

// ── node/connector pipeline chrome ──────────────────────────────────────────

const TONE = {
  bull:    { text: 'text-bull',              dot: 'bg-bull',              box: 'border-bull/40 bg-bull/[0.06]',
             glow: 'shadow-[0_0_22px_-4px_rgba(52,211,153,0.55)]',  dotGlow: 'shadow-[0_0_8px_1px_rgba(52,211,153,0.85)]' },
  bear:    { text: 'text-bear',              dot: 'bg-bear',              box: 'border-bear/40 bg-bear/[0.06]',
             glow: 'shadow-[0_0_22px_-4px_rgba(251,113,133,0.55)]', dotGlow: 'shadow-[0_0_8px_1px_rgba(251,113,133,0.85)]' },
  signal:  { text: 'text-signal-dim',        dot: 'bg-signal',            box: 'border-signal/40 bg-signal/[0.06]',
             glow: 'shadow-[0_0_22px_-4px_rgba(56,189,248,0.55)]',  dotGlow: 'shadow-[0_0_8px_1px_rgba(56,189,248,0.85)]' },
  warn:    { text: 'text-locked',            dot: 'bg-locked',            box: 'border-locked/40 bg-locked/[0.06]',
             glow: 'shadow-[0_0_22px_-4px_rgba(251,191,36,0.55)]',  dotGlow: 'shadow-[0_0_8px_1px_rgba(251,191,36,0.85)]' },
  neutral: { text: 'text-on-surface-variant', dot: 'bg-on-surface-variant', box: 'border-outline-variant bg-surface-variant/10',
             glow: '', dotGlow: '' },
}

function Node({ index, title, state, tone, children }) {
  const [boxRef, size] = useElementSize()
  const t = TONE[tone] ?? TONE.neutral
  // idle and scanning share the same dim base look -- only the traced border overlay signals
  // "processing"; the box itself only flips to its lit appearance once settled.
  const dotCls =
    state === 'settled' ? `${t.dot} ${t.dotGlow}` :
    state === 'scanning' ? 'bg-signal animate-pulse motion-reduce:animate-none' :
    'bg-on-surface-faint'
  const titleCls =
    state === 'settled' ? t.text :
    state === 'scanning' ? 'text-signal' :
    'text-on-surface-faint'
  // idle boxes carry an "unlit trace" navy-blue tint (matches the circuit-board reference) rather
  // than plain neutral gray, so the whole rail reads as one dark-PCB surface before anything fires.
  const boxCls = state === 'settled' ? `${t.box} ${t.glow}` : 'border-signal-deep/50 bg-signal-deep/10'
  const canTraceBorder = state === 'scanning' && size.width > 4 && size.height > 4

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-4 w-2.5 shrink-0">
        <span className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${dotCls}`} />
      </div>
      <div ref={boxRef} className={`relative flex-1 min-w-0 rounded-lg border transition-all duration-300 ${boxCls}`}>
        {canTraceBorder && (
          <svg
            className="absolute -inset-px overflow-visible pointer-events-none"
            width={size.width + 2}
            height={size.height + 2}
            viewBox={`0 0 ${size.width + 2} ${size.height + 2}`}
            aria-hidden="true"
          >
            <defs>
              {/* Mild fractal-noise displacement so the traced segment reads as a jittery,
                  irregular "current" rather than a clean geometric line -- applied only to the
                  sharp strokes below, not the blurred ambient glow (blur already handles softness
                  there, and stacking both would just muddy the shape). */}
              <filter id={`current-jitter-${index}`} x="-30%" y="-30%" width="160%" height="160%">
                <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed={index} result="n" />
                <feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G" />
              </filter>
            </defs>
            {/* pathLength=100 normalizes the rect's perimeter to 100 units regardless of its actual
                aspect ratio, so "dasharray 8 92" is always an 8%-of-perimeter segment and dashoffset
                0 -> -100 always completes exactly one full lap, corners included. This is the node's
                own one-shot "current" ceremony -- a dedicated cyan-teal (#22d3d9 family), never the
                Signal-blue used for generic interactive chrome elsewhere on this page. */}
            <rect
              x="1" y="1" width={size.width} height={size.height} rx="4" ry="4"
              fill="none" stroke="#22d3d9" strokeWidth="7" strokeLinecap="round"
              pathLength="100" strokeDasharray="8 92" opacity="0.28"
              className="blur-[4px] animate-[borderTrace_2200ms_linear]"
            />
            <rect
              x="1" y="1" width={size.width} height={size.height} rx="4" ry="4"
              fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round"
              pathLength="100" strokeDasharray="8 92" opacity="0.30"
              filter={`url(#current-jitter-${index})`}
              className="animate-[borderTrace_2200ms_linear_160ms]"
            />
            <rect
              x="1" y="1" width={size.width} height={size.height} rx="4" ry="4"
              fill="none" stroke="#22d3d9" strokeWidth="2.5" strokeLinecap="round"
              pathLength="100" strokeDasharray="8 92" opacity="0.55"
              filter={`url(#current-jitter-${index})`}
              className="animate-[borderTrace_2200ms_linear_80ms]"
            />
            <rect
              x="1" y="1" width={size.width} height={size.height} rx="4" ry="4"
              fill="none" stroke="#d4fffb" strokeWidth="2.5" strokeLinecap="round"
              pathLength="100" strokeDasharray="8 92"
              filter={`url(#current-jitter-${index})`}
              className="animate-[borderTrace_2200ms_linear]"
            />
          </svg>
        )}
        <div className="relative px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`font-data-sm transition-colors duration-300 ${titleCls}`}>{`[0${index}]`}</span>
            <h4 className={`font-data-sm uppercase tracking-widest transition-colors duration-300 ${titleCls}`}>{title}</h4>
          </div>
          {state === 'settled' && (
            <div className="mt-3 animate-[fadeInSettle_350ms_ease-out] motion-reduce:animate-none">{children}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Plain dim/lit trace -- deliberately no motion, no gradient, no glow-dot. The "current" texture
// is reserved for each node's own border so the node reads as the event and the connector reads
// as a guide between events, not a second thing competing for attention.
function Connector({ state }) {
  const lit = state === 'lit'
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center w-2.5 h-7 shrink-0">
        <span
          className={`w-0.5 h-full rounded-full transition-colors duration-200 ${
            lit ? 'bg-signal' : 'bg-signal-deep/60'
          }`}
        />
      </div>
      <div className="flex-1" />
    </div>
  )
}

function LoadingNote() {
  return (
    <div className="flex items-center gap-3 py-6">
      <div className="w-2 h-2 rounded-full bg-signal animate-pulse motion-reduce:animate-none" />
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

// ── step content (node bodies -- Node itself renders the [0n] header) ───────

function Step1Content({ decision, marketId }) {
  return (
    <>
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
    </>
  )
}

function Step2Content({ betDecision }) {
  const dirGlyph = betDecision.decision === 'BULL' ? '▲ ' : betDecision.decision === 'BEAR' ? '▼ ' : ''
  const dirColor = betDecision.decision === 'BULL' ? 'text-bull' : betDecision.decision === 'BEAR' ? 'text-bear' : 'text-on-surface'
  return (
    <div>
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

function Step3Content({ agentBook, agentAddress, betDecision, marketId }) {
  return (
    <>
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
    </>
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
