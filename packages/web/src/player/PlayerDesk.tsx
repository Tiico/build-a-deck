import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Activity, Snapshot, VisibleComponentState } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { HandFace, TURNED_GROUND } from './HandFace.js'
import { CountersRow } from './SeatExtras.js'
import { DicePill, diceOf } from './Dice.js'
import { TurnBadge } from './TurnBadge.js'
import { ExitButton, FlagButton, UndoButton, type RaiseSheet } from './SessionOverlays.js'
import { overviewOf, type Placement } from './PlaySheet.js'
import { emptyHandText } from './HandGrid.js'
import { LastMove } from '../online/LastMove.js'
import { useHandGestures } from '../online/handGestures.js'
import { FAN_MIN_PX } from '../online/fan.js'
import { RuleDrawer } from '../rules/RuleDrawer.js'
import { Help } from '../editor/HelpDrawer.js'
import { Texture } from '../table/Texture.js'
import { hue } from '../table/hue.js'
import { cardName, cardWord, floorName } from '../table/keyboard.js'
import { isPiece } from '../components.js'
import { seatColor } from '../table/seatColor.js'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'
import { useT, type T } from '../i18n/index.js'
import type { TurnedHand } from './turned.js'
import './desk.css'

// `/play` in a wide window (#1310, beställarens beslut A i #1308): a computer at a table around a
// TV. The phone's four tabs (C4, #1147) put a 580 px column in the middle of the screen and what
// lies in front of the seat behind a tab, on a screen that holds all of it; so here nothing is
// behind anything. The head carries who, the counters, whose turn it is, where the table is and
// what just happened there, Ångra, and what «Mer» holds on the phone. Under it, the places a card
// of this hand can go, as targets. Along the foot, the hand in full size.
//
// The mouse does what it does in `/online`'s hand (K11, reviderat 2026-10-25, #1291), from the same
// gestures (`useHandGestures`): resting reads, a click turns, a drag onto a target plays. The hand
// opens no panel with the mouse. The keyboard keeps Space and F to turn and Enter for the address
// panel (K16), and a finger keeps its press that reads and then asks.
//
// The window this is drawn in is the one `/online` draws a board in (`player/desk.ts`). Its sheet is
// fetched with it and not in the first frame's, which has no room to spare (felt-font.spec.ts).
export type PlayerDeskProps = {
  client: TableClient
  view: Snapshot
  activity: readonly Activity[]
  seat: string
  name: string
  sessionId: string
  faces: string
  turnedHand: TurnedHand
  // The keyboard's address panel, which Enter on a hand card opens (#1, K16).
  openHand(card: VisibleComponentState): void
  // A pile's top card into this hand (#79), and the pile's own answer.
  onDraw(zone: string): void
  drawn: RefusalHandle
  refusedPile: string | null
  // A hand card let go over a target, and the target's own answer.
  onDrop(card: VisibleComponentState, zone: string, at: Placement): void
  dropped: RefusalHandle
  refusedZone: string | null
  // A card on a target held up to be read, with the verbs it has there (#507, #483).
  onRead(card: VisibleComponentState, row: 'mine' | { zone: string }): void
  raiseHead: RaiseSheet
  raiseMore: RaiseSheet
  onRoll(): void
  rolling: boolean
  // Out of reach while a card is held up or another seat's rewind is asked (#483, #715).
  behind: { inert?: boolean }
}

export function PlayerDesk(props: PlayerDeskProps) {
  const { client, view, activity, seat, name, sessionId, faces, turnedHand, openHand, raiseHead, raiseMore, behind } = props
  const t = useT()
  const playing = !view.ended && !view.rewind
  // Drawn as the grid draws it, from the bottom up (#415): the card just drawn is the last.
  const hand = view.components.filter((c) => c.zone === `hand:${seat}`).reverse()
  const groups = deskTargets(view, t)
  const [aimed, setAimed] = useState<string | null>(null)
  const targets = useRef<HTMLElement>(null)
  const rows = useStackRows(targets)
  const atOf = (zone: string): Placement => [...groups.lead, ...groups.mine, ...groups.piles, ...groups.rest].find((z) => z.id === zone)?.at ?? 'top'
  const tile = (z: DeskTarget) => <Target key={z.id} z={z} {...props} aimed={aimed === z.id} t={t} />
  return (
    <div className="byd-desk" style={{ ['--seat' as string]: seatColor(Math.max(0, view.seats.findIndex((s) => s.id === seat))) }}>
      <header className="byd-desk-head" {...behind}>
        <h1 className="byd-offscreen">{t('desk.heading')}</h1>
        <span className="byd-player-who byd-desk-who">
          <strong>{name}</strong>
          <span>{t(hand.length === 1 ? 'play.cards.one' : 'play.cards.other', { n: hand.length })}</span>
        </span>
        <CountersRow
          view={view}
          onSet={(c, value) => void client.send({ v: 'setCounter', component: c.id, value })}
          extra={diceOf(view).length > 0 ? <DicePill view={view} open={props.rolling} onOpen={props.onRoll} /> : undefined}
        />
        <TurnBadge view={view} seat={seat} onGive={(next) => void client.send({ v: 'turn.give', seat: next })} />
        <div className="byd-desk-where">
          <span>{t('desk.where')}</span>
          <LastMove view={view} activity={activity} seat={seat} />
        </div>
        <div className="byd-desk-tools">
          <UndoButton client={client} view={view} raise={raiseHead} words />
          <Help topic={t('play.help.hand.topic')}>
            <p>{t('desk.help.read')}</p>
            <p>{t('desk.help.play')}</p>
            <p>{t('play.help.hand.hidden')}</p>
          </Help>
          {playing && <RuleDrawer http={faces} sessionId={sessionId} placement="tv" live={view} />}
          <FlagButton view={view} raise={raiseMore} words />
          <ExitButton view={view} raise={raiseMore} words />
        </div>
      </header>
      <main className="byd-desk-targets" ref={targets} {...behind}>
        {groups.lead.map(tile)}
        {groups.mine.length > 0 && <div className="byd-desk-mine">{groups.mine.map(tile)}</div>}
        {groups.piles.length > 0 && <div className="byd-desk-stack" data-stack="piles" style={stackStyle(groups.piles.length, rows)}>{groups.piles.map(tile)}</div>}
        {groups.rest.length > 0 && <div className="byd-desk-stack" data-stack="rest" style={stackStyle(groups.rest.length, rows)}>{groups.rest.map(tile)}</div>}
      </main>
      <HandRow
        view={view}
        cards={hand}
        faces={faces}
        locked={!playing}
        turnedHand={turnedHand}
        onOpen={openHand}
        onAim={setAimed}
        onPlay={(card, zone) => {
          if (playing) props.onDrop(card, zone, atOf(zone))
        }}
        behind={behind}
        t={t}
      />
    </div>
  )
}

// The places a card of this hand can be played to, in four groups the page lays out left to right
// (prototype A): the first pile; what lies in front of the seat, which is where most cards go (C4's
// green button); the other piles; and the rest of the table, another seat's areas among it, with
// the floor last as the table itself. The tiles are the overview's (`overviewOf`, L48): every zone
// this reader may look into that is not a hand, a counters strip or the floor.
//
// A pile is never guessed at by its name or id (C4, #79). The one that leads is the pile this
// seat's hand returns to (`returnTo`), which the designer set and which is the deck at the wizard's
// table; a setup whose hand returns nowhere leads with its first pile. Another seat's area is a target because
// the beställare's decision names it one (#1308) and because the felt already lets a card be dropped
// there (#65); the phone's sheet still does not offer it (C4).
export type DeskTarget = { id: string; name: string; at: Placement; kind: 'pile' | 'area'; count: number; mine: boolean }
export function deskTargets(view: Snapshot, t: T): { lead: DeskTarget[]; mine: DeskTarget[]; piles: DeskTarget[]; rest: DeskTarget[] } {
  const owner = new Map(view.zones.map((z) => [z.id, z.owner]))
  const tiles: DeskTarget[] = overviewOf(view).flatMap((z) => (z.kind === 'hand' ? [] : [{ id: z.id, name: z.name, at: z.at, kind: z.kind, count: z.count, mine: owner.get(z.id) === view.seat }]))
  const back = view.zones.find((z) => z.kind === 'hand' && z.owner === view.seat)?.returnTo
  const all = tiles.filter((z) => z.kind === 'pile')
  const first = all.find((z) => z.id === back) ?? all[0]
  const piles = first ? [first, ...all.filter((z) => z !== first)] : []
  const floor: DeskTarget = { id: view.floor, name: floorName(view, t), at: 'top', kind: 'area', count: view.components.filter((c) => c.zone === view.floor && !isPiece(c)).length, mine: false }
  return {
    lead: piles.slice(0, 1),
    mine: tiles.filter((z) => z.kind === 'area' && z.mine),
    piles: piles.slice(1),
    rest: [...tiles.filter((z) => z.kind === 'area' && !z.mine), floor],
  }
}

// How many targets a column of them holds: as many as the row's height has room for at a target's
// floor, `STACK_FLOOR_PX`. A column holding more opens a second one beside it, so every target is
// on the screen at once (measured with eight seats and four piles, `desk-density.spec.ts`). Worked
// out from the row's own height rather than left to the browser, because a grid that flows into
// columns cannot say how wide it is before it knows how tall.
const STACK_FLOOR_PX = 96
const STACK_GAP_PX = 14
const TARGETS_PAD_PX = 16
function useStackRows(ref: { current: HTMLElement | null }): number {
  const [rows, setRows] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setRows(Math.max(1, Math.floor((el.clientHeight - 2 * TARGETS_PAD_PX + STACK_GAP_PX) / (STACK_FLOOR_PX + STACK_GAP_PX))))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return rows
}
function stackStyle(n: number, rows: number): CSSProperties {
  // As few columns as the height allows, and the targets shared evenly between them: four piles in
  // a column that holds three are two and two, not three and one.
  const across = Math.ceil(n / Math.max(1, Math.min(n, rows)))
  return { gridTemplateRows: `repeat(${Math.ceil(n / across)}, minmax(0, 1fr))`, gridTemplateColumns: `repeat(${across}, var(--byd-desk-stack-col))` }
}

type TargetProps = PlayerDeskProps & { z: DeskTarget; aimed: boolean; t: T }

// One target: its name and count, what lies in it, and the line that says a card may be dragged
// there. The whole tile is where a card is let go (`data-drop-zone`); what is pressed inside it is
// a pile's draw (#79) or a card held up to be read.
function Target({ z, aimed, t, view, faces, onDraw, drawn, refusedPile, dropped, refusedZone, onRead }: TargetProps) {
  const cards = view.components.filter((c) => c.zone === z.id && !isPiece(c))
  const refused = refusedZone === z.id && dropped.notice !== null
  return (
    <section className="byd-desk-target" data-kind={z.kind} data-drop-zone={z.id} data-aim={aimed ? '' : undefined} aria-label={z.name}>
      <header>
        <h2>{z.name}</h2>
        <span>{t(z.count === 1 ? 'play.cards.one' : 'play.cards.other', { n: z.count })}</span>
      </header>
      {z.kind === 'pile' ? (
        <div className="byd-desk-pile">
          {z.count > 0 && view.seat !== null ? (
            <button
              type="button"
              data-zone-draw={z.id}
              aria-label={`${z.name}, ${t(z.count === 1 ? 'play.cards.one' : 'play.cards.other', { n: z.count })}, ${t('kbd.verb.toHand')}`}
              className={refusedPile === z.id ? 'byd-status-refused-control' : undefined}
              {...(refusedPile === z.id ? drawn.control : {})}
              onClick={() => onDraw(z.id)}
            >
              <PileTop top={cards[0]} faces={faces} />
              <em>{t('kbd.verb.toHand')}</em>
            </button>
          ) : (
            <span className="byd-desk-empty" aria-hidden="true" />
          )}
          {refusedPile === z.id && <Refusal handle={drawn} />}
        </div>
      ) : (
        <div className="byd-desk-cards">
          {cards.map((c) => (
            <button key={c.id} type="button" className="byd-desk-card-small" data-area-card={c.id} aria-label={cardName(c, t)} style={{ ['--hue' as string]: hue(c.cardRef ?? '') }} onClick={() => onRead(c, z.mine ? 'mine' : { zone: z.id })}>
              <Texture faces={faces} c={c} />
              <strong aria-hidden="true">{cardWord(c) ?? ''}</strong>
            </button>
          ))}
        </div>
      )}
      {refused ? <Refusal handle={dropped} /> : <p className="byd-desk-hint" aria-hidden="true">{t('desk.drop')}</p>}
    </section>
  )
}

// The top of a pile, as the table shows it: its face where the pile is open and the card face up,
// and a back otherwise.
function PileTop({ top, faces }: { top: VisibleComponentState | undefined; faces: string }) {
  if (top && top.cardRef !== null) {
    return (
      <span className="byd-desk-top" style={{ ['--hue' as string]: hue(top.cardRef) }}>
        <Texture faces={faces} c={top} />
      </span>
    )
  }
  return <span className="byd-desk-top" data-back="" style={TURNED_GROUND} />
}

type HandRowProps = {
  view: Snapshot
  cards: readonly VisibleComponentState[]
  faces: string
  locked: boolean
  turnedHand: TurnedHand
  onOpen(card: VisibleComponentState): void
  onAim(zone: string | null): void
  onPlay(card: VisibleComponentState, zone: string): void
  behind: { inert?: boolean }
  t: T
}

// What lies under the pointer where a carried card would be let go: the target it is over, or
// nothing. The ghost is drawn without a pointer, so it is never what is under it.
const targetAt = (x: number, y: number): string | null => document.elementFromPoint?.(x, y)?.closest('[data-drop-zone]')?.getAttribute('data-drop-zone') ?? null

// How far one card stands from the next: the card and a gap while the row has room, closing up
// until every card fits the window, and never below a fingertip (#6), past which the row scrolls.
// Worked out here and not by the browser's shrinking, as `fan.ts` does it for the band, because an
// overlapped card's name has to know how much of it shows.
const ROW_PAD_PX = 24
function rowStyle(n: number): CSSProperties {
  return n > 1 ? { ['--byd-desk-step' as string]: `clamp(${FAN_MIN_PX}px, (100vw - ${2 * ROW_PAD_PX}px - var(--fan-card)) / ${n - 1}, var(--fan-card) + 8px)` } : {}
}

// The hand along the foot (prototype A): every card in full size side by side, overlapping when
// the row runs out of room and scrolling in its own box past a fingertip's step, never the page
// (L10). The last card is always whole.
function HandRow({ view, cards, faces, locked, turnedHand, onOpen, onAim, onPlay, behind, t }: HandRowProps) {
  const { turned } = turnedHand
  const hand = useHandGestures({
    cards,
    faces,
    locked,
    turned,
    onTurn: (c) => turnedHand.toggle(c.id),
    onOpen,
    shape: 'row',
    says: { mouse: 'desk.says.mouse', turned: 'desk.says.mouse.turned' },
    onCarry: (carried) => onAim(carried ? targetAt(carried.x, carried.y) : null),
    onPlay: (card, x, y) => {
      const zone = targetAt(x, y)
      if (zone) onPlay(card, zone)
    },
  })
  let body: ReactNode
  if (cards.length === 0) body = <p className="byd-desk-hand-empty">{emptyHandText(view, t)}</p>
  else
    body = (
      <div ref={hand.container} className="byd-desk-row" data-hand-fan role="group" aria-label={t('desk.hand', { cards: t(cards.length === 1 ? 'play.cards.one' : 'play.cards.other', { n: cards.length }) })} style={rowStyle(cards.length)}>
        {cards.map((c) => (
          <div className="byd-desk-slot" key={c.id}>
            <button className="byd-hand-face byd-desk-card" {...hand.cardProps(c)}>
              <HandFace faces={faces} c={c} turned={turned.has(c.id)} />
            </button>
          </div>
        ))}
      </div>
    )
  return (
    <div className="byd-desk-hand" data-hand-row {...behind}>
      <div className="byd-desk-hand-head">
        <span>{t('desk.hand', { cards: t(cards.length === 1 ? 'play.cards.one' : 'play.cards.other', { n: cards.length }) })}</span>
        <span>{t('desk.hint')}</span>
      </div>
      {body}
      {hand.overlays}
    </div>
  )
}
