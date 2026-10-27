import { createHash } from 'node:crypto'
import type postgres from 'postgres'

// Brings a schema up to a script, once (#1442). Both schema scripts are idempotent and were run at
// every start, and their `alter table` and `create index if not exists` locked the tables they name
// whatever the schema already said: a start beside the app's writes could die in a deadlock (40P01).
// Now `schema_migrations` keeps the sha256 of the script each schema was last brought up to, and a
// start whose script is the one recorded touches no table but that one. A changed script runs whole,
// as before, and is recorded in the same transaction.
//
// The app and the worker both run the render script, and may start at the same moment: an advisory
// lock per schema makes the second wait for the first and then find the script recorded. A script
// that has to change something can still meet a write going the other way; Postgres then aborts one
// side, and if it is the start, the start is rolled back whole and tried again.
const RETRIED = new Set(['40P01', '40001', '55P03'])
const ATTEMPTS = 8

export async function migrate(sql: postgres.Sql, name: string, script: string, schema?: string): Promise<'migrated' | 'current'> {
  const sha256 = createHash('sha256').update(script).digest('hex')
  for (let attempt = 1; ; attempt++) {
    try {
      return await sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext('byd:schema'), hashtext(${schema ?? ''}))`
        if (schema) await tx.unsafe(`create schema if not exists "${schema.replace(/"/g, '')}"`)
        await tx`create table if not exists schema_migrations (
          name        text primary key,
          sha256      text not null,
          applied_at  timestamptz not null default now()
        )`
        const [row] = await tx<{ sha256: string }[]>`select sha256 from schema_migrations where name = ${name}`
        if (row?.sha256 === sha256) return 'current' as const
        await tx.unsafe(script)
        await tx`insert into schema_migrations (name, sha256) values (${name}, ${sha256})
          on conflict (name) do update set sha256 = excluded.sha256, applied_at = now()`
        return 'migrated' as const
      })
    } catch (err) {
      const code = (err as { code?: unknown }).code
      if (attempt >= ATTEMPTS || typeof code !== 'string' || !RETRIED.has(code)) throw err
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt + Math.random() * 100))
    }
  }
}
