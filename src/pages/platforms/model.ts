import type { Platforms, PricePoint, Service } from '../../lib/content.ts'

export const price = (p: Platforms, provider: string, item: string): PricePoint => {
  const found = p.prices.find((x) => x.provider === provider && x.item === item)
  if (!found) throw new Error(`price missing: ${provider} / ${item}`)
  return found
}

export const serviceFor = (p: Platforms, provider: string, category: string): Service | undefined =>
  p.services.find((s) => s.provider === provider && s.category === category)

export interface Workload {
  /** TB scanned by queries per month. */
  scannedTb: number
  /** Hours per month a warehouse/compute cluster is actually running. */
  computeHours: number
  /** Data stored, TB. */
  storageTb: number
  /** Size multiplier for credit/DBU/RPU engines: 1 = smallest practical size, 2 = next, 4 … */
  size: number
}

export interface Estimate {
  engine: string
  provider: string
  model: 'per byte scanned' | 'per compute time' | 'per capacity hour'
  compute: number
  storage: number
  note: string
}

const GB = 1000

/**
 * Monthly list-price estimate for one analytics engine per provider. Deliberately simple: one
 * engine, no discounts, no egress. Its job is to show how the pricing *units* behave.
 */
export function estimate(p: Platforms, w: Workload): Estimate[] {
  const tib = w.scannedTb / 1.0995 // TB → TiB
  const bqFree = 1
  const credit = price(p, 'snowflake', 'Credit (Standard edition)').usd
  const xs = price(p, 'snowflake', 'X-Small warehouse').usd
  const dbu = price(p, 'databricks', 'SQL Serverless').usd
  const small = price(p, 'databricks', '2X-Small SQL warehouse').usd
  const rpu = price(p, 'aws', 'Redshift Serverless').usd
  const baseRpu = price(p, 'aws', 'Redshift Serverless base capacity').usd
  return [
    {
      engine: 'BigQuery on-demand',
      provider: 'gcp',
      model: 'per byte scanned',
      compute: Math.max(0, tib - bqFree) * price(p, 'gcp', 'BigQuery on-demand query').usd,
      storage: w.storageTb * GB * price(p, 'gcp', 'BigQuery active storage').usd,
      note: 'first 1 TiB scanned free each month',
    },
    {
      engine: 'Athena on S3',
      provider: 'aws',
      model: 'per byte scanned',
      compute: w.scannedTb * price(p, 'aws', 'Athena query').usd,
      storage: w.storageTb * GB * price(p, 'aws', 'S3 Standard storage').usd,
      note: 'Parquet + partitions shrink “scanned” directly',
    },
    {
      engine: 'Redshift Serverless',
      provider: 'aws',
      model: 'per compute time',
      compute: w.computeHours * baseRpu * w.size * rpu,
      storage: w.storageTb * GB * price(p, 'aws', 'Redshift managed storage').usd,
      note: `${baseRpu * w.size} RPU while queries run`,
    },
    {
      engine: 'Snowflake warehouse',
      provider: 'snowflake',
      model: 'per compute time',
      compute: w.computeHours * xs * w.size * credit,
      storage: w.storageTb * price(p, 'snowflake', 'Storage').usd,
      note: `${['X-Small', 'Small', '', 'Medium', '', '', '', 'Large'][w.size - 1] || `${w.size}× X-Small`}, Standard edition, auto-suspend`,
    },
    {
      engine: 'Databricks SQL Serverless',
      provider: 'databricks',
      model: 'per compute time',
      compute: w.computeHours * small * w.size * dbu,
      storage: w.storageTb * GB * price(p, 'aws', 'S3 Standard storage').usd,
      note: `${small * w.size} DBU/h; storage in your own bucket`,
    },
    {
      engine: 'Fabric capacity F2',
      provider: 'azure',
      model: 'per capacity hour',
      compute: 730 * w.size * price(p, 'azure', 'Fabric capacity F2').usd,
      storage: w.storageTb * GB * price(p, 'azure', 'OneLake storage').usd,
      note: `F${2 * w.size} running all month (pause it to save)`,
    },
  ]
}
