import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { Applied } from '@byd/protocol'
import type { SetupDef } from '@byd/engine'
import { SeqConflictError, type Deck, type LogStore, type SessionRecord } from './store.js'

export class PostgresLogStore implements LogStore {
  constructor(private readonly sql: postgres.Sql) {}

  static connect(url: string): PostgresLogStore {
    return new PostgresLogStore(postgres(url, { max: 5, onnotice: () => undefined }))
  }

  // Idempotent schema for the slice. DRIFT §7 moves this into a migration step before start.
  async migrate(): Promise<void> {
    const path = fileURLToPath(new URL('../sql/001-init.sql', import.meta.url))
    await this.sql.unsafe(await readFile(path, 'utf8'))
  }

  async close(): Promise<void> {
    await this.sql.end()
  }

  async createSession(record: SessionRecord): Promise<void> {
    await this.sql`
      insert into sessions (id, version, setup, deck)
      values (${record.id}, ${record.version}, ${this.sql.json(record.setup as never)}, ${record.deck ? this.sql.json(record.deck as never) : null})
    `
  }

  async loadSession(id: string): Promise<SessionRecord | null> {
    const rows = await this.sql<{ id: string; version: string; setup: SetupDef; deck: Deck | null }[]>`
      select id, version, setup, deck from sessions where id = ${id}
    `
    const row = rows[0]
    if (!row) return null
    return { id: row.id, version: row.version, setup: row.setup, ...(row.deck ? { deck: row.deck } : {}) }
  }

  async append(sessionId: string, lines: readonly Applied[]): Promise<void> {
    const first = lines[0]
    if (!first) return
    await this.sql.begin(async (tx) => {
      // One writer per session at a time, even if two processes ever race.
      await tx`select pg_advisory_xact_lock(hashtext(${sessionId}))`
      const [row] = await tx<{ max: number | null }[]>`
        select max(seq)::int as max from events where session_id = ${sessionId}
      `
      const expected = (row?.max ?? 0) + 1
      if (first.seq !== expected) throw new SeqConflictError(sessionId, expected, first.seq)
      for (const [i, line] of lines.entries()) {
        if (line.seq !== first.seq + i) throw new Error('lines in one append must be consecutive')
        await tx`
          insert into events (session_id, seq, batch, at, by_seat, intent, outcome)
          values (
            ${sessionId}, ${line.seq}, ${line.batch}, ${line.at}, ${line.by},
            ${tx.json(line.intent as never)},
            ${line.outcome === undefined ? null : tx.json(line.outcome as never)}
          )
        `
      }
    })
  }

  async read(sessionId: string): Promise<Applied[]> {
    const rows = await this.sql<
      { seq: number; batch: string; at: Date; by_seat: string | null; intent: unknown; outcome: unknown }[]
    >`
      select seq, batch, at, by_seat, intent, outcome
      from events where session_id = ${sessionId} order by seq
    `
    return rows.map((r) =>
      Applied.parse({
        seq: r.seq,
        batch: r.batch,
        at: r.at.toISOString(),
        by: r.by_seat,
        intent: r.intent,
        ...(r.outcome === null ? {} : { outcome: r.outcome }),
      }),
    )
  }
}
