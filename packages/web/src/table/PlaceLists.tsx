import { useState, type ReactNode } from 'react'
import type { Activity, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import { describeActivity, sayable } from './describe.js'
import { seatColor } from './seatColor.js'
import { cardName, countOf } from './keyboard.js'
import { handName } from './handName.js'
import { useT, type T } from '../i18n/index.js'

// A card opened from a list, with the rest of that list to walk (#507): what the reader is handed.
export type ReadCard = (card: VisibleComponentState, row: VisibleComponentState[]) => void

// The observer's «Platser» (#551, beställarens beslut A; P-2 and P-17). Her felt draws every hand
// as a fan of cards a thumb cannot tell apart, and says none of their names to a screen reader; so
// every hand, and every zone on the table, is a row here that opens into a list of its cards — one
// card a row, each at least 44 px, named where it lies — and a card opens the reader, where what it
// prints is heard (K27). The felt stays what it was for the eye and the pointer. The list is the
// equivalent control beside it, not a repair of it.
//
// A row with nothing to list is no button: there is nothing behind it to open.
export function PlaceLists({ view, activity, dense, onRead }: { view: Snapshot; activity: readonly Activity[]; dense: boolean; onRead?: ReadCard | undefined }) {
  const t = useT()
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const toggle = (key: string) =>
    setOpen((was) => {
      const next = new Set(was)
      if (!next.delete(key)) next.add(key)
      return next
    })
  const said = sayable(activity).reverse()
  const hands = view.zones.filter((z) => z.kind === 'hand')
  const lying = view.zones.filter((z) => z.kind !== 'hand').map((z) => ({ zone: z, cards: listed(view, z) })).filter((g) => g.cards.length > 0)
  const group = (key: string, head: ReactNode, cards: VisibleComponentState[], where: string, downs: boolean) => {
    const shut = !open.has(key)
    const list = `places-${key}`
    return (
      <>
        {cards.length === 0 || !onRead ? (
          <div className="byd-tv-place">{head}</div>
        ) : (
          <button type="button" className="byd-tv-place" aria-expanded={!shut} aria-controls={list} onClick={() => toggle(key)}>
            {head}
          </button>
        )}
        {cards.length > 0 && onRead && (
          <ul id={list} className="byd-tv-cards" hidden={shut}>
            {!shut && cards.map((c) => {
              const down = downs && c.cardRef !== null && c.face !== 'front'
              return (
                <li key={c.id}>
                  <button type="button" aria-label={t(down ? 'tv.list.card.down' : 'tv.list.card', { card: cardName(c, t), where })} onClick={() => onRead(c, cards)}>
                    {down ? t('tv.list.down', { card: cardName(c, t) }) : cardName(c, t)}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </>
    )
  }
  return (
    <>
      <ul aria-labelledby="tv-seats" data-dense={dense ? '' : undefined}>
        {view.seats.map((s, i) => {
          const last = said.find((l) => l.by === s.id)
          const hand = hands.find((z) => z.owner === s.id)
          const n = hand ? countOf(hand) : 0
          const head = (
            <>
              <i data-avatar>{(s.name ?? s.id).slice(0, 1)}</i>
              <div>
                <span>{s.name ?? s.id}</span>
                <span>{t(`tv.seat.hand${dense ? '.short' : ''}.${n === 1 ? 'one' : 'other'}`, { n })}</span>
                {!dense && <small>{last ? describeActivity(last, view, t) : t('tv.seat.none')}</small>}
              </div>
            </>
          )
          return (
            <li key={s.id} style={{ ['--seat' as string]: seatColor(i) }}>
              {group(`seat-${s.id}`, head, hand ? listed(view, hand) : [], hand ? handName(view, hand, t) : '', false)}
            </li>
          )
        })}
      </ul>
      {onRead && lying.length > 0 && (
        <>
          <h3 id="tv-on-table">{t('tv.list.table')}</h3>
          <ul aria-labelledby="tv-on-table" data-zones="">
            {lying.map(({ zone, cards }) => (
              <li key={zone.id}>
                {group(
                  `zone-${zone.id}`,
                  <div>
                    <span>{zone.name}</span>
                    <span>{summary(zone, cards, t)}</span>
                  </div>,
                  cards,
                  zone.name,
                  true,
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

// The cards a row lists, in the zone's own order. A pile is listed by its top card, as the felt
// shows it (#551's prototype): the rest of the pile is its order, which the count beside it says.
// A seat's counters are tokens and not cards (C4), and have no words to read.
function listed(view: Snapshot, z: ZoneView): VisibleComponentState[] {
  const inZone = z.mode === 'order' ? z.order.flatMap((id) => view.components.filter((c) => c.id === id)) : view.components.filter((c) => c.zone === z.id)
  const cards = inZone.filter((c) => c.counter === undefined)
  return z.kind === 'pile' ? cards.slice(0, 1) : cards
}

function summary(z: ZoneView, cards: VisibleComponentState[], t: T): string {
  const n = countOf(z)
  const many = n === 1 ? 'one' : 'other'
  return z.kind === 'pile' ? t(`tv.list.pile.${many}`, { n, top: cardName(cards[0], t) }) : t(`tv.list.area.${many}`, { n })
}
