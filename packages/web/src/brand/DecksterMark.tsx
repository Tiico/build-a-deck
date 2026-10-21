import { EDGE_STROKE_WIDTH, HAND, cards, markViewBox } from './mark.js'

// Deckster's hand (#1082) on a page, beside the name: the favicon's own cards, drawn inline so
// the page needs no request for it. It is a picture of the name next to it, so it is never read out.
// `edge` is the ground the hand lies on, which is what parts one card from the next.
export function DecksterMark({ className, edge = HAND.edge }: { className?: string; edge?: string }) {
  return (
    <svg className={className} viewBox={markViewBox()} aria-hidden="true" focusable="false">
      {cards().map((c) => (
        <rect key={c.fill} x={c.x} y={c.y} width={c.width} height={c.height} rx={c.rx} fill={c.fill} stroke={edge} strokeWidth={EDGE_STROKE_WIDTH} transform={c.transform} />
      ))}
    </svg>
  )
}
