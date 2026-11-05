import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const EVENT = 'themechange'

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  localStorage.setItem('theme', t)
  window.dispatchEvent(new Event(EVENT))
}

/** The active theme; follows the toggle, and the OS while the user hasn't chosen. */
export function useTheme(): Theme {
  const [theme, set] = useState<Theme>(currentTheme)
  useEffect(() => {
    const onChange = () => set(currentTheme())
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onMedia = (e: MediaQueryListEvent) => {
      if (localStorage.getItem('theme')) return
      document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'
      onChange()
    }
    window.addEventListener(EVENT, onChange)
    media.addEventListener('change', onMedia)
    return () => {
      window.removeEventListener(EVENT, onChange)
      media.removeEventListener('change', onMedia)
    }
  }, [])
  return theme
}
