import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import type { RefusalHandle } from '../status/Refusal.js'
import { useT } from '../i18n/index.js'
import { cardName } from '../table/keyboard.js'
import { targetsOf, type Placement } from './PlaySheet.js'

// Every destination belongs to the setup. The full address sheet remains available for zones
// without explicit shortcuts and for the floor; no role is inferred from an id or a label.
export function HandActions({ view, cards, pending, onRead, onPlay, onMore, refusal, refusedZone }: {
  view: Snapshot
  cards: VisibleComponentState[]
  pending: boolean
  refusal?: RefusalHandle | undefined
  refusedZone?: string | null
  onRead(card: VisibleComponentState): void
  onPlay(zone: string, at: Placement): void
  onMore(card: VisibleComponentState): void
}) {
  const t = useT()
  const first = cards[0]
  const targets = handTargets(view, t)
  return (
    <section className="byd-hand-actions" aria-label={t('player.hand.actions')}>
      <p>{first ? t('player.hand.chosen', { name: cards.length === 1 ? cardName(first, t) : t('play.cards.other', { n: cards.length }) }) : t('player.hand.none')}</p>
      <button type="button" disabled={!first || pending} onClick={() => first && onRead(first)}>{t('player.hand.read')}</button>
      <div className="byd-hand-targets">
        {targets.map(target => (
          <button
            type="button"
            key={target.id}
            // The zone this button plays into, said in markup as every other surface says it
            // (`data-zone` on the felt, `data-zone-actions` in the editor). Without it the only
            // way to name a target is the label, and a label is a translation: a test that
            // reaches for "Kasta" is a test that fails the day the reader speaks English (A4).
            data-zone={target.id}
            {...(refusedZone === target.id ? refusal?.control : {})}
            disabled={!first || pending}
            onClick={() => onPlay(target.id, target.at)}
          >
            {target.label}
          </button>
        ))}
        <button type="button" disabled={!first || pending} onClick={() => first && onMore(first)}>{t('player.mine.play')}</button>
      </div>
    </section>
  )
}

// The places a card in the hand is played to in one press: the setup's own shortcuts, the areas
// first. One list, read by the actions under the hand and by the bar at the foot.
export function handTargets(view: Snapshot, t: ReturnType<typeof useT>) {
  return targetsOf(view, t)
    .filter((target) => view.zones.find((z) => z.id === target.id)?.shortcut)
    .sort((a, b) => Number(b.kind === 'area') - Number(a.kind === 'area'))
}

// The chosen card's first place and «Spela…», in the bar at the foot of the phone (#484 fynd 11,
// beslut B, prototyp 28). At 320 × 568 the actions under the hand stood 219 px below the screen's
// edge; the bar #483 put there for «Regler» is always in reach, so it carries the one press that
// plays and the way to every other place. Nothing when no card is chosen.
export function FootPlay({ view, cards, pending, onPlay, onMore, refusal, refusedZone }: {
  view: Snapshot
  cards: VisibleComponentState[]
  pending: boolean
  refusal?: RefusalHandle | undefined
  refusedZone?: string | null
  onPlay(zone: string, at: Placement): void
  onMore(card: VisibleComponentState): void
}) {
  const t = useT()
  const first = cards[0]
  const target = handTargets(view, t)[0]
  if (!first) return null
  return (
    <>
      {target && (
        <button type="button" className="byd-foot-play" data-zone={target.id} {...(refusedZone === target.id ? refusal?.control : {})} disabled={pending} onClick={() => onPlay(target.id, target.at)}>
          {target.label}
        </button>
      )}
      <button type="button" className="byd-foot-more" disabled={pending} onClick={() => onMore(first)}>
        {t('player.mine.play')}
      </button>
    </>
  )
}

