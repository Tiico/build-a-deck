import { useEffect, useRef, useState } from 'react'
import type { Activity } from '@byd/protocol'

// A shuffle, fanned on the pile it shuffled (L35, #326). `shuffle` is an intent and its line is in
// the log, so a screen knows exactly when a pile was shuffled and plays the fan *by the event*,
// never by a difference in state: a shuffle changes nothing one can see afterwards, and a screen
// that compared snapshots would have nothing to compare. One fan per line, on every screen that
// sees the pile, including the one that asked for it; keyed by the line's `seq` so that the same
// line arriving twice is one event.
export type Shuffle = { pile: string; seq: number }

// The fan: four backs fanned out and gathered back, 560 ms. Under `prefers-reduced-motion` the
// motion is off — not damped — and what is left is an amber pulse on the pile, 420 ms.
export const SHUFFLE_MS = 560
export const SHUFFLE_PULSE_MS = 420
// Where each of the four fanned backs reaches at the fan's widest: how far out along the card's
// own width, in per cent of it, and how far it turns. In the card's measure and never in pixels
// (L35): a pile on the TV is as large as the camera makes it, and a fan written in pixels would be
// a different fan on every screen.
export const FAN: readonly (readonly [out: number, turn: number])[] = [
  [-27, -7],
  [-9.5, -2.5],
  [9.5, 2.5],
  [27, 7],
]
export const STILL = '(prefers-reduced-motion: reduce)'

// Whether the reader has asked for less motion. Asked of the window at the moment it matters —
// the moment a shuffle arrives — rather than remembered, so that a preference changed mid-game is
// honoured by the next shuffle.
export function isStill(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(STILL).matches
}

// The same answer, for a component that draws by it: kept in step with the preference for as
// long as the component is mounted.
export function useStill(): boolean {
  const [still, setStill] = useState(isStill)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(STILL)
    const update = () => setStill(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return still
}

// The shuffles among the lines newer than `lastSeq`.
export function shufflesAfter(activity: readonly Activity[], lastSeq: number): Shuffle[] {
  const fresh: Shuffle[] = []
  for (const line of activity) if (line.seq > lastSeq && line.intent.v === 'shuffle') fresh.push({ pile: line.intent.pile, seq: line.seq })
  return fresh
}

const lastSeqOf = (activity: readonly Activity[]): number => activity.reduce((max, l) => Math.max(max, l.seq), -1)

// Which piles are being shuffled right now, for a screen that shows the table.
//
// The log the first snapshot brings is history and not events: a screen that joins mid-game is
// told about every shuffle that ever happened, and fanning them all would say that every pile was
// just shuffled. So nothing plays until `ready` — the screen has its snapshot — and the lines
// standing then are the baseline. Only lines newer than the newest seen are events, which also
// holds across a reconnect, when the client's remembered log is handed over whole.
export function useShuffles(activity: readonly Activity[], ready: boolean): Shuffle[] {
  const [shuffles, setShuffles] = useState<Shuffle[]>([])
  const lastSeq = useRef<number | null>(null)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    if (!ready) return
    if (lastSeq.current === null) {
      lastSeq.current = lastSeqOf(activity)
      return
    }
    const fresh = shufflesAfter(activity, lastSeq.current)
    lastSeq.current = Math.max(lastSeq.current, lastSeqOf(activity))
    if (fresh.length === 0) return
    // A later shuffle of a pile takes the place of an earlier one still playing: the fan starts
    // over, and the earlier one's clock running out does not stop it.
    const piles = new Set(fresh.map((s) => s.pile))
    setShuffles((s) => [...s.filter((x) => !piles.has(x.pile)), ...fresh])
    const seqs = new Set(fresh.map((s) => s.seq))
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setShuffles((s) => s.filter((x) => !seqs.has(x.seq)))
    }, isStill() ? SHUFFLE_PULSE_MS : SHUFFLE_MS)
    timers.current.add(timer)
  }, [activity, ready])
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) clearTimeout(timer)
    }
  }, [])
  return shuffles
}
