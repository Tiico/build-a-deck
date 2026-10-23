import { useEffect, useState } from 'react'

// The session record (L5, C9): which game a table runs — its name, and the project it was started
// from, which the owner's way back leads to (#1217). Asked only when it is needed. A record that
// cannot be read is no record, so a screen goes on without a name rather than without a page.
export type SessionRecord = { name?: string; project?: string }

export function useSessionRecord(http: string, sessionId: string | null, needed = true): SessionRecord | null {
  const [record, setRecord] = useState<SessionRecord | null>(null)
  useEffect(() => {
    if (!sessionId || !needed) return
    let live = true
    void fetch(`${http}/sessions/${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<SessionRecord>) : null))
      .catch(() => null)
      .then((s) => live && setRecord(s))
    return () => {
      live = false
    }
  }, [http, sessionId, needed])
  return record
}

// The game a session runs, by name, for a screen that was not given the room's code (#759). A
// guest never gets the code (DRIFT §9), and the name is what they know the table by.
export function useSessionName(http: string, sessionId: string | null, needed: boolean): string | null {
  return useSessionRecord(http, sessionId, needed)?.name ?? null
}
