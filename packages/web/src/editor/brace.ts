import type { ProjectDoc } from './types.js'
import { LIBRARY, searchSymbols, symbolName, symbolWords, type GameSymbol } from './symbols.js'
import type { T } from '../i18n/index.js'

// What the brace in a table cell proposes, and in which order (L57, #631).
//
// The game comes first. What the deck already writes — `{sköld|försvar}` on card after card — is
// what the designer reaches for nine times in ten, so it stands at the top, most written first,
// and goes in with one click. Then the game's own icons, one of which is drawn in a meaning before
// it goes in (L34). The library is the second click: «Hela biblioteket» opens it in the same box,
// and a symbol taken from it becomes one of the game's. A search searches everything but shows the
// game's own first.
//
// A game with no icons has nothing of its own to propose, so its brace opens on the library
// exactly as it always did — never on an empty list.
//
// The parts are one list to the keys: the arrows walk from the deck's tokens through the icons to
// the way into the library, which is why everything here is a flat run of picks under headings
// rather than three lists that each own a cursor.

export type BracePick =
  // A token the deck already writes, and how many times.
  | { kind: 'written'; name: string; role: string | null; count: number }
  // One of the game's icons, by the name card text writes it with.
  | { kind: 'icon'; name: string }
  // A library symbol; `inGame` when the game already has it.
  | { kind: 'library'; symbol: GameSymbol; inGame: boolean }
  // The way into the library, and the way back out of it.
  | { kind: 'more' }
  | { kind: 'back' }

// Which heading a run of picks stands under. `found` is the library's matches shown beneath the
// game's own while searching; `library` is the library itself.
export type BracePart = 'written' | 'icons' | 'found' | 'library' | 'more'
export type BraceSection = { part: BracePart; picks: BracePick[] }

// How many of the deck's tokens are offered: the handful written most, not an index of the deck.
const WRITTEN = 5
// How many library matches a search shows. The library opened as such shows all of it.
const FOUND = 8

type Doc = Pick<ProjectDoc, 'rows' | 'icons' | 'palette' | 'credits'>

// The icon tokens the deck writes, most written first. Only names the game has an icon for, and
// only meanings the game has named, count: anything else draws as its own letters on the card and
// is a typo to fix rather than a habit to offer. A bare number in braces is a pip (L2). In a field
// an `icons` element shows, a token is a bare name among others (#33) and is counted as one.
export function writtenInDeck(doc: Doc, iconFields: readonly string[]): Extract<BracePick, { kind: 'written' }>[] {
  const counts = new Map<string, { name: string; role: string | null; count: number }>()
  const count = (name: string, role: string | null) => {
    if (!doc.icons[name]) return
    if (role !== null && !doc.palette?.[role]) return
    const key = `${name}|${role ?? ''}`
    const seen = counts.get(key)
    if (seen) seen.count++
    else counts.set(key, { name, role, count: 1 })
  }
  for (const row of doc.rows) {
    for (const [field, value] of Object.entries(row.fields)) {
      if (typeof value !== 'string') continue
      if (iconFields.includes(field)) {
        for (const word of value.split(/[\s,]+/)) {
          const [name = '', role] = word.split('|')
          if (name) count(name, role ?? null)
        }
        continue
      }
      for (const [, name = '', role] of value.matchAll(/\{([^{}|]+)(?:\|([^{}]*))?\}/g)) count(name, role ?? null)
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'sv') || (a.role ?? '').localeCompare(b.role ?? '', 'sv'))
    .slice(0, WRITTEN)
    .map((w) => ({ kind: 'written', ...w }))
}

// The library symbol a game icon was taken from, when it was taken from the library (E4).
const sourceOf = (doc: Doc, name: string): GameSymbol | undefined => {
  const source = doc.credits?.[name]?.source
  return source ? LIBRARY.find((s) => s.id === source) : undefined
}

// Whether the game already has this library symbol: taken from it, or under its very name.
const inGame = (doc: Doc, symbol: GameSymbol, t: T): boolean =>
  Boolean(doc.icons[symbolName(symbol, t)]) || Object.values(doc.credits ?? {}).some((c) => c.source === symbol.id)

// What the brace offers for what has been typed since it. `library` is whether the second click
// has been taken. An empty result is a brace with nothing to offer, which draws no box at all.
export function braceSections(doc: Doc, query: string, library: boolean, iconFields: readonly string[], t: T): BraceSection[] {
  const q = query.trim().toLowerCase()
  const icons = Object.keys(doc.icons)
  const libraryPick = (symbol: GameSymbol): BracePick => ({ kind: 'library', symbol, inGame: inGame(doc, symbol, t) })
  if (icons.length === 0) return nonEmpty([{ part: 'library', picks: searchSymbols(query, null, t).slice(0, FOUND).map(libraryPick) }])
  if (library) return nonEmpty([{ part: 'library', picks: searchSymbols(query, null, t).map(libraryPick) }], { kind: 'back' })
  const matches = (name: string) => {
    if (!q || name.toLowerCase().includes(q)) return true
    const source = sourceOf(doc, name)
    return source ? symbolWords(source, t).some((w) => w.includes(q)) : false
  }
  return nonEmpty(
    [
      // While searching, the tokens give way: what is being looked for is a symbol, and the
      // game's icons that match are the game's answer to it.
      { part: 'written', picks: q ? [] : writtenInDeck(doc, iconFields) },
      { part: 'icons', picks: icons.filter(matches).map((name) => ({ kind: 'icon', name })) },
      { part: 'found', picks: q ? searchSymbols(query, null, t).filter((s) => !inGame(doc, s, t)).slice(0, FOUND).map(libraryPick) : [] },
    ],
    { kind: 'more' },
  )
}

// The parts that have something in them, and the way in or out of the library after them — but
// only when there is something to stand beside: a search that found nothing draws no box.
function nonEmpty(sections: BraceSection[], way?: BracePick): BraceSection[] {
  const kept = sections.filter((s) => s.picks.length > 0)
  if (kept.length === 0) return []
  return way ? [...kept, { part: 'more', picks: [way] }] : kept
}

// Which part the pick at this place in the run stands in: what the cell's `aria-controls` names.
export function partAt(sections: readonly BraceSection[], index: number): BracePart | null {
  let from = 0
  for (const section of sections) {
    if (index < from + section.picks.length) return section.part
    from += section.picks.length
  }
  return null
}

// The flat run the keys walk.
export const bracePicks = (sections: readonly BraceSection[]): BracePick[] => sections.flatMap((s) => s.picks)

// What tells one pick from the next within its part, for React and for the option's id.
export const pickKeyOf = (pick: BracePick): string =>
  pick.kind === 'written' ? `${pick.name}|${pick.role ?? ''}` : pick.kind === 'icon' ? pick.name : pick.kind === 'library' ? pick.symbol.id : pick.kind
