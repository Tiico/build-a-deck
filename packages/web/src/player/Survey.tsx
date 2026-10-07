import { useEffect, useRef, useState } from 'react'
import { questions, type SurveyAnswers } from './surveyApi.js'
import { useT } from '../i18n/index.js'
import { versionWord } from '../i18n/version.js'

// `saveUrl` (G1): where the guest goes to keep this session on an account; absent without a token.
// `remember`: the seat and session the answers are for, so a reload after sending shows the thanks
// rather than the first question again (#483). `rulebook`: whether the table had one, which is
// what the second question asks about when it did (#744); `null` while that is being asked.
export type SurveyProps = { who: string; version: string; onSubmit(answers: SurveyAnswers): Promise<void>; saveUrl?: string | null | undefined; remember?: string | undefined; rulebook?: boolean | null | undefined }

// The survey after a session (G3, prototype A): one question at a time with big buttons, a free
// line last, then thanks. Answers are tied to the version the session ended on.
export function Survey({ who, version, onSubmit, saveUrl, remember, rulebook }: SurveyProps) {
  const t = useT()
  const [step, setStep] = useState(0)
  const [scales, setScales] = useState<Partial<Record<'fun' | 'clarity' | 'balance', number>>>({})
  const [change, setChange] = useState('')
  const [state, setState] = useState<'open' | 'sending' | 'sent' | 'failed'>(() => (remember !== undefined && wasSent(remember) ? 'sent' : 'open'))
  // The survey takes the focus when it appears (#483): it replaces the view whose button ended the
  // table, and a focus left on that button is a focus on nothing.
  const here = useRef<HTMLDivElement>(null)
  useEffect(() => here.current?.focus(), [state])
  const q = questions(rulebook)[step]
  const send = async () => {
    const { fun, clarity, balance } = scales
    if (fun === undefined || clarity === undefined || balance === undefined) return
    setState('sending')
    try {
      await onSubmit({ fun, clarity, balance, change })
      if (remember !== undefined) markSent(remember)
      setState('sent')
    } catch {
      setState('failed')
    }
  }
  if (state === 'sent') {
    return (
      <div className="byd-survey" data-survey="sent" ref={here} tabIndex={-1}>
        <div />
        <div className="byd-survey-thanks">
          <strong>{t('survey.thanks', { who })}</strong>
          <span>{t('survey.tied', { version: versionWord(version, t) })}</span>
          {saveUrl && <a className="byd-survey-save" href={saveUrl}>{t('survey.save')}</a>}
          {/* What a guest leaves behind, said where she saves it (#757). */}
          {saveUrl && <p className="byd-guest-kept">{t('guest.kept')}</p>}
        </div>
        <div />
      </div>
    )
  }
  return (
    <div className="byd-survey" data-survey={q ? q.key : 'change'} ref={here} tabIndex={-1}>
      <div>
        <h1>{t('survey.title')}</h1>
        <div className="byd-survey-sub">{t('survey.sub', { version: versionWord(version, t) })}</div>
      </div>
      <div className="byd-survey-q">
        {q ? (
          <>
            <h2>{t(q.text)}</h2>
            <div className="byd-survey-scale">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" className="byd-choice" aria-pressed={scales[q.key] === n} onClick={() => setScales({ ...scales, [q.key]: n })}>
                  {n}
                </button>
              ))}
            </div>
            <div className="byd-survey-labels">
              <span>{t(q.low)}</span>
              <span>{t(q.high)}</span>
            </div>
          </>
        ) : (
          <>
            <h2>{t('survey.change')}</h2>
            <textarea placeholder={t('survey.change.placeholder')} value={change} onChange={(e) => setChange(e.target.value)} maxLength={500} />
            {state === 'failed' && <p className="byd-survey-error">{t('survey.failed')}</p>}
          </>
        )}
      </div>
      <div className="byd-survey-nav">
        <div className="byd-survey-dots">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} data-on={i <= step ? 'true' : 'false'} />
          ))}
        </div>
        {q ? (
          <button type="button" className="byd-primary" disabled={scales[q.key] === undefined} onClick={() => setStep(step + 1)}>
            {t('survey.next')}
          </button>
        ) : (
          <button type="button" className="byd-primary" disabled={state === 'sending'} onClick={() => void send()}>
            {t('survey.send')}
          </button>
        )}
      </div>
      {saveUrl && <a className="byd-survey-save" href={saveUrl}>{t('survey.save')}</a>}
      {saveUrl && <p className="byd-guest-kept">{t('guest.kept')}</p>}
    </div>
  )
}

// Kept in the tab's own storage: a reload on this phone remembers, and nothing leaves the device.
const SENT = 'byd.survey.sent.'
function wasSent(key: string): boolean {
  try {
    return sessionStorage.getItem(SENT + key) === '1'
  } catch {
    return false
  }
}
function markSent(key: string): void {
  try {
    sessionStorage.setItem(SENT + key, '1')
  } catch {
    // A browser that keeps nothing asks again after a reload, which is where it was before.
  }
}
