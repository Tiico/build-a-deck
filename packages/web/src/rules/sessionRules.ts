import { useEffect, useState } from 'react'
import type { RenderedRules } from '@byd/template'

// The rulebook a session hands out (B7), rendered against the version it plays, or 'none'. 204 is
// the table saying it has no rulebook, which is an answer and not a failure; a table that cannot
// be asked is read the same way, because a book nobody can fetch is a book nobody can read.
export async function sessionRules(http: string, sessionId: string): Promise<RenderedRules | 'none'> {
  try {
    const res = await fetch(`${http}/sessions/${encodeURIComponent(sessionId)}/rules`)
    return res.ok && res.status !== 204 ? ((await res.json()) as RenderedRules) : 'none'
  } catch {
    return 'none'
  }
}

// Whether the table has a rulebook at all, once it is asked: `null` while it is being asked.
// `when` holds the question back until it matters — the survey asks only once the table has ended.
export function useHasRulebook(http: string, sessionId: string, when = true): boolean | null {
  const [has, setHas] = useState<boolean | null>(null)
  useEffect(() => {
    if (!when) return
    let live = true
    void sessionRules(http, sessionId).then((r) => live && setHas(r !== 'none'))
    return () => {
      live = false
    }
  }, [http, sessionId, when])
  return has
}
