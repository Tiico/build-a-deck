import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FitReport } from '@byd/template'
import { titleOfRow } from '@byd/server/doc'
import type { ProposalPart, ProposalProblem } from '@byd/server/proposal'
import type { ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { CARD_PX } from './corner.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { deckIssues, groupIssues, issueWords } from './checks.js'
import { cellLine, problemWords, proposalView, translated, type ProposalParts } from './proposals.js'
import { useT, type T } from '../i18n/index.js'

// An AI proposal in the conversation (#1002, #940 variant A): the cards it brings and the cards it
// changes (#1003), each drawn by the one renderer (E2) the moment it arrives — a changed card with
// the values it would have, and beside it what each changed cell was and becomes; what the physical
// check says of them (E5), which never stops them; and what the designer can do with it — lay it on
// the wall among the deck's cards, accept all of it in one step, choose the parts she wants
// («Välj delar…»), or discard it.
//
// The line under it refines it (#1004, in the panel): a refined proposal that arrives whole and
// usable takes its place, and this one then only says that it was replaced.

// How wide a proposed card is drawn in the panel: three to a row in its 380 px, with their names.
const CARD_WIDTH = 84

// `replaced` is a proposal a refined one took the place of (#1004).
export type ProposalVerdict = 'accepted' | 'discarded' | 'replaced'
export type AiProposalProps = {
  id: string
  doc: ProjectDoc
  http: string
  parts: ProposalParts
  // Whether the whole proposal has arrived, and whether it arrived whole.
  done: boolean
  broken: boolean
  verdict: ProposalVerdict | null
  // What an accepted proposal added and changed, said once it was accepted.
  accepted: { cards: number; changed: number }
  onWall: boolean
  // Where showing shows it: on the wall, or in the table's own comparison when Tabell is open.
  showsIn?: 'wall' | 'table'
  onShow(): void
  onAccept(): void
  onDiscard(): void
  onAgain?: (() => void) | undefined
  // «Välj delar…» (#1003): whether the choice stands open, the parts left out, and the ways to open
  // it, to tick or leave a part, and to accept the parts left ticked.
  choosing?: boolean
  leave?: ReadonlySet<string>
  onChoose?: () => void
  onToggle?: (key: string) => void
  onAcceptChosen?: () => void
}

const NONE: ReadonlySet<string> = new Set()

export function AiProposal({ id, doc, http, parts, done, broken, verdict, accepted, onWall, showsIn = 'wall', onShow, onAccept, onDiscard, onAgain, choosing = false, leave = NONE, onChoose, onToggle, onAcceptChosen }: AiProposalProps) {
  const t = useT()
  const read = useMemo(() => (parts.cards.length === 0 && parts.changes.length === 0 ? null : translated(doc, parts)), [doc, parts])
  const view = useMemo(() => (read?.ok ? proposalView(doc, read) : null), [doc, read])
  const face = doc.template.faces['front']
  const icons = useMemo(() => previewIcons({ icons: doc.icons }, http), [doc.icons, http])
  const fonts = useMemo(() => previewFonts({ template: doc.template, fonts: doc.fonts }, http), [doc.template, doc.fonts, http])
  // What the one renderer measured on each proposed card, which is what the physical check reads to
  // say whether a text fits (#808).
  const [measured, setMeasured] = useState<Record<string, readonly FitReport[]>>({})
  const onMeasured = useCallback((cardRef: string, fitted: FitReport[]) => {
    setMeasured((m) => (JSON.stringify(m[cardRef] ?? []) === JSON.stringify(fitted) ? m : { ...m, [cardRef]: fitted }))
  }, [])
  // The choice opens where the keys are: on its first part.
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    if (choosing) list.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus()
  }, [choosing])
  // Nothing proposed after all — the model answered in words.
  if (verdict === null && parts.cards.length === 0 && parts.changes.length === 0 && !broken) return null
  if (verdict !== null) {
    return (
      <div className="byd-ai-proposal" data-verdict={verdict} role="group" aria-label={t('ai.proposal')}>
        <p className="byd-ai-verdict" role="status">
          {verdict === 'accepted' ? acceptedWords(accepted, t) : verdict === 'replaced' ? t('ai.proposal.replaced') : t('ai.proposal.discarded')}
        </p>
      </div>
    )
  }
  const problem: ProposalProblem | { kind: 'broken' } | null = read && !read.ok ? read.problem : broken ? { kind: 'broken' } : null
  if (problem) return <Unusable problem={problem} t={t} onAgain={onAgain} />
  const all: ProposalPart[] = read?.ok ? read.parts : []
  const summary = sizeWords(all, t)
  const label = `${t(done ? 'ai.proposal' : 'ai.proposal.coming')} · ${summary}`
  const groups = done && view ? groupIssues(deckIssues({ ...doc, rows: view.doc.rows.filter((row) => view.added.has(row.id) || view.changed.has(row.id)) }, { front: measured })) : []
  const words = issueWords(t)
  const ticked = all.filter((part) => !leave.has(part.key)).length
  const rowOf = (cardRef: string) => view?.doc.rows.find((row) => row.id === cardRef)
  return (
    <div className="byd-ai-proposal" role="group" aria-label={label} aria-busy={!done}>
      <p className="byd-ai-proposal-head" aria-hidden="true">
        <strong>{t(done ? 'ai.proposal' : 'ai.proposal.coming')}</strong> · {summary}
      </p>
      {face && (
        <ul className="byd-ai-cards" ref={list}>
          {all.map((part, i) => {
            const row = part.kind === 'card' || part.kind === 'change' ? rowOf(part.cardRef) : undefined
            if (!row) return null
            const name = titleOfRow(part.kind === 'change' ? (doc.rows.find((r) => r.id === row.id) ?? row) : row) || t('ai.proposal.untitled', { n: i + 1 })
            const left = choosing && leave.has(part.key)
            const drawn = (
              <div className="byd-ai-card-face">
                {/* The id scopes the card's own style sheet, so it is the part's place and never its
                    key, whose colon would end the selector. */}
                <CardPreview id={`ai-${id}-${i}`} face={face} row={row.fields} icons={icons} fonts={fonts} scale={CARD_WIDTH / CARD_PX} assetBase={http} palette={doc.palette} onMeasured={(fitted) => onMeasured(row.id, fitted)} />
              </div>
            )
            const named = (
              <span className="byd-ai-card-name">
                {choosing && <input type="checkbox" checked={!leave.has(part.key)} onChange={() => onToggle?.(part.key)} aria-label={t('ai.proposal.take', { name })} />}
                <span>{name}</span>
              </span>
            )
            const Wrap = choosing ? 'label' : 'div'
            return (
              <li key={part.key} className="byd-ai-card" {...(part.kind === 'change' ? { 'data-changed': '' } : {})} {...(left ? { 'data-left': '' } : {})}>
                {part.kind === 'change' ? (
                  <Wrap className="byd-ai-change">
                    {drawn}
                    <span className="byd-ai-change-text">
                      {named}
                      {/* Its key too, since a deck has several cards of one name — four «Duel». */}
                      <span className="byd-ai-card-ref">{part.cardRef}</span>
                      <span className="byd-ai-cells">
                        {part.cells.map((cell) => (
                          <span key={cell.field} className="byd-ai-cell">
                            {cellLine(cell, t)}
                          </span>
                        ))}
                      </span>
                    </span>
                  </Wrap>
                ) : (
                  <Wrap className="byd-ai-new">
                    {drawn}
                    {named}
                  </Wrap>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {groups.length > 0 && (
        <div className="byd-ai-checks">
          <p>
            <strong>{t('ai.proposal.checks')}</strong>
          </p>
          <ul>
            {groups.map((group) => (
              <li key={group.code}>{t(group.cards.length === 1 ? 'ai.proposal.checks.cards.one' : 'ai.proposal.checks.cards.other', { what: words[group.code], n: group.cards.length })}</li>
            ))}
          </ul>
          <p className="byd-ai-quiet">{t('ai.proposal.checks.note')}</p>
        </div>
      )}
      {done && all.length > 1 && !choosing && onChoose && (
        // A way into the choice, not one of the three things to do with the proposal: drawn as a
        // link above their row, so the row keeps «Godta alla» in its middle (E4).
        <button type="button" className="byd-ai-choose" onClick={onChoose}>
          {t('ai.proposal.choose')}
        </button>
      )}
      {/* While the choice stands, the link's place says how much of the proposal is chosen, so the
          button that accepts it keeps a name as short as «Godta alla» and the row stays one row. */}
      {done && choosing && (
        <p className="byd-ai-chosen" aria-live="polite">
          {/* The noun counts the whole: «1 av 5 delar valda». */}
          {t(all.length === 1 ? 'ai.proposal.chosen.one' : 'ai.proposal.chosen.other', { n: ticked, total: all.length })}
        </p>
      )}
      {done && (
        <div className="byd-ai-decide">
          {/* A switch, drawn as the language draws a thing that is on (L13): the chosen pill. */}
          <button type="button" className="byd-choice" aria-pressed={onWall} onClick={onShow}>
            {t(showsIn === 'table' ? 'ai.proposal.showTable' : 'ai.proposal.show')}
          </button>
          {/* Outlined and not filled (L13): the header's «Starta/Uppdatera bord» is the view's first
              action, and the one filled button a view may have. While parts are being chosen, the
              same place accepts the ones left ticked — and nothing is not a choice it takes. */}
          {choosing ? (
            <button type="button" className="byd-secondary" aria-disabled={ticked === 0} onClick={() => ticked > 0 && onAcceptChosen?.()}>
              {t('ai.proposal.acceptChosen')}
            </button>
          ) : (
            <button type="button" className="byd-secondary" onClick={onAccept}>
              {t('ai.proposal.accept')}
            </button>
          )}
          <button type="button" className="byd-secondary" onClick={onDiscard}>
            {t('ai.proposal.discard')}
          </button>
        </div>
      )}
    </div>
  )
}

// How big a proposal is, in its own words: «3 nya kort», «2 ändrade kort», or both.
function sizeWords(parts: readonly ProposalPart[], t: T): string {
  const cards = parts.filter((p) => p.kind === 'card').length
  const changed = parts.filter((p) => p.kind === 'change').length
  const said: string[] = []
  if (cards > 0 || changed === 0) said.push(t(cards === 1 ? 'ai.proposal.cards.one' : 'ai.proposal.cards.other', { n: cards }))
  if (changed > 0) said.push(t(changed === 1 ? 'ai.proposal.changed.one' : 'ai.proposal.changed.other', { n: changed }))
  return said.join(', ')
}

// What an accepted proposal did: new cards in the deck, changed cards, or both.
function acceptedWords({ cards, changed }: { cards: number; changed: number }, t: T): string {
  if (changed === 0) return t(cards === 1 ? 'ai.proposal.accepted.one' : 'ai.proposal.accepted.other', { n: cards })
  const changedWords = t(changed === 1 ? 'ai.proposal.changed.one' : 'ai.proposal.changed.other', { n: changed })
  if (cards === 0) return t('ai.proposal.accepted.changed', { changed: changedWords })
  return t('ai.proposal.accepted.both', { cards: t(cards === 1 ? 'ai.proposal.cards.one' : 'ai.proposal.cards.other', { n: cards }), changed: changedWords })
}

function Unusable({ problem, t, onAgain }: { problem: ProposalProblem | { kind: 'broken' }; t: T; onAgain?: (() => void) | undefined }) {
  return (
    <div className="byd-ai-fail" role="alert">
      <strong>{t('ai.unusable')}</strong>
      <span>
        {problemWords(problem, t)} {t('ai.unusable.text')}
      </span>
      {onAgain && (
        <button type="button" className="byd-secondary" onClick={onAgain}>
          {t('ai.again')}
        </button>
      )}
    </div>
  )
}
