import { useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { normalCdf } from '../../core/abtest.ts'
import { mulberry32, normal } from '../../core/random.ts'
import type { VisualProps } from '../index.ts'
import s from '../visuals.module.css'

const METRICS = ['signups', 'revenue', 'orders', 'retention D7', 'retention D30', 'sessions', 'time on site', 'pages/visit', 'add-to-cart', 'checkout', 'refunds', 'support tickets', 'NPS', 'mobile conv.', 'desktop conv.', 'new users', 'returning users', 'US', 'EU', 'LATAM']

/** 20 metrics of an experiment with no effect; rerun it and see which ones “win” this time. */
export default function MetricLottery({ props }: VisualProps) {
  const t = useVizTheme()
  const [rng] = useState(() => mulberry32(Number(props.seed ?? 4)))
  const draw = () => METRICS.map(() => 2 * (1 - normalCdf(Math.abs(normal(rng)))))
  const [ps, setPs] = useState<number[]>(draw)
  const [runs, setRuns] = useState({ n: 1, any: 0 })
  const [bonf, setBonf] = useState(false)
  const cut = bonf ? 0.05 / METRICS.length : 0.05
  const wins = ps.filter((p) => p < cut).length

  const rerun = () => {
    const next = draw()
    setPs(next)
    setRuns((r) => ({ n: r.n + 1, any: r.any + (next.some((p) => p < cut) ? 1 : 0) }))
  }

  return (
    <div className={s.wrap}>
      <div className={s.controls}>
        <button type="button" onClick={rerun}>
          ↻ Rerun the experiment
        </button>
        <label>
          <input
            type="checkbox"
            checked={bonf}
            onChange={(e) => {
              setBonf(e.target.checked)
              setRuns({ n: 0, any: 0 })
            }}
          />{' '}
          Bonferroni (each at 0.05 / 20 = 0.0025)
        </label>
      </div>
      <div className={s.readout}>
        <span>
          “Significant” metrics this run: <b style={{ color: wins ? '#d03b3b' : undefined }}>{wins}</b>
        </span>
        <span>
          Runs with at least one false win: <b>{runs.n ? `${runs.any} of ${runs.n}` : '–'}</b> (expect {bonf ? '≈ 5%' : '≈ 64%'})
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
        {METRICS.map((m, i) => {
          const win = ps[i] < cut
          return (
            <div
              key={m}
              style={{
                border: `1px solid ${win ? '#d03b3b' : t.grid}`,
                background: win ? 'color-mix(in srgb, #d03b3b 14%, transparent)' : 'transparent',
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: 12,
                transition: 'background 0.3s',
              }}
            >
              <div style={{ fontWeight: 600 }}>{m}</div>
              <div style={{ color: t.inkSecondary }}>
                p = {ps[i].toFixed(3)} {win ? '✗ “win”' : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
