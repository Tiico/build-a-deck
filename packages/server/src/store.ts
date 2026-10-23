import { PHYSICAL_VERBS, type Applied, type GameVersionId } from '@byd/protocol'
import type { SetupDef } from '@byd/engine'
import type { Deck } from './faces.js'
import { QuotaReached, startThatFrees, tableGrowth, withFrees, type TableCeilings, type TableUse } from './quotas.js'

export type { Deck }

// Persistence of the one thing that matters: the log.
// `append` must be atomic per call and must refuse a gap or overlap in seq —
// that guard is what makes "commit before apply" a guarantee rather than a habit.

// `deck` is what the table's textures are compiled from; a session without one plays with blank cards.
// `project` is the project a table was started from, so it can be refreshed to a newer rev (C7).
// Admission (DRIFT §9): `code` is what guests reach the table by, alive until `codeExpiresAt`,
// and `hostKeyHash` is the hash of the key that opens the table's own view.
// `accountId` is the table's bearer (A2, #1194): the account its cost is counted against, set when
// it is started and never moved. A table started from a game is borne by the game's owner, never by
// the test leader who pressed; one opened at the raw door by the account that opened it. It stays
// when the game is taken away, which is why it is written down rather than read through `project`.
// A table from a game from before accounts, or from a server without accounts, has none.
export type SessionRecord = { id: string; version: GameVersionId; setup: SetupDef; deck?: Deck; project?: string; accountId?: string; code?: string; codeExpiresAt?: string; hostKeyHash?: string }
// A session as it is read back: everything but its decks (#1012). A deck names its pictures and
// typefaces by hash since #1028, but one made before that carries them as data URLs, tens of
// megabytes for a game with art on every card — and the session is read by every door a table has:
// each socket that opens, each code looked up, each list of tables. The deck is read by the one
// reader that deals from it, through `deckOf`.
export type SessionInfo = Omit<SessionRecord, 'deck'>

// A guest's admission (DRIFT §9): the hash of the token a phone or an observer connects with,
// what it admits to, and the name it was bought under. A pending admission expires unless it
// connects and is activated; a kick or expiry sets `revokedAt`.
// `accountId` is set when the guest claims the session to an account afterwards (G1).
export type GuestRecord = { tokenHash: string; kind: 'seat' | 'observer'; seat: string | null; name: string; issuedAt: string; expiresAt: string; revokedAt?: string; accountId?: string }
export type PlayedRecord = GuestRecord & { sessionId: string }

export type LogStore = {
  // `ceilings` are the bearer's on its tables (#1196, A2): counted and written in one step, so two
  // tables asked for at the ceiling's last place give exactly one, and the other throws
  // `QuotaReached` with nothing written. Absent, or a table with no bearer, is unlimited.
  createSession(record: SessionRecord, ceilings?: TableCeilings): Promise<void>
  // What an account bears of tables (#1196): those of its tables whose log does not end with
  // `session.end`, and those started after `since`. Counted out of the sessions and their bearer,
  // so a game taken away takes none of its tables out of the count.
  tablesOf(account: string, since: Date): Promise<TableUse>
  loadSession(id: string): Promise<SessionInfo | null>
  // The deck a table is refreshed to (C7), kept under the version it is for. Written before the
  // version.change line is committed, so a log that says a version always has its deck.
  addDeck(sessionId: string, version: GameVersionId, deck: Deck): Promise<void>
  // The deck a table plays at `version`: the one «Uppdatera» moved it to, or else the start deck,
  // which stays where it was because that is where replay begins (#677). Null without a deck.
  deckOf(sessionId: string, version: GameVersionId): Promise<Deck | null>
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
  // «Ny kod» (#820): a new code and a new host key in one write, so a leaked key is taken back
  // with the code it was leaked beside, and there is never a moment when only one of them is new.
  rotateAdmission(sessionId: string, code: string, expiresAt: string, hostKeyHash: string): Promise<void>
  // Atomically reserves a live seat. False means another live guest already holds it.
  // Observer admissions do not reserve a seat.
  issueGuest(sessionId: string, guest: GuestRecord): Promise<boolean>
  // Turns a still-valid pending admission into a longer-lived active admission.
  activateGuest(sessionId: string, tokenHash: string, now: string, expiresAt: string): Promise<GuestRecord | null>
  guestByToken(sessionId: string, tokenHash: string): Promise<GuestRecord | null>
  // Every admission ever given at a table, revoked ones too, oldest first: who came to it (#1010).
  guestsAt(sessionId: string): Promise<GuestRecord[]>
  // Revokes every token for a seat (or every observer token, for null); returns how many.
  revokeGuests(sessionId: string, seat: string | null, at: string): Promise<number>
  // Claiming (G1): the admission behind a token becomes the account's, once; null when there
  // is no such token, 'other' when another account has it already.
  claimGuest(tokenHash: string, accountId: string): Promise<PlayedRecord | 'other' | null>
  // Every admission an account has claimed, newest first.
  guestsOf(accountId: string): Promise<PlayedRecord[]>
  // «Tillbaka till bordet» (#690): the account's newest live admission at a table is given a new
  // token in place of its old one, keeping its seat, name and account; null when there is none.
  returnGuest(sessionId: string, accountId: string, tokenHash: string, now: string): Promise<GuestRecord | null>
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
  private readonly decks = new Map<string, Map<GameVersionId, Deck>>()
  private readonly logs = new Map<string, Applied[]>()
  private readonly createdAt = new Map<string, number>()
  private readonly guests = new Map<string, GuestRecord[]>()

  // Counted and written with no wait between them, so no other request can come in between.
  async createSession(record: SessionRecord, ceilings?: TableCeilings): Promise<void> {
    if (this.sessions.has(record.id)) throw new Error(`session ${record.id} already exists`)
    if (record.accountId !== undefined && ceilings) {
      const met = tableGrowth(ceilings, this.countTables(record.accountId, ceilings.since))
      if (met) throw new QuotaReached(met.measure === 'tablesPer30Days' ? withFrees(met, this.startsOf(record.accountId, ceilings.since)[startThatFrees(met)]) : met)
    }
    this.sessions.set(record.id, structuredClone(record))
    this.logs.set(record.id, [])
    this.createdAt.set(record.id, Date.now())
  }

  async tablesOf(account: string, since: Date): Promise<TableUse> {
    return this.countTables(account, since)
  }

  // When each of the account's tables in the window was started, oldest first.
  private startsOf(account: string, since: Date): number[] {
    const starts: number[] = []
    for (const [id, record] of this.sessions) {
      const at = this.createdAt.get(id) ?? 0
      if (record.accountId === account && at > since.getTime()) starts.push(at)
    }
    return starts.sort((a, b) => a - b)
  }

  private countTables(account: string, since: Date): TableUse {
    const used: TableUse = { open: 0, started: 0 }
    for (const [id, record] of this.sessions) {
      if (record.accountId !== account) continue
      if (this.logs.get(id)?.at(-1)?.intent.v !== 'session.end') used.open++
      if ((this.createdAt.get(id) ?? 0) > since.getTime()) used.started++
    }
    return used
  }

  async loadSession(id: string): Promise<SessionInfo | null> {
    const r = this.sessions.get(id)
    if (!r) return null
    const { deck: _deck, ...info } = r
    return structuredClone(info)
  }

  async addDeck(sessionId: string, version: GameVersionId, deck: Deck): Promise<void> {
    if (!this.sessions.has(sessionId)) throw new Error(`unknown session ${sessionId}`)
    const decks = this.decks.get(sessionId) ?? new Map<GameVersionId, Deck>()
    decks.set(version, structuredClone(deck))
    this.decks.set(sessionId, decks)
  }

  async deckOf(sessionId: string, version: GameVersionId): Promise<Deck | null> {
    const deck = this.decks.get(sessionId)?.get(version) ?? this.sessions.get(sessionId)?.deck
    return deck ? structuredClone(deck) : null
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
      out.push({ id, lastAt: this.logs.get(id)?.findLast((l) => PHYSICAL_VERBS.includes(l.intent.v))?.at ?? null })
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

  async rotateAdmission(sessionId: string, code: string, expiresAt: string, hostKeyHash: string): Promise<void> {
    await this.setCode(sessionId, code, expiresAt)
    const r = this.sessions.get(sessionId)
    if (r) r.hostKeyHash = hostKeyHash
  }

  async issueGuest(sessionId: string, guest: GuestRecord): Promise<boolean> {
    if (!this.sessions.has(sessionId)) throw new Error(`unknown session ${sessionId}`)
    const guests = this.guests.get(sessionId) ?? []
    const issuedAt = Date.parse(guest.issuedAt)
    for (const existing of guests) {
      if (existing.revokedAt === undefined && Date.parse(existing.expiresAt) <= issuedAt) existing.revokedAt = guest.issuedAt
    }
    if (guest.seat !== null && guests.some((g) => g.seat === guest.seat && g.revokedAt === undefined)) return false
    this.guests.set(sessionId, [...guests, structuredClone(guest)])
    return true
  }

  async guestByToken(sessionId: string, tokenHash: string): Promise<GuestRecord | null> {
    const g = (this.guests.get(sessionId) ?? []).find((x) => x.tokenHash === tokenHash)
    return g ? structuredClone(g) : null
  }

  async guestsAt(sessionId: string): Promise<GuestRecord[]> {
    return (this.guests.get(sessionId) ?? []).map((g) => structuredClone(g))
  }

  async activateGuest(sessionId: string, tokenHash: string, now: string, expiresAt: string): Promise<GuestRecord | null> {
    const g = (this.guests.get(sessionId) ?? []).find((x) => x.tokenHash === tokenHash)
    if (!g || g.revokedAt !== undefined || Date.parse(g.expiresAt) <= Date.parse(now)) return null
    if (Date.parse(expiresAt) > Date.parse(g.expiresAt)) g.expiresAt = expiresAt
    return structuredClone(g)
  }

  async claimGuest(tokenHash: string, accountId: string): Promise<PlayedRecord | 'other' | null> {
    for (const [sessionId, guests] of this.guests) {
      const g = guests.find((x) => x.tokenHash === tokenHash)
      if (!g) continue
      if (g.accountId !== undefined && g.accountId !== accountId) return 'other'
      g.accountId = accountId
      return { ...structuredClone(g), sessionId }
    }
    return null
  }

  async guestsOf(accountId: string): Promise<PlayedRecord[]> {
    const out: PlayedRecord[] = []
    for (const [sessionId, guests] of this.guests) {
      for (const g of guests) if (g.accountId === accountId) out.push({ ...structuredClone(g), sessionId })
    }
    return out.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  }

  async returnGuest(sessionId: string, accountId: string, tokenHash: string, now: string): Promise<GuestRecord | null> {
    const live = (this.guests.get(sessionId) ?? [])
      .filter((g) => g.accountId === accountId && g.revokedAt === undefined && Date.parse(g.expiresAt) > Date.parse(now))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0]
    if (!live) return null
    live.tokenHash = tokenHash
    return structuredClone(live)
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
