import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n/index.js'
import type { VisibleComponentState } from '@byd/protocol'
import { Texture } from '../table/Texture.js'
import { hue } from '../table/hue.js'
import { cardName, cardWord } from '../table/keyboard.js'
import { useSmallestPt } from '../table/smallest.js'
import { readingWidth } from '../legibility.js'

// How far a thumb goes across the card before it is a step to the next one and not a tap.
const SWIPE_PX = 40

// A card held up large after a tap (K4). It is put down on the next touch, not on click: a tap is
// a pointerup and then a click, and the click lands on what the pointerup just opened (UX-30).
//
// This is the phone's one big, quiet surface, so it is where a lost face offers its way back
// (#10): the card in the strip is a control and cannot hold one (UX-37, #82). A press on that
// way back is not the touch that puts the card down; the texture keeps it to itself.
//
// It is also where a card carries its verbs (#78, #507): `actions` is the row under the card —
// the hand's way to play it, or what a card lying in front of you can be made to do, or nothing
// for a card that is only looked at. Whatever goes in there keeps its own press.
//
// And it is the reader for the row the card was lifted from (#507, beslut A): one tap reads a card
// at the floor's size (K26), and the rest of the row is a swipe or an arrow away rather than three
// presses each. The card itself is still put down by a tap, but on its own click and not at the
// touch that begins it — a swipe begins the same way — and the click after a swipe is the swipe's.
export function HeldCard({ card, faces, onClose, actions, row, onStep, smallestPt }: {
  card: VisibleComponentState
  faces?: string | undefined
  onClose(): void
  actions?: ReactNode
  // The row the card was lifted from, as it is drawn, and what showing another card of it means.
  row?: readonly VisibleComponentState[] | undefined
  onStep?: ((card: VisibleComponentState) => void) | undefined
  // The card's own smallest text (#523), when the caller already knows it; otherwise it is asked of
  // the server the picture comes from.
  smallestPt?: number | null | undefined
}) {
  const t = useT()
  // Held up wider for a card whose words are smaller than the wizard's frame (#523): the width that
  // brings them to the floor, which the stylesheet caps at the screen's own room.
  const heard = useSmallestPt(faces, card)
  const need = readingWidth(0, smallestPt === undefined ? heard : smallestPt, 'phone')
  const [opener] = useState(() => typeof document === 'undefined' ? null : document.activeElement)
  useEffect(() => () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus() }, [opener])
  const at = row ? row.findIndex((c) => c.id === card.id) : -1
  const walkable = row !== undefined && onStep !== undefined && row.length > 1
  const step = (by: number) => {
    const next = row?.[at + by]
    if (at >= 0 && next && onStep) onStep(next)
  }
  const swipe = useRef<{ x: number; stepped: boolean } | null>(null)
  const keep = (event: { stopPropagation(): void }) => event.stopPropagation()
  return (
    <div
      className="byd-inspect"
      role="dialog"
      aria-modal="false"
      aria-label={cardName(card, t)}
      onPointerDown={onClose}
      {...(need > 0 ? { style: { ['--byd-read-need' as string]: `${need}px` } } : {})}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose() }
        if (walkable && event.key === 'ArrowRight') { event.preventDefault(); step(1) }
        if (walkable && event.key === 'ArrowLeft') { event.preventDefault(); step(-1) }
      }}
    >
      <div
        data-inspect={card.id}
        data-face="front"
        style={{ ['--hue' as string]: hue(card.cardRef ?? '') }}
        onPointerDown={event => { keep(event); swipe.current = { x: event.clientX, stepped: false } }}
        onPointerUp={event => {
          const begun = swipe.current
          if (!begun || !walkable) return
          const dx = event.clientX - begun.x
          if (Math.abs(dx) < SWIPE_PX) return
          begun.stepped = true
          step(dx < 0 ? 1 : -1)
        }}
        onClick={() => {
          // Only a touch that began on the card puts it down. The click that ends the tap which
          // opened it lands here too, in the middle of the screen, and has no press of its own.
          const begun = swipe.current
          swipe.current = null
          if (begun && !begun.stepped) onClose()
        }}
      >
        <Texture faces={faces} c={card} retry />
        <span>{cardWord(card)}</span>
      </div>
      {actions && <div className="byd-inspect-actions" onPointerDown={keep}>{actions}</div>}
      <div className="byd-inspect-walk" onPointerDown={keep}>
        {walkable && (
          <button type="button" className="byd-inspect-step" aria-label={t('player.read.prev')} disabled={at <= 0} onClick={() => step(-1)}>
            ‹
          </button>
        )}
        {walkable && <span className="byd-inspect-at">{t('player.read.at', { n: at + 1, of: row.length })}</span>}
        <button className="byd-inspect-close" type="button" autoFocus onClick={onClose}>{t('kbd.panel.close')}</button>
        {walkable && (
          <button type="button" className="byd-inspect-step" aria-label={t('player.read.next')} disabled={at < 0 || at >= row.length - 1} onClick={() => step(1)}>
            ›
          </button>
        )}
      </div>
    </div>
  )
}
