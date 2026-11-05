/** A small ring that fills with progress (0–1); a check when complete. */
export default function ProgressDot({ value, size = 14, title }: { value: number; size?: number; title?: string }) {
  const r = size / 2 - 1.5
  const c = 2 * Math.PI * r
  const done = value >= 1
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title ?? `${Math.round(value * 100)}% done`} style={{ flex: '0 0 auto' }}>
      <title>{title ?? `${Math.round(value * 100)}% done`}</title>
      <circle cx={size / 2} cy={size / 2} r={r} fill={done ? 'var(--good)' : 'none'} stroke={done ? 'var(--good)' : 'var(--border-strong)'} strokeWidth={1.5} />
      {!done && value > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2.5}
          strokeDasharray={`${c * value} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      {done && (
        <path d={`M${size * 0.3} ${size * 0.52} L${size * 0.45} ${size * 0.67} L${size * 0.72} ${size * 0.36}`} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
      )}
    </svg>
  )
}
