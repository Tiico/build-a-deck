import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'
import type { SendResult } from '../client.js'
import { useRoving } from '../editor/roving.js'
import { refusalText } from '../status/notice.js'
import { useSay } from '../status/StatusLive.js'
import { ActionPanel } from './ActionPanel.js'
import { CardLook } from './CardLook.js'
import { feltLabels, intentsForPlace, landedKeyFor, thingsOn, type Thing } from './keyboard.js'
import type { FeltKeyboard } from './TableRenderer.js'

// The keyboard on the felt and in the hand (#1, #2, variant C "adressen"). It owns four things:
// what every node is called, which one holds the single tab stop, which one has the panel open,
// and where the focus stands once a move has landed.
//
// The roving tabindex is the editor's settled one (`roving.ts`) — the felt is a list laid out in
// two dimensions, so it takes all four arrows into the same one reading order.
export type FeltKeyboardHandle = {
  // Passed to `TableRenderer`; undefined when the table is only being shown, so the editor's
  // thumbnails grow no tab stops (K9).
  keyboard: FeltKeyboard | undefined
  // Everything the keyboard puts over the route: the panel while something is open, and the
  // card it asked to look at. One node, so a route renders `{felt.panel}` and nothing else.
  panel: ReactNode
  // Opens the panel on a card that is not on the felt at all: a card in this seat's own hand.
  openHand(card: VisibleComponentState, marked: readonly string[]): void
}

export type FeltKeyboardOptions = {
  // One envelope to the table. What went through is said by the activity feed the pointer
  // already fills (`useActivityLive`); only the answer that did not happen is said here.
  act(intents: Intent[]): Promise<SendResult>
  // Called when a play from the hand went through, so the hand can drop its marks.
  onPlayed?: (() => void) | undefined
  // The HTTP origin that serves /faces/:hash, for the card the panel opens large.
  faces?: string | undefined
}

// `felt` says whether this route draws a table that can be played on. The phone has no felt, so
// it passes false and gets the panel and the hand alone; the editor's thumbnails never call this
// at all, and so grow no tab stops (K9).
export function useFeltKeyboard(view: Snapshot | null, felt: boolean, options: FeltKeyboardOptions): FeltKeyboardHandle {
  const say = useSay()
  const [open, setOpen] = useState<{ thing: Thing; cards: string[] } | null>(null)
  const [looking, setLooking] = useState<VisibleComponentState | null>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  // Where the focus is heading once the table has answered. The node it names does not exist
  // yet when the move is sent, so it is claimed on the first render that draws it.
  const pending = useRef<string | null>(null)
  const on = view !== null && felt
  const things = on ? thingsOn(view) : []
  const roving = useRoving({ ids: things.map((t) => t.key), selected: null, orientation: 'both' })

  useLayoutEffect(() => {
    const want = pending.current
    if (want === null) return
    if (roving.focus(want)) {
      pending.current = null
      return
    }
    // The thing focus was heading for can have left the felt — a card played into a hand, a pile
    // that dissolved. Focus then goes to the first stop that is left, never to nothing.
    if (things.some((t) => t.key === want)) return
    pending.current = null
    roving.focus(things[0]?.key)
  })

  const remember = () => {
    returnTo.current = (document.activeElement as HTMLElement | null) ?? null
  }
  const close = (landedOn?: string) => {
    setOpen(null)
    if (landedOn !== undefined) {
      pending.current = landedOn
      return
    }
    const el = returnTo.current
    if (el && document.contains(el)) el.focus()
    else if (open) pending.current = open.thing.key
  }

  const keyboard: FeltKeyboard | undefined =
    view && on
      ? {
          labels: feltLabels(view),
          open: open?.thing.key ?? null,
          itemProps: roving.itemProps,
          onActivate: (key) => {
            const thing = things.find((t) => t.key === key)
            if (!thing) return
            remember()
            setOpen({ thing, cards: [] })
          },
        }
      : undefined

  const sheet =
    view && open ? (
      <ActionPanel
        view={view}
        thing={open.thing}
        cards={open.cards}
        onClose={() => close()}
        onLook={(c) => {
          setLooking(c)
          close()
        }}
        onRun={(intents, landedOn) => {
          // A refusal is an answer to something someone asked for that did not happen, so it
          // cuts in (D5). Nothing else on this path is worth interrupting a reader for.
          void options.act(intents).then((result) => {
            if (!result.ok) say?.('assertive', refusalText(result.reason))
          })
          options.onPlayed?.()
          close(landedOn)
        }}
        intentsFor={(place, moving) => intentsForPlace(view, place, open.thing, moving)}
        landedKey={(place) => landedKeyFor(view, place, open.thing)}
      />
    ) : null
  const panel = (
    <>
      {sheet}
      {looking && <CardLook card={looking} faces={options.faces} onClose={() => setLooking(null)} />}
    </>
  )

  return {
    keyboard,
    panel,
    openHand: (card, marked) => {
      remember()
      setOpen({
        thing: { key: `card:${card.id}`, kind: 'card', id: card.id, name: card.cardRef ?? 'Dolt kort', zone: card.zone },
        cards: marked.includes(card.id) ? [...marked] : [card.id],
      })
    },
  }
}
