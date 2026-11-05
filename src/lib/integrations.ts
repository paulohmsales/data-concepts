import { useEffect, useState } from 'react'
import { integrationStatus } from './api.ts'
import type { IntegrationKey, IntegrationStatus } from './content.ts'

export const bytes = (b: number) =>
  b < 1e6 ? `${(b / 1e3).toFixed(0)} KB` : b < 1e9 ? `${(b / 1e6).toFixed(1)} MB` : `${(b / 1e9).toFixed(2)} GB`

/** Live provider status (never cached), with a refresh for after each run. */
export function useStatus() {
  const [status, setStatus] = useState<Record<IntegrationKey, IntegrationStatus> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = () => integrationStatus().then(setStatus, (e: Error) => setError(e.message))
  useEffect(() => {
    integrationStatus().then(setStatus, (e: Error) => setError(e.message))
  }, [])
  return { status, error, refresh }
}
