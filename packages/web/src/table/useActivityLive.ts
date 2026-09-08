import { useEffect, useRef } from 'react'
import type { Activity, Snapshot } from '@byd/protocol'
import { useSay } from '../status/StatusLive.js'
import { describeActivity } from './describe.js'
import { useT } from '../i18n/index.js'

// A beat long enough that three moves in a busy round arrive as one sentence, short enough that
// a reader is not told about the table a second after it stopped being true.
const BEAT_MS = 1400

// What happens on the table, said out loud (#1, #2, D5). `describeActivity` has written the
// Swedish sentence since the activity feed was built; until now it never reached a live region,
// so a reader who could not see the felt was never told that anything moved.
//
// The rule is D5's own split. What I did myself is said at once, because it is the answer to
// something I just asked for. What everybody else did is gathered up and said on a beat — three
// moves at once become "3 drag av de andra, senast: …" rather than three interruptions, which is
// the flooding the requirement forbids. A refusal is assertive and lives elsewhere, at the
// control that caused it.
export function useActivityLive(activity: readonly Activity[], view: Snapshot | null, me: string | null): void {
  const say = useSay()
  const t = useT()
  // The last line this screen has already spoken about. Null until the first list arrives: the
  // snapshot carries the last fifty lines of a table that was already being played, and reading
  // a room its own history on arrival is not news.
  const spoken = useRef<number | null>(null)
  const queue = useRef<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  useEffect(() => {
    if (!say || view === null) return
    const last = activity.at(-1)?.seq ?? 0
    if (spoken.current === null) {
      spoken.current = last
      return
    }
    const fresh = activity.filter((line) => line.seq > (spoken.current ?? 0))
    if (fresh.length === 0) return
    spoken.current = last
    for (const line of fresh) {
      const sentence = describeActivity(line, view, t)
      if (line.by === me) {
        say('polite', sentence)
        continue
      }
      queue.current.push(sentence)
    }
    if (queue.current.length === 0 || timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      const lines = queue.current
      queue.current = []
      const latest = lines.at(-1)
      if (latest === undefined) return
      say('polite', lines.length === 1 ? latest : `${lines.length} drag av de andra, senast: ${latest}`)
    }, BEAT_MS)
  }, [say, t, activity, view, me])
}
