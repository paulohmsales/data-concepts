import { useState } from 'react'
import { useVizTheme } from '../../components/vizTheme.ts'
import { normalCdf } from '../../core/abtest.ts'
import type { VisualProps } from '../index.ts'
import { useWidth } from '../useWidth.ts'
import s from '../visuals.module.css'

/**
 * 1,000 people as squares. Positives at the given prevalence; a classifier with sensitivity and
 * false-positive rate from two normal score distributions (separation d) and a threshold.
 * Shows how precision depends on prevalence even when the model is unchanged.
 */
export default function IconArray({ props }: VisualProps) {
  const t = useVizTheme()
  const { ref, width } = useWidth()
  const [prev, setPrev] = useState(Number(props.prevalence ?? 0.1))
  const [thr, setThr] = useState(Number(props.threshold ?? 1))
  const d = Number(props.separation ?? 2)
  const N = 1000
  const tpr = 1 - normalCdf(thr - d)
  const fpr = 1 - normalCdf(thr)
  const pos = Math.round(N * prev)
  const tp = Math.round(pos * tpr)
  const fn = pos - tp
  const fp = Math.round((N - pos) * fpr)
  const tn = N - pos - fp
  const kinds = [...Array(tp).fill('tp'), ...Array(fn).fill('fn'), ...Array(fp).fill('fp'), ...Array(tn).fill('tn')]
  const color: Record<string, string> = { tp: t.series1, fn: '#d03b3b', fp: t.series2, tn: t.grid }
  const cols = 50
  const cell = Math.min(12, (width - 10) / cols)

  return (
    <div ref={ref} className={s.wrap}>
      <div className={s.controls}>
        <label>
          Share of positives <input type="range" min={0.005} max={0.5} step={0.005} value={prev} onChange={(e) => setPrev(Number(e.target.value))} /> <b>{(prev * 100).toFixed(1)}%</b>
        </label>
        <label>
          Threshold <input type="range" min={-1} max={4} step={0.05} value={thr} onChange={(e) => setThr(Number(e.target.value))} /> <b>{thr.toFixed(2)}</b>
        </label>
      </div>
      <div className={s.readout}>
        <span style={{ color: t.series1 }}>■ caught {tp}</span>
        <span style={{ color: '#d03b3b' }}>■ missed {fn}</span>
        <span style={{ color: t.series2 }}>■ false alarms {fp}</span>
        <span>
          recall <b>{pos ? Math.round((100 * tp) / pos) : 0}%</b> · precision <b>{tp + fp ? Math.round((100 * tp) / (tp + fp)) : 0}%</b> · accuracy <b>{(((tp + tn) / N) * 100).toFixed(1)}%</b>
        </span>
      </div>
      <svg width={width} height={Math.ceil(N / cols) * cell + 4} role="img" aria-label="1,000 people coloured by classification outcome">
        {kinds.map((k, i) => (
          <rect key={i} x={(i % cols) * cell} y={Math.floor(i / cols) * cell} width={cell - 1.5} height={cell - 1.5} rx={1.5} fill={color[k]} />
        ))}
      </svg>
    </div>
  )
}
