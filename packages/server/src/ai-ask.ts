import type { ServerResponse } from 'node:http'
import { z } from 'zod'
import { AI_INSTRUCTIONS, aiContextOf, aiSelectionOf } from './ai-context.js'
import type { AiKeyVault } from './ai-keys.js'
import { AiProviderError, type AiFailure, type AiProviders } from './ai-providers.js'
import type { ProjectDoc } from './projects.js'
import { Proposal, proposalSchema } from './proposal.js'

// The editor's question, made on the designer's behalf (#1001, E4, PRD module 6). The server does
// not think, it passes on: it builds the game's context out of its own copy of the document, opens
// the asker's own key, asks her provider, and hands the answer on a piece at a time.
//
// The answer goes back as server-sent events on the response to the POST that asked. It is one
// answer to one person, going one way, for as long as it takes and then done — which is what a
// response is. The editor's WebSocket is the game's shared line (D3): every co-editor hears what
// goes over it, the actor stands behind it, and an answer is neither an edit nor anyone else's
// business. On a response of its own, the asker hanging up is the request closing, which is the one
// signal that has to reach the provider: a cancelled answer must stop costing her at once.
//
// What is logged is who asked, which provider, how long it took and how it went (DRIFT §8). Never
// the key, never the game, never the question and never the answer: `docker logs` is read by whoever
// runs the box, and an unpublished game is not theirs to read.

// How many answers may run at once for one account and for the whole server, and how long one may
// take. Each running answer holds a connection to the provider and its context in memory (DRIFT §1);
// a few long ones must never be able to crowd the box. Two per account lets a designer ask in a
// second tab while the first is still answering; eight in all is a handful of designers at once on a
// box with little memory to spare. Three minutes is far beyond any answer to a question and well
// short of a line held open for nothing.
export type AiCaps = { perAccount: number; total: number; timeoutMs: number }
export const AI_CAPS: AiCaps = { perAccount: 2, total: 8, timeoutMs: 180_000 }
// The most a question's body can honestly be: forty turns of twenty thousand characters, with room.
export const ASK_MAX_BYTES = 1024 * 1024
// What an answer may cost at most, in the provider's tokens: enough for a long answer about a game,
// and for a proposal of a few dozen cards (#1002), each a handful of fields of card text. An answer is
// only billed for what it says, so the ceiling is a guard and not a price.
const MAX_TOKENS = 16_000
// What the model is offered to propose with (#1002): the proposal model's own schema, so what the
// provider holds the model to is what the editor reads the answer with.
const PROPOSE = { name: 'propose', description: 'Propose changes to the game for the designer to look at and accept or discard. In this version: new cards, and changes to cards the game has.', schema: proposalSchema() }
// A comment line now and then while the provider thinks, so that nothing between here and the
// browser takes a quiet stream for a dead one (Cloudflare gives up on a response after 100 s).
const HEARTBEAT_MS = 15_000

// What a question is: the question, the conversation it continues, the language the asker uses the
// tool in, and which cards she has selected. Nothing else — the game is the server's to read, never
// the client's to send, and a selection is ids the server looks up in its own copy.
const Turn = z.strictObject({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(20_000) })
export const AskBody = z.strictObject({
  question: z.string().trim().min(1).max(4000),
  // A conversation alternates and begins with the designer, and the question is hers to add, so
  // the turns before it end with an answer.
  turns: z
    .array(Turn)
    .max(40)
    .refine((turns) => turns.every((t, i) => t.role === (i % 2 === 0 ? 'user' : 'assistant')) && turns.length % 2 === 0, 'turns alternate, begin with the designer and end with an answer'),
  lang: z.enum(['sv', 'en']).optional(),
  // The cards the designer has selected (#1003), by id: the server reads them out of its own copy of
  // the game, as it reads the rest of it. As many as a deck can hold, and each id no longer than one.
  selected: z.array(z.string().min(1).max(200)).max(5000).optional(),
  // The proposal the question refines (#1004): the one still waiting in the panel, as the model
  // wrote it and read with the same schema, and the parts the designer left out of it with «Välj
  // delar…», by the keys the editor names them with — `card:2`, `change:<id>`.
  refine: z.strictObject({ proposal: Proposal, leave: z.array(z.string().min(1).max(210)).max(5000) }).optional(),
})
export type AskBody = z.infer<typeof AskBody>

// How an answer went: as the provider said it, or as the server or the asker ended it.
export type AskOutcome = 'ok' | 'cancelled' | 'timeout' | AiFailure
// What goes over the wire, one per event.
// A `part` is one part of a proposal, whole (#1002); `broken` on `done` says a proposal began and was
// cut off before it was whole.
export type AskEvent = { t: 'text'; text: string } | { t: 'part'; key: string; part: unknown } | { t: 'done'; broken?: true } | { t: 'failed'; kind: AiFailure | 'timeout' }

// The answers in flight, counted per account and in all.
export class AiFlight {
  private readonly mine = new Map<string, number>()
  private all = 0
  constructor(readonly caps: AiCaps = AI_CAPS) {}
  // A place for one more answer, or null when there is none; the place is given back by calling
  // what is returned, once.
  take(account: string): (() => void) | null {
    const had = this.mine.get(account) ?? 0
    if (had >= this.caps.perAccount || this.all >= this.caps.total) return null
    this.mine.set(account, had + 1)
    this.all++
    let given = false
    return () => {
      if (given) return
      given = true
      this.all--
      const left = (this.mine.get(account) ?? 1) - 1
      if (left > 0) this.mine.set(account, left)
      else this.mine.delete(account)
    }
  }
}

export type AskWith = { vault: AiKeyVault; providers: AiProviders; flight: AiFlight }

// Answers the question on `res`. The asker has already been let in; what is left to refuse is a
// missing key and a full server, and both are said before anything is streamed.
export async function answerQuestion(ai: AskWith, res: ServerResponse, account: string, doc: ProjectDoc, ask: AskBody): Promise<void> {
  const opened = await ai.vault.open(account)
  if (!opened) return json(res, 409, { error: 'no-key' })
  const giveBack = ai.flight.take(account)
  if (!giveBack) return json(res, 429, { error: 'busy' })
  const adapter = ai.providers[opened.provider]
  const started = Date.now()
  let outcome: AskOutcome = 'ok'
  const stop = new AbortController()
  // Typed by assertion: the closures below set it, which narrowing at the declaration cannot see.
  let ended = null as 'cancelled' | 'timeout' | null
  const send = (event: AskEvent) => {
    if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  // The asker hanging up is the request closing before the answer did.
  const hangUp = () => {
    if (res.writableEnded) return
    ended ??= 'cancelled'
    stop.abort()
  }
  res.on('close', hangUp)
  const timer = setTimeout(() => {
    ended ??= 'timeout'
    stop.abort()
  }, ai.flight.caps.timeoutMs)
  const beat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(': ping\n\n')
  }, HEARTBEAT_MS)
  try {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' })
    // The headers go now, so the editor knows at once that it was let in and the provider is asked.
    res.flushHeaders()
    const request = {
      model: opened.model ?? adapter.defaultModel,
      instructions: `${AI_INSTRUCTIONS}\nThe designer uses the tool in ${ask.lang === 'en' ? 'English' : 'Swedish'}; answer in that language when the language of the question is unclear.`,
      context: aiContextOf(doc),
      // The selected cards stand before the question they are asked about, in the question's own
      // message and not in the game's context: the context is the large part the providers cache,
      // and a selection that changes from one question to the next must not move it.
      messages: [...ask.turns, { role: 'user' as const, text: questionOf(doc, ask) }],
      maxTokens: MAX_TOKENS,
      proposal: PROPOSE,
    }
    for await (const event of adapter.complete(opened.key, request, stop.signal)) {
      if (event.type === 'text') send({ t: 'text', text: event.text })
      else if (event.type === 'part') send({ t: 'part', key: event.key, part: event.value })
      else send(event.broken ? { t: 'done', broken: true } : { t: 'done' })
    }
    if (ended) outcome = ended
  } catch (err) {
    outcome = ended ?? (err instanceof AiProviderError ? err.kind : 'network')
  } finally {
    clearTimeout(timer)
    clearInterval(beat)
    res.off('close', hangUp)
    giveBack()
  }
  if (outcome !== 'ok' && outcome !== 'cancelled') send({ t: 'failed', kind: outcome })
  res.end()
  console.log(JSON.stringify({ msg: 'ai', account, provider: opened.provider, ms: Date.now() - started, outcome }))
}

// The question as the provider is asked it: the proposal it refines, the selected cards, whole, and
// then the question under a heading of its own, so none of them is ever read as another.
function questionOf(doc: ProjectDoc, ask: AskBody): string {
  const before = [...(ask.refine ? refining(ask.refine) : []), aiSelectionOf(doc, ask.selected ?? [])].filter((s): s is string => s !== null)
  return before.length > 0 ? `${before.join('\n\n')}\n\n## Question\n${ask.question}` : ask.question
}

// The proposal still waiting for the designer (#1004), as the model wrote it, and what she left out
// of it. Her message refines it: the model answers with the whole proposal again, revised, which
// takes its place — or, when she asks something else, in words, and the proposal stands.
function refining({ proposal, leave }: NonNullable<AskBody['refine']>): string[] {
  const out = [
    [
      '## Proposal to refine',
      'You proposed this, and the designer has not accepted it; nothing in it is in the game. Her message below refines it: propose the whole proposal again, revised as she asks — every part she still wants, not only the ones that change — and it takes the place of this one. When her message asks something else, answer in words and propose nothing, and this proposal stands.',
      JSON.stringify(proposal),
    ].join('\n'),
  ]
  const left = leave.flatMap((key) => {
    const card = /^card:(\d+)$/.exec(key)
    if (card) {
      const proposed = proposal.cards[Number(card[1]) - 1]
      if (!proposed) return []
      const title = proposed.fields.find((c) => c.field === 'title')?.value
      return [`- New card ${card[1]}${typeof title === 'string' && title.trim() !== '' ? ` (${title})` : ''}`]
    }
    const change = /^change:(.+)$/.exec(key)
    return change && proposal.changes.some((c) => c.card === change[1]) ? [`- The change to card ${change[1]}`] : []
  })
  if (left.length > 0) out.push(['## Left out by the designer', 'She left these parts out of the proposal: leave them out of the revised one unless her message asks for them again.', ...left].join('\n'))
  return out
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
