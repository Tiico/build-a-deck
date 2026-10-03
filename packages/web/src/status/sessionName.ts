import { useEffect, useState } from 'react'

// The game a session runs, by name, for a screen that was not given the room's code (#759). A
// guest never gets the code (DRIFT §9), and the name is what they know the table by. Asked only
// when it is needed, from the session record that already says it to the TV (L5).
export function useSessionName(http: string, sessionId: string | null, needed: boolean): string | null {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    if (!sessionId || !needed) return
    let live = true
    void fetch(`${http}/sessions/${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ name?: string }>) : null))
      // A record that cannot be read leaves the tab without a room rather than without a page.
      .catch(() => null)
      .then((s) => live && setName(s?.name ?? null))
    return () => {
      live = false
    }
  }, [http, sessionId, needed])
  return name
}
