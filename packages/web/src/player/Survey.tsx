import { useState } from 'react'
import { QUESTIONS, type SurveyAnswers } from './surveyApi.js'

// `saveUrl` (G1): where the guest goes to keep this session on an account; absent without a token.
export type SurveyProps = { who: string; version: string; onSubmit(answers: SurveyAnswers): Promise<void>; saveUrl?: string | null | undefined }

// The survey after a session (G3, prototype A): one question at a time with big buttons, a free
// line last, then thanks. Answers are tied to the version the session ended on.
export function Survey({ who, version, onSubmit, saveUrl }: SurveyProps) {
  const [step, setStep] = useState(0)
  const [scales, setScales] = useState<Partial<Record<'fun' | 'clarity' | 'balance', number>>>({})
  const [change, setChange] = useState('')
  const [state, setState] = useState<'open' | 'sending' | 'sent' | 'failed'>('open')
  const q = QUESTIONS[step]
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
      <div className="byd-survey" data-survey="sent">
        <div />
        <div className="byd-survey-thanks">
          <strong>Tack, {who}.</strong>
          <span>Dina svar är knutna till {version}.</span>
          {saveUrl && <a className="byd-survey-save" href={saveUrl}>Spara till ditt konto</a>}
        </div>
        <div />
      </div>
    )
  }
  return (
    <div className="byd-survey" data-survey={q ? q.key : 'change'}>
      <div>
        <h1>Sessionen är slut</h1>
        <div className="byd-survey-sub">Fyra frågor, en minut. Svaren knyts till version {version}.</div>
      </div>
      <div className="byd-survey-q">
        {q ? (
          <>
            <h2>{q.text}</h2>
            <div className="byd-survey-scale">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={scales[q.key] === n} onClick={() => setScales({ ...scales, [q.key]: n })}>
                  {n}
                </button>
              ))}
            </div>
            <div className="byd-survey-labels">
              <span>{q.low}</span>
              <span>{q.high}</span>
            </div>
          </>
        ) : (
          <>
            <h2>Vad skulle du ändra?</h2>
            <textarea placeholder="En mening räcker" value={change} onChange={(e) => setChange(e.target.value)} maxLength={500} />
            {state === 'failed' && <p className="byd-survey-error">Det gick inte att skicka. Försök igen.</p>}
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
          <button type="button" disabled={scales[q.key] === undefined} onClick={() => setStep(step + 1)}>
            Nästa
          </button>
        ) : (
          <button type="button" disabled={state === 'sending'} onClick={() => void send()}>
            Skicka
          </button>
        )}
      </div>
      {saveUrl && <a className="byd-survey-save" href={saveUrl}>Spara till ditt konto</a>}
    </div>
  )
}
