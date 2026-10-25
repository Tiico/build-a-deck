import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Activity } from '@byd/protocol'
import { isStill } from './shuffle.js'

// A die seen from above (#1137, K28 variant A, prototype `2026-10-22-tarningar`): each kind its own
// outline, so a table reads what lies on it without a word, and the side that is up on the top
// face. Drawn in a 100-unit square that the felt scales to the die's size; the figures are in the
// same units, so they grow and shrink with the die and never break its outline.
//
// The outlines are the prototype's `silhouette(n)`: a d4 a triangle, a d6 a rounded square, a d8 a
// hexagon with its top triangle, a d10 a kite, a d12 a decagon round a pentagon, and a d20 a
// hexagon with its facets. `top` is where the figure stands, on the face that is up, and `size`
// how large it is set. `two` is where and how large a side of two figures is set: wider than one,
// and on a d20's triangle it has to stand lower, where the triangle is wide, and be smaller (#1170);
// the d20's top face is drawn large so that even then it reads as large as a d12's (#1178). A die without it sets two figures at 0.85 of one,
// which its face has room for.
type Figure = { top: number; size: number }
type Shape = Figure & { outline: ReactNode; two?: Figure }
const EDGE = { stroke: '#b9ad97', strokeWidth: 2, strokeLinejoin: 'round' as const }
const SIDE = '#ddd2bd'
const points = (ps: readonly (readonly [number, number])[]) => ps.map((p) => `${round(p[0])},${round(p[1])}`).join(' ')
const round = (n: number) => Math.round(n * 100) / 100
function ngon(k: number, r: number, cx = 50, cy = 50): [number, number][] {
  return Array.from({ length: k }, (_, i) => {
    const a = ((-90 + (360 / k) * i) * Math.PI) / 180
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })
}

function shapeOf(faces: number): Shape {
  switch (faces) {
    case 4:
      return { outline: <polygon points={points(ngon(3, 50, 50, 58))} fill="var(--byd-die)" {...EDGE} />, top: 66, size: 40 }
    case 6:
      return { outline: <rect x={8} y={8} width={84} height={84} rx={12} fill="var(--byd-die)" {...EDGE} />, top: 51, size: 56 }
    case 8:
      return {
        outline: (
          <>
            <polygon points={points(ngon(6, 50))} fill={SIDE} {...EDGE} />
            <polygon points={points(ngon(3, 50))} fill="var(--byd-die)" {...EDGE} />
          </>
        ),
        top: 58,
        size: 40,
      }
    case 10:
      return {
        outline: (
          <>
            <polygon points="50,2 92,46 50,98 8,46" fill={SIDE} {...EDGE} />
            <polygon points="50,14 80,48 50,70 20,48" fill="var(--byd-die)" {...EDGE} />
          </>
        ),
        top: 47,
        size: 38,
      }
    case 12:
      return {
        outline: (
          <>
            <polygon points={points(ngon(10, 50))} fill={SIDE} {...EDGE} />
            <polygon points={points(ngon(5, 34))} fill="var(--byd-die)" {...EDGE} />
          </>
        ),
        top: 53,
        size: 42,
      }
    default: {
      // The d20, and any die with sides the felt has no outline for: a hexagon with the top face's
      // triangle and the facets running out to the rim.
      const rim = ngon(6, 50)
      const face = ngon(3, 40, 50, 56)
      return {
        outline: (
          <>
            <polygon points={points(rim)} fill={SIDE} {...EDGE} />
            {rim.map((p, i) => {
              const to = face[Math.floor(((i + 1) % 6) / 2)]
              return to && <line key={i} x1={round(p[0])} y1={round(p[1])} x2={round(to[0])} y2={round(to[1])} stroke={EDGE.stroke} strokeWidth={1.5} />
            })}
            <polygon points={points(face)} fill="var(--byd-die)" {...EDGE} />
          </>
        ),
        // The triangle is narrow at its apex, so the figure is set low on it, its ink standing on
        // the base with the edge line kept clear. The face is the large one beställaren chose (#1178,
        // C): with the old, smaller face «17» had to be set a size below every other die's figure.
        top: 58,
        size: 42,
        two: { top: 61.5, size: 32 },
      }
    }
  }
}

// How long a roll whips round (K28, revised by #1288 to beställarens variant D): two turns in 0.45 s,
// braking hard with a small recoil, the figure jumping more and more slowly and still for the last
// 0.15 s, so that what the eye lands on is the value and not a blur. Under `prefers-reduced-motion`
// nothing turns or jumps: the value is there at once and a ring in the colour of the seat that
// rolled stands round the die for 1.5 s instead.
export const ROLL_MS = 450
export const ROLL_RING_MS = 1500
const JUMP_GAPS_MS = [40, 45, 55, 70, 90]
// The after-images that trail the spin, each a little further behind than the one before.
const TRAILS = 3

// A roll, played on the die it rolled by the log line that says so (L35's rule for the shuffle): a
// die rolled to the side it already showed changes nothing a snapshot could compare, and still
// tumbles. `seat` is who rolled, whose colour the ring under reduced motion wears; null is the table.
export type Roll = { component: string; seq: number; seat: string | null }

export function rollsAfter(activity: readonly Activity[], lastSeq: number): Roll[] {
  const fresh: Roll[] = []
  for (const line of activity) if (line.seq > lastSeq && line.intent.v === 'roll') fresh.push({ component: line.intent.component, seq: line.seq, seat: line.by })
  return fresh
}

const lastSeqOf = (activity: readonly Activity[]): number => activity.reduce((max, l) => Math.max(max, l.seq), -1)

// Which dice are rolling right now, for a screen that shows the table. As with the shuffle, the log
// the first snapshot brings is history and not events, so nothing plays until `ready` and the lines
// standing then are the baseline; a later roll of a die that is still tumbling starts it over.
export function useRolls(activity: readonly Activity[], ready: boolean): Roll[] {
  const [rolls, setRolls] = useState<Roll[]>([])
  const lastSeq = useRef<number | null>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    if (!ready) return
    if (lastSeq.current === null) {
      lastSeq.current = lastSeqOf(activity)
      return
    }
    const fresh = rollsAfter(activity, lastSeq.current)
    lastSeq.current = Math.max(lastSeq.current, lastSeqOf(activity))
    if (fresh.length === 0) return
    const dice = new Set(fresh.map((r) => r.component))
    setRolls((r) => [...r.filter((x) => !dice.has(x.component)), ...fresh])
    const seqs = new Set(fresh.map((r) => r.seq))
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setRolls((r) => r.filter((x) => !seqs.has(x.seq)))
    }, isStill() ? ROLL_RING_MS : ROLL_MS)
    timers.current.add(timer)
  }, [activity, ready])
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) clearTimeout(timer)
    }
  }, [])
  return rolls
}

// The figures a whipping die shows on the way. They are the screen's own and never the log's: the
// value the die lands on is `value`, the side the table says is up, and the jumping stops before the
// tumble does, so no other figure can be the last one drawn (D4).
function useJumping(faces: number, roll: number | undefined, still: boolean): number | null {
  const [shown, setShown] = useState<number | null>(null)
  useEffect(() => {
    if (roll === undefined || still) {
      setShown(null)
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const jump = (i: number) => {
      const gap = JUMP_GAPS_MS[i]
      if (gap === undefined) {
        setShown(null)
        return
      }
      setShown(1 + Math.floor(Math.random() * faces))
      timer = setTimeout(() => jump(i + 1), gap)
    }
    jump(0)
    return () => {
      clearTimeout(timer)
      setShown(null)
    }
  }, [faces, roll, still])
  return shown
}

export function DieFace({ faces, value, roll, still }: { faces: number; value: number; roll?: number | undefined; still: boolean }) {
  const shape = shapeOf(faces)
  const jumping = useJumping(faces, roll, still)
  const figure = String(jumping ?? value)
  const set: Figure = figure.length > 1 ? (shape.two ?? { top: shape.top, size: shape.size * 0.85 }) : shape
  const whipping = roll !== undefined && !still
  return (
    <>
      {whipping &&
        Array.from({ length: TRAILS }, (_, i) => (
          <svg key={`${roll}-${i}`} className="byd-die-trail" style={{ ['--trail' as string]: i + 1 }} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            {shape.outline}
          </svg>
        ))}
      <svg key={whipping ? roll : 'still'} className="byd-die-body" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className="byd-die-ring" cx={50} cy={52} r={58} />
        {shape.outline}
        <text data-die-value="" x={50} y={set.top} fontSize={set.size}>
          {figure}
        </text>
      </svg>
      {whipping && (
        <svg key={`${roll}-catch`} className="byd-die-catch" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle cx={50} cy={50} r={58} />
        </svg>
      )}
    </>
  )
}
