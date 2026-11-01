import type { Limit } from './quotas.js'

// The read-only mode L2 (G5 as precised 2026-10-28, #1469, #1491): which games of a lapsed account
// fit under the free tier's ceilings, and so work as usual, and which lie over them, and so may be
// opened, read, played back, exported and deleted but not changed, nor have a table started from
// them. One rule, here, and nothing else decides it; no HTTP, no store.
//
// The games are taken the most recently changed first, and each is held to the same measures the
// ceilings are: a game with more unique cards (`cardRowsPerProject`) or copies
// (`cardCopiesPerProject`) than the free tier holds lies over it on its own and takes no place;
// otherwise it fits while there is a place left under `projects`, and while what the fitting games
// name together stays under `storageBytes`, a picture two of them share weighed once, as the
// measure weighs it. A game that does not fit never shuts out an older one that does. Games
// changed at the same moment are taken in id order, so the answer never depends on the order asked.
//
// When a game is deleted, or one is made smaller elsewhere, the next one fits, since the rule is
// asked again each time and nothing about it is stored.
export type FitCeilings = { projects: Limit; cardRowsPerProject: Limit; cardCopiesPerProject: Limit; storageBytes: Limit }
// A game as it stands: when it was last changed, what it uses of each card measure, and the
// assets its versions name with their sizes.
export type GameStanding = { id: string; changedAt: string; rows: number; copies: number; assets: Record<string, number> }

// The ways a read-only game stays open to (#1491), as the terms keep theirs (`OPEN_WRITES` in
// `terms.ts`, #1272): every read; exporting it and drawing its print PDFs and booklet, which are the
// export's (G5, until #1209 says otherwise); a still of it to save, and the hero's box opened, which
// change nothing of it; deleting it, which is always the owner's; and taking a person off it or
// withdrawing an invite, which change who has it and not the game. Every other write on a game is
// closed, a way added later included, until this list says otherwise. An edit that only makes the
// game smaller is a change too: the decision says «not changed» (#1469).
export const READ_ONLY_OPEN: readonly (readonly [string, RegExp])[] = [
  ['POST', /^\/projects\/[^/]+\/export$/],
  ['POST', /^\/projects\/[^/]+\/print$/],
  ['POST', /^\/projects\/[^/]+\/rulebook$/],
  ['POST', /^\/projects\/[^/]+\/still$/],
  ['POST', /^\/projects\/[^/]+\/box\/opened$/],
  ['DELETE', /^\/projects\/[^/]+$/],
  ['DELETE', /^\/projects\/[^/]+\/members\/[^/]+$/],
  ['DELETE', /^\/projects\/[^/]+\/invites\/[^/]+$/],
]
const READS = new Set(['GET', 'HEAD', 'OPTIONS'])
// The game a request would change, when it would change one: a write under `/projects/<id>` that
// the list does not leave open, or an upload into a game (`POST /assets?project=<id>`). Null for
// everything else, which the read-only mode never asks: a new game, an import and a duplicate are
// held to the ceilings instead, and tables that stand are never asked (#1196).
export function gameWritten(method: string, path: string, query: URLSearchParams): string | null {
  if (READS.has(method)) return null
  if (method === 'POST' && path === '/assets') return query.get('project') || null
  const game = /^\/projects\/([^/]+)(?:\/.*)?$/.exec(path)?.[1]
  if (!game || game === 'import') return null
  if (READ_ONLY_OPEN.some(([m, p]) => m === method && p.test(path))) return null
  return decodeURIComponent(game)
}

// What the project actor throws when an edit is asked of a read-only game (#1491): the editor's line
// answers it with `refused` and `why: 'read-only'`, and nothing is committed.
export class ReadOnlyGame extends Error {
  constructor() {
    super('read-only')
    this.name = 'ReadOnlyGame'
  }
}
// Whether a game of this owner's is read-only now; asked by the actor as an edit or a version is
// decided, so a lapse set or lifted holds from the next one.
export type ReadOnlyCheck = (owner: string, id: string) => Promise<boolean>

const within = (limit: Limit, used: number): boolean => limit === null || used <= limit

export function readOnlyGames(ceilings: FitCeilings, games: readonly GameStanding[]): Set<string> {
  const newestFirst = [...games].sort((a, b) => (a.changedAt === b.changedAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.changedAt < b.changedAt ? 1 : -1))
  const over = new Set<string>()
  const named = new Map<string, number>()
  let fitting = 0
  let stored = 0
  for (const g of newestFirst) {
    const fresh = Object.entries(g.assets).filter(([hash]) => !named.has(hash))
    const adds = fresh.reduce((sum, [, size]) => sum + size, 0)
    const fits = within(ceilings.cardRowsPerProject, g.rows) && within(ceilings.cardCopiesPerProject, g.copies) && within(ceilings.projects, fitting + 1) && within(ceilings.storageBytes, stored + adds)
    if (!fits) {
      over.add(g.id)
      continue
    }
    fitting += 1
    stored += adds
    for (const [hash, size] of fresh) named.set(hash, size)
  }
  return over
}
