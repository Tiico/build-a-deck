import { useEffect, useState } from 'react'

// How far a table's textures have come (L5), as GET /sessions/:id/textures says it.
export type Textures = { total: number; done: number; failed: string[]; smallest?: Record<string, number> }

// How long a count may stand still before the rendering is said to stand still (#88).
export const RENDER_STALLED_AFTER_MS = 30_000

// Whether cards are still on their way: a card that failed for good is not coming, and is said by
// `TextureFailures` instead (#10).
export const stillRendering = (t: Textures | null): t is Textures => t !== null && t.done + t.failed.length < t.total

export async function readTextures(http: string, sessionId: string): Promise<Textures> {
  const res = await fetch(`${http}/sessions/${encodeURIComponent(sessionId)}/textures`, { credentials: 'include' })
  if (!res.ok) throw new Error(`could not read texture status: ${res.status}`)
  return (await res.json()) as Textures
}

// A table's textures, asked with a growing pause while anything is still rendering and not at all
// once everything is (#765). Until the first answer it is null: a count nobody has given is not
// «0 av …» (#910). An answer that fails is asked again and changes nothing.
export function useTextures(http: string | null, sessionId: string | null): Textures | null {
  const [textures, setTextures] = useState<Textures | null>(null)
  useEffect(() => {
    setTextures(null)
    if (!http || !sessionId) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let delay = 100
    const poll = async () => {
      const t = await readTextures(http, sessionId).catch(() => null)
      if (stop) return
      if (t) setTextures(t)
      if (!t || stillRendering(t)) {
        timer = setTimeout(() => void poll(), delay)
        delay = Math.min(1000, delay * 2)
      }
    }
    void poll()
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [http, sessionId])
  return textures
}

// Whether what is watched has stood the same for `ms` (#88). `watched` names the state — a table,
// its count, and whatever else starts the wait over — and null is nothing to wait on. What is
// remembered is the state the stall was seen at, so a count that moves on takes the stall with it
// in the same render.
export function useStalled(watched: string | null, ms: number): boolean {
  const [stalledAt, setStalledAt] = useState<string | null>(null)
  useEffect(() => {
    if (watched === null) return
    const timer = setTimeout(() => setStalledAt(watched), ms)
    return () => clearTimeout(timer)
  }, [watched, ms])
  return watched !== null && stalledAt === watched
}

// The cards a live table is still waiting for, as the start tile and the TV's column say it
// (#765, beslut B): the count while any are missing, and whether the queue has stood still for
// `stalledAfterMs` (#88). Null once every card can be seen, before the first answer, and at a table
// that has ended — it deals nothing more and is not asked.
export function useCardsPending(http: string, sessionId: string | null, view: { ended: boolean } | null, stalledAfterMs = RENDER_STALLED_AFTER_MS): { done: number; total: number; stalled: boolean } | null {
  const textures = useTextures(view && !view.ended ? http : null, sessionId)
  const pending = stillRendering(textures) ? textures : null
  const stalled = useStalled(pending && sessionId ? `${sessionId}:${pending.done}` : null, stalledAfterMs)
  return pending ? { done: pending.done, total: pending.total, stalled } : null
}
