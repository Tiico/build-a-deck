// The survey after a session (G3): short, structured, one per participant, sent once the log is
// locked. `http` is the server origin.
import type { Key } from '../i18n/index.js'
import { useEffect, useState } from 'react'
import { withCredentials } from '../account/session.js'

export type SurveyAnswers = { fun: number; clarity: number; balance: number; change: string }
// `token` is the admission the phone sat or watched under (#1021): the server reads who answered
// out of it, and a seat or an observer has one answer, the latest. Without one it is the login: the
// account's own claimed seat from Mina spel (#1143), or the host from the editor's own ways in.
export type SurveyRequest = { token?: string | undefined; who: string; seat: string | null; observer?: boolean; answers: SurveyAnswers }

// The questions themselves are the tool's words, so they are catalogue keys and the sheet reads
// them in whichever language the reader is given (A4).
//
// A game without a rulebook has no rules to be clear (#744): its players learned it from the
// designer in the room. There the second question asks how easy the game was to understand — the
// same scale about the same thing, stored as the same `clarity`, so a game that later gets a book
// is still read on one line. A table not yet known to have a book is asked that way too, since
// it is true of a game with a book as well.
type Question = { key: 'fun' | 'clarity' | 'balance'; text: Key; low: Key; high: Key }
export function questions(rulebook: boolean | null | undefined): Question[] {
  return [
    { key: 'fun', text: 'survey.q.fun', low: 'survey.q.fun.low', high: 'survey.q.fun.high' },
    rulebook
      ? { key: 'clarity', text: 'survey.q.clarity', low: 'survey.q.clarity.low', high: 'survey.q.clarity.high' }
      : { key: 'clarity', text: 'survey.q.understood', low: 'survey.q.understood.low', high: 'survey.q.understood.high' },
    { key: 'balance', text: 'survey.q.balance', low: 'survey.q.balance.low', high: 'survey.q.balance.high' },
  ]
}

export async function submitSurvey(http: string, sessionId: string, answer: SurveyRequest): Promise<void> {
  const init: RequestInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answer) }
  const res = await fetch(`${http}/sessions/${encodeURIComponent(sessionId)}/survey`, answer.token === undefined ? withCredentials(init) : init)
  if (!res.ok) throw new Error(`could not send the survey: ${res.status}`)
}

// Whether the seat or the watch has answered already (#1355, beställarens beslut 2026-10-25), and
// whether her admission was erased (#1281), which took her answers with it (#1353). Asked of the
// server before the survey is shown, so a new tab, a reload or another phone shows the thanks; the
// tab's own storage knows nothing of it. A server that cannot say is a survey not yet answered,
// which is where the phone was before it asked.
export type SurveyStanding = { answered: boolean; forgotten: boolean }
export const NOT_ANSWERED: SurveyStanding = { answered: false, forgotten: false }
export type SurveyAsk = Omit<SurveyRequest, 'answers' | 'who'> & { who?: string }

export async function surveyStanding(http: string, sessionId: string, ask: SurveyAsk): Promise<SurveyStanding> {
  const init: RequestInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ask) }
  try {
    const res = await fetch(`${http}/sessions/${encodeURIComponent(sessionId)}/survey/mine`, ask.token === undefined ? withCredentials(init) : init)
    if (!res.ok) return NOT_ANSWERED
    const said = (await res.json()) as Partial<SurveyStanding>
    return { answered: said.answered === true, forgotten: said.forgotten === true }
  } catch {
    return NOT_ANSWERED
  }
}

// The standing of one sender, asked once the table is over: undefined while it is being asked.
export function useSurveyStanding(http: string, sessionId: string, ask: SurveyAsk, ended: boolean): SurveyStanding | undefined {
  const [standing, setStanding] = useState<SurveyStanding | undefined>(undefined)
  const key = JSON.stringify(ask)
  useEffect(() => {
    if (!ended) return
    let live = true
    void surveyStanding(http, sessionId, JSON.parse(key) as SurveyAsk).then((said) => live && setStanding(said))
    return () => {
      live = false
    }
  }, [http, sessionId, key, ended])
  return standing
}
