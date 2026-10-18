import { useCallback, useMemo, useState } from 'react'
import type { FitReport } from '@byd/template'
import { titleOfRow, type ProposalProblem } from '@byd/server/doc'
import type { ProjectDoc } from './types.js'
import { CardPreview } from './CardPreview.js'
import { CARD_PX } from './corner.js'
import { previewIcons } from './assets.js'
import { previewFonts } from './fonts.js'
import { deckIssues, groupIssues, issueWords } from './checks.js'
import { problemWords, proposedRows, translated, type ProposalParts } from './proposals.js'
import { useT, type T } from '../i18n/index.js'

// An AI proposal in the conversation (#1002, #940 variant A): the cards it brings, each drawn by the
// one renderer (E2) the moment it arrives; what the physical check says of them (E5), which never
// stops them; and the three things the designer can do with it — lay it on the wall among the
// deck's cards, accept all of it in one step, or discard it.
//
// «Välj delar…» (#1003) and the line that refines a proposal (#1004) come after this slice; the
// proposal is held as its parts so that a choice among them is a filter over the same list.

// How wide a proposed card is drawn in the panel: three to a row in its 380 px, with their names.
const CARD_WIDTH = 84

export type ProposalVerdict = 'accepted' | 'discarded'
export type AiProposalProps = {
  id: string
  doc: ProjectDoc
  http: string
  parts: ProposalParts
  // Whether the whole proposal has arrived, and whether it arrived whole.
  done: boolean
  broken: boolean
  verdict: ProposalVerdict | null
  // How many cards an accepted proposal added, said once it was accepted.
  acceptedCards: number
  onWall: boolean
  onShow(): void
  onAccept(): void
  onDiscard(): void
  onAgain?: (() => void) | undefined
}

export function AiProposal({ id, doc, http, parts, done, broken, verdict, acceptedCards, onWall, onShow, onAccept, onDiscard, onAgain }: AiProposalProps) {
  const t = useT()
  const read = useMemo(() => (parts.cards.length === 0 ? null : translated(doc, parts)), [doc, parts])
  const rows = useMemo(() => (read?.ok ? proposedRows(read.edits) : []), [read])
  const face = doc.template.faces['front']
  const icons = useMemo(() => previewIcons({ icons: doc.icons }, http), [doc.icons, http])
  const fonts = useMemo(() => previewFonts({ template: doc.template, fonts: doc.fonts }, http), [doc.template, doc.fonts, http])
  // What the one renderer measured on each proposed card, which is what the physical check reads to
  // say whether a text fits (#808).
  const [measured, setMeasured] = useState<Record<string, readonly FitReport[]>>({})
  const onMeasured = useCallback((cardRef: string, fitted: FitReport[]) => {
    setMeasured((m) => (JSON.stringify(m[cardRef] ?? []) === JSON.stringify(fitted) ? m : { ...m, [cardRef]: fitted }))
  }, [])
  // Nothing proposed after all — the model answered in words.
  if (verdict === null && parts.cards.length === 0 && !broken) return null
  if (verdict !== null) {
    return (
      <div className="byd-ai-proposal" data-verdict={verdict} role="group" aria-label={t('ai.proposal')}>
        <p className="byd-ai-verdict" role="status">
          {verdict === 'accepted' ? t(acceptedCards === 1 ? 'ai.proposal.accepted.one' : 'ai.proposal.accepted.other', { n: acceptedCards }) : t('ai.proposal.discarded')}
        </p>
      </div>
    )
  }
  const problem: ProposalProblem | { kind: 'broken' } | null = read && !read.ok ? read.problem : broken ? { kind: 'broken' } : null
  if (problem) return <Unusable problem={problem} t={t} onAgain={onAgain} />
  const n = rows.length
  const label = `${t(done ? 'ai.proposal' : 'ai.proposal.coming')} · ${t(n === 1 ? 'ai.proposal.cards.one' : 'ai.proposal.cards.other', { n })}`
  const groups = done ? groupIssues(deckIssues({ ...doc, rows }, { front: measured })) : []
  const words = issueWords(t)
  return (
    <div className="byd-ai-proposal" role="group" aria-label={label} aria-busy={!done}>
      <p className="byd-ai-proposal-head" aria-hidden="true">
        <strong>{t(done ? 'ai.proposal' : 'ai.proposal.coming')}</strong> · {t(n === 1 ? 'ai.proposal.cards.one' : 'ai.proposal.cards.other', { n })}
      </p>
      {face && (
        <ul className="byd-ai-cards">
          {rows.map((row, i) => {
            const name = titleOfRow(row) || t('ai.proposal.untitled', { n: i + 1 })
            return (
              <li key={row.id} className="byd-ai-card">
                <div className="byd-ai-card-face">
                  <CardPreview id={`ai-${id}-${i}`} face={face} row={row.fields} icons={icons} fonts={fonts} scale={CARD_WIDTH / CARD_PX} assetBase={http} palette={doc.palette} onMeasured={(fitted) => onMeasured(row.id, fitted)} />
                </div>
                <span className="byd-ai-card-name">{name}</span>
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
      {done && (
        <div className="byd-ai-decide">
          <button type="button" className="byd-secondary" aria-pressed={onWall} onClick={onShow}>
            {t('ai.proposal.show')}
          </button>
          {/* Outlined and not filled (L13): the header's «Starta/Uppdatera bord» is the view's first
              action, and the one filled button a view may have. */}
          <button type="button" className="byd-secondary" onClick={onAccept}>
            {t('ai.proposal.accept')}
          </button>
          <button type="button" className="byd-secondary" onClick={onDiscard}>
            {t('ai.proposal.discard')}
          </button>
        </div>
      )}
    </div>
  )
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
