import { useCallback, useEffect, useState } from 'react'
import { ProjectClient, ProjectUnavailable, type ProjectFault } from './ProjectClient.js'
import { Unauthorized, whoAmI } from '../account/api.js'

// Which of the shared states (#12) the project is in, plus the one that is not a message but a
// redirect: not logged in sends the designer to the login card and back.
export type ProjectTrouble = ProjectFault | 'unauthorized'
export type ProjectState = { client: ProjectClient | null; fault: ProjectTrouble | null; tick: number; retry(): void }

// Opens the project once per address and re-renders on every edit, whoever made it: the client
// holds the socket to the project's actor (D3), so someone else's change arrives the same way
// one's own does. Leaving the page closes it, and the others stop being told this editor is here.
// A retry asks the server the same question again, on this page: never a reload, which would
// throw away the very work the designer is trying to keep.
export function useProjectClient(http: string | null, id: string | null): ProjectState {
  const [state, setState] = useState<{ client: ProjectClient | null; fault: ProjectTrouble | null; tick: number }>({ client: null, fault: null, tick: 0 })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!http || !id) return
    let live = true
    let opened: ProjectClient | null = null
    let unsubscribe: () => void = () => undefined
    setState({ client: null, fault: null, tick: 0 })
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
      setState({ client, fault: null, tick: 0 })
    }
    void start().catch((err: unknown) => {
      if (!live) return
      // Anything the browser could not even send — a name that does not resolve, a port that
      // refuses — is the same fact as a server that answered badly: there is no contact.
      const fault: ProjectTrouble = err instanceof Unauthorized ? 'unauthorized' : err instanceof ProjectUnavailable ? err.fault : 'offline'
      setState({ client: null, fault, tick: 0 })
    })
    return () => {
      live = false
      unsubscribe()
      opened?.close()
    }
  }, [http, id, attempt])
  return { ...state, retry: useCallback(() => setAttempt((n) => n + 1), []) }
}
