import { useId, useRef } from 'react'
import type { PlaytestCard, PlaytestFlag } from '@byd/server/doc'
import { BackTexture, Texture } from '../table/Texture.js'
import { useT, type T } from '../i18n/index.js'
import { useFocusTrap } from './focusTrap.js'
import { isMasked } from '../masked.js'

// The card a flag is about (#1142, beställarens val 2026-10-22: «1 · miniatyren i raden»), as it
// was: the texture of the version the flag was raised on, with the side up that the flagger saw.
// The server read all of it off the log (`playtestOf`), so a card the designer has rewritten since
// is still drawn here as the player had it in front of her.

// What a card is called in the editor's words: its title, or its row when it has none.
const nameOf = (card: PlaytestCard): string => card.title ?? card.cardRef ?? card.id

// The side the flagger saw. Her own hand shows her its face even where it lies face down; a card
// turned down on the felt shows her its back, and the back is the face that is not the front.
function SeenFace({ origin, card }: { origin: string; card: PlaytestCard }) {
  if (card.seen === 'front') return <Texture faces={origin} c={card} />
  const back = Object.entries(card.faces ?? {}).find(([face]) => face !== 'front')?.[1]
  return <BackTexture faces={origin} hash={back} />
}

// Where it lay, which side was up and how the game draws it now — the line under the flag.
export function cardLine(card: PlaytestCard, t: T): string {
  return [nameOf(card), ...placeOf(card, t), ...nowOf(card, t)].join(' · ')
}

function placeOf(card: PlaytestCard, t: T): string[] {
  const where = card.place.kind === 'hand' && card.place.owner !== null ? t('results.card.hand', { who: card.place.owner }) : card.place.zone
  return [where, ...(card.seen === 'back' ? [t('results.card.down')] : []), ...(card.rot !== 0 ? [t('results.card.turned', { deg: String(card.rot) })] : [])]
}

const nowOf = (card: PlaytestCard, t: T): string[] => (card.now === undefined ? [] : [t(`results.card.${card.now}` as const)])

export function FlagThumb({ origin, card, onLift }: { origin: string; card: PlaytestCard; onLift(): void }) {
  const t = useT()
  return (
    <button type="button" className="byd-results-thumb" onClick={onLift} aria-label={t('results.card.show', { title: nameOf(card) })}>
      <SeenFace origin={origin} card={card} />
    </button>
  )
}

// The card held up over the view: large, with what the flag said and when, and the front beside it
// when the flagger only saw the back. A modal window, so the keyboard stays in it until it closes
// and goes back to the thumbnail it came from.
export function LiftedCard({ origin, flag, card, version, when, onClose }: { origin: string; flag: PlaytestFlag; card: PlaytestCard; version: string; when: string; onClose(): void }) {
  const t = useT()
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  useFocusTrap(box, { onEscape: onClose })
  const who = flag.who ?? t('results.flag.table')
  return (
    <div className="byd-results-lift-ground" onClick={onClose}>
      <div ref={box} className="byd-results-lift" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} onClick={(e) => e.stopPropagation()}>
        <div className="byd-results-lift-card">
          <SeenFace origin={origin} card={card} />
        </div>
        <div className="byd-results-lift-about">
          <h3 id={`${id}-title`}>{t('results.card.lifted', { title: nameOf(card) })}</h3>
          <p className="byd-results-quiet">{t('results.card.by', { who })}</p>
          <dl>
            <dt>{t('results.card.version')}</dt>
            <dd>{version}</dd>
            <dt>{t('results.card.place')}</dt>
            <dd>{placeOf(card, t).join(' · ')}</dd>
            <dt>{t('results.card.at')}</dt>
            <dd>{when}</dd>
            {card.now !== undefined && (
              <>
                <dt>{t('results.card.now')}</dt>
                <dd data-now={card.now}>{t(`results.card.${card.now}` as const)}</dd>
              </>
            )}
          </dl>
          {card.seen === 'back' && (
            <figure className="byd-results-lift-front">
              <figcaption>{t('results.card.front')}</figcaption>
              <div className="byd-results-lift-front-card">
                <Texture faces={origin} c={card} />
              </div>
            </figure>
          )}
          {/* What she wrote, quoted; or that it is removed (#1349), never a quotation of the
              placeholder. A flag without a comment says nothing here, as the row already says so. */}
          {isMasked(flag.note) ? <p className="byd-results-quiet">{t('masked.comment')}</p> : flag.note && <p className="byd-results-said">«{flag.note}»</p>}
          <button type="button" className="byd-results-lift-close" onClick={onClose}>
            {t('results.card.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
