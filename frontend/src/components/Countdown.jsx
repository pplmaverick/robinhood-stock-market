import { useState, useEffect } from 'react'

export default function Countdown({ closeTime }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    const tick = () => {
      const diff = Number(closeTime) - Math.floor(Date.now() / 1000)
      setRemaining(Math.max(0, diff))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [closeTime])

  if (!closeTime) return <span className="font-data-md text-on-surface-variant">—</span>

  const d = Math.floor(remaining / 86400)
  const h = Math.floor((remaining % 86400) / 3600)
  const m = Math.floor((remaining % 3600) / 60)
  const s = remaining % 60
  const fmt = (n) => String(n).padStart(2, '0')

  if (remaining === 0) {
    return <span className="font-data-md text-secondary">CLOSED</span>
  }

  return (
    <span className="font-data-md text-signal-dim tabular-nums">
      {d > 0 && `${d}d `}{fmt(h)}:{fmt(m)}:{fmt(s)}
    </span>
  )
}
