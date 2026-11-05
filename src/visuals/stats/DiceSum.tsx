import { scaleLinear } from 'd3'
import { useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { normalPdf } from '../../core/stats.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const DIES: Record<string, { label: string; p: number[] }> = {
  fair: { label: 'fair die', p: [1, 1, 1, 1, 1, 1].map((x) => x / 6) },
  loaded: { label: 'lopsided die (70% of the time a 1)', p: [0.7, 0.06, 0.06, 0.06, 0.06, 0.06] },
}

/** Exact distribution of the sum of k dice: convolve the face probabilities k times. */
function sumDist(p: number[], k: number): number[] {
  let d = [1]
  for (let i = 0; i < k; i++) {
    const next = new Array<number>(d.length + p.length - 1).fill(0)
    d.forEach((a, x) => p.forEach((b, y) => (next[x + y] += a * b)))
    d = next
  }
  return d // index i = sum of (k + i)
}

export default function DiceSum({ props, state }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [kLocal, setK] = useState(Number(props.k ?? 1))
  const [dieLocal, setDie] = useState(String(props.die ?? 'fair'))
  const k = state?.k !== undefined ? Number(state.k) : kLocal
  const die = state?.die !== undefined ? String(state.die) : dieLocal
  const p = DIES[die].p
  const dist = sumDist(p, k)
  const mu = p.reduce((a, b, i) => a + b * (i + 1), 0)
  const v = p.reduce((a, b, i) => a + b * (i + 1 - mu) ** 2, 0)
  const m3 = p.reduce((a, b, i) => a + b * (i + 1 - mu) ** 3, 0)
  const skew = m3 / v ** 1.5 / Math.sqrt(k)
  const h = 240
  const mg = { l: 16, r: 16, t: 10, b: 30 }
  const x = scaleLinear().domain([k - 0.5, 6 * k + 0.5]).range([mg.l, width - mg.r])
  const maxP = Math.max(...dist, normalPdf(0, 0, Math.sqrt(k * v)))
  const y = scaleLinear().domain([0, maxP * 1.1]).range([h - mg.b, mg.t])
  const bw = Math.max(1, x(k + 1) - x(k) - (k < 10 ? 3 : 1))
  const curve = Array.from({ length: 200 }, (_, i) => {
    const sx = k - 0.5 + ((5 * k + 1) * i) / 199
    return `${i ? 'L' : 'M'}${x(sx)},${y(normalPdf(sx, k * mu, Math.sqrt(k * v)))}`
  }).join('')
  const ticks = k <= 3 ? Array.from({ length: 5 * k + 1 }, (_, i) => k + i) : [k, Math.round(k * 2), Math.round(k * 3.5), Math.round(k * 5), 6 * k]

  return (
    <div ref={ref} className={s.wrap}>
      {!state && (
        <div className={s.controls}>
          <label>
            Dice <input type="range" min={1} max={40} value={k} onChange={(e) => setK(Number(e.target.value))} /> <b>{k}</b>
          </label>
          <label>
            <select value={die} onChange={(e) => setDie(e.target.value)}>
              {Object.entries(DIES).map(([key, d]) => (
                <option key={key} value={key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className={s.readout}>
        <span>
          Sum of <b>{k}</b> {DIES[die].label}
          {k === 1 ? '' : 's'}
        </span>
        <span>
          mean <b>{(k * mu).toFixed(1)}</b>, SD <b>{Math.sqrt(k * v).toFixed(2)}</b>
        </span>
        <span>
          skewness <b>{skew.toFixed(2)}</b>
        </span>
      </div>
      <svg width={width} height={h} role="img" aria-label={`Distribution of the sum of ${k} dice with the normal approximation`}>
        {dist.map((pr, i) => (
          <rect key={i} x={x(k + i) - bw / 2} width={bw} y={y(pr)} height={y(0) - y(pr)} fill={t.series1} rx={k < 10 ? 2 : 0} />
        ))}
        {k > 1 && <path d={curve} fill="none" stroke={t.series2} strokeWidth={2.5} />}
        <line x1={mg.l} x2={width - mg.r} y1={y(0)} y2={y(0)} stroke={t.axis} />
        {ticks.map((v2) => (
          <text key={v2} x={x(v2)} y={h - 10} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
            {v2}
          </text>
        ))}
      </svg>
    </div>
  )
}
