import { useState } from 'react'
import type { Activity, Snapshot, VisibleComponentState } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { HeldCard } from './HeldCard.js'
import { HandStrip } from './HandStrip.js'
import { CountersRow, MineActions, MineStrip } from './SeatExtras.js'
import { PlaySheet } from './PlaySheet.js'
import { TableSummary } from './TableSummary.js'
import { SessionButtons, SessionOverlays, useToast, type Sheet } from './SessionOverlays.js'
import { RuleDrawer } from '../rules/RuleDrawer.js'
import { playIntents } from './play.js'
import { useRefusal } from '../status/Refusal.js'
import { useT } from '../i18n/index.js'

// What a player is given on a screen that cannot carry the board: the seat's own hand as K10's
// strip, the counters, the private zones, and the table itself as names and counts rather than as
// a felt. It is the whole of `/play`, and since C2's revision of 2026-09-16 (#99) it is also what
// `/online` shows a player holding a phone — a phone is the control, and the board is the TV in
// the room or a screen wide enough to hold it.
//
// One surface drawn by two routes, and deliberately one: "the hand on a phone is K10's strip
// whichever address opened it" is a sentence no pair of copies can keep true for long.
//
// What the surface does *not* own is the keyboard. Whether there is a felt under it is the route's
// question and not this one's (#1), so the route makes the keyboard and hands in the one door this
// surface needs — and the marks a play clears travel with it, because the keyboard clears them
// from the outside.
export type HandMarks = {
  selected: ReadonlySet<string>
  toggle(card: VisibleComponentState): void
  clear(): void
}

// The cards a thumb has marked. It lives above the surface because the keyboard is given
// `onPlayed` when it is made, and a play through the keyboard drops the marks like any other.
export function useHandMarks(): HandMarks {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  return {
    selected,
    clear: () => setSelected(new Set()),
    toggle: (card) =>
      setSelected((s) => {
        const next = new Set(s)
        if (next.has(card.id)) next.delete(card.id)
        else next.add(card.id)
        return next
      }),
  }
}

export type PlayerSurfaceProps = {
  client: TableClient
  view: Snapshot
  activity: readonly Activity[]
  seat: string
  // What this seat is called on the felt, which is not always what the link said (#31).
  name: string
  sessionId: string
  // The HTTP origin that serves /faces/:hash.
  faces: string
  version: string | null
  marks: HandMarks
  // The route's own keyboard, the one door into it a hand needs (#1, #2).
  openHand(card: VisibleComponentState, marked: readonly string[]): void
  // Where the way out (#31) leads once the seat has been given up.
  onLeft(): void
}

export function PlayerSurface({ client, view, activity, seat, name, sessionId, faces, version, marks, openHand, onLeft }: PlayerSurfaceProps) {
  const t = useT()
  const [inspect, setInspect] = useState<VisibleComponentState | null>(null)
  const [lifted, setLifted] = useState<VisibleComponentState | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  // Which target the table said no to, and why.
  const refusal = useRefusal('phone')
  const [refusedZone, setRefusedZone] = useState<string | null>(null)
  // The overview's own answer (#79): a draw the table refuses is said at the pile that was
  // pressed, and never in the sheet, which is a different press.
  const drawn = useRefusal('phone')
  const [refusedPile, setRefusedPile] = useState<string | null>(null)
  const [toast, setToast] = useToast()

  const hand = view.components.filter((c) => c.zone === `hand:${seat}`)
  // A lifted card is played alone unless it is one of the selected hand cards (K3).
  const toPlay = lifted ? (marks.selected.has(lifted.id) ? hand.filter((c) => marks.selected.has(c.id)) : [lifted]) : []

  // A play the table refuses leaves the sheet open with the answer beside the button that was
  // pressed: the cards stay in the hand and nothing is quietly lost.
  const play = (zone: string, at: 'top' | 'bottom') => {
    setRefusedZone(zone)
    void refusal.watch(client.send(...playIntents(view, toPlay, zone, undefined, at))).then((result) => {
      if (!result.ok) return
      setRefusedZone(null)
      setLifted(null)
      marks.clear()
    })
  }
  // The top card of a pile into this hand: the felt's ring already offers exactly this on any
  // pile (K14), and the phone offers it on the same terms.
  const draw = (zone: string) => {
    setRefusedPile(zone)
    void drawn.watch(client.send({ v: 'split', pile: zone, at: 1, to: `hand:${seat}` })).then((result) => {
      if (result.ok) setRefusedPile(null)
    })
  }

  return (
    <>
      <header>
        <strong>{name}</strong>
        <span>{t(hand.length === 1 ? 'play.cards.one' : 'play.cards.other', { n: hand.length })}</span>
        <SessionButtons client={client} view={view} sheet={sheet} onSheet={setSheet} />
        {/* The rules this table plays by (B7), one press away beside the session's own buttons. */}
        <RuleDrawer http={faces} sessionId={sessionId} placement="phone" />
      </header>
      <CountersRow view={view} onSet={(c, value) => void client.send({ v: 'setCounter', component: c.id, value })} />
      <TableSummary view={view} activity={activity} onDraw={draw} refusal={drawn} refusedZone={refusedPile} />
      {/* A card in front of you opens the same inspection a hand card does (#78); the verbs that
          used to sit under it in the strip are in there, where a word has room to be one. */}
      <MineStrip view={view} faces={faces} onOpen={setInspect} />
      <HandStrip view={view} selected={marks.selected} faces={faces} onTap={setInspect} onHold={marks.toggle} onLift={setLifted} onOpen={(c) => openHand(c, [...marks.selected])} />
      {/* The hint names what a finger can do to a card, so it waits for a card to exist (UX-16).
          An empty hand says its own thing in the strip above instead. */}
      {hand.length > 0 && (
        <p className="byd-hint">
          {marks.selected.size > 0
            ? t(marks.selected.size === 1 ? 'player.hint.selected.one' : 'player.hint.selected.other', { n: marks.selected.size })
            : t('player.hint')}
        </p>
      )}
      {/* The card held up. A card that lies in front of you carries its verbs here, and a verb
          puts the card down as it goes: what it did is read off the strip behind it. */}
      {inspect && (
        <HeldCard
          card={inspect}
          faces={faces}
          onClose={() => setInspect(null)}
          actions={
            <MineActions
              view={view}
              card={inspect}
              onFlip={(c) => {
                setInspect(null)
                void client.send({ v: 'flip', component: c.id, face: c.face === 'front' ? 'back' : 'front' })
              }}
              onTake={(c) => {
                setInspect(null)
                void client.send({ v: 'move', component: c.id, to: `hand:${seat}` })
              }}
              onPlay={(c) => {
                setInspect(null)
                setLifted(c)
              }}
            />
          }
        />
      )}
      {lifted && (
        <PlaySheet
          view={view}
          count={toPlay.length}
          label={lifted.cardRef ?? ''}
          onPlay={play}
          onClose={() => {
            refusal.clear()
            setRefusedZone(null)
            setLifted(null)
          }}
          refusal={refusal}
          refusedZone={refusedZone}
        />
      )}
      <SessionOverlays client={client} view={view} seat={seat} sheet={sheet} onSheet={setSheet} onLeft={onLeft} toast={toast} onToast={setToast} version={version} />
    </>
  )
}
