import { useEffect, useState } from 'react'
import { ProjectClient } from './ProjectClient.js'

export type ProjectState = { client: ProjectClient | null; error: string | null; tick: number }

// Opens the project once per address and re-renders on every local edit or save.
export function useProjectClient(http: string | null, id: string | null): ProjectState {
  const [state, setState] = useState<ProjectState>({ client: null, error: null, tick: 0 })
  useEffect(() => {
    if (!http || !id) return
    let live = true
    let unsubscribe: () => void = () => undefined
    ProjectClient.open({ http, id }).then(
      (client) => {
        if (!live) return
        unsubscribe = client.subscribe(() => setState((s) => ({ ...s, tick: s.tick + 1 })))
        setState({ client, error: null, tick: 0 })
      },
      (err: unknown) => live && setState({ client: null, error: err instanceof Error ? err.message : String(err), tick: 0 }),
    )
    return () => {
      live = false
      unsubscribe()
    }
  }, [http, id])
  return state
}
