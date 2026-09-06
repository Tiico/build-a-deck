import type { Applied, GameVersionId } from '@byd/protocol'
import type { SetupDef } from '@byd/engine'
import type { Deck } from './faces.js'

export type { Deck }

// Persistence of the one thing that matters: the log.
// `append` must be atomic per call and must refuse a gap or overlap in seq —
// that guard is what makes "commit before apply" a guarantee rather than a habit.

// `deck` is what the table's textures are compiled from; a session without one plays with blank cards.
export type SessionRecord = { id: string; version: GameVersionId; setup: SetupDef; deck?: Deck }

export type LogStore = {
  createSession(record: SessionRecord): Promise<void>
  loadSession(id: string): Promise<SessionRecord | null>
  append(sessionId: string, lines: readonly Applied[]): Promise<void>
  read(sessionId: string): Promise<Applied[]>
}

export class SeqConflictError extends Error {
  constructor(sessionId: string, expected: number, got: number) {
    super(`session ${sessionId}: expected next seq ${expected}, got ${got}`)
    this.name = 'SeqConflictError'
  }
}

// In-memory store for tests and local play. Same contract, no durability.
export class MemoryLogStore implements LogStore {
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly logs = new Map<string, Applied[]>()

  async createSession(record: SessionRecord): Promise<void> {
    if (this.sessions.has(record.id)) throw new Error(`session ${record.id} already exists`)
    this.sessions.set(record.id, structuredClone(record))
    this.logs.set(record.id, [])
  }

  async loadSession(id: string): Promise<SessionRecord | null> {
    const r = this.sessions.get(id)
    return r ? structuredClone(r) : null
  }

  async append(sessionId: string, lines: readonly Applied[]): Promise<void> {
    const log = this.logs.get(sessionId)
    if (!log) throw new Error(`unknown session ${sessionId}`)
    const first = lines[0]
    if (!first) return
    const expected = (log.at(-1)?.seq ?? 0) + 1
    if (first.seq !== expected) throw new SeqConflictError(sessionId, expected, first.seq)
    for (const [i, line] of lines.entries()) {
      if (line.seq !== first.seq + i) throw new Error('lines in one append must be consecutive')
    }
    log.push(...structuredClone(lines))
  }

  async read(sessionId: string): Promise<Applied[]> {
    const log = this.logs.get(sessionId)
    if (!log) throw new Error(`unknown session ${sessionId}`)
    return structuredClone(log)
  }
}
