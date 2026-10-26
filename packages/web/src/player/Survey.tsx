import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NOT_ANSWERED, questions, type SurveyAnswers, type SurveyStanding } from './surveyApi.js'
import { useT } from '../i18n/index.js'
import { versionWord } from '../i18n/version.js'
import type { SendResult } from '../client.js'
import { CheckGlyph } from '../glyphs.js'
import { useRefusal } from '../status/Refusal.js'
import { ForgetSheet } from './SessionSheets.js'

// `saveUrl` (G1): where the guest goes to keep this session on an account; absent without a token.
// It is offered on the thanks only, once the answers are sent (#690, beslut 2026-10-06): a guest
// who went to save first never found the survey again on the other side of the login.
// `standing`: whether this seat or watch has answered already and whether her admission was erased,
// as the server says it (#1355, #1353), or 'asking' while it is asked; absent, nothing is known and
// the survey begins. A reload, a new tab and another phone show the thanks from it, and nothing of
// it is kept in the tab (beställarens beslut 2026-10-25). `rulebook`: whether the table had one, which is
// what the second question asks about when it did (#744); `null` while that is being asked.
// `saved`: the claim has come back here (#690). Saving is only offered once the answers are sent,
// so it is the thanks that stand — in a tab of its own too — and
// they say it is saved in place of offering it again. `onward`: the way on under the thanks, for a
// survey answered from the account (#1143), which has a page to go back to where the phone has not.
// `onForget`: a guest's way to have her name and her answers removed (#1281, G6), offered under the
// thanks after the sentence on why keeping them helps, as a quieter button than the save; absent
// without a token. `watched`: she watched the table rather than sat at it, for the question to say.
export type SurveyProps = { who: string; version: string; onSubmit(answers: SurveyAnswers): Promise<void>; saveUrl?: string | null | undefined; standing?: SurveyStanding | 'asking' | undefined; rulebook?: boolean | null | undefined; saved?: boolean | undefined; onward?: ReactNode; onForget?: (() => Promise<SendResult>) | undefined; watched?: boolean }

// The survey after a session (G3, prototype A): one question at a time with big buttons, a free
// line last, then thanks. Answers are tied to the version the session ended on. While the server is
// asked whether she has answered, the survey holds its place and asks nothing: a first question that
// turned into the thanks under her thumb would be a question she answered for nothing.
export function Survey({ standing, ...props }: SurveyProps) {
  if (standing === 'asking') return <div className="byd-survey" data-survey="asking" aria-busy="true" />
  return <Asked {...props} standing={standing ?? NOT_ANSWERED} />
}

function Asked({ who, version, onSubmit, saveUrl, rulebook, saved = false, onward, onForget, watched = false, standing }: Omit<SurveyProps, 'standing'> & { standing: SurveyStanding }) {
  const t = useT()
  const [forgotten, setForgotten] = useState(standing.forgotten)
  // She chose «Svara igen» (#1355): the questions say that the new answer replaces the first.
  const [again, setAgain] = useState(false)
  const [asking, setAsking] = useState(false)
  const [forgetting, setForgetting] = useState(false)
  const forgot = useRefusal('phone')
  const forget = async () => {
    if (!onForget || forgetting) return
    setForgetting(true)
    const done = await forgot.watch(onForget())
    setForgetting(false)
    if (!done.ok) return
    setAsking(false)
    setForgotten(true)
  }
  const [step, setStep] = useState(0)
  const [scales, setScales] = useState<Partial<Record<'fun' | 'clarity' | 'balance', number>>>({})
  const [change, setChange] = useState('')
  const [state, setState] = useState<'open' | 'sending' | 'sent' | 'failed'>(saved || standing.answered || standing.forgotten ? 'sent' : 'open')
  // The survey takes the focus when it appears (#483): it replaces the view whose button ended the
  // table, and a focus left on that button is a focus on nothing.
  const here = useRef<HTMLDivElement>(null)
  useEffect(() => here.current?.focus(), [state, forgotten])
  const q = questions(rulebook)[step]
  const send = async () => {
    const { fun, clarity, balance } = scales
    if (fun === undefined || clarity === undefined || balance === undefined) return
    setState('sending')
    try {
      await onSubmit({ fun, clarity, balance, change })
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
          <strong>{forgotten ? t('forget.thanks.after') : t('survey.thanks', { who })}</strong>
          {/* Answers that were removed are tied to no version (#1353). */}
          {!forgotten && <span>{t('survey.tied', { version: versionWord(version, t) })}</span>}
          {forgotten ? (
            // Done, in place of the save: a table whose name is gone has nothing to keep (#1281).
            <div className="byd-forget-done" role="status">
              <CheckGlyph />
              <strong>{t('forget.done')}</strong>
              <span>{t('forget.done.body', { masked: t('masked.name') })}</span>
            </div>
          ) : (
            <>
              {saved ? <span>{t('survey.saved')}</span> : saveUrl && <a className="byd-survey-save" href={saveUrl}>{t('survey.save')}</a>}
              {/* What saving keeps, and for how long, said where she saves it (#757, #1281). */}
              {!saved && saveUrl && <p className="byd-muted">{t('guest.kept.account')}</p>}
              {/* The row's first two (#757, #1272), where she saves what she left. */}
              {!saved && saveUrl && (
                <p className="byd-trust">
                  <a href="/villkor">{t('trust.terms')}</a> · <a href="/villkor#integritet">{t('trust.privacy')}</a> · <a href="/villkor/anmal">{t('trust.report')}</a>
                </p>
              )}
              {/* Answering again (#1355): the new answer replaces the first, as the server keeps it (#1021). */}
              <button
                type="button"
                className="byd-survey-again"
                onClick={() => {
                  setAgain(true)
                  setStep(0)
                  setScales({})
                  setChange('')
                  setState('open')
                }}
              >
                {t('survey.again')}
              </button>
              {onForget && (
                <div className="byd-forget-way">
                  <p>{t('forget.why')}</p>
                  <button type="button" data-kind="forget" onClick={() => setAsking(true)}>
                    {t('forget.thanks')}
                  </button>
                </div>
              )}
            </>
          )}
          {onward}
        </div>
        <div />
        {asking && !forgotten && (
          <ForgetSheet
            name={who}
            leaving={false}
            watched={watched}
            refusal={forgot}
            busy={forgetting}
            onYes={() => void forget()}
            onClose={() => {
              forgot.clear()
              setAsking(false)
            }}
          />
        )}
      </div>
    )
  }
  return (
    <div className="byd-survey" data-survey={q ? q.key : 'change'} ref={here} tabIndex={-1}>
      <div>
        <h1>{t('survey.title')}</h1>
        <div className="byd-survey-sub">{t('survey.sub', { version: versionWord(version, t) })}</div>
        {again && <div className="byd-survey-sub">{t('survey.again.note')}</div>}
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
    </div>
  )
}
