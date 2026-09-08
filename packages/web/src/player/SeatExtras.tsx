import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import { hue } from '../table/hue.js'
import { Texture } from '../table/Texture.js'
import { COUNTER_TYPE } from './PlaySheet.js'
import { useT } from '../i18n/index.js'

// What a seat owns beside its hand (C4, prototype A): its counters as a row of pills under the
// head, and the cards in front of it as a smaller strip above the hand.

// The seat's own counters: components of the counter type in a zone the seat owns.
export function countersOf(view: Snapshot): VisibleComponentState[] {
  const own = new Set(view.zones.filter((z) => z.owner === view.seat).map((z) => z.id))
  return view.components.filter((c) => c.type.id === COUNTER_TYPE && own.has(c.zone))
}
// The cards in the seat's own areas: zones it owns that are areas, and hold cards.
export function inFrontOf(view: Snapshot): VisibleComponentState[] {
  const own = new Set(view.zones.filter((z) => z.owner === view.seat && z.kind === 'area').map((z) => z.id))
  return view.components.filter((c) => c.type.id !== COUNTER_TYPE && own.has(c.zone))
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

// The cards in front of you, each with what you can do to it: turn it, take it up, play it on.
export type MineStripProps = { view: Snapshot; faces?: string | undefined; onFlip(c: VisibleComponentState): void; onTake(c: VisibleComponentState): void; onPlay(c: VisibleComponentState): void }
export function MineStrip({ view, faces, onFlip, onTake, onPlay }: MineStripProps) {
  const t = useT()
  const mine = inFrontOf(view)
  const hasArea = view.zones.some((z) => z.owner === view.seat && z.kind === 'area' && !view.components.some((c) => c.zone === z.id && c.type.id === COUNTER_TYPE))
  if (!hasArea && mine.length === 0) return null
  return (
    <section className="byd-mine" data-mine>
      <h2>{t('player.mine.title', { n: mine.length })}</h2>
      <div className="byd-mine-strip">
        {mine.map((c) => {
          const up = c.cardRef !== null
          return (
            <div key={c.id} className="byd-mine-card" data-mine-card={c.id} data-face={up ? 'front' : 'back'} style={up ? { ['--hue' as string]: hue(c.cardRef ?? '') } : undefined}>
              <Texture faces={faces} c={c} />
              <strong>{c.cardRef ?? ''}</strong>
              <div className="byd-mine-actions">
                <button type="button" data-act="flip" onClick={() => onFlip(c)}>
                  {up ? t('player.mine.flip.down') : t('player.mine.flip.up')}
                </button>
                <button type="button" data-act="take" onClick={() => onTake(c)}>
                  {t('player.mine.take')}
                </button>
                <button type="button" data-act="play" onClick={() => onPlay(c)}>
                  {t('player.mine.play')}
                </button>
              </div>
            </div>
          )
        })}
        {mine.length === 0 && <p className="byd-mine-empty">{t('player.mine.empty')}</p>}
      </div>
    </section>
  )
}
