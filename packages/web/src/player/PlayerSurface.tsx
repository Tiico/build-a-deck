import { useRef, useState } from 'react'
import type { Activity, Snapshot, VisibleComponentState } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { HeldCard } from './HeldCard.js'
import { HandActions } from './HandActions.js'
import { HandStrip } from './HandStrip.js'
import { CountersRow, MineActions, MineStrip, inFrontOf } from './SeatExtras.js'
import { PlaySheet } from './PlaySheet.js'
import { TableSummary, RecentActivity } from './TableSummary.js'
import { SessionButtons, SessionOverlays, useToast, type Sheet } from './SessionOverlays.js'
import { RuleDrawer } from '../rules/RuleDrawer.js'
import { Help } from '../editor/HelpDrawer.js'
import { playIntents } from './play.js'
import { Refusal, useRefusal } from '../status/Refusal.js'
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
  const personal = useRef<HTMLDetailsElement>(null)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [quickTarget, setQuickTarget] = useState<string | null>(null)
  const [quickSource, setQuickSource] = useState<string | null>(null)
  const quick = useRefusal('phone')
  const quickBusy = useRef(false)
  const [quickPending, setQuickPending] = useState(false)
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
  const chosen = chosenId === '' ? undefined : hand.find(c => c.id === chosenId) ?? hand[0]
  const marked = hand.filter(c => marks.selected.has(c.id))
  const chosenCards = marked.length ? marked : chosen ? [chosen] : []
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
      if (result.ok) {
        setRefusedPile(null)
        const added = client.view?.components.find(c => c.zone === `hand:${seat}` && !hand.some(before => before.id === c.id))
        if (added) { setChosenId(added.id); marks.clear() }
      }
    })
  }
  const playDirect = async (cards: VisibleComponentState[], zone: string, at: 'top' | 'bottom') => {
    const first = cards[0]
    if (quickBusy.current || !first) return
    quickBusy.current = true
    quick.clear()
    setQuickPending(true)
    setQuickTarget(zone)
    setQuickSource(first.zone === `hand:${seat}` ? 'hand' : first.id)
    try {
      const intents = zone === `hand:${seat}` ? cards.map(c => ({ v: 'move' as const, component: c.id, to: zone })) : playIntents(view, cards, zone, undefined, at)
      const result = await quick.watch(client.send(...intents))
      if (result.ok) {
        if (cards.some(c => c.zone === `hand:${seat}`) || zone === `hand:${seat}`) {
          marks.clear()
          setChosenId(null)
        }
        if (zone === `hand:${seat}`) setChosenId(first.id)
        if (view.zones.some(z => z.id === zone && z.kind === 'area' && z.owner === seat) && personal.current) personal.current.open = true
      }
    } finally {
      quickBusy.current = false
      setQuickPending(false)
    }
  }
  const toggle = (card: VisibleComponentState) => {
    if (marks.selected.size === 1 && marks.selected.has(card.id)) setChosenId('')
    marks.toggle(card)
  }

  return (
    <>
      <header>
        <strong>{name}</strong>
        <span>{t(hand.length === 1 ? 'play.cards.one' : 'play.cards.other', { n: hand.length })}</span>
        {/* The one help pattern (L32), on a narrower screen (#305). It stands in the chrome and
            not beside the heading over the hand, and that is the whole of the measurement the
            decision was made on: from up here the box hangs over the top of the felt and covers
            nothing a thumb plays with, while a sheet from the bottom lay over four cards out of
            five. The hint line under the hand says what a finger does; what it has no room for
            is behind the question mark. */}
        <Help topic={t('play.help.hand.topic')}>
          <p>{t('play.help.hand.pick')}</p>
          <p>{t('play.help.hand.play')}</p>
          <p>{t('play.help.hand.hidden')}</p>
        </Help>
        <SessionButtons client={client} view={view} sheet={sheet} onSheet={setSheet} />
        {/* The rules this table plays by (B7), one press away beside the session's own buttons.
            The living number (#226) reads this seat's own view: her own hand is a reading, the
            deck and the others' hands are counts. */}
        <RuleDrawer http={faces} sessionId={sessionId} placement="phone" live={view} />
      </header>
      <CountersRow view={view} onSet={(c, value) => void client.send({ v: 'setCounter', component: c.id, value })} />
      <main className="byd-phone-main">
        <h1>{t('player.hand.title')}</h1>
        <TableSummary view={view} activity={activity} onDraw={draw} refusal={drawn} refusedZone={refusedPile} zones="piles" history={false} />
        <HandStrip view={view} selected={new Set(chosenCards.map(c => c.id))} faces={faces} onTap={card => { setChosenId(card.id); marks.clear() }} onHold={toggle} onLift={setLifted} onOpen={(c) => openHand(c, [...marks.selected])} />
        {hand.length > 0 && <p className="byd-hint">{marks.selected.size > 0 ? t(marks.selected.size === 1 ? 'player.hint.selected.one' : 'player.hint.selected.other', { n: marks.selected.size }) : t('player.hint')}</p>}
        <HandActions refusal={quickSource === 'hand' ? quick : undefined} refusedZone={quickTarget} view={view} cards={chosenCards} pending={quickPending} onRead={setInspect} onPlay={(zone, at) => void playDirect(chosenCards, zone, at)} onMore={setLifted} />
        {quickSource === 'hand' && <Refusal handle={quick} />}
        <details ref={personal} className="byd-personal" data-personal>
          <summary>{t('player.mine.title', { n: inFrontOf(view).length })}</summary>
          <MineStrip refusal={quick} refusedCard={quickSource} refusedZone={quickTarget} onTake={card => void playDirect([card], `hand:${seat}`, 'top')} heading={false} view={view} faces={faces} onOpen={setInspect} pending={quickPending} onPlay={(card, zone, at) => void playDirect([card], zone, at)} />
          {quickSource !== 'hand' && <Refusal handle={quick} />}
        </details>
        {/* The full table, folded out when it is asked for (C4). The row above the hand is the
            piles, because the hand comes first (#156) and the piles are what a hand acts on; a
            row that grew by a tile per seat would push the hand towards the fold at eight seats.
            The whole table lives down here instead, beside the two folds that were already here,
            and it costs one closed row of height whatever the table's size.
            It is here, and not only on the felt, because the area in front of a seat is public
            since #414: the cards in front of the others are in this phone's own frames, and a
            screen that hid what its socket had been sent is the state the repo's rule about
            hidden information exists to keep out. It reads and never acts — the draw stays in the
            row above, where a thumb already knows to find it. */}
        <details className="byd-phone-table" data-phone-table><summary>{t('player.table.title')}</summary><TableSummary view={view} activity={activity} history={false} /></details>
        <details className="byd-phone-history"><summary>{t('play.latest')}</summary><RecentActivity view={view} activity={activity} /></details>
      </main>
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
