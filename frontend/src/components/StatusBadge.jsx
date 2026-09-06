import { STATE } from '../constants'

const BADGES = {
  [STATE.OPEN]: {
    label: 'OPEN',
    cls: 'bg-bull/15 text-bull border border-bull/30',
    dot: true,
  },
  [STATE.LOCKED]: {
    label: 'LOCKED',
    cls: 'bg-locked/15 text-locked border border-locked/30',
    dot: false,
  },
  [STATE.SETTLED]: {
    label: 'SETTLED',
    cls: 'bg-surface-variant text-on-surface-variant border border-outline-variant',
    dot: false,
  },
}

export default function StatusBadge({ state }) {
  const b = BADGES[state] ?? BADGES[STATE.SETTLED]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold ${b.cls}`}>
      {b.dot && <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />}
      {b.label}
    </span>
  )
}
