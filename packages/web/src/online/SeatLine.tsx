import type { T } from '../i18n/index.js'

// Who you are at the felt (C5): your name, how many cards you hold, and who is watching. It sits
// in one bottom corner and the tools sit in the other, so it must never grow into them — a name
// is a person's own and can be as long as they like, and the same words are longer in one
// language than another (A4).
export type SeatLineProps = { name: string; hand: number; observers: readonly string[]; t: T }

export function SeatLine({ name, hand, observers, t }: SeatLineProps) {
  return (
    <div className="byd-online-me">
      <strong>{name}</strong>
      <span>{t(hand === 1 ? 'play.cards.one' : 'play.cards.other', { n: hand })}</span>
      {observers.length > 0 && <em>{t(observers.length === 1 ? 'online.observers.one' : 'online.observers.other', { names: observers.join(', ') })}</em>}
    </div>
  )
}
