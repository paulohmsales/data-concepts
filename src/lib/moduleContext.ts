import { createContext, useContext } from 'react'
import type { ModuleContent } from './content.ts'

export const ModuleContext = createContext<ModuleContent | null>(null)

/** The current module's content (inside a ModulePage). */
export function useModule(): ModuleContent {
  const m = useContext(ModuleContext)
  if (!m) throw new Error('useModule outside a module page')
  return m
}
