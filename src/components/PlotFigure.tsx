import * as Plot from '@observablehq/plot'
import { useEffect, useRef, useState } from 'react'
import { useVizTheme, type VizTheme } from './vizTheme.ts'
import styles from './PlotFigure.module.css'

interface Props {
  /** Build Plot options for the container's current width and color theme. */
  build: (width: number, theme: VizTheme) => Plot.PlotOptions
  /** Accessible description of what the chart shows. */
  label: string
}

/** Renders an Observable Plot chart, responsive to width and light/dark mode. */
export default function PlotFigure({ build, label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const theme = useVizTheme()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = ref.current
    // too narrow to draw (e.g. mid-resize): margins alone would exceed it
    if (!el || width < 160) return
    const opts = build(width, theme)
    const chart = Plot.plot({
      style: { background: 'transparent', color: theme.inkSecondary, fontSize: '12px' },
      marginBottom: 44,
      ...opts,
      // x label centred under the axis, so it never collides with the last tick
      x: { labelAnchor: 'center', labelOffset: 38, ...opts.x },
      width,
    })
    chart.setAttribute('aria-label', label)
    el.replaceChildren(chart)
    return () => chart.remove()
  }, [build, theme, width, label])

  return <div ref={ref} className={styles.figure} role="figure" aria-label={label} />
}

