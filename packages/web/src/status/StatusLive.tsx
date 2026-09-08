import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Notice } from './notice.js'

// Both live regions sit in the tree from the start and empty, for the same reason
// `TextureFailures` does it (#10): a region created together with its text is a region nothing
// was listening to. They live in `App`, the only place mounted exactly once per screen, so no
// route can forget them and no route can add a second pair.
type Say = (live: 'polite' | 'assertive', text: string) => void
const Channel = createContext<Say | null>(null)

export function StatusLive({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState('')
  const [assertive, setAssertive] = useState('')
  const say = useCallback<Say>((live, text) => (live === 'polite' ? setPolite(text) : setAssertive(text)), [])
  return (
    <Channel.Provider value={say}>
      {children}
      {/* Polite: something is on its way, and the reader will get to it in her own time. */}
      <p className="byd-status-live" data-status-live="polite" role="status">
        {polite}
      </p>
      {/* Assertive: what is on the screen has stopped being true, or something she asked for
          did not happen. Nothing else is worth cutting a reader off for. */}
      <p className="byd-status-live" data-status-live="assertive" role="alert">
        {assertive}
      </p>
    </Channel.Provider>
  )
}

// The channel itself, for what is not a notice: the table's own activity, said in the words
// `describeActivity` already writes (#1, #2). Everything that speaks on a screen speaks through
// these two regions — a route that made its own would be a second reader in the same room.
export function useSay(): Say | null {
  return useContext(Channel)
}

// Says a notice once, in the channel the model chose for it, and takes it back when the state
// it belongs to is over.
export function useAnnounce(notice: Notice | null): void {
  const say = useContext(Channel)
  const said = useRef<'polite' | 'assertive' | null>(null)
  const sentence = notice ? [notice.heading, notice.text].filter((s) => s !== '').join('. ') : ''
  const live = notice?.live ?? null
  useEffect(() => {
    if (!say) return
    if (!live) {
      if (said.current) say(said.current, '')
      said.current = null
      return
    }
    said.current = live
    say(live, sentence)
    return () => say(live, '')
  }, [say, live, sentence])
}
