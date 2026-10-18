// The editor's question to the AI from the browser's side (#1001, E4): the question and the
// conversation go to the server, which reads the game itself and asks the designer's provider with
// her own key, and the answer comes back as server-sent events on the response to the same POST.
//
// Cancelling cancels the response's body. In a browser that hangs up the request, which the server
// takes as the asker hanging up and passes on to the provider at once; and it needs no
// `AbortSignal`, whose jsdom twin Node's `fetch` refuses (#999).
import type { AiFailure } from '@byd/server/doc'
import { withCredentials } from '../account/session.js'

export type AskTurn = { role: 'user' | 'assistant'; text: string }
// Why an answer did not come: the provider's own closed set of words, the server's ceilings — the
// time an answer may take, and how many may run at once — and the editor's own: no key to ask
// with, and no server to ask.
export type AskFailure = AiFailure | 'timeout' | 'busy' | 'no-key' | 'offline'
// A `part` is one part of a proposal, whole, as it was written (#1002): read, never trusted — the
// panel reads it with the proposal model before it draws it. `broken` on `done` says a proposal
// began and was cut off before it was whole.
export type AskEvent = { t: 'text'; text: string } | { t: 'part'; key: string; part: unknown } | { t: 'done'; broken?: boolean } | { t: 'failed'; kind: AskFailure }
export type Asking = { cancel(): void; finished: Promise<void> }

const KINDS: readonly AskFailure[] = ['invalid-key', 'no-credit', 'rate-limit', 'overloaded', 'refused', 'network', 'timeout', 'busy', 'no-key', 'offline']
const kindOf = (value: unknown): AskFailure => KINDS.find((k) => k === value) ?? 'network'

// `selected` is the cards the designer has selected, by id (#1003): the server reads them out of its
// own copy of the game and sends them whole with the question.
export function askAi(http: string, project: string, ask: { question: string; turns: readonly AskTurn[]; lang: 'sv' | 'en'; selected?: readonly string[] }, onEvent: (event: AskEvent) => void): Asking {
  let cancelled = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  const tell = (event: AskEvent) => {
    if (!cancelled) onEvent(event)
  }
  const finished = (async () => {
    let res: Response
    try {
      res = await fetch(`${http}/projects/${encodeURIComponent(project)}/ai/ask`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ask) }))
    } catch {
      return tell({ t: 'failed', kind: 'offline' })
    }
    if (cancelled) return void res.body?.cancel().catch(() => undefined)
    if (!res.ok || !res.body) {
      const said = ((await res.json().catch(() => ({}))) as { error?: unknown }).error
      return tell({ t: 'failed', kind: res.status === 409 ? 'no-key' : res.status === 429 && said === 'busy' ? 'busy' : 'network' })
    }
    reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let ended = false
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch {
        break
      }
      if (chunk.done || cancelled) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      for (const frame of frames) {
        const data = frame.split('\n').find((line) => line.startsWith('data: '))
        if (!data) continue
        let event: { t?: unknown; text?: unknown; kind?: unknown; key?: unknown; part?: unknown; broken?: unknown }
        try {
          event = JSON.parse(data.slice(6)) as typeof event
        } catch {
          continue
        }
        if (event.t === 'text' && typeof event.text === 'string') tell({ t: 'text', text: event.text })
        else if (event.t === 'part' && typeof event.key === 'string') tell({ t: 'part', key: event.key, part: event.part })
        else if (event.t === 'done') {
          ended = true
          tell(event.broken === true ? { t: 'done', broken: true } : { t: 'done' })
        } else if (event.t === 'failed') {
          ended = true
          tell({ t: 'failed', kind: kindOf(event.kind) })
        }
      }
    }
    // A stream that stopped without saying how it ended is a line that broke.
    if (!ended) tell({ t: 'failed', kind: 'network' })
  })()
  return {
    finished,
    cancel() {
      if (cancelled) return
      cancelled = true
      void reader?.cancel().catch(() => undefined)
    },
  }
}
