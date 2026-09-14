import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { cardName } from '../table/keyboard.js'
import { isCounter } from '../components.js'
import { useT } from '../i18n/index.js'

// What a seat owns beside its hand (C4, prototype A): its counters as a row of pills under the
// head, and the cards in front of it as a smaller strip above the hand.

// The seat's own counters: components of the counter type in a zone the seat owns.
export function countersOf(view: Snapshot): VisibleComponentState[] {
  const own = new Set(view.zones.filter((z) => z.owner === view.seat).map((z) => z.id))
  return view.components.filter((c) => isCounter(c) && own.has(c.zone))
}
// The cards in the seat's own areas: zones it owns that are areas, and hold cards.
export function inFrontOf(view: Snapshot): VisibleComponentState[] {
  const own = new Set(view.zones.filter((z) => z.owner === view.seat && z.kind === 'area').map((z) => z.id))
  return view.components.filter((c) => !isCounter(c) && own.has(c.zone))
}

// A counter as a pill: tap the sides to count, tap the number to type a value.
export function CountersRow({ view, onSet }: { view: Snapshot; onSet(c: VisibleComponentState, value: number): void }) {
  const t = useT()
  const counters = countersOf(view)
  if (counters.length === 0) return null
  return (
    <div className="byd-counters" data-counters>
      {counters.map((c) => (
        <div key={c.id} className="byd-counter" data-counter={c.cardRef ?? c.id}>
          <button type="button" aria-label={t('player.counter.minus', { name: c.cardRef ?? '' })} onClick={() => onSet(c, (c.counter ?? 0) - 1)}>
            −
          </button>
          <div
            onClick={() => {
              const typed = prompt(`${c.cardRef}:`, String(c.counter ?? 0))
              if (typed !== null && typed.trim() !== '' && Number.isFinite(Number(typed))) onSet(c, Math.round(Number(typed)))
            }}
          >
            <b>{c.counter ?? 0}</b>
            <span>{c.cardRef}</span>
          </div>
          <button type="button" aria-label={t('player.counter.plus', { name: c.cardRef ?? '' })} onClick={() => onSet(c, (c.counter ?? 0) + 1)}>
            +
          </button>
        </div>
      ))}
    </div>
  )
}

// The cards in front of you: a strip of faces, each one control and nothing else (#78, form C).
// A press holds the card up, exactly as a press on a hand card does, and the verbs are in the
// view that holds it up — where a verb has room to be a word rather than a 32px abbreviation,
// and where a card that is a control no longer hides its own buttons under its face.
export type MineStripProps = { view: Snapshot; faces?: string | undefined; onOpen(c: VisibleComponentState): void }
export function MineStrip({ view, faces, onOpen }: MineStripProps) {
  const t = useT()
  const mine = inFrontOf(view)
  const hasArea = view.zones.some((z) => z.owner === view.seat && z.kind === 'area' && !view.components.some((c) => c.zone === z.id && isCounter(c)))
  if (!hasArea && mine.length === 0) return null
  return (
    <section className="byd-mine" data-mine>
      <h2>{t('player.mine.title', { n: mine.length })}</h2>
      <div className="byd-mine-strip">
        {mine.map((c) => {
          const up = c.cardRef !== null
          return (
            <button
              key={c.id}
              type="button"
              className="byd-mine-card"
              data-mine-card={c.id}
              data-face={up ? 'front' : 'back'}
              aria-label={cardName(c, t)}
              style={up ? { ['--hue' as string]: hue(c.cardRef ?? '') } : undefined}
              onClick={() => onOpen(c)}
            >
              {/* The face is a box of its own, so what lies over it while it waits lies over the
                  face and not over the control. The card is a control, so it carries no way back
                  of its own: that is on the card held up (UX-37, #82). */}
              <i className="byd-mine-face">
                <Texture faces={faces} c={c} />
              </i>
              <strong aria-hidden="true">{c.cardRef ?? ''}</strong>
            </button>
          )
        })}
        {mine.length === 0 && <p className="byd-mine-empty">{t('player.mine.empty')}</p>}
      </div>
    </section>
  )
}

// What you can do to a card that lies in front of you: turn it, take it up, play it on. Rendered
// in the view that holds the card up, and only for a card that is still lying there — a hand card
// held up is looked at and nothing else. The card is read out of the view rather than taken from
// the press that opened the sheet, so the verb names the face that is on show now.
export type MineActionsProps = {
  view: Snapshot
  card: VisibleComponentState
  onFlip(c: VisibleComponentState): void
  onTake(c: VisibleComponentState): void
  onPlay(c: VisibleComponentState): void
}
export function MineActions({ view, card, onFlip, onTake, onPlay }: MineActionsProps) {
  const t = useT()
  const now = inFrontOf(view).find((c) => c.id === card.id)
  if (!now) return null
  // Which way the card lies, not whether you may know what it is: a card you played face down in
  // front of you is still yours to read, and the verb has to be the one that turns it back up.
  const up = now.face === 'front'
  // The view that holds a card up puts it down on the next touch and not on the click that
  // follows it (UX-30), so a press on a verb has to be kept out of that touch — the same trap
  // the way back beside these is written for.
  const keep = (e: ReactPointerEvent) => e.stopPropagation()
  return (
    <div className="byd-mine-actions" data-mine-actions>
      <button type="button" data-act="flip" onPointerDown={keep} onClick={() => onFlip(now)}>
        {up ? t('player.mine.flip.down') : t('player.mine.flip.up')}
      </button>
      <button type="button" data-act="take" onPointerDown={keep} onClick={() => onTake(now)}>
        {t('player.mine.take')}
      </button>
      <button type="button" data-act="play" onPointerDown={keep} onClick={() => onPlay(now)}>
        {t('player.mine.play')}
      </button>
    </div>
  )
}
