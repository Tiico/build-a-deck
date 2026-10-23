import { useEffect, useState } from 'react'
import type { Snapshot } from '@byd/protocol'

// Which cards in this seat's hand are turned over, so that they are played face down (#1133,
// beställarens beslut A — K11's second choice).
//
// **The screen's memory, and never the log's.** Nobody else at a table sees which way a card in
// your hand lies, so a turn is no event (L4): it sends nothing, and the play that follows is what
// the table hears of it. A card's `face` in a hand could not have carried it either — a card drawn
// from a face-down pile lies there as `back`, and its owner sees the front all the same.
//
// It is kept in the browser under the table and the seat, so a page opened again on the same
// screen still holds the card the way it was left. `localStorage` throws in a private window and
// can be switched off, so both ways are wrapped, and a screen that may not remember turns cards
// all the same: it only forgets them on the next load.
export type TurnedHand = {
  turned: ReadonlySet<string>
  toggle(id: string): void
}

const keyFor = (scope: string): string => `byd.turned.${scope}`

function recall(scope: string | null): ReadonlySet<string> {
  if (scope === null) return new Set()
  try {
    const said = window.localStorage.getItem(keyFor(scope))
    const read: unknown = said === null ? [] : JSON.parse(said)
    return new Set(Array.isArray(read) ? read.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function remember(scope: string | null, turned: ReadonlySet<string>): void {
  if (scope === null) return
  try {
    if (turned.size === 0) window.localStorage.removeItem(keyFor(scope))
    else window.localStorage.setItem(keyFor(scope), JSON.stringify([...turned]))
  } catch {
    // A screen that may not remember still turns the card; it forgets it on the next load.
  }
}

// `scope` names the table and the seat; `hand` is the hand as it is now, or null before the table
// has said. A card that has left the hand is forgotten, so one dealt back to it later comes face
// up the way every card comes into a hand.
export function useTurnedHand(scope: string | null, hand: readonly string[] | null): TurnedHand {
  const [turned, setTurned] = useState<ReadonlySet<string>>(() => recall(scope))
  const held = hand?.join(' ') ?? null
  useEffect(() => {
    if (held === null) return
    const ids = new Set(held === '' ? [] : held.split(' '))
    setTurned((now) => {
      if ([...now].every((id) => ids.has(id))) return now
      const kept = new Set([...now].filter((id) => ids.has(id)))
      remember(scope, kept)
      return kept
    })
  }, [scope, held])
  return {
    turned,
    toggle: (id) =>
      setTurned((now) => {
        const next = new Set(now)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        remember(scope, next)
        return next
      }),
  }
}

// The same, for a seat at a table: kept under the table and the seat, and given the hand as the
// table last said it.
export function useSeatTurned(sessionId: string | null, seat: string | null, view: Snapshot | null): TurnedHand {
  const scope = sessionId && seat ? `${sessionId}.${seat}` : null
  const hand = view && seat ? view.components.filter((c) => c.zone === `hand:${seat}`).map((c) => c.id) : null
  return useTurnedHand(scope, hand)
}
