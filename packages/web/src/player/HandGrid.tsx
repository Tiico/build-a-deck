import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { HandFace, TURNED_GROUND } from './HandFace.js'
import { useRoving } from '../editor/roving.js'
import { handLabel } from '../table/keyboard.js'
import { useT, type T } from '../i18n/index.js'
import { returnPile } from '../table/handName.js'
import { TileInCard } from '../table/TileInCard.js'
import { HOLDS_A_TILE, TILE_MARK } from '../table/tileLook.js'
import { isTile, tileOf } from '../components.js'

export type HandGridProps = {
  view: Snapshot
  // The marked cards, in the order they were marked: that order is what the grid numbers them by.
  selected: ReadonlySet<string>
  // A tap, a click or Space: mark the card, or unmark it.
  onToggle(card: VisibleComponentState): void
  // Enter on a card: the address panel, the keyboard's way to every verb (#1, variant C).
  onOpen(card: VisibleComponentState): void
  // A card carried one place along the hand by Alt and an arrow (K4). `position` is where it should
  // stand in the grid as it is drawn, first card first.
  onReorder?: ((card: VisibleComponentState, position: number) => void) | undefined
  // The HTTP origin that serves /faces/:hash; without it cards show their names on colour.
  faces?: string | undefined
  // The cards turned over in the hand, which are played face down (#1133), and F on a card turning
  // it, as F turns a card on the felt.
  turned?: ReadonlySet<string> | undefined
  onTurn?: ((card: VisibleComponentState) => void) | undefined
}

// The seat's own hand, the whole of it at once (#1147, beställarens val B): a grid three cards wide
// on a phone, so nothing is out of sight in a strip that has to be scrolled through, and a hand of
// twenty-five is a few rows rather than ten screens (#767). The projection already guarantees that
// only this seat's hand is here to show.
//
// A press marks a card and a second press unmarks it; marked cards carry the number of the order
// they were marked in, which is the order a several-card play is sent in. What to do with them is
// the bar under the grid, which is the only place the verbs stand.
//
// Every card is a real control (#1): it has the name the projection gives it, it says whether it is
// marked, and the grid is one tab stop with the arrows inside — the editor's roving tabindex, moving
// through the grid as it is laid out. Space marks and unmarks, Enter opens the address panel, F
// turns the card over, and Alt with an arrow moves a card along the hand.
export function HandGrid({ view, selected, onToggle, onOpen, onReorder, faces, turned, onTurn }: HandGridProps) {
  const t = useT()
  // The hand read from the bottom up (#415, decision B of 2026-09-22). A drawn card lands on top of
  // the zone, which is index 0 of the projection's order, so reading the order backwards is what
  // makes the hand grow towards the reading direction: the card that just arrived is last, and the
  // cards already held keep the places the eye left them in.
  // A hand's tiles stand after its cards (#1486, variant A of #1474), each in its own order: a tile
  // is held as a card is, and a hand that mixed them looked like a deck dropped on the floor.
  const raw = view.components.filter((c) => c.zone === `hand:${view.seat}`).reverse()
  const hand = [...raw.filter((c) => !isTile(c)), ...raw.filter(isTile)]
  const order = [...selected]
  const last = order.at(-1) ?? null
  const grid = useRef<HTMLDivElement>(null)
  // The grid's one tab stop is the card marked last, so Tab lands where the thumb just was.
  const roving = useRoving({ ids: hand.map((c) => c.id), selected: last, orientation: 'spatial' })

  // The card marked last is the one the bar names and plays, so it is the one that has to be in
  // view (#415): a card drawn into a long hand is marked as it lands, at the grid's far end.
  useEffect(() => {
    if (last === null) return
    grid.current?.querySelector<HTMLElement>(`[data-hand-card="${CSS.escape(last)}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [last, hand.length])

  // A card that leaves the hand while it holds the focus — played from the address panel, which
  // hands the focus back to the card it was opened on just before the table takes that card away —
  // took the focus with it to nothing (#761, K16). The focus goes to the card that now stands where
  // it stood, or the one before it at the end of the hand, and to the deck's tile when the hand is
  // empty: the first stop that is left, and the one a hand that was just emptied wants next.
  const focused = useRef<{ id: string; at: number } | null>(null)
  const ids = hand.map((c) => c.id).join(' ')
  useLayoutEffect(() => {
    const was = focused.current
    if (!was || hand.some((c) => c.id === was.id)) return
    focused.current = null
    const now = document.activeElement
    if (now !== null && now !== document.body) return
    const next = hand[Math.min(was.at, hand.length - 1)]
    const to = next ? grid.current?.querySelector<HTMLElement>(`[data-hand-card="${CSS.escape(next.id)}"]`) : document.querySelector<HTMLElement>('[data-zone-draw]')
    to?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the hand's ids are what this answers
  }, [ids])

  // A hand with nothing in it (UX-16): where the cards would be, the grid says what fills it — and
  // with no card in any pile it does not ask for one (#751).
  if (hand.length === 0) return <p className="byd-grid-empty" data-hand>{emptyHandText(view, t)}</p>

  return (
    <div className="byd-grid" data-hand ref={grid}>
      {hand.map((c, at) => {
        const item = roving.itemProps(c.id)
        const marked = selected.has(c.id)
        const faceDown = turned?.has(c.id) === true
        return (
          <button
            key={c.id}
            type="button"
            className="byd-grid-card"
            data-hand-card={c.id}
            data-selected={marked ? 'true' : 'false'}
            data-shape={tileOf(c)?.shape}
            {...(faceDown ? { 'data-turned': 'true' } : {})}
            aria-label={handLabel(c, marked, t, faceDown)}
            aria-pressed={marked}
            style={{ ['--hue' as string]: hue(c.cardRef ?? ''), ...(faceDown && !isTile(c) ? TURNED_GROUND : {}), ...(isTile(c) ? HOLDS_A_TILE : {}) }}
            tabIndex={item.tabIndex}
            ref={item.ref}
            onFocus={() => {
              focused.current = { id: c.id, at }
              item.onFocus()
            }}
            onBlur={(e) => {
              // Focus that went somewhere else on purpose is not this grid's to bring back.
              if (e.relatedTarget !== null) focused.current = null
            }}
            onKeyDown={(e) => {
              // Alt and an arrow carry the card one place along the hand (K4, #483), as Alt and an
              // arrow move a layer or a column everywhere else in this tool.
              if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault()
                // Among its own kind: a tile goes past tiles and a card past cards, to the place the
                // one it passes holds in the hand's own order.
                const past = hand[at + (e.key === 'ArrowRight' ? 1 : -1)]
                if (past && isTile(past) === isTile(c)) onReorder?.(c, raw.indexOf(past))
                return
              }
              if (e.key === 'Enter') {
                e.preventDefault()
                onOpen(c)
                return
              }
              if ((e.key === 'f' || e.key === 'F') && onTurn && !e.altKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                onTurn(c)
                return
              }
              item.onKeyDown(e)
            }}
            onClick={() => onToggle(c)}
          >
            <TileInCard c={c}>
              <HandFace faces={faces} c={c} turned={faceDown} Word="strong" />
            </TileInCard>
            {/* Where in the order of a several-card play this card goes. */}
            {marked && order.length > 1 && <i className="byd-grid-at" aria-hidden="true">{order.indexOf(c.id) + 1}</i>}
            {/* A marked tile is marked by a bar under it: an outline cuts off the ring a card wears. */}
            {marked && isTile(c) && <i aria-hidden="true" data-tile-marked style={TILE_MARK} />}
          </button>
        )
      })}
    </div>
  )
}

// No pile on the table holds a card, so there is nothing a hand could be filled from.
function nothingToDraw(view: Snapshot): boolean {
  return view.zones.filter((z) => z.kind === 'pile').every((z) => (z.mode === 'count' ? z.count : z.order.length) === 0)
}

// What an empty hand says, naming the pile it fills from (#714) — and with no card in any pile it
// does not ask for one (#751). The desk's row says the same (#1310).
export function emptyHandText(view: Snapshot, t: T): string {
  return nothingToDraw(view) ? t('player.hand.empty.none') : emptyHand(view, t)
}

function emptyHand(view: Snapshot, t: T): string {
  const pile = returnPile(view, view.seat)
  return pile ? t('player.hand.empty', { pile }) : t('player.hand.empty.any')
}
