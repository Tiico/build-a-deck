import type { Snapshot, VisibleComponentState } from '@byd/protocol'
import type { RefusalHandle } from '../status/Refusal.js'
import { useT } from '../i18n/index.js'
import { cardName } from '../table/keyboard.js'
import { targetsOf, type Placement } from './PlaySheet.js'
import { ArrowGlyph } from '../glyphs.js'

// The places a card in the hand is played to in one press: the setup's own shortcuts, the areas
// first. Every destination belongs to the setup: no role is inferred from an id or a label (#79),
// and a zone without a shortcut is reached through «Spela…», which offers every place there is.
export function handTargets(view: Snapshot, t: ReturnType<typeof useT>) {
  return targetsOf(view, t)
    .filter((target) => view.zones.find((z) => z.id === target.id)?.shortcut)
    .sort((a, b) => Number(b.kind === 'area') - Number(a.kind === 'area'))
}

// The bar that grows above the tabs while cards in the hand are marked (#1147, beställarens val B),
// and the one place on the phone a hand card's verbs stand: what is marked, a way to read it large
// and a way to let go of it, then the setup's first two places and «Spela…» for every other one.
// Nothing at all while nothing is marked — the hand's tab is the cards and nothing else.
export function HandBar({ view, cards, pending, onPlay, onMore, onRead, onClear, refusal, refusedZone, down = false }: {
  view: Snapshot
  cards: VisibleComponentState[]
  // The marked cards are turned over in the hand and go face down wherever they go (#1133): the
  // bar says so on every press, so nobody plays a card face up who turned it down.
  down?: boolean
  pending: boolean
  refusal?: RefusalHandle | undefined
  refusedZone?: string | null
  onPlay(zone: string, at: Placement): void
  onMore(card: VisibleComponentState): void
  onRead(card: VisibleComponentState): void
  onClear(): void
}) {
  const t = useT()
  const first = cards[0]
  if (!first) return null
  const one = cards.length === 1
  const [main, next] = handTargets(view, t)
  const place = (target: NonNullable<typeof main>, primary: boolean) => (
    <button
      type="button"
      key={target.id}
      // The zone this button plays into, said in markup as every other surface says it
      // (`data-zone` on the felt, `data-zone-actions` in the editor). Without it the only way to
      // name a target is the label, and a label is a translation (A4).
      data-zone={target.id}
      className={primary ? 'byd-bar-main' : undefined}
      {...(refusedZone === target.id ? refusal?.control : {})}
      disabled={pending}
      onClick={() => onPlay(target.id, target.at)}
    >
      {down ? t('player.hand.down', { label: target.label }) : target.label}
    </button>
  )
  const named = one ? cardName(first, t) : t('player.hand.marked', { n: cards.length })
  return (
    <section className="byd-hand-bar" data-hand-bar aria-label={t('player.hand.actions')}>
      <p>
        <strong>{down ? t('player.hand.chosen.down', { name: named }) : named}</strong>
        {one && (
          <button type="button" onClick={() => onRead(first)}>
            {t('player.hand.read')}
          </button>
        )}
        <button type="button" onClick={onClear}>
          {t('player.hand.clear')}
        </button>
      </p>
      <div className="byd-bar-plays">
        {main && place(main, true)}
        {next && place(next, false)}
        <button type="button" className={main ? undefined : 'byd-bar-main'} disabled={pending} onClick={() => onMore(first)}>
          {t('player.mine.play')}
        </button>
      </div>
    </section>
  )
}

// One card's first place and «Spela…», under a hand card held up to be read: the same two the bar
// leads with, so reading a card large never takes the way to play it away.
export function CardPlays({ view, card, pending, onPlay, onMore, down = false }: {
  view: Snapshot
  card: VisibleComponentState
  // Played face down, because the card is turned over in the hand (#1133): the one press says so.
  down?: boolean
  pending: boolean
  onPlay(zone: string, at: Placement): void
  onMore(card: VisibleComponentState): void
}) {
  const t = useT()
  const target = handTargets(view, t)[0]
  return (
    <>
      {target && (
        <button type="button" className="byd-bar-main" data-zone={target.id} disabled={pending} onClick={() => onPlay(target.id, target.at)}>
          {down ? t('player.hand.down', { label: target.label }) : target.label}
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => onMore(card)}>
        {t('player.mine.play')}
      </button>
    </>
  )
}

// The hand's order without a drag (#552, beslut A; WCAG 2.5.7): what Alt and an arrow do on the
// grid (K4). At an end the button stays where it is and says it can go no further, so the focus
// that carried the card there is not dropped to the page (`aria-disabled`).
export function HandOrder({ at, of, onStep }: { at: number; of: number; onStep(by: -1 | 1): void }) {
  const t = useT()
  if (of < 2) return null
  return (
    <div className="byd-hand-order">
      <button type="button" aria-disabled={at === 0 ? true : undefined} onClick={() => at > 0 && onStep(-1)}>
        <ArrowGlyph to="left" /> {t('player.hand.left')}
      </button>
      <button type="button" aria-disabled={at === of - 1 ? true : undefined} onClick={() => at < of - 1 && onStep(1)}>
        {t('player.hand.right')} <ArrowGlyph to="right" />
      </button>
    </div>
  )
}
