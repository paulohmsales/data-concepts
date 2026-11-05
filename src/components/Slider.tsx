import { useId } from 'react'
import styles from './Slider.module.css'

interface Props {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  format: (v: number) => string
  /** Log scale: the thumb moves in ratios, not steps (good for sample sizes). */
  log?: boolean
  hint?: string
}

const STEPS = 1000

export default function Slider({ label, value, onChange, min, max, step, format, log, hint }: Props) {
  const id = useId()
  const toPos = (v: number) =>
    log ? (Math.log(v / min) / Math.log(max / min)) * STEPS : v
  const fromPos = (pos: number) => {
    if (!log) return pos
    const raw = min * Math.pow(max / min, pos / STEPS)
    // round to 2 significant figures so n reads as 12,000 rather than 12,137
    const mag = Math.pow(10, Math.floor(Math.log10(raw)) - 1)
    return Math.max(min, Math.min(max, Math.round(raw / mag) * mag))
  }

  return (
    <div className={styles.slider}>
      <label htmlFor={id} className={styles.row}>
        <span>{label}</span>
        <output className={styles.value}>{format(value)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={log ? 0 : min}
        max={log ? STEPS : max}
        step={log ? 1 : step}
        value={toPos(value)}
        onChange={(e) => onChange(fromPos(Number(e.target.value)))}
      />
      {hint && <small className={styles.hint}>{hint}</small>}
    </div>
  )
}
