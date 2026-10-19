import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { parseBody, type InlineNode } from '@byd/template'
import { aiContextParts } from '@byd/server/doc'
import type { ProjectDoc } from './types.js'
import { PROVIDER_NAMES, listAiModels, modelNameOf, readAiKey, type AiKey, type AiModel } from '../account/ai-key.js'
import { askAi, type AskFailure, type AskTurn, type Asking } from './ai-ask.js'
import type { EditIntent } from '@byd/server/doc'
import { AiProposal, type ProposalVerdict } from './AiProposal.js'
import { noParts, translated, withPart, type ProposalParts, type ShownProposal } from './proposals.js'
import { useMarked } from './marked.js'
import { titleOfRow } from '@byd/server/doc'
import { useLang, useT, type Key, type T } from '../i18n/index.js'

// The AI panel beside the editor's work (#1001, E4, #940 variant A): a conversation about the game,
// docked at the work surface's side in every tab, and folded to a narrow tab when it is not wanted.
//
// The designer asks; the server reads the game itself and asks her provider with her own key; the
// answer comes back a piece at a time into a polite live region, busy while it streams, so a screen
// reader reads it once it is whole rather than word by word (PRD 44, L12). Sending becomes stopping
// in the same place while an answer comes, and Escape in the question stops it too: a stopped
// answer stops at the provider as well, so it stops costing her.
//
// Without a key the panel is the way to the profile page where a key is added (#999), and the
// editor is otherwise as it was (PRD 9): the tab at the edge is all it adds.
//
// What is sent is said before it is sent — «Skickas till Anthropic: 77 kort · mallen · …» — read
// off the same reading of the game the server's context is built from (`aiContextParts`).

export type AiKeyState = { kind: 'off' } | { kind: 'loading' } | { kind: 'ready'; key: AiKey | null }

// Whether the account has a key, asked once when the editor opens so the panel is decided before
// the work is drawn. A server with no AI, or nobody logged in to ask for, has no panel at all.
export function useAiKey(http: string, wanted: boolean): [AiKeyState, (key: AiKey | null) => void] {
  const [state, setState] = useState<AiKeyState>({ kind: 'loading' })
  useEffect(() => {
    if (!wanted) return
    let live = true
    readAiKey(http).then(
      ({ key }) => live && setState({ kind: 'ready', key }),
      () => live && setState({ kind: 'off' }),
    )
    return () => {
      live = false
    }
  }, [http, wanted])
  return [state, (key) => setState({ kind: 'ready', key })]
}

// Whether the panel stands open, remembered for this reader across games and visits. Unsaid, it
// stands open for a designer with a key.
const OPEN_KEY = 'byd.ai.panel'
function rememberedOpen(): boolean | null {
  try {
    const said = localStorage.getItem(OPEN_KEY)
    return said === 'open' ? true : said === 'closed' ? false : null
  } catch {
    return null
  }
}
function rememberOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? 'open' : 'closed')
  } catch {
    // A browser that keeps nothing still opens and closes the panel; it only forgets.
  }
}

type TurnState = 'waiting' | 'streaming' | 'done' | 'cancelled' | 'failed'
// A proposal the answer brought (#1002): its parts as they arrived, whether it was cut off, and what
// the designer did with it.
// `leave` is the parts the designer has left out with «Välj delar…» (#1003), and `choosing` whether the
// choice stands open; `accepted` is what an accepted proposal added and changed.
type TurnProposal = { parts: ProposalParts; broken: boolean; verdict: ProposalVerdict | null; accepted: { cards: number; changed: number }; leave: ReadonlySet<string>; choosing: boolean }
type Turn = { id: number; question: string; answer: string; state: TurnState; failure?: AskFailure; proposal?: TurnProposal }
const freshProposal = (): TurnProposal => ({ parts: noParts(), broken: false, verdict: null, accepted: { cards: 0, changed: 0 }, leave: new Set(), choosing: false })
// The failures worth asking again about as they are: a pause, a busy provider, a broken line.
const AGAIN: readonly AskFailure[] = ['rate-limit', 'overloaded', 'network', 'timeout', 'busy', 'offline']
// The conversation the next question carries, in pairs: at most the last twenty (the server's own
// ceiling), and only answers that came whole.
const MAX_TURNS = 40

export type AiPanelProps = {
  http: string
  project: string
  doc: ProjectDoc
  aiKey: AiKey | null
  // Where the key is added or changed, with the way back to this game (#999).
  profileUrl: string
  // Leaves the editor for the profile, by the editor's own way out (L9), handing back the element
  // the keyboard should return to if the designer stays.
  onLeave(url: string, from: HTMLElement): void
  // The server found no key after all — it was removed in another tab.
  onKeyGone(): void
  // Whether the open panel lies over the work as a sheet rather than beside it (beställarens beslut
  // 2026-10-18, #1001): in Speltema and Bord, whose surfaces are measured to the pixel (#741, #652,
  // #685), it takes none of their width, and what it covers is there again when it folds.
  over?: boolean
  // A proposal laid on the wall among the deck's cards, as ghosts that are not in the game, or taken
  // off it with null (#1002) — with the parts left out of it, which the wall leaves out too (#1003).
  // The panel keeps which proposal it is; the wall and the table only draw it.
  onShowOnWall?(shown: ShownProposal | null): void
  // Whether a proposal stands on the wall at all: the table can take it off as well (#1003).
  wallShown?: boolean
  // Where showing a proposal shows it (#1003): the table shows it in its own comparison, and so the
  // button says the table there.
  showsIn?: 'wall' | 'table'
  // The card chosen on the wall or in the table (#1003): with the rows ticked in Tabell, the cards
  // the question is about, sent with it.
  chosen?: string | null
  // An accepted proposal, as the edits it is: applied as one (#1002).
  onAccept?(edits: readonly EditIntent[]): void
}

export function AiPanel({ http, project, doc, aiKey, profileUrl, onLeave, onKeyGone, over = false, onShowOnWall, onAccept, wallShown = true, showsIn = 'wall', chosen = null }: AiPanelProps) {
  const t = useT()
  const { lang } = useLang()
  // Without a key it always starts folded: the editor is to look as it did (PRD 9), whatever the
  // reader last did with the panel.
  const [open, setOpen] = useState(() => aiKey !== null && (rememberedOpen() ?? true))
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const asking = useRef<{ id: number; asking: Asking } | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  // Which turn's proposal stands on the wall, if any — for as long as the editor still shows it.
  const [wallTurnHeld, setWallTurn] = useState<number | null>(null)
  const wallTurn = wallShown ? wallTurnHeld : null
  // The cards selected in the editor (#1003): the one chosen on the wall or in the table, and the
  // rows ticked in Tabell — the same marking the bulk editor works on (#222). In the deck's order.
  const [marked] = useMarked()
  const selected = doc.rows.filter((row) => row.id === chosen || marked.has(row.id))
  const next = useRef(1)
  const field = useRef<HTMLTextAreaElement>(null)
  const profileLink = useRef<HTMLAnchorElement>(null)
  const rail = useRef<HTMLButtonElement>(null)
  const log = useRef<HTMLDivElement>(null)
  // Where the keys go after the panel is opened or folded by hand; nothing moves them on load.
  const [handTo, setHandTo] = useState<'inside' | 'rail' | null>(null)
  const panelId = useId()
  const titleId = useId()
  const sentId = useId()
  const leadId = useId()
  const provider = aiKey ? PROVIDER_NAMES[aiKey.provider] : ''
  // The key's models as the provider names them, the list the profile's picker is drawn from, so the
  // head says «Claude Sonnet 5.5» where the profile does and not the model's id.
  const [models, setModels] = useState<AiModel[] | null>(null)
  const keyed = aiKey?.provider ?? null
  useEffect(() => {
    if (!keyed) return
    let live = true
    listAiModels(http).then(
      (list) => live && list && setModels(list.models),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [http, keyed])

  // An answer still coming when the editor closes is hung up on, not left running at the provider.
  useEffect(() => () => asking.current?.asking.cancel(), [])

  useEffect(() => {
    if (!handTo) return
    setHandTo(null)
    if (handTo === 'rail') rail.current?.focus()
    else (field.current ?? profileLink.current)?.focus()
  }, [handTo])

  // The log follows the answer down while the reader is at its end, and stays where she scrolled to
  // when she has gone back up to read something.
  const atEnd = useRef(true)
  useLayoutEffect(() => {
    const box = log.current
    if (box && atEnd.current) box.scrollTop = box.scrollHeight
  }, [turns])

  const fold = (to: boolean) => {
    // A proposal on the wall is driven from here; folded away, nothing would take it off again.
    if (!to && wallTurn !== null) {
      setWallTurn(null)
      onShowOnWall?.(null)
    }
    setOpen(to)
    rememberOpen(to)
    setHandTo(to ? 'inside' : 'rail')
  }

  const update = (id: number, change: (turn: Turn) => Turn) => setTurns((all) => all.map((turn) => (turn.id === id ? change(turn) : turn)))

  const run = (id: number, question: string, before: readonly Turn[]) => {
    const history: AskTurn[] = before
      .filter((turn) => turn.state === 'done' && turn.answer.trim() !== '')
      .flatMap((turn): AskTurn[] => [
        { role: 'user', text: turn.question },
        { role: 'assistant', text: turn.answer },
      ])
      .slice(-MAX_TURNS)
    const done = () => {
      if (asking.current?.id === id) asking.current = null
      setBusy((now) => (now === id ? null : now))
    }
    const call = askAi(http, project, { question, turns: history, lang, ...(selected.length > 0 ? { selected: selected.map((row) => row.id) } : {}) }, (event) => {
      if (event.t === 'text') update(id, (turn) => ({ ...turn, answer: turn.answer + event.text, state: 'streaming' }))
      else if (event.t === 'part') {
        update(id, (turn) => {
          const had = turn.proposal ?? freshProposal()
          return { ...turn, state: 'streaming', proposal: { ...had, parts: withPart(had.parts, event.key, event.part) } }
        })
      } else if (event.t === 'done') {
        update(id, (turn) => ({ ...turn, state: 'done', ...(event.broken ? { proposal: { ...(turn.proposal ?? freshProposal()), broken: true } } : {}) }))
        done()
      } else {
        update(id, (turn) => ({ ...turn, state: 'failed', failure: event.kind }))
        done()
        if (event.kind === 'no-key') onKeyGone()
      }
    })
    asking.current = { id, asking: call }
    setBusy(id)
  }

  const send = (said: string) => {
    const question = said.trim()
    if (!question || asking.current) return
    const id = next.current++
    const before = turns
    setTurns([...before, { id, question, answer: '', state: 'waiting' }])
    setDraft('')
    atEnd.current = true
    run(id, question, before)
  }

  const again = (turn: Turn) => {
    if (asking.current) return
    offWall(turn.id)
    update(turn.id, (had) => ({ id: had.id, question: had.question, answer: '', state: 'waiting' }))
    atEnd.current = true
    run(
      turn.id,
      turn.question,
      turns.filter((other) => other.id < turn.id),
    )
  }

  const setProposal = (id: number, change: (proposal: TurnProposal) => TurnProposal) => update(id, (turn) => (turn.proposal ? { ...turn, proposal: change(turn.proposal) } : turn))
  const offWall = (id: number) => {
    if (wallTurn !== id) return
    setWallTurn(null)
    onShowOnWall?.(null)
  }
  const showOnWall = (turn: Turn) => {
    if (!turn.proposal) return
    if (wallTurn === turn.id) return offWall(turn.id)
    setWallTurn(turn.id)
    onShowOnWall?.({ parts: turn.proposal.parts, leave: turn.proposal.leave })
  }
  // A part ticked or left (#1003): the wall, when it shows this proposal, shows the choice with it.
  const choose = (turn: Turn, key: string) => {
    if (!turn.proposal) return
    const leave = new Set(turn.proposal.leave)
    if (leave.has(key)) leave.delete(key)
    else leave.add(key)
    setProposal(turn.id, (proposal) => ({ ...proposal, leave }))
    if (wallTurn === turn.id) onShowOnWall?.({ parts: turn.proposal.parts, leave })
  }
  // Accepted against the game as it stands at this moment: what lands is what the game takes now —
  // the whole proposal, or the parts left ticked (#1003), and never nothing.
  const accept = (turn: Turn, chosenOnly: boolean) => {
    if (!turn.proposal || !onAccept) return
    const read = translated(doc, turn.proposal.parts, chosenOnly ? turn.proposal.leave : undefined)
    if (!read.ok || read.edits.length === 0) return
    onAccept(read.edits)
    const accepted = { cards: read.parts.filter((p) => p.kind === 'card').length, changed: read.parts.filter((p) => p.kind === 'change').length }
    setProposal(turn.id, (proposal) => ({ ...proposal, verdict: 'accepted', accepted, choosing: false }))
    offWall(turn.id)
  }
  const discard = (turn: Turn) => {
    setProposal(turn.id, (proposal) => ({ ...proposal, verdict: 'discarded', choosing: false }))
    offWall(turn.id)
  }

  const cancel = () => {
    const now = asking.current
    if (!now) return
    asking.current = null
    now.asking.cancel()
    update(now.id, (turn) => ({ ...turn, state: 'cancelled' }))
    setBusy(null)
  }

  const toProfile = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    onLeave(profileUrl, event.currentTarget)
  }

  if (!open) {
    return (
      <aside className="byd-ai" aria-label={t('ai.title')}>
        <button ref={rail} type="button" className="byd-ai-rail" aria-expanded={false} aria-controls={panelId} onClick={() => fold(true)}>
          <span className="byd-ai-spark" aria-hidden="true">
            ✦
          </span>
          {t('ai.title')}
        </button>
      </aside>
    )
  }

  const parts = aiContextParts(doc)
  // The selected cards are said first, since they are what the question is about (#1003) — and said
  // as the editor shows them (#1037): the chosen card by its name, as its ring on the wall and its
  // row in the table show it, and the ticked rows as the table's foot counts them. One number for
  // both said «2 markerade» over a foot that said «1 markerat kort», and both were true.
  const chosenAlone = chosen !== null && !marked.has(chosen) ? selected.find((row) => row.id === chosen) : undefined
  const ticked = selected.filter((row) => marked.has(row.id)).length
  const picked = [
    ...(chosenAlone ? [t('ai.sent.chosen', { name: titleOfRow(chosenAlone) || chosenAlone.id })] : []),
    ...(ticked > 0 ? [t(ticked === 1 ? 'ai.sent.marked.one' : 'ai.sent.marked.other', { n: ticked })] : []),
  ]
  const chips = [...picked, t(parts.cards === 1 ? 'ai.sent.cards.one' : 'ai.sent.cards.other', { n: parts.cards }), ...(parts.template ? [t('ai.sent.template')] : []), ...(parts.rules ? [t('ai.sent.rules')] : []), ...(parts.table ? [t('ai.sent.table')] : [])]
  const model = aiKey ? modelNameOf(models, aiKey.model ?? aiKey.defaultModel) : ''

  return (
    <>
    {/* Over Speltema and Bord the work keeps the folded tab's room and no more, so nothing under the
        sheet moves when it opens or folds. */}
    {over && <div className="byd-ai-room" aria-hidden="true" />}
    <aside
      className="byd-ai"
      id={panelId}
      data-open=""
      {...(over ? { 'data-over': '' } : {})}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        // A sheet over the work is put away with Escape, as every sheet in the editor is (L55); an
        // answer on its way is stopped first, by the question's own Escape.
        if (!over || event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        event.stopPropagation()
        fold(false)
      }}
    >
      <header className="byd-ai-head">
        <h2 id={titleId}>
          <span className="byd-ai-spark" aria-hidden="true">
            ✦
          </span>{' '}
          {t('ai.title')}
        </h2>
        {aiKey && (
          <a className="byd-ai-who" href={profileUrl} onClick={toProfile} aria-label={t('ai.who.label', { provider, model })}>
            {t('ai.who', { provider, model })}
          </a>
        )}
        <button type="button" className="byd-ai-close" aria-label={t('ai.close')} aria-expanded={true} aria-controls={panelId} onClick={() => fold(false)}>
          <span aria-hidden="true">⟩</span>
        </button>
      </header>
      <div
        className="byd-ai-log"
        ref={log}
        onScroll={(event) => {
          const box = event.currentTarget
          atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24
        }}
      >
        {!aiKey && (
          <div className="byd-ai-empty">
            <p>{t('ai.nokey.lead')}</p>
            <a ref={profileLink} className="byd-secondary byd-ai-to-profile" href={profileUrl} onClick={toProfile}>
              {t('ai.nokey.link')}
            </a>
            <p className="byd-ai-quiet">{t('ai.nokey.rest')}</p>
          </div>
        )}
        {aiKey && turns.length === 0 && (
          <div className="byd-ai-empty">
            <p id={leadId}>{t('ai.lead', { provider })}</p>
            <ul className="byd-ai-suggest" aria-label={t('ai.suggest')}>
              {(['ai.suggest.unused', 'ai.suggest.summary'] as const).map((key) => (
                <li key={key}>
                  <button type="button" className="byd-secondary" onClick={() => send(t(key))}>
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {turns.length > 0 && (
          <ol className="byd-ai-turns">
            {turns.map((turn) => (
              <li key={turn.id} className="byd-ai-turn">
                <p className="byd-ai-said">
                  <span className="byd-offscreen">{t('ai.you')}: </span>
                  {turn.question}
                </p>
                {turn.state === 'waiting' && <p className="byd-ai-quiet byd-ai-reading">{t('ai.reading')}</p>}
                <div className="byd-ai-answer" aria-live="polite" aria-busy={turn.state === 'waiting' || turn.state === 'streaming'}>
                  {answerOf(turn.answer)}
                  {turn.state === 'cancelled' && <p className="byd-ai-quiet">{t('ai.cancelled')}</p>}
                </div>
                {turn.proposal && turn.state !== 'cancelled' && turn.state !== 'failed' && (
                  <AiProposal
                    id={String(turn.id)}
                    doc={doc}
                    http={http}
                    parts={turn.proposal.parts}
                    done={turn.state === 'done'}
                    broken={turn.proposal.broken}
                    verdict={turn.proposal.verdict}
                    accepted={turn.proposal.accepted}
                    onWall={wallTurn === turn.id}
                    showsIn={showsIn}
                    onShow={() => showOnWall(turn)}
                    onAccept={() => accept(turn, false)}
                    choosing={turn.proposal.choosing}
                    leave={turn.proposal.leave}
                    onChoose={() => setProposal(turn.id, (proposal) => ({ ...proposal, choosing: true }))}
                    onToggle={(key) => choose(turn, key)}
                    onAcceptChosen={() => accept(turn, true)}
                    onDiscard={() => discard(turn)}
                    onAgain={busy === null ? () => again(turn) : undefined}
                  />
                )}
                {turn.state === 'failed' && turn.failure && turn.failure !== 'no-key' && (
                  <Failure kind={turn.failure} provider={provider} t={t} profileUrl={profileUrl} onProfile={toProfile} {...(AGAIN.includes(turn.failure) ? { onAgain: () => again(turn) } : {})} />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
      {aiKey && (
        <form
          className="byd-ai-compose"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy !== null) cancel()
            else send(draft)
          }}
        >
          <p className="byd-ai-sent" id={sentId}>
            <span className="byd-ai-quiet">{t('ai.sent', { provider })}</span>
            {chips.map((chip, i) => (
              <Fragment key={chip}>
                {' '}
                <span className="byd-ai-chip">{chip}</span>
                {i < chips.length - 1 && <span className="byd-offscreen">,</span>}
              </Fragment>
            ))}
          </p>
          <textarea
            ref={field}
            className="byd-ai-field"
            rows={3}
            maxLength={4000}
            aria-label={t('ai.field')}
            aria-describedby={turns.length === 0 ? `${leadId} ${sentId}` : sentId}
            placeholder={t('ai.field.placeholder')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                send(draft)
              }
              if (event.key === 'Escape' && busy !== null) {
                event.preventDefault()
                event.stopPropagation()
                cancel()
              }
            }}
          />
          <div className="byd-ai-row">
            {/* One button that sends and, while an answer comes, stops it: the same element in the
                same place, so the keys that pressed it stay on it. */}
            <button type="submit" className="byd-secondary byd-ai-send" aria-disabled={busy === null && draft.trim() === ''}>
              {t(busy !== null ? 'ai.cancel' : 'ai.send')}
            </button>
          </div>
        </form>
      )}
    </aside>
    </>
  )
}

function Failure({ kind, provider, t, profileUrl, onProfile, onAgain }: { kind: Exclude<AskFailure, 'no-key'>; provider: string; t: T; profileUrl: string; onProfile(event: MouseEvent<HTMLAnchorElement>): void; onAgain?: () => void }) {
  return (
    <div className="byd-ai-fail" role="alert">
      <strong>{t(`ai.error.${kind}` as Key, { provider })}</strong>
      <span>{t(`ai.error.${kind}.text` as Key, { provider })}</span>
      {kind === 'invalid-key' && (
        <a className="byd-secondary" href={profileUrl} onClick={onProfile}>
          {t('ai.error.profile')}
        </a>
      )}
      {onAgain && (
        <button type="button" className="byd-secondary" onClick={onAgain}>
          {t('ai.again')}
        </button>
      )}
    </div>
  )
}

// The answer as a reader reads it: paragraphs, points, bold and italic — the subset card text is
// written in (L2), which the model is told to answer in. Nothing in it is ever markup: the parser
// makes a tree and this draws its text, so a `<b>` the model wrote is two angle brackets and a b.
function answerOf(text: string): ReactNode {
  if (!text) return null
  return parseBody(text).map((block, i) =>
    block.type === 'paragraph' ? (
      <p key={i}>{inline(block.children)}</p>
    ) : (
      <ul key={i}>
        {block.items.map((item, j) => (
          <li key={j}>{inline(item)}</li>
        ))}
      </ul>
    ),
  )
}

function inline(nodes: readonly InlineNode[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return <Fragment key={i}>{node.text}</Fragment>
      case 'bold':
        return <strong key={i}>{inline(node.children)}</strong>
      case 'italic':
        return <em key={i}>{inline(node.children)}</em>
      // An icon is the game's word for one, and the answer says the word as the card text would.
      case 'icon':
        return <Fragment key={i}>{`{${node.name}${node.role ? `|${node.role}` : ''}}`}</Fragment>
      case 'ref':
        return <Fragment key={i}>{node.id}</Fragment>
    }
  })
}
