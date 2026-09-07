import type { Applied, GameVersionId } from '@byd/protocol'
import type { SetupDef } from '@byd/engine'
import type { Deck } from './faces.js'

export type { Deck }

// Persistence of the one thing that matters: the log.
// `append` must be atomic per call and must refuse a gap or overlap in seq —
// that guard is what makes "commit before apply" a guarantee rather than a habit.

// `deck` is what the table's textures are compiled from; a session without one plays with blank cards.
// `project` is the project a table was started from, so it can be refreshed to a newer rev (C7).
// Admission (DRIFT §9): `code` is what guests reach the table by, alive until `codeExpiresAt`,
// and `hostKeyHash` is the hash of the key that opens the table's own view.
export type SessionRecord = { id: string; version: GameVersionId; setup: SetupDef; deck?: Deck; project?: string; code?: string; codeExpiresAt?: string; hostKeyHash?: string }

// A guest's admission (DRIFT §9): the hash of the token a phone or an observer connects with,
// what it admits to, and the name it was bought under. A kick sets `revokedAt`.
export type GuestRecord = { tokenHash: string; kind: 'seat' | 'observer'; seat: string | null; name: string; issuedAt: string; revokedAt?: string }

export type LogStore = {
  createSession(record: SessionRecord): Promise<void>
  loadSession(id: string): Promise<SessionRecord | null>
  append(sessionId: string, lines: readonly Applied[]): Promise<void>
  read(sessionId: string): Promise<Applied[]>
  // Sessions whose latest line (or creation, if none) is older than `olderThan` and that have
  // not ended: what the timeout in C9 ends for a group that forgot.
  staleSessions(olderThan: Date): Promise<string[]>
  // The tables one project has started (#19), newest first, with when each last moved. The
  // editor keeps no list of its own: a table is a session that names the project.
  sessionsOf(project: string): Promise<SessionSummary[]>
  // Admission (DRIFT §9): the session behind a code, and giving a session its (next) code.
  sessionByCode(code: string): Promise<{ id: string; codeExpiresAt: string } | null>
  setCode(sessionId: string, code: string, expiresAt: string): Promise<void>
  // Atomically reserves a live seat. False means another live guest already holds it.
  // Observer admissions do not reserve a seat.
  issueGuest(sessionId: string, guest: GuestRecord): Promise<boolean>
  guestByToken(sessionId: string, tokenHash: string): Promise<GuestRecord | null>
  // Revokes every token for a seat (or every observer token, for null); returns how many.
  revokeGuests(sessionId: string, seat: string | null, at: string): Promise<number>
}

// A table as a list can show it before anyone opens it: which session, and the moment of its
// latest line — null while nothing has happened yet.
export type SessionSummary = { id: string; lastAt: string | null }

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
  private readonly createdAt = new Map<string, number>()
  private readonly guests = new Map<string, GuestRecord[]>()

  async createSession(record: SessionRecord): Promise<void> {
    if (this.sessions.has(record.id)) throw new Error(`session ${record.id} already exists`)
    this.sessions.set(record.id, structuredClone(record))
    this.logs.set(record.id, [])
    this.createdAt.set(record.id, Date.now())
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

  async sessionsOf(project: string): Promise<SessionSummary[]> {
    const out: SessionSummary[] = []
    for (const [id, record] of this.sessions) {
      if (record.project !== project) continue
      out.push({ id, lastAt: this.logs.get(id)?.at(-1)?.at ?? null })
    }
    // Insertion order is the order they were started; the newest table is the one being played.
    return out.reverse()
  }

  async sessionByCode(code: string): Promise<{ id: string; codeExpiresAt: string } | null> {
    for (const r of this.sessions.values()) {
      if (r.code === code && r.codeExpiresAt !== undefined) return { id: r.id, codeExpiresAt: r.codeExpiresAt }
    }
    return null
  }

  async setCode(sessionId: string, code: string, expiresAt: string): Promise<void> {
    const r = this.sessions.get(sessionId)
    if (!r) throw new Error(`unknown session ${sessionId}`)
    for (const other of this.sessions.values()) {
      if (other.id !== sessionId && other.code === code) throw new Error(`code ${code} is taken`)
    }
    r.code = code
    r.codeExpiresAt = expiresAt
  }

  async issueGuest(sessionId: string, guest: GuestRecord): Promise<boolean> {
    if (!this.sessions.has(sessionId)) throw new Error(`unknown session ${sessionId}`)
    if (guest.seat !== null && (this.guests.get(sessionId) ?? []).some((g) => g.seat === guest.seat && g.revokedAt === undefined)) return false
    this.guests.set(sessionId, [...(this.guests.get(sessionId) ?? []), structuredClone(guest)])
    return true
  }

  async guestByToken(sessionId: string, tokenHash: string): Promise<GuestRecord | null> {
    const g = (this.guests.get(sessionId) ?? []).find((x) => x.tokenHash === tokenHash)
    return g ? structuredClone(g) : null
  }

  async revokeGuests(sessionId: string, seat: string | null, at: string): Promise<number> {
    let n = 0
    for (const g of this.guests.get(sessionId) ?? []) {
      if (g.seat === seat && g.revokedAt === undefined) {
        g.revokedAt = at
        n++
      }
    }
    return n
  }

  async staleSessions(olderThan: Date): Promise<string[]> {
    const out: string[] = []
    for (const [id, log] of this.logs) {
      const last = log.at(-1)
      if (last?.intent.v === 'session.end') continue
      const latest = last ? Date.parse(last.at) : (this.createdAt.get(id) ?? 0)
      if (latest < olderThan.getTime()) out.push(id)
    }
    return out
  }
}
