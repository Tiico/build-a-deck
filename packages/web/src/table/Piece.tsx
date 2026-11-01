import type { PieceKind } from '../components.js'

// A wooden piece seen from above (#1475, prototype #1472 felt B): the figure everybody knows, in the
// colour of its seat (L11), drawn in a 100-unit square that the felt scales to the piece's size. A
// meeple laid down is the same silhouette turned on its side, without the shadow of one standing.
//
// On the green felt no seat colour reaches 3:1 by itself (1.59–2.77 in the middle, measured in the
// prototype), so every figure has a hairline of the felt's chalk round it, as the seat band has
// (K16): the chalk carries the outline and the colour only has to be the identity.
//
// A disc in the yellow seat is the amber of a counter's chip (#1472), so a disc carries a ring of its
// own inside its edge, which no chip has.
const CHALK = '#f3e9d6'
const MEEPLE =
  'M50 6a14 14 0 0 1 14 14c0 5-2.5 9-6 11.5l26 11c6 2.5 7 10 1.5 13l-15 7 11 24c1.5 4-1 7-5 7h-17l-9.5-15-9.5 15h-17c-4 0-6.5-3-5-7l11-24-15-7c-5.5-3-4.5-10.5 1.5-13l26-11c-3.5-2.5-6-6.5-6-11.5a14 14 0 0 1 14-14z'
const band = (width: number) => ({ stroke: CHALK, strokeWidth: width, vectorEffect: 'non-scaling-stroke' as const, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const })
const SHADOW = { fill: '#000', opacity: 0.35 }

export function Figure({ kind, colour, lying = false, edge = 2.5 }: { kind: PieceKind; colour: string; lying?: boolean; edge?: number }) {
  if (kind === 'meeple') {
    if (lying)
      return (
        <g transform="rotate(90 50 50) scale(.92) translate(4 4)">
          <path data-figure d={MEEPLE} fill={colour} {...band(edge)} />
          <path d="M30 60h40" stroke="#0006" strokeWidth={4} strokeLinecap="round" />
        </g>
      )
    return (
      <>
        <path d={MEEPLE} transform="translate(5 6)" {...SHADOW} />
        <path data-figure d={MEEPLE} fill={colour} {...band(edge)} />
      </>
    )
  }
  if (kind === 'cube')
    return (
      <>
        <rect x={16} y={16} width={70} height={70} rx={9} {...SHADOW} />
        <rect data-figure x={12} y={12} width={76} height={76} rx={9} fill={colour} {...band(edge)} />
      </>
    )
  return (
    <>
      <circle cx={54} cy={55} r={40} {...SHADOW} />
      <circle data-figure cx={50} cy={50} r={40} fill={colour} {...band(edge)} />
      <circle cx={50} cy={50} r={26} fill="none" stroke="#0007" strokeWidth={5} />
    </>
  )
}

// A pile of what has not been moved yet: one dark chip in the chalk with the figure on it and the
// count on a badge at its shoulder, like the counters' pile (#89). The count is read as a number and
// not as five figures, which is the point of the pile.
export function PieceChip({ kind, colour, count }: { kind: PieceKind; colour: string; count: number }) {
  return (
    <svg viewBox="-6 -6 112 112" aria-hidden="true">
      <circle cx={54} cy={55} r={46} {...SHADOW} />
      <circle cx={50} cy={50} r={46} fill="#171a23" {...band(2)} />
      <g transform="translate(19 17) scale(.62)">
        <Figure kind={kind} colour={colour} edge={1.5} />
      </g>
      <circle cx={82} cy={20} r={27} fill={CHALK} stroke="#171a23" strokeWidth={4} />
      <text data-piece-count x={82} y={21}>
        {count}
      </text>
    </svg>
  )
}

export function PieceFigure({ kind, colour, lying, rot }: { kind: PieceKind; colour: string; lying: boolean; rot: number }) {
  return (
    <svg viewBox="-6 -6 112 112" aria-hidden="true">
      <g transform={rot % 360 === 0 ? undefined : `rotate(${rot} 50 50)`}>
        <Figure kind={kind} colour={colour} lying={lying} />
      </g>
    </svg>
  )
}
