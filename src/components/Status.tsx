import styles from '../modules/common.module.css'

/** Status is never color alone: icon + label + color (dataviz status palette). */
export default function Status({ level, children }: { level: 'good' | 'warn' | 'bad'; children: React.ReactNode }) {
  const icon = level === 'good' ? '✓' : level === 'warn' ? '!' : '✗'
  return (
    <span className={styles[level]}>
      {icon} {children}
    </span>
  )
}
