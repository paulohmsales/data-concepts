import { useId, type ReactNode } from 'react'
import styles from './Controls.module.css'

/** Seed input plus a "new luck" button (D10: same seed, same simulation). */
export function SeedControl({ seed, onChange }: { seed: number; onChange: (s: number) => void }) {
  return (
    <div className={styles.seed}>
      <label>
        Seed{' '}
        <input type="number" value={seed} onChange={(e) => onChange(Math.trunc(Number(e.target.value)) || 0)} />
      </label>
      <button type="button" onClick={() => onChange(Math.floor(Math.random() * 1_000_000))}>
        New luck
      </button>
    </div>
  )
}

/** A small segmented control for picking one of a few options. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (v: T) => void
  hint?: ReactNode
}) {
  const name = useId()
  return (
    <fieldset className={styles.choice}>
      <legend>{label}</legend>
      <div className={styles.options}>
        {options.map((o) => (
          <label key={o.value} className={o.value === value ? styles.selected : undefined}>
            <input type="radio" name={name} checked={o.value === value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
      {hint && <small className={styles.hint}>{hint}</small>}
    </fieldset>
  )
}

export function Toggle({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.reset} onClick={onClick}>
      Reset
    </button>
  )
}
