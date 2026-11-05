/** Minimal database interface, so the same load jobs run on DuckDB-WASM (browser) and DuckDB (tests). */
export type Row = Record<string, unknown>

export interface Db {
  /** Run one statement that returns rows. */
  all<T = Row>(sql: string): Promise<T[]>
  /** Run one statement for its side effect. */
  run(sql: string): Promise<void>
}

/** SQL string literal (doubles single quotes). */
export const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

/** DuckDB returns BIGINT (e.g. COUNT) as bigint; the UI and tests want plain numbers. */
export function normalizeRow(row: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'bigint' ? Number(v) : v
  return out
}

/** Wraps a Db and reports every statement, so the UI can show the SQL a job ran. */
export function tracing(db: Db, onSql: (sql: string) => void): Db {
  return {
    all: (sql) => {
      onSql(sql)
      return db.all(sql)
    },
    run: (sql) => {
      onSql(sql)
      return db.run(sql)
    },
  }
}
