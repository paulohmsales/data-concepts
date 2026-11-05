import { scaleLinear } from 'd3'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { mulberry32 } from '../../core/random.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

const SAMPLE = [12, 15, 18, 21, 22, 25, 27, 31, 36, 44, 58, 95] // one skewed sample (e.g. order values)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Draw a resample with replacement, ball by ball; each resample’s mean drops into a histogram. */
export default function ResampleAnim() {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [rng] = useState(() => mulberry32(3))
  const [picks, setPicks] = useState<number[]>([])
  const [means, setMeans] = useState<number[]>([])
  const [auto, setAuto] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const step = useCallback(
    () =>
      setPicks((p) => {
        if (p.length === SAMPLE.length) {
          setMeans((m) => [...m, mean(p.map((i) => SAMPLE[i]))])
          return []
        }
        return [...p, Math.floor(rng() * SAMPLE.length)]
      }),
    [rng],
  )
  const fast = means.length >= 3

  useEffect(() => {
    if (!auto) return
    timer.current = window.setInterval(step, fast ? 25 : 160)
    return () => window.clearInterval(timer.current)
  }, [auto, fast, step])

  const count = picks.reduce((c, i) => ((c[i] = (c[i] ?? 0) + 1), c), {} as Record<number, number>)
  const ballR = Math.min(16, (width - 40) / SAMPLE.length / 2.4)
  const bx = (i: number) => 24 + i * ((width - 48) / (SAMPLE.length - 1))
  const x = scaleLinear().domain([15, 60]).range([24, width - 24]).clamp(true)
  const bins = new Map<number, number>()
  means.forEach((m) => {
    const b = Math.round(m / 2) * 2
    bins.set(b, (bins.get(b) ?? 0) + 1)
  })
  const maxBin = Math.max(1, ...bins.values())
  const histH = 120
  const sd = means.length > 2 ? Math.sqrt(means.reduce((a, m) => a + (m - mean(means)) ** 2, 0) / (means.length - 1)) : NaN

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <button type="button" onClick={step} disabled={auto}>
          Draw one ball
        </button>
        <button type="button" onClick={() => setAuto((a) => !a)}>
          {auto ? '❚❚ Pause' : '▶ Keep resampling'}
        </button>
        <button
          type="button"
          onClick={() => {
            setPicks([])
            setMeans([])
          }}
        >
          Reset
        </button>
      </div>
      <div className={s.readout}>
        <span>
          Original sample mean <b>{mean(SAMPLE).toFixed(1)}</b>
        </span>
        <span>
          Resamples <b>{means.length}</b>
        </span>
        <span>
          Bootstrap SE <b>{Number.isFinite(sd) ? sd.toFixed(1) : '–'}</b> (formula s/√n ≈ 6.7)
        </span>
      </div>
      <svg width={width} height={ballR * 6 + histH + 60} role="img" aria-label="Bootstrap resampling animation">
        <text x={8} y={14} fontSize={11} fill={t.inkSecondary}>
          the one sample you have: each ball can be picked again (with replacement)
        </text>
        {SAMPLE.map((v, i) => (
          <g key={i}>
            <circle cx={bx(i)} cy={ballR + 26} r={ballR} fill={count[i] ? t.series1 : t.surface} stroke={t.series1} strokeWidth={1.5} />
            <text x={bx(i)} y={ballR + 30} textAnchor="middle" fontSize={10} fill={count[i] ? '#fff' : t.ink}>
              {v}
            </text>
            {count[i] > 1 && (
              <text x={bx(i)} y={ballR * 2 + 40} textAnchor="middle" fontSize={11} fontWeight={700} fill={t.series2}>
                ×{count[i]}
              </text>
            )}
          </g>
        ))}
        <text x={8} y={ballR * 2 + 58} fontSize={11} fill={t.inkSecondary}>
          picked {picks.length} of {SAMPLE.length}
          {picks.length === SAMPLE.length ? ` → resample mean ${mean(picks.map((i) => SAMPLE[i])).toFixed(1)}` : ''}
        </text>
        <g transform={`translate(0, ${ballR * 2 + 70})`}>
          {[...bins.entries()].map(([b, c]) => (
            <rect key={b} x={x(b - 1) + 1} width={Math.max(1, x(b + 1) - x(b - 1) - 2)} y={histH - (c / maxBin) * histH} height={(c / maxBin) * histH} fill={t.series1} rx={2} />
          ))}
          <line x1={x(mean(SAMPLE))} x2={x(mean(SAMPLE))} y1={0} y2={histH} stroke={t.series2} strokeWidth={2} />
          <line x1={24} x2={width - 24} y1={histH} y2={histH} stroke={t.axis} />
          {[20, 30, 40, 50, 60].map((v) => (
            <text key={v} x={x(v)} y={histH + 14} textAnchor="middle" fontSize={10} fill={t.inkSecondary}>
              {v}
            </text>
          ))}
          <text x={width - 24} y={histH + 28} textAnchor="end" fontSize={11} fill={t.inkSecondary}>
            mean of each resample →
          </text>
        </g>
      </svg>
    </div>
  )
}
