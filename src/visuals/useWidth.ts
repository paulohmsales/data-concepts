import { useEffect, useRef, useState } from 'react'

/** Width of a container element, kept up to date (for responsive SVG visuals). */
export function useWidth<T extends HTMLElement = HTMLDivElement>(initial = 640) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}
