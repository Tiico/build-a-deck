import { useCallback, useId, useState } from 'react'
import type { SendResult } from '../client.js'
import { refusal, type Notice, type Voice } from './notice.js'
import { useT } from '../i18n/index.js'
import { useAnnounce } from './StatusLive.js'
import './status.css'

export type RefusalHandle = {
  // What was refused, in the reader's language, or nothing when the last answer was yes.
  notice: Notice | null
  // The id the message will carry, so the control that asked can point at it.
  id: string
  // Props for the control that asked: it is described by the answer it got.
  control: { 'aria-describedby'?: string; 'data-refused'?: '' }
  // Wraps a send: the answer decides whether anything is said.
  watch(sent: Promise<SendResult>): Promise<SendResult>
  clear(): void
}

// `TableClient.send` has always answered `{ ok: false, reason }` for a refusal, a lost line and a
// socket that is not open; before #7 nothing read it, so an action the table refused simply did
// not happen and nobody was told why. A refusal belongs at the control that caused it and not at
// the top of the document — you should not have to go looking for the answer to your own press.
export function useRefusal(voice: Voice): RefusalHandle {
  const t = useT()
  const id = useId()
  const [reason, setReason] = useState<string | null>(null)
  const watch = useCallback(async (sent: Promise<SendResult>) => {
    const result = await sent
    setReason(result.ok ? null : result.reason)
    return result
  }, [])
  const notice = reason === null ? null : refusal(reason, voice, t)
  return {
    notice,
    id,
    control: notice ? { 'aria-describedby': id, 'data-refused': '' } : {},
    watch,
    clear: useCallback(() => setReason(null), []),
  }
}

// The message itself, beside the control. Assertive, because it is an answer to something
// someone asked for that did not happen.
export function Refusal({ handle }: { handle: RefusalHandle }) {
  useAnnounce(handle.notice)
  if (!handle.notice) return null
  return (
    <span id={handle.id} data-testid="refusal" data-status-refusal className="byd-status-refusal">
      {handle.notice.text}
    </span>
  )
}
