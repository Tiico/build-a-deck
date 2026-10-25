import { entry, parseLedger, replayLedger, type Erased, type ErasureStore, type LedgerEntry } from './erase.js'
import type { LogStore } from './store.js'

// The operator's erasure (#1279, G6, F5): what a guest asks for through Kontakt, done by hand over
// Tailscale against the box's database (DRIFT §10, §12), as `plan` is. Every verb writes one line of
// JSON that says what it did, counted, and never a name, an address or a token — a name given with
// `--name` is used and not said again.
//
//   erase table <session>                 every guest at a table: every line masked, every survey gone
//   erase table <session> --seat <plats>  the guests who sat at that seat
//   erase table <session> --name <namn>   the guests who sat or watched under that name
//   erase game <id>                       every table started from a game, as a game taken away has
//                                         them (the game itself is the designer's to take away)
//   erase ledger                          the ledger as JSON lines, to keep before a restore
//   erase replay [--from <fil>]           the ledger run again after a restore (RUNBOOK §6): the
//                                         database's own, or one kept with `erase ledger`
export const ERASE_USAGE = 'usage: erase table <session> [--seat <plats> | --name <namn>] | erase game <id> | erase ledger | erase replay [--from <fil>]   (DATABASE_URL)'

export type EraseStores = { store: LogStore; erasures: ErasureStore; projects?: { remove(id: string): Promise<boolean> } | null }
type Io = { out(line: string): void; err(line: string): void; read(path: string): Promise<string>; now?: () => Date }

const counted = (done: Erased) => ({ tables: done.sessions.length, lines: done.lines, guests: done.guests, surveys: done.surveys })

export async function runErase(args: readonly string[], stores: EraseStores, io: Io): Promise<number> {
  const [verb, target, flag, value, ...rest] = args
  const now = io.now?.() ?? new Date()
  const say = (line: Record<string, unknown>) => io.out(JSON.stringify({ msg: 'erase', verb, ...line }))
  if (verb === 'table' && target && (flag === undefined || ((flag === '--seat' || flag === '--name') && value !== undefined && value !== '' && rest.length === 0))) {
    const session = await stores.store.loadSession(target)
    if (!session) {
      say({ session: target, error: 'no such table' })
      return 1
    }
    let entries: LedgerEntry[]
    if (flag === undefined) entries = [entry({ kind: 'table', session: target }, 'request', now)]
    else {
      const asked = (value ?? '').trim()
      const admissions = (await stores.store.guestsAt(target)).filter((g) => (flag === '--seat' ? g.kind === 'seat' && g.seat === asked : g.name === asked))
      if (admissions.length === 0) {
        say({ session: target, ...(flag === '--seat' ? { seat: value } : {}), error: 'no guest matched' })
        return 1
      }
      entries = admissions.map((g) => entry({ kind: 'guest', session: target, seat: g.seat, issuedAt: g.issuedAt }, 'request', now))
    }
    const done = await stores.erasures.erase(entries)
    say({ session: target, ...(flag === '--seat' ? { seat: value } : {}), admissions: entries.filter((e) => e.kind === 'guest').length, ...counted(done), ledger: entries.map((e) => e.id) })
    return 0
  }
  if (verb === 'game' && target && flag === undefined) {
    const e = entry({ kind: 'game', project: target }, 'request', now)
    const done = await stores.erasures.erase([e])
    say({ project: target, ...counted(done), ledger: [e.id] })
    return 0
  }
  if (verb === 'ledger' && target === undefined) {
    for (const e of await stores.erasures.ledger()) io.out(JSON.stringify(e))
    return 0
  }
  if (verb === 'replay' && (target === undefined || (target === '--from' && flag !== undefined && value === undefined))) {
    const kept = target === '--from' && flag !== undefined ? parseLedger(await io.read(flag)) : undefined
    const done = await replayLedger(stores, kept)
    say({ entries: done.entries, ...counted(done) })
    return 0
  }
  io.err(ERASE_USAGE)
  return 2
}
