import { useEffect, useState } from 'react'
import { ProjectClient } from './ProjectClient.js'
import { whoAmI } from '../account/api.js'

export type ProjectState = { client: ProjectClient | null; error: string | null; tick: number }

// Opens the project once per address and re-renders on every edit, whoever made it: the client
// holds the socket to the project's actor (D3), so someone else's change arrives the same way
// one's own does. Leaving the page closes it, and the others stop being told this editor is here.
export function useProjectClient(http: string | null, id: string | null): ProjectState {
  const [state, setState] = useState<ProjectState>({ client: null, error: null, tick: 0 })
  useEffect(() => {
    if (!http || !id) return
    let live = true
    let opened: ProjectClient | null = null
    let unsubscribe: () => void = () => undefined
    const start = async () => {
      // The name the others see is the account's own; without one the editor is simply someone,
      // which is what a project from before accounts has.
      const email = await whoAmI(http).catch(() => null)
      if (!live) return
      const client = await ProjectClient.open({ http, id, ...(email ? { name: email } : {}) })
      if (!live) {
        client.close()
        return
      }
      opened = client
      unsubscribe = client.subscribe(() => setState((s) => ({ ...s, tick: s.tick + 1 })))
      setState({ client, error: null, tick: 0 })
    }
    void start().catch((err: unknown) => live && setState({ client: null, error: err instanceof Error ? err.message : String(err), tick: 0 }))
    return () => {
      live = false
      unsubscribe()
      opened?.close()
    }
  }, [http, id])
  return state
}
