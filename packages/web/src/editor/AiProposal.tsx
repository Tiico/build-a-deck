import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { elementsFor, plainOf, renderRules, type FitReport, type RenderedBlock } from '@byd/template'
import { arrangementOf, namesOfProject, titleOfRow } from '@byd/server/doc'
import type { ProposalPart, ProposalProblem } from '@byd/server/proposal'
import type { ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { CARD_PX } from './corner.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { deckIssues, groupIssues, issueWords, type Found } from './checks.js'
import { cellLine, hasParts, problemWords, proposalView, rulesWords, translated, type ProposalParts } from './proposals.js'
import { fieldLabel } from './fields.js'
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
// What an accepted proposal added and changed, the template it laid on a face, with how many new
// fields it brought (#1005), and the rule text it added to the book and rewrote in it (#1006).
export type Accepted = { cards: number; changed: number; template?: { face: string; fields: number }; rules?: { added: number; rewritten: number } }
export function acceptedOf(parts: readonly ProposalPart[]): Accepted {
  const template = parts.find((p) => p.kind === 'template')
  const rules = parts.flatMap((p) => (p.kind === 'rules' ? [p] : []))
  return {
    cards: parts.filter((p) => p.kind === 'card').length,
    changed: parts.filter((p) => p.kind === 'change').length,
    ...(template ? { template: { face: template.face, fields: template.fields.length } } : {}),
    ...(rules.length > 0 ? { rules: { added: rules.filter((p) => p.replaced.length === 0).length, rewritten: rules.filter((p) => p.replaced.length > 0).length } } : {}),
  }
}
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
  accepted: Accepted
  onWall: boolean
  // Where showing shows it: on the wall, in the table's own comparison when Tabell is open, or in the
  // book when Regler is (#1006).
  showsIn?: 'wall' | 'table' | 'rules'
  onShow(): void
  // Shows the proposal in the book from another tab, for a proposal that also has cards or a template
  // to show on the wall (#1006): «Visa i regelboken» beside its rule text.
  onShowRules?: (() => void) | undefined
  onAccept(): void
  onDiscard(): void
  onAgain?: (() => void) | undefined
  // What was wrong with the proposal the AI was given its one chance to correct (#1184): said under
  // a corrected one, and beside the reason when the corrected one could not be used either.
  corrected?: ProposalProblem | undefined
  // «Välj delar…» (#1003): whether the choice stands open, the parts left out, and the ways to open
  // it, to tick or leave a part, and to accept the parts left ticked.
  choosing?: boolean
  leave?: ReadonlySet<string>
  onChoose?: () => void
  onToggle?: (key: string) => void
  onAcceptChosen?: () => void
}

const NONE: ReadonlySet<string> = new Set()

export function AiProposal({ id, doc, http, parts, done, broken, verdict, accepted, onWall, showsIn = 'wall', onShow, onShowRules, onAccept, onDiscard, onAgain, corrected, choosing = false, leave = NONE, onChoose, onToggle, onAcceptChosen }: AiProposalProps) {
  const t = useT()
  const read = useMemo(() => (hasParts(parts) ? translated(doc, parts) : null), [doc, parts])
  const view = useMemo(() => (read?.ok ? proposalView(doc, read) : null), [doc, read])
  // A template (#1005) is drawn on a few of the deck's cards, one of each look it gives them first, so
  // a group of the template that only some cards fall in is seen in the panel and not only on the wall.
  const templatePart = read?.ok ? read.parts.find((part) => part.kind === 'template') : undefined
  // The proposal's cards are drawn with the template it would leave the game with: its own, unless
  // the designer is leaving it out, when they would land in the game's (#1005).
  const face = (view && !(templatePart && choosing && leave.has(templatePart.key)) ? view.doc : doc).template.faces['front']
  const samples = useMemo(() => {
    if (!view || !templatePart) return []
    const proposedFace = view.doc.template.faces[templatePart.face]
    if (!proposedFace) return []
    const deck = view.doc.rows.filter((row) => !view.added.has(row.id))
    const looks = new Set<string>()
    const first = deck.filter((row) => {
      const look = JSON.stringify(elementsFor(proposedFace, row.fields))
      if (looks.has(look)) return false
      looks.add(look)
      return true
    })
    return [...first, ...deck.filter((row) => !first.includes(row))].slice(0, 3).map((row) => ({ row, face: proposedFace }))
  }, [view, templatePart])
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
  if (verdict === null && !hasParts(parts) && !broken) return null
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
  // A proposal that cannot be used is judged when it has come whole (#1184): until then the rest of it
  // may still be on its way, and the AI is given it back once to correct before anything is refused.
  if (problem && !done) return null
  if (problem) return <Unusable problem={problem} t={t} onAgain={onAgain} corrected={corrected !== undefined} />
  const all: ProposalPart[] = read?.ok ? read.parts : []
  const summary = sizeWords(all, t)
  const label = `${t(done ? 'ai.proposal' : 'ai.proposal.coming')} · ${summary}`
  // The physical check runs on every card the proposal touches, a card the proposed template draws
  // differently among them, with the proposal's template (E5); it says, and never stops anything. A
  // card the template only redraws is the proposal's on that face alone (#1005): its other face is
  // the game's, and what is said of it there was said before the proposal came.
  const touched = (row: { id: string }) => view !== null && (view.added.has(row.id) || view.changed.has(row.id) || view.redrawn.has(row.id))
  const changedCards = new Set(read?.ok ? read.parts.flatMap((part) => (part.kind === 'change' ? [part.cardRef] : [])) : [])
  const ownFound = (found: Found) => view !== null && (found.face === view.face || view.added.has(found.cardRef) || changedCards.has(found.cardRef))
  const groups = done && view ? groupIssues(deckIssues({ ...view.doc, rows: view.doc.rows.filter(touched) }, { [view.face]: measured }).filter(ownFound)) : []
  const words = issueWords(t)
  const ticked = all.filter((part) => !leave.has(part.key)).length
  const rowOf = (cardRef: string) => view?.doc.rows.find((row) => row.id === cardRef)
  // Rule text (#1006) is read as the book reads it, what a rule names said by the name it has.
  const rulesOnly = all.length > 0 && all.every((part) => part.kind === 'rules')
  const hasRules = all.some((part) => part.kind === 'rules')
  const names = view ? namesOfProject(view.doc) : null
  return (
    <div className="byd-ai-proposal" role="group" aria-label={label} aria-busy={!done}>
      <p className="byd-ai-proposal-head" aria-hidden="true">
        <strong>{t(done ? 'ai.proposal' : 'ai.proposal.coming')}</strong> · {summary}
      </p>
      {(face || hasRules) && (
        <ul className="byd-ai-cards" ref={list}>
          {all.map((part, i) => {
            if (part.kind === 'rules') {
              // An entry of rule text, one part (#1006): its first heading or its place for a name,
              // and its blocks as the book reads them, a little of each.
              const n = Number(part.key.slice('rules:'.length))
              const rendered = view && names ? renderRules({ title: '', blocks: part.blocks }, names, arrangementOf(view.doc)).blocks : []
              const heading = rendered.find((block): block is Extract<RenderedBlock, { kind: 'heading' }> => block.kind === 'heading')
              const said = heading ? plainOf(heading.children).trim() : ''
              const name = said !== '' ? said : t('ai.proposal.rules.name', { n })
              const read = rendered.filter((block) => block !== heading)
              const left = choosing && leave.has(part.key)
              const Wrap = choosing ? 'label' : 'div'
              const replaced = part.replaced.length
              return (
                <li key={part.key} className="byd-ai-card" data-rules="" {...(left ? { 'data-left': '' } : {})}>
                  <Wrap className="byd-ai-rules">
                    <span className="byd-ai-card-name">
                      {choosing && <input type="checkbox" checked={!leave.has(part.key)} onChange={() => onToggle?.(part.key)} aria-label={t('ai.proposal.take', { name })} />}
                      <span>{name}</span>
                    </span>
                    {replaced > 0 && (
                      <span className="byd-ai-cell">{t(part.blocks.length === 0 ? (replaced === 1 ? 'ai.proposal.rules.removes.one' : 'ai.proposal.rules.removes.other') : replaced === 1 ? 'ai.proposal.rules.replaces.one' : 'ai.proposal.rules.replaces.other', { n: replaced })}</span>
                    )}
                    <span className="byd-ai-rules-text">
                      {read.map((block) => (
                        <span key={block.id} className="byd-ai-rules-line">
                          {ruleLine(block)}
                        </span>
                      ))}
                    </span>
                  </Wrap>
                  {/* From a proposal that also shows on the wall, the way to the book (#1006): a link,
                      as «Välj delar…» is, and never inside the label a choice makes of the part. */}
                  {done && !choosing && !rulesOnly && onShowRules && (
                    <button type="button" className="byd-ai-choose" onClick={onShowRules}>
                      {t('ai.proposal.showRules')}
                    </button>
                  )}
                </li>
              )
            }
            if (!face) return null
            if (part.kind === 'template') {
              // The template and the fields it brings, one part (#1003): a few of the deck's cards
              // drawn with it, what it is called, and the new fields with how many cards get a value.
              const name = t(part.face === 'back' ? 'ai.proposal.template.name.back' : 'ai.proposal.template.name.front')
              const left = choosing && leave.has(part.key)
              const Wrap = choosing ? 'label' : 'div'
              return (
                <li key={part.key} className="byd-ai-card" data-template="" {...(left ? { 'data-left': '' } : {})}>
                  <Wrap className="byd-ai-template">
                    <span className="byd-ai-samples">
                      {samples.map(({ row, face: drawnFace }, n) => (
                        <span key={row.id} className="byd-ai-card-face">
                          <CardPreview id={`ai-${id}-${i}-${n}`} face={drawnFace} row={row.fields} icons={icons} fonts={fonts} scale={CARD_WIDTH / CARD_PX} assetBase={http} palette={doc.palette} onMeasured={(fitted) => onMeasured(row.id, fitted)} />
                        </span>
                      ))}
                    </span>
                    <span className="byd-ai-card-name">
                      {choosing && <input type="checkbox" checked={!leave.has(part.key)} onChange={() => onToggle?.(part.key)} aria-label={t('ai.proposal.take', { name })} />}
                      <span>{name}</span>
                    </span>
                    {part.fields.length > 0 && (
                      <span className="byd-ai-cells">
                        <span className="byd-ai-cell">{t(part.fields.length === 1 ? 'ai.proposal.template.fields.one' : 'ai.proposal.template.fields.other', { fields: part.fields.map((f) => fieldLabel(f, t)).join(', ') })}</span>
                        {part.filled > 0 && <span className="byd-ai-cell">{t(part.filled === 1 ? 'ai.proposal.template.filled.one' : 'ai.proposal.template.filled.other', { n: part.filled })}</span>}
                      </span>
                    )}
                  </Wrap>
                </li>
              )
            }
            const row = rowOf(part.cardRef)
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
          {/* A switch, drawn as the language draws a thing that is on (L13): the chosen pill. A
              template is shown on the wall from Tabell too (#1005), since the table holds no
              template and none of the columns a proposed one brings. */}
          <button type="button" className="byd-choice" aria-pressed={onWall} onClick={onShow}>
            {t(rulesOnly || (showsIn === 'rules' && hasRules) ? 'ai.proposal.showRules' : showsIn === 'table' && !templatePart ? 'ai.proposal.showTable' : 'ai.proposal.show')}
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
      {done && corrected && <p className="byd-ai-corrected">{t('ai.corrected', { fault: problemWords(corrected, t) })}</p>}
    </div>
  )
}

// How big a proposal is, in its own words: «3 nya kort», «2 ändrade kort», or both.
// A template (#1005) first, «ny mall för framsidan, 1 nytt fält», since it is what every card is drawn by.
// Rule text (#1006) last, «1 tillägg i regelboken», since it is not on the cards.
function sizeWords(parts: readonly ProposalPart[], t: T): string {
  const cards = parts.filter((p) => p.kind === 'card').length
  const changed = parts.filter((p) => p.kind === 'change').length
  const template = parts.find((p) => p.kind === 'template')
  const rules = parts.flatMap((p) => (p.kind === 'rules' ? [p] : []))
  const said: string[] = template ? templateWords({ face: template.face, fields: template.fields.length }, t) : []
  if (cards > 0 || (changed === 0 && !template && rules.length === 0)) said.push(t(cards === 1 ? 'ai.proposal.cards.one' : 'ai.proposal.cards.other', { n: cards }))
  if (changed > 0) said.push(t(changed === 1 ? 'ai.proposal.changed.one' : 'ai.proposal.changed.other', { n: changed }))
  said.push(...rulesWords(rules.filter((p) => p.replaced.length === 0).length, rules.filter((p) => p.replaced.length > 0).length, t))
  return said.join(', ')
}

// A rendered block of rule text as one line in the panel: a heading, a paragraph, or a list's points.
function ruleLine(block: RenderedBlock): string {
  switch (block.kind) {
    case 'heading':
      return plainOf(block.children)
    case 'text':
      return block.paragraphs.map((p) => plainOf(p.children)).join(' ')
    case 'list':
      return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '•'} ${plainOf(item)}`).join(' ')
    default:
      return ''
  }
}

// A template as the proposal's size says it: the face it is for, and the new fields it brings.
function templateWords(template: { face: string; fields: number }, t: T): string[] {
  const words = [t(template.face === 'back' ? 'ai.proposal.template.back' : 'ai.proposal.template.front')]
  if (template.fields > 0) words.push(t(template.fields === 1 ? 'ai.proposal.fields.one' : 'ai.proposal.fields.other', { n: template.fields }))
  return words
}

// What an accepted proposal did: new cards in the deck, changed cards, or both — and a template with
// its fields (#1005), said first and the rest after it in one list.
function acceptedWords({ cards, changed, template, rules }: Accepted, t: T): string {
  if (template || rules) {
    const said = template ? templateWords(template, t) : []
    if (cards > 0) said.push(t(cards === 1 ? 'ai.proposal.cards.one' : 'ai.proposal.cards.other', { n: cards }))
    if (changed > 0) said.push(t(changed === 1 ? 'ai.proposal.changed.one' : 'ai.proposal.changed.other', { n: changed }))
    if (rules) said.push(...rulesWords(rules.added, rules.rewritten, t))
    const last = said.pop() ?? ''
    return t('ai.proposal.accepted.changed', { changed: said.length > 0 ? `${said.join(', ')} ${t('ai.proposal.and')} ${last}` : last })
  }
  if (changed === 0) return t(cards === 1 ? 'ai.proposal.accepted.one' : 'ai.proposal.accepted.other', { n: cards })
  const changedWords = t(changed === 1 ? 'ai.proposal.changed.one' : 'ai.proposal.changed.other', { n: changed })
  if (cards === 0) return t('ai.proposal.accepted.changed', { changed: changedWords })
  return t('ai.proposal.accepted.both', { cards: t(cards === 1 ? 'ai.proposal.cards.one' : 'ai.proposal.cards.other', { n: cards }), changed: changedWords })
}

function Unusable({ problem, t, onAgain, corrected = false }: { problem: ProposalProblem | { kind: 'broken' }; t: T; onAgain?: (() => void) | undefined; corrected?: boolean }) {
  return (
    <div className="byd-ai-fail" role="alert">
      <strong>{t('ai.unusable')}</strong>
      <span>
        {problemWords(problem, t)} {t('ai.unusable.text')}
        {corrected && ` ${t('ai.unusable.corrected')}`}
      </span>
      {onAgain && (
        <button type="button" className="byd-secondary" onClick={onAgain}>
          {t('ai.again')}
        </button>
      )}
    </div>
  )
}
