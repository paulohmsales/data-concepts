/**
 * A lakehouse table (Delta / Iceberg) over one week, hour by hour. 1 GB of new data arrives every
 * hour in `appendsPerHour` commits. Update batches change 1% of the rows in the files they touch,
 * written copy-on-write (rewrite whole files) or merge-on-read (write small delete files that
 * readers merge). Compaction bin-packs small files and applies deletes; vacuum removes old
 * versions once they are older than the retention period.
 */
export const HOURS = 168
const INGEST_MB_PER_HOUR = 1024
const SMALL_MB = 256
const TARGET_MB = 1024
const FILE_OPEN_S = 0.02
const DELETE_FILE_S = 0.05
const SCAN_MBPS = 2000
export const UPDATE_FRACTION = 0.01

export interface LakeParams {
  appendsPerHour: number
  compaction: 'none' | 'daily' | 'hourly'
  writeMode: 'cow' | 'mor'
  updatesPerDay: number
  /** scattered: updates touch every file; clustered: only the newest 2% */
  updatePattern: 'scattered' | 'clustered'
  retentionDays: number
}

interface DataFile {
  mb: number
  deleteFiles: number
}

export interface LakePoint {
  h: number
  files: number
  deleteFiles: number
  querySec: number
  liveGb: number
  storageGb: number
}

export interface LakeResult {
  series: LakePoint[]
  writeAmplification: number
  commits: number
}

export function simulateLake(p: LakeParams): LakeResult {
  let files: DataFile[] = []
  let retained: { mb: number; at: number }[] = []
  let written = 0
  let ingested = 0
  let commits = 0
  const series: LakePoint[] = []
  const updateEvery = p.updatesPerDay > 0 ? 24 / p.updatesPerDay : Infinity

  const compact = (h: number) => {
    const small = files.filter((f) => f.mb < SMALL_MB || f.deleteFiles > 0)
    if (small.length < 2 && !small.some((f) => f.deleteFiles > 0)) return
    const keep = files.filter((f) => !(f.mb < SMALL_MB || f.deleteFiles > 0))
    const total = small.reduce((a, f) => a + f.mb, 0)
    retained.push(...small.map((f) => ({ mb: f.mb, at: h })))
    written += total
    const out: DataFile[] = []
    for (let left = total; left > 0; left -= TARGET_MB) out.push({ mb: Math.min(TARGET_MB, left), deleteFiles: 0 })
    files = [...keep, ...out]
    commits++
  }

  for (let h = 0; h < HOURS; h++) {
    for (let a = 0; a < p.appendsPerHour; a++) files.push({ mb: INGEST_MB_PER_HOUR / p.appendsPerHour, deleteFiles: 0 })
    written += INGEST_MB_PER_HOUR
    ingested += INGEST_MB_PER_HOUR
    commits += p.appendsPerHour

    if (h > 0 && h % updateEvery === 0) {
      const n = p.updatePattern === 'scattered' ? files.length : Math.max(1, Math.ceil(files.length * 0.02))
      const touched = files.slice(files.length - n)
      for (const f of touched) {
        if (p.writeMode === 'cow') {
          retained.push({ mb: f.mb, at: h })
          written += f.mb
        } else {
          f.deleteFiles += 1
          written += f.mb * UPDATE_FRACTION
        }
      }
      ingested += touched.reduce((a, f) => a + f.mb * UPDATE_FRACTION, 0)
      commits++
    }

    if (p.compaction === 'hourly' || (p.compaction === 'daily' && h % 24 === 23)) compact(h)
    retained = retained.filter((r) => h - r.at < p.retentionDays * 24)

    const liveMb = files.reduce((a, f) => a + f.mb, 0)
    const del = files.reduce((a, f) => a + f.deleteFiles, 0)
    series.push({
      h,
      files: files.length,
      deleteFiles: del,
      querySec: files.length * FILE_OPEN_S + del * DELETE_FILE_S + liveMb / SCAN_MBPS,
      liveGb: liveMb / 1024,
      storageGb: (liveMb + retained.reduce((a, r) => a + r.mb, 0)) / 1024,
    })
  }
  return { series, writeAmplification: written / ingested, commits }
}
