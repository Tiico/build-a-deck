import { createContext, useContext } from 'react'

// The game's pictures that are blocked after a report (#1274, beslut 1), by hash, with why and when:
// the owner's and the co-editors' to know, asked once the game is open (`ProjectClient.blocked`). The
// service treats such a hash as not there, so every surface draws it empty whatever this says; what
// this adds is the word. Tabell's picture tile says «Spärrad», and pressing it says why.
export type BlockReason = 'rights' | 'illegal' | 'terms'
export type Block = { reason: BlockReason; at: string }
export type Withheld = ReadonlyMap<string, Block>

export const WithheldPictures = createContext<Withheld>(new Map())

export function useWithheld(hash: string | null): Block | undefined {
  const withheld = useContext(WithheldPictures)
  return hash === null ? undefined : withheld.get(hash)
}

// The hashes every drawing surface is to leave empty: those whose bytes are on their way (#907), and
// those that are blocked. One set, so a card, a canvas and a symbol never ask the service for either.
// The block behind one card's picture field, if the field holds a picture that is blocked.
export function blockOf(rows: readonly { id: string; fields: Record<string, unknown> }[], at: { cardRef: string; field: string }, withheld: Withheld): Block | undefined {
  const value = rows.find((r) => r.id === at.cardRef)?.fields[at.field]
  return typeof value === 'string' && value.startsWith('asset:') ? withheld.get(value.slice('asset:'.length)) : undefined
}

export function drawnEmpty(arriving: ReadonlySet<string>, withheld: Withheld): ReadonlySet<string> {
  if (withheld.size === 0) return arriving
  return new Set([...arriving, ...withheld.keys()])
}
