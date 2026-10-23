import { useEffect, useId, useRef, useState } from 'react'
import type { Activity, Snapshot, VisibleComponentState } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { HeldCard } from './HeldCard.js'
import { ShowForAll } from './ShowForAll.js'
import { forTheRoom } from '../table/presence.js'
import { CardPlays, HandBar, HandOrder } from './HandActions.js'
import { HandGrid } from './HandGrid.js'
import { CountersRow, MineActions, MineStrip, inFrontOf } from './SeatExtras.js'
import { isCounter } from '../components.js'
import { PlaySheet } from './PlaySheet.js'
import { standingRewind } from '../table/rewind.js'
import { cardName } from '../table/keyboard.js'
import { TableSummary, RecentActivity } from './TableSummary.js'
import { ExitButton, FlagButton, SessionOverlays, UndoButton, useSheetOpener, useToast, type Sheet } from './SessionOverlays.js'
import { RuleDrawer } from '../rules/RuleDrawer.js'
import { Help } from '../editor/HelpDrawer.js'
import { playIntents } from './play.js'
import { Refusal, useRefusal } from '../status/Refusal.js'
import { useT } from '../i18n/index.js'
import { useRoving } from '../editor/roving.js'
import type { TurnedHand } from './turned.js'

// What a player is given on a screen that cannot carry the board: the seat's own hand, the
// counters, the private zones, and the table itself as names and counts rather than as a felt. It
// is the whole of `/play`, and since C2's revision of 2026-09-16 (#99) it is also what `/online`
// shows a player holding a phone — a phone is the control, and the board is the TV in the room or
// a screen wide enough to hold it.
//
// Four tabs at the foot (#1147, beställarens val B 2026-10-22): «Handen», «Framför mig», «Bordet»
// and «Mer», and each of them is one thing. The column it replaced held all of it at once — the
// counters, the piles, a strip, six buttons, three folds and a fixed foot — and two of its verbs
// stood twice on the same screen. A hand card's verbs now stand in one place, the bar that grows
// over the tabs while cards are marked.
//
// One surface drawn by two routes, and deliberately one: "the hand on a phone is this surface
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

// The cards a thumb has marked, in the order they were marked. It lives above the surface because
// the keyboard is given `onPlayed` when it is made, and a play through the keyboard drops the
// marks like any other.
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
  // The cards turned over in the hand (#1133): the route keeps them, because its keyboard plays
  // from the hand too and has to play them face down as well.
  turnedHand: TurnedHand
  // The route's own keyboard, the one door into it a hand needs (#1, #2).
  openHand(card: VisibleComponentState, marked: readonly string[]): void
  // Where the way out (#31) leads once the seat has been given up.
  onLeft(): void
  // Played from afar with no felt in the window (`/online` on a phone, C2): the table fold says
  // where the whole table is, which a phone beside the television never needs told.
  away?: boolean | undefined
}

export function PlayerSurface({ client, view, activity, seat, name, sessionId, faces, version, marks, turnedHand, openHand, onLeft, away = false }: PlayerSurfaceProps) {
  const ids = useId()
  const t = useT()
  const [tab, setTab] = useState<Tab>('hand')
  // Out of reach while another seat's rewind is asked of this one (#483): the question covers the
  // phone and has to be answered, so nothing behind it is a Tab stop or a press.
  const asking = standingRewind(view)
  const [quickTarget, setQuickTarget] = useState<string | null>(null)
  const [quickSource, setQuickSource] = useState<string | null>(null)
  const quick = useRefusal('phone')
  const quickBusy = useRef(false)
  const [quickPending, setQuickPending] = useState(false)
  // The card held up, and the row it was lifted from (#507, beslut A): her hand, what lies in front
  // of her, or an area of the table — which is what the held card walks, and what it offers to do.
  const [held, setHeld] = useState<{ card: VisibleComponentState; row: 'hand' | 'mine' | { zone: string } } | null>(null)
  const [lifted, setLifted] = useState<VisibleComponentState | null>(null)
  // Out of reach while another seat's rewind is asked of this one (#483), and while a card is held
  // up (#715): the hand's buttons showed through the veil and read into the card's own row.
  const behind = (asking && asking.by !== seat) || held !== null ? { inert: true } : {}
  const [sheet, setSheet] = useState<Sheet>(null)
  // The head's undo and «Mer»'s flag and way out each hand the focus back to themselves.
  const raiseHead = useSheetOpener(sheet, setSheet)
  const raiseMore = useSheetOpener(sheet, setSheet)
  // Which target the table said no to, and why.
  const refusal = useRefusal('phone')
  const [refusedZone, setRefusedZone] = useState<string | null>(null)
  // The pile's own answer (#79): a draw the table refuses is said at the pile that was pressed, and
  // never in the sheet, which is a different press.
  const drawn = useRefusal('phone')
  const [refusedPile, setRefusedPile] = useState<string | null>(null)
  const [toast, setToast] = useToast()

  const hand = view.components.filter((c) => c.zone === `hand:${seat}`)
  // The marked cards in the order they were marked, which is the order they are played in.
  const marked = [...marks.selected].flatMap((id) => hand.filter((c) => c.id === id))
  // A lifted card is played alone unless it is one of the marked hand cards (K3).
  const toPlay = lifted ? (marks.selected.has(lifted.id) ? marked : [lifted]) : []
  const { turned } = turnedHand
  const allDown = (cards: readonly VisibleComponentState[]) => cards.length > 0 && cards.every((c) => turned.has(c.id))

  // A card carried to another place in the hand (K4; #483, beslut A efter prototyp 33). The grid
  // draws the hand bottom-up (#415), so a place in the grid is counted from the other end of the
  // zone's order. It is `move` with `index` inside the same hand: no new verb.
  const reorder = (card: VisibleComponentState, position: number) => {
    const n = view.components.filter((c) => c.zone === `hand:${seat}`).length
    void client.send({ v: 'move', component: card.id, to: `hand:${seat}`, index: n - 1 - position })
  }
  const play = (zone: string, at: 'top' | 'bottom') => {
    setRefusedZone(zone)
    void refusal.watch(client.send(...playIntents(view, toPlay, zone, undefined, at, turned))).then((result) => {
      if (!result.ok) return
      setRefusedZone(null)
      setLifted(null)
      marks.clear()
    })
  }
  // The top card of a pile into this hand: the felt's ring already offers exactly this on any
  // pile (K14), and the phone offers it on the same terms. The card drawn is the one marked, so
  // the bar offers to play it straight away.
  const draw = (zone: string) => {
    setRefusedPile(zone)
    void drawn.watch(client.send({ v: 'split', pile: zone, at: 1, to: `hand:${seat}` })).then((result) => {
      if (result.ok) {
        setRefusedPile(null)
        const added = client.view?.components.find(c => c.zone === `hand:${seat}` && !hand.some(before => before.id === c.id))
        marks.clear()
        if (added) marks.toggle(added)
      }
    })
  }
  // A card played from the hand takes the control that played it along — the bar goes once
  // nothing is marked — and focus fell to BODY, so the next Tab began at the header (#559 P-3,
  // K16: never to nothing). Once the cards have left the hand, focus that was stranded goes to the
  // grid's one tab stop.
  const regain = useRef<string[] | null>(null)
  useEffect(() => {
    const gone = regain.current
    if (!gone || gone.some(id => hand.some(c => c.id === id))) return
    regain.current = null
    const stranded = document.activeElement === null || document.activeElement === document.body
    // An emptied hand has no stop left, and the deck's tile is the one it wants next (#761).
    if (stranded) (document.querySelector<HTMLElement>('.byd-grid [data-hand-card][tabindex="0"]') ?? document.querySelector<HTMLElement>('[data-zone-draw]'))?.focus()
  }, [hand])
  const playDirect = async (cards: VisibleComponentState[], zone: string, at: 'top' | 'bottom') => {
    const first = cards[0]
    if (quickBusy.current || !first) return
    quickBusy.current = true
    quick.clear()
    setQuickPending(true)
    setQuickTarget(zone)
    setQuickSource(first.zone === `hand:${seat}` ? 'hand' : first.id)
    try {
      const intents = zone === `hand:${seat}` ? cards.map(c => ({ v: 'move' as const, component: c.id, to: zone })) : playIntents(view, cards, zone, undefined, at, turned)
      const result = await quick.watch(client.send(...intents))
      if (result.ok) {
        if (zone !== `hand:${seat}` && cards.some(c => c.zone === `hand:${seat}`)) regain.current = cards.map(c => c.id)
        if (cards.some(c => c.zone === `hand:${seat}`)) marks.clear()
        // A card taken up into the hand is the one marked there, ready for the next play.
        if (zone === `hand:${seat}`) {
          marks.clear()
          marks.toggle(first)
        }
      }
    } finally {
      quickBusy.current = false
      setQuickPending(false)
    }
  }
  // The row as it is drawn now, so a card that moved while it was held leaves the walk with it.
  const rowOf = (row: 'hand' | 'mine' | { zone: string }): VisibleComponentState[] =>
    row === 'hand' ? [...hand].reverse() : row === 'mine' ? inFrontOf(view) : view.components.filter((c) => c.zone === row.zone && !isCounter(c))
  const hold = (card: VisibleComponentState, row: 'hand' | 'mine' | { zone: string }) => setHeld({ card, row })

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'hand', label: t('player.tab.hand'), count: hand.length },
    { id: 'mine', label: t('player.tab.mine'), count: inFrontOf(view).length },
    { id: 'table', label: t('player.tab.table') },
    { id: 'more', label: t('player.tab.more') },
  ]
  // The tabs are one stop with the arrows inside, and an arrow opens the tab it lands on.
  const roving = useRoving({ ids: tabs.map((x) => x.id), selected: tab, orientation: 'horizontal', followFocus: true, onActivate: (id) => setTab(id as Tab) })
  const panel = (id: Tab) => ({ role: 'tabpanel', id: `${ids}-${id}`, 'aria-labelledby': `${ids}-tab-${id}`, hidden: tab !== id, className: 'byd-panel', 'data-panel': id })
  const playing = !view.ended && !view.rewind

  return (
    <>
      <header {...behind}>
        {/* Who is holding the phone, over how many cards: stacked, so the name has the width of the
            row that is left and gives way behind an ellipsis before the controls do (#483). */}
        <span className="byd-player-who">
          <strong>{name}</strong>
          <span>{t(hand.length === 1 ? 'play.cards.one' : 'play.cards.other', { n: hand.length })}</span>
        </span>
        <UndoButton client={client} view={view} raise={raiseHead} words />
      </header>
      <main className="byd-panels" {...behind}>
        <section {...panel('hand')}>
          {/* The piles first, because they are what fills a hand (#79), and the hand under them,
              whole. */}
          <TableSummary view={view} activity={activity} onDraw={draw} refusal={drawn} refusedZone={refusedPile} zones="piles" history={false} />
          <HandGrid view={view} selected={marks.selected} faces={faces} onToggle={marks.toggle} onOpen={(c) => openHand(c, [...marks.selected])} onReorder={reorder} turned={turned} onTurn={(c) => turnedHand.toggle(c.id)} />
        </section>
        <section {...panel('mine')}>
          <CountersRow view={view} onSet={(c, value) => void client.send({ v: 'setCounter', component: c.id, value })} />
          <MineStrip refusal={quick} refusedCard={quickSource} refusedZone={quickTarget} onTake={card => void playDirect([card], `hand:${seat}`, 'top')} heading={false} view={view} faces={faces} onOpen={(card) => hold(card, 'mine')} pending={quickPending} onPlay={(card, zone, at) => void playDirect([card], zone, at)} />
          {quickSource !== 'hand' && <Refusal handle={quick} />}
        </section>
        <section {...panel('table')}>
          {/* Played from afar with no felt (C2, #484): where the whole table is, first. */}
          {away && <p className="byd-phone-table-where">{t('online.table.where')}</p>}
          {/* Every zone this reader may look into that is not a pile: the piles stand on the
              hand's tab, where the draw is, and no tile stands in two places (#465). The area in
              front of another seat is public since #414, so it is read here — and never acted on. */}
          <TableSummary view={view} activity={activity} zones="areas" history={false} faces={faces} onRead={(_, card) => hold(card, { zone: card.zone })} />
          <h2 className="byd-panel-title">{t('play.latest')}</h2>
          <RecentActivity view={view} activity={activity} />
        </section>
        <section {...panel('more')}>
          {/* The one help pattern (L32), on a narrower screen (#305), as a line with its question
              mark. It stands here and not in the head (#1147): from the head the box hung over
              the hand's first row of cards, and here it covers nothing a thumb plays with. */}
          <p className="byd-help-row">
            <span>{t('player.more.help')}</span>
            <Help topic={t('play.help.hand.topic')}>
              <p>{t('play.help.hand.pick')}</p>
              <p>{t('play.help.hand.play')}</p>
              <p>{t('play.help.hand.hidden')}</p>
            </Help>
          </p>
          {/* The rules this table plays by (B7). The living number (#226) reads this seat's own
              view. Out of the way when the table asks something of everyone (#483). */}
          {playing && <RuleDrawer http={faces} sessionId={sessionId} placement="phone" live={view} />}
          <FlagButton view={view} raise={raiseMore} words />
          <ExitButton view={view} raise={raiseMore} words />
        </section>
      </main>
      {/* What the table just said to this seat, over the bar and the tabs (#715). */}
      {toast && <p className="byd-phone-said" role="status">{toast}</p>}
      {tab === 'hand' && (
        <div className="byd-bar" {...behind}>
          <HandBar
            view={view}
            cards={marked}
            down={allDown(marked)}
            pending={quickPending}
            refusal={quickSource === 'hand' ? quick : undefined}
            refusedZone={quickTarget}
            onPlay={(zone, at) => void playDirect(marked, zone, at)}
            onMore={setLifted}
            onRead={(card) => hold(card, 'hand')}
            onClear={marks.clear}
          />
          {quickSource === 'hand' && <Refusal handle={quick} />}
        </div>
      )}
      <div role="tablist" aria-label={t('player.tabs')} className="byd-tabs" {...behind}>
        {tabs.map((x) => {
          const item = roving.itemProps(x.id)
          return (
            <button
              key={x.id}
              type="button"
              role="tab"
              id={`${ids}-tab-${x.id}`}
              data-tab={x.id}
              aria-selected={tab === x.id}
              aria-controls={`${ids}-${x.id}`}
              tabIndex={item.tabIndex}
              ref={item.ref}
              onFocus={item.onFocus}
              onKeyDown={item.onKeyDown}
              onClick={() => setTab(x.id)}
            >
              {x.label}
              {x.count !== undefined && <span className="byd-tab-count">{x.count}</span>}
            </button>
          )
        })}
      </div>
      {/* The card held up. A card that lies in front of you carries its verbs here, and a verb
          puts the card down as it goes: what it did is read off the row behind it. */}
      {held && (() => {
        const row = rowOf(held.row)
        // The card as it lies now, so a flip seen while it is held shows the face it has.
        const card = row.find((c) => c.id === held.card.id) ?? held.card
        const put = () => setHeld(null)
        // A card the table sees face up can be held up on the room's screen too (#518).
        const share = forTheRoom(view, card) ? <ShowForAll card={card} client={client} /> : null
        const at = row.findIndex((c) => c.id === card.id)
        return (
          <HeldCard
            card={card}
            faces={faces}
            row={row}
            onStep={(next) => hold(next, held.row)}
            onClose={put}
            returnTo={(c) => document.querySelector<HTMLElement>(held.row === 'hand' ? `[data-hand-card="${CSS.escape(c.id)}"]` : `[data-area-card="${CSS.escape(c.id)}"], [data-mine-card="${CSS.escape(c.id)}"]`)}
            actions={
              held.row === 'hand' ? (
                // The hand's own way to play the card read, and its place in the hand: what the bar
                // offers, and the order the grid keeps (#552). A verb puts the card down as it goes.
                // Turning the card over is the one that does not (#1133): it is still in the hand,
                // and the press beside it now says how it will land.
                <>
                  <button type="button" className="byd-show-all" data-turn={card.id} onClick={() => turnedHand.toggle(card.id)}>
                    {t(turned.has(card.id) ? 'player.hand.unturn' : 'player.hand.turn')}
                  </button>
                  <CardPlays
                    view={view}
                    card={card}
                    down={turned.has(card.id)}
                    pending={quickPending}
                    onPlay={(zone, where) => { put(); void playDirect([card], zone, where) }}
                    onMore={(c) => { put(); setLifted(c) }}
                  />
                  {at >= 0 && <HandOrder at={at} of={row.length} onStep={(by) => reorder(card, at + by)} />}
                </>
              ) : held.row === 'mine' ? (
                <>
                <MineActions
                  view={view}
                  card={card}
                  onFlip={(c) => {
                    put()
                    // A card of your own turned face down in front of you is still yours to know (#483,
                    // beslut A efter prototyp 31): the flip peeks as it turns, in the same envelope, so
                    // the owner is told which card it is and the rest of the room is told what it was
                    // told before — that a card lies there.
                    void (c.face === 'front'
                      ? client.send({ v: 'flip', component: c.id, face: 'back' }, { v: 'peek', components: [c.id] })
                      : client.send({ v: 'flip', component: c.id, face: 'front' }))
                  }}
                  onTake={(c) => {
                    put()
                    void client.send({ v: 'move', component: c.id, to: `hand:${seat}` })
                  }}
                  onPlay={(c) => {
                    put()
                    setLifted(c)
                  }}
                />
                {share}
                </>
              ) : (share ?? undefined)
            }
          />
        )
      })()}
      {lifted && (
        <PlaySheet
          view={view}
          count={toPlay.length}
          // The card by the name the grid calls it, never by its id (#483).
          label={cardName(lifted, t)}
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
      <SessionOverlays client={client} view={view} seat={seat} sheet={sheet} onSheet={setSheet} onLeft={onLeft} toast={null} onToast={setToast} version={version} />
    </>
  )
}

type Tab = 'hand' | 'mine' | 'table' | 'more'
