import { useTheme } from '../lib/theme.ts'

/**
 * Chart colors (dataviz reference palette). Plot writes colors into SVG attributes, where CSS
 * var() is unreliable, so we pass concrete hex and swap the whole set on color-scheme change.
 */
export interface VizTheme {
  surface: string
  ink: string
  inkSecondary: string
  muted: string
  grid: string
  axis: string
  series1: string // blue
  series2: string // orange
  series3: string // aqua
  neutral: string // de-emphasised marks
}

const LIGHT: VizTheme = {
  surface: '#ffffff',
  ink: '#0b0b0b',
  inkSecondary: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  series1: '#2a78d6',
  series2: '#eb6834',
  series3: '#1baf7a',
  neutral: '#c3c2b7',
}

const DARK: VizTheme = {
  surface: '#181817',
  ink: '#f0efec',
  inkSecondary: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  axis: '#383835',
  series1: '#3987e5',
  series2: '#d95926',
  series3: '#199e70',
  neutral: '#52514e',
}

export function useVizTheme(): VizTheme {
  return useTheme() === 'dark' ? DARK : LIGHT
}
