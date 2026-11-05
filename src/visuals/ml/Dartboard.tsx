import { useMemo } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { mulberry32, normal } from '../../core/random.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const CASES = [
  { title: 'Low bias, low variance', sub: 'the goal', bias: [0, 0], sd: 0.12 },
  { title: 'Low bias, high variance', sub: 'overfit: right on average, scattered', bias: [0, 0], sd: 0.42 },
  { title: 'High bias, low variance', sub: 'underfit: consistently wrong', bias: [0.5, -0.35], sd: 0.12 },
  { title: 'High bias, high variance', sub: 'the worst of both', bias: [0.5, -0.35], sd: 0.42 },
]

/** Each dart is a model trained on a different sample; the bullseye is the truth. */
export default function Dartboard() {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const darts = useMemo(() => {
    const rng = mulberry32(12)
    return CASES.map((c) => Array.from({ length: 14 }, () => [c.bias[0] + c.sd * normal(rng), c.bias[1] + c.sd * normal(rng)]))
  }, [])
  const cols = width > 640 ? 4 : 2
  const size = Math.min(170, (width - 20 * cols) / cols)
  const r = size / 2 - 6

  return (
    <div ref={ref} className={s.wrap} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
      {CASES.map((c, i) => (
        <div key={c.title} style={{ textAlign: 'center' }}>
          <svg width={size} height={size} role="img" aria-label={c.title}>
            {[1, 0.66, 0.33].map((f, k) => (
              <circle key={f} cx={size / 2} cy={size / 2} r={r * f} fill={k % 2 ? t.surface : t.grid} stroke={t.axis} />
            ))}
            <circle cx={size / 2} cy={size / 2} r={4} fill={t.ink} />
            {darts[i].map(([dx, dy], k) => (
              <circle key={k} cx={size / 2 + dx * r} cy={size / 2 + dy * r} r={3.5} fill={t.series2} stroke={t.surface} />
            ))}
          </svg>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
          <div style={{ fontSize: 12, color: t.inkSecondary }}>{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
