import { useCallback, useEffect, useState } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { SHOW_MS, shownCard, type Shown } from './presence.js'

export type Showing = { card: VisibleComponentState; by: string | null; at: number }

// What the room's screen holds up for everyone (#508, beslut B): the card a phone showed (the
// relayed `show`, already pruned when its time is up), or the one the table's own keyboard asked
// «Titta» on. The newest of the two wins; either goes by itself after `SHOW_MS`; and one taken down
// with Escape or a press stays down until somebody shows something again. Nothing is drawn that
// this screen's own view does not carry face up (`shownCard`).
export function useShowing(view: Snapshot | null, fromRoom: Shown | null): { showing: Showing | null; show(card: VisibleComponentState): void; dismiss(): void } {
  const [own, setOwn] = useState<Shown | null>(null)
  const [down, setDown] = useState<number | null>(null)

  useEffect(() => {
    if (!own) return
    const gone = setTimeout(() => setOwn(null), Math.max(0, own.at + SHOW_MS - Date.now()))
    return () => clearTimeout(gone)
  }, [own])

  const latest = own && (!fromRoom || own.at >= fromRoom.at) ? own : fromRoom
  const card = latest && latest.at !== down ? shownCard(view, latest) : null
  const showing = latest && card ? { card, by: latest.seat === null ? null : latest.name, at: latest.at } : null

  const show = useCallback((c: VisibleComponentState) => setOwn({ component: c.id, seat: null, name: '', at: Date.now() }), [])
  const dismiss = useCallback(() => setDown(latest?.at ?? null), [latest?.at])
  return { showing, show, dismiss }
}
