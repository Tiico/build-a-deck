import { useCallback, useEffect, useRef, useState } from 'react'
import { ProjectClient, ProjectUnavailable, type ProjectFault } from './ProjectClient.js'
import { Unauthorized, whoAmI } from '../account/api.js'
import { useT } from '../i18n/index.js'
import { DEFAULT_TIMING, type StatusTiming } from '../status/connection.js'
import { waitBegan } from '../status/waitClock.js'

// Which of the shared states (#12) the project is in, plus the one that is not a message but a
// redirect: not logged in sends the designer to the login card and back.
export type ProjectTrouble = ProjectFault | 'unauthorized'
// `slow`: the project has not come and the wait has outlasted the silence it is allowed (D5).
export type ProjectState = { client: ProjectClient | null; fault: ProjectTrouble | null; slow: boolean; tick: number; retry(): void }
export type ProjectTiming = Pick<StatusTiming, 'slowAfterMs' | 'dropAfterMs' | 'connectTimeoutMs'>

// Opens the project once per address and re-renders on every edit, whoever made it: the client
// holds the socket to the project's actor (D3), so someone else's change arrives the same way
// one's own does. Leaving the page closes it, and the others stop being told this editor is here.
// A retry asks the server the same question again, on this page: never a reload, which would
// throw away the very work the designer is trying to keep.
//
// Opening has the deadline D5 gives every first connection (#876): a server that takes the call
// and never answers left «Öppnar spelet…» standing for ever. The wait is said to be long after
// `slowAfterMs`, and after `connectTimeoutMs` it is called off as no contact, with the retry and
// the way home that says. The deadline is a race and not an abort, as on /join: what matters is
// that the page stops waiting, and an answer that comes after it is closed unseen.
export function useProjectClient(http: string | null, id: string | null, timing: ProjectTiming = DEFAULT_TIMING): ProjectState {
  const { slowAfterMs, dropAfterMs, connectTimeoutMs } = timing
  const [state, setState] = useState<{ client: ProjectClient | null; fault: ProjectTrouble | null; slow: boolean; tick: number }>(() => ({ client: null, fault: null, slow: Date.now() - waitBegan() > slowAfterMs, tick: 0 }))
  const [attempt, setAttempt] = useState(0)
  // The first opening on the page goes on from the shell's wait (#749, `waitClock.ts`); a retry, or
  // another project, is a wait of its own.
  const first = useRef(true)
  // Read through a ref, not a dependency: the word for somebody is settled once, when this
  // editor arrives. Switching language later renames nobody who is already in the project.
  const t = useT()
  const reader = useRef(t)
  reader.current = t
  useEffect(() => {
    if (!http || !id) return
    let live = true
    let opened: ProjectClient | null = null
    let unsubscribe: () => void = () => undefined
    // Set once the wait has an answer, either the server's or the deadline's; nothing after it
    // may change what the page says about opening.
    let settled = false
    const began = first.current ? waitBegan() : Date.now()
    first.current = false
    setState({ client: null, fault: null, slow: Date.now() - began > slowAfterMs, tick: 0 })
    const slow = setTimeout(() => live && !settled && setState((s) => ({ ...s, slow: true })), Math.max(0, slowAfterMs - (Date.now() - began)))
    const deadline = setTimeout(() => {
      if (!live || settled) return
      settled = true
      setState({ client: null, fault: 'offline', slow: false, tick: 0 })
    }, connectTimeoutMs)
    const answered = () => {
      clearTimeout(slow)
      clearTimeout(deadline)
      settled = true
    }
    const start = async () => {
      // The name the others see is the account's own; without one the editor is simply someone,
      // which is what a game from before accounts has. That word is the reader's own, taken
      // where she arrives and frozen there — see A4's boundary and the note on `open`.
      const email = await whoAmI(http).catch(() => null)
      if (!live || settled) return
      const client = await ProjectClient.open({ http, id, dropAfterMs, t: reader.current, ...(email ? { name: email } : {}) })
      if (!live || settled) {
        client.close()
        return
      }
      answered()
      opened = client
      // A project that closes to this editor while it is open says so in the same words as one that
      // would not open (#477): the document is no longer this reader's to look at.
      // A game that is deleted while it is open (#485) is different: the work on the screen is the
      // designer's own and the only copy of it now, so the page keeps it and says so over it.
      unsubscribe = client.subscribe(() =>
        setState((s) => (client.shut === 'missing' || client.shut === 'loggedOut' ? { client, fault: client.shut, slow: false, tick: s.tick + 1 } : client.shut ? { client: null, fault: client.shut, slow: false, tick: s.tick + 1 } : { ...s, tick: s.tick + 1 })),
      )
      setState({ client, fault: null, slow: false, tick: 0 })
    }
    void start().catch((err: unknown) => {
      if (!live || settled) return
      answered()
      // Anything the browser could not even send — a name that does not resolve, a port that
      // refuses — is the same fact as a server that answered badly: there is no contact.
      const fault: ProjectTrouble = err instanceof Unauthorized ? 'unauthorized' : err instanceof ProjectUnavailable ? err.fault : 'offline'
      setState({ client: null, fault, slow: false, tick: 0 })
    })
    return () => {
      live = false
      clearTimeout(slow)
      clearTimeout(deadline)
      unsubscribe()
      opened?.close()
    }
  }, [http, id, attempt, slowAfterMs, dropAfterMs, connectTimeoutMs])
  return { ...state, retry: useCallback(() => setAttempt((n) => n + 1), []) }
}
