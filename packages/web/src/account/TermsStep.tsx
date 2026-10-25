import { useEffect, useId, useRef, useState } from 'react'
import { DecksterMark } from '../brand/DecksterMark.js'
import { ArrowGlyph, BookGlyph } from '../glyphs.js'
import { useLang, useT } from '../i18n/index.js'
import { useSay } from '../status/StatusLive.js'
import { useFocusTrap } from '../editor/focusTrap.js'
import { Inline } from '../terms/Inline.js'
import { textOf } from '../terms/beta.js'
import { acceptTerms } from './api.js'
import { putOff } from './terms-due.js'
import './terms.css'

// The terms' step (#1272, beställarens beslut 2026-10-24, variant B): the beta's terms said in five
// lines out of «Kort sagt», the way to the whole text, what accepting attests (18 years, F4 beslut
// 6), «Godkänn och fortsätt» and «Inte nu». The same card is the welcome card's second step after
// the name (#1254), and the dialog a write opens for an account that has not accepted (`TermsDialog`).
//
// It travels in a chunk of its own with its sheet: it is drawn once per account, and never by the
// phone (#760, #1304).
export type TermsStepProps = {
  http: string
  // The version to show and accept: the one in force, as the server said it.
  version: string
  title: string
  // What stands above the five lines: the version, unless the dialog says why it was opened.
  lead?: string
  step?: { n: number; total: number; onBack(): void }
  // In a dialog the card is the dialog and its heading is the dialog's; on a page it is the page's.
  dialog?: boolean
  // The heading's id, for a dialog that is named by it.
  headingId?: string
  // The focus goes to the heading when the card opens: a step that replaces another in the same
  // place would otherwise leave it on nothing (WCAG 2.4.3).
  focusOnOpen?: boolean
  onAccepted(): void
  onLater(): void
}

export function TermsStep({ http, version, title, lead, step, dialog = false, headingId, focusOnOpen = false, onAccepted, onLater }: TermsStepProps) {
  const t = useT()
  const { lang } = useLang()
  const say = useSay()
  const own = useId()
  const heading = headingId ?? own
  const top = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusOnOpen) top.current?.focus()
  }, [focusOnOpen])
  const [shown, setShown] = useState(version)
  const [state, setState] = useState<'open' | 'busy' | 'failed' | 'changed'>('open')
  const text = textOf(shown)
  const server = new URLSearchParams(location.search).get('server')
  const page = (part: 'villkor' | 'integritet') => `/villkor${server ? `?${new URLSearchParams({ server }).toString()}` : ''}${part === 'integritet' ? '#integritet' : ''}`
  const accept = async () => {
    setState('busy')
    try {
      const answer = await acceptTerms(http, shown)
      if (answer === 'accepted' || answer.changed === null) {
        putOff(null)
        say?.('polite', t('terms.accepted'))
        return onAccepted()
      }
      // The version changed while the card stood (#1270): the new one is shown and accepted only
      // once it has been read.
      setShown(answer.changed)
      setState('changed')
    } catch {
      setState('failed')
    }
  }
  const later = () => {
    putOff(shown)
    onLater()
  }
  const H = dialog ? 'h2' : 'h1'
  return (
    <div className="byd-terms-card" data-terms-step>
      <H id={heading} ref={top} tabIndex={-1}>
        <DecksterMark className="byd-terms-mark" edge="#171a23" />
        {title}
      </H>
      {step && (
        <p className="byd-terms-steps">
          {Array.from({ length: step.total }, (_, i) => (
            <i key={i} {...(i + 1 === step.n ? { 'data-now': '' } : {})} />
          ))}
          <span>{t('terms.step.of', { n: step.n, total: step.total })}</span>
          <button type="button" className="byd-terms-back" onClick={step.onBack}>
            <ArrowGlyph to="left" />
            {t('terms.step.back')}
          </button>
        </p>
      )}
      <p className="byd-terms-lead">{lead ?? t('terms.step.version', { version: shown })}</p>
      {/* The terms are Swedish while they are a draft (#1272): an English reader is told so. */}
      {lang !== 'sv' && <p className="byd-terms-note">{t('terms.page.swedish')}</p>}
      <ul className="byd-terms-summary" lang="sv">
        {text.summary.map((line) => (
          <li key={line}>
            <Inline text={line} href={page} />
          </li>
        ))}
      </ul>
      {/* In a tab of their own, so neither the step nor a change the dialog holds is left behind. */}
      <p className="byd-terms-links">
        <a href={page('villkor')} target="_blank" rel="noopener">
          <BookGlyph />
          {t('terms.step.read')}
        </a>
        <a href={page('integritet')} target="_blank" rel="noopener">
          <BookGlyph />
          {t('terms.step.privacy')}
        </a>
      </p>
      <p className="byd-terms-note">{t('terms.step.age')}</p>
      {(state === 'failed' || state === 'changed') && (
        <p className="byd-terms-error" role="alert">
          {t(state === 'failed' ? 'terms.step.failed' : 'terms.step.changed')}
        </p>
      )}
      <div className="byd-terms-answers">
        <button type="button" className="byd-primary" disabled={state === 'busy'} onClick={() => void accept()}>
          {t('terms.step.accept')}
        </button>
        <button type="button" className="byd-terms-later" disabled={state === 'busy'} onClick={later}>
          {t('terms.step.later')}
        </button>
      </div>
    </div>
  )
}

// The step as a dialog over the page (#1272, variant B): what a write opens for an account that has
// not accepted. Modal while it stands, and Escape is «Inte nu».
export function TermsDialog(props: Omit<TermsStepProps, 'dialog' | 'step' | 'headingId'>) {
  const box = useRef<HTMLDivElement>(null)
  const heading = useId()
  // Escape is «Inte nu», and puts the terms off for the visit as the button does. The focus opens on
  // the heading, so the card is read from its top rather than from its first link.
  useFocusTrap(box, {
    initial: () => document.getElementById(heading),
    onEscape: () => {
      putOff(props.version)
      props.onLater()
    },
  })
  return (
    <div className="byd-terms-scrim" role="presentation">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={heading} className="byd-terms-dialog">
        <TermsStep {...props} dialog headingId={heading} />
      </div>
    </div>
  )
}
