import { scaleLinear } from 'd3'
import { useEffect, useRef, useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { meanInterval } from '../../core/ci.ts'
import { mulberry32, normal } from '../../core/random.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

interface Iv {
  lo: number
  hi: number
  center: number
  covers: boolean
}

const TRUTH = 50
const SD = 10
const ROWS = 40

/** Intervals arrive one study at a time; the counter shows coverage converging to the promise. */
export default function CiDance({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [level, setLevel] = useState(Number(props.level ?? 0.95))
  const [n, setN] = useState(Number(props.n ?? 10))
  const [ivs, setIvs] = useState<Iv[]>([])
  const [total, setTotal] = useState({ runs: 0, hits: 0 })
  const [playing, setPlaying] = useState(false)
  const [rng] = useState(() => mulberry32(11))
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      const sample = Array.from({ length: n }, () => TRUTH + SD * normal(rng))
      const iv = meanInterval(sample, level, 't', TRUTH)
      setIvs((xs) => [iv, ...xs].slice(0, ROWS))
      setTotal((x) => ({ runs: x.runs + 1, hits: x.hits + (iv.covers ? 1 : 0) }))
    }, 120)
    return () => window.clearInterval(timer.current)
  }, [playing, n, level, rng])

  const reset = () => {
    setIvs([])
    setTotal({ runs: 0, hits: 0 })
  }
  const rowH = 7
  const h = ROWS * rowH + 40
  const x = scaleLinear().domain([TRUTH - 20, TRUTH + 20]).range([16, width - 16]).clamp(true)

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? '❚❚ Pause' : '▶ Run studies'}
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
        <label>
          Level{' '}
          <input
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={level}
            onChange={(e) => {
              setLevel(Number(e.target.value))
              reset()
            }}
          />{' '}
          <b>{Math.round(level * 100)}%</b>
        </label>
        <label>
          n{' '}
          <input
            type="range"
            min={3}
            max={100}
            value={n}
            onChange={(e) => {
              setN(Number(e.target.value))
              reset()
            }}
          />{' '}
          <b>{n}</b>
        </label>
      </div>
      <div className={s.readout}>
        <span>
          Studies <b>{total.runs}</b>
        </span>
        <span>
          Caught the true mean <b>{total.runs ? ((100 * total.hits) / total.runs).toFixed(1) : '–'}%</b> (promised {Math.round(level * 100)}%)
        </span>
      </div>
      <svg width={width} height={h} role="img" aria-label="Stream of confidence intervals">
        <line x1={x(TRUTH)} x2={x(TRUTH)} y1={0} y2={h - 24} stroke={t.ink} strokeDasharray="4 3" />
        {ivs.map((iv, i) => (
          <g key={total.runs - i} style={{ opacity: 1 - i / (ROWS * 1.4) }}>
            <line x1={x(iv.lo)} x2={x(iv.hi)} y1={8 + i * rowH} y2={8 + i * rowH} stroke={iv.covers ? t.series1 : '#d03b3b'} strokeWidth={i === 0 ? 3.5 : 2.5} strokeLinecap="round" />
            <circle cx={x(iv.center)} cy={8 + i * rowH} r={1.8} fill={t.ink} />
          </g>
        ))}
        <text x={x(TRUTH)} y={h - 8} textAnchor="middle" fontSize={11} fill={t.inkSecondary}>
          true mean (unknown to every study)
        </text>
      </svg>
    </div>
  )
}
