// The survey after a session (G3): short, structured, one per participant, sent once the log is
// locked. `http` is the server origin.
import type { Key } from '../i18n/index.js'

export type SurveyAnswers = { fun: number; clarity: number; balance: number; change: string }
export type SurveyRequest = { who: string; seat: string | null; observer?: boolean; answers: SurveyAnswers }

// The questions themselves are the tool's words, so they are catalogue keys and the sheet reads
// them in whichever language the reader is given (A4).
export const QUESTIONS: { key: 'fun' | 'clarity' | 'balance'; text: Key; low: Key; high: Key }[] = [
  { key: 'fun', text: 'survey.q.fun', low: 'survey.q.fun.low', high: 'survey.q.fun.high' },
  { key: 'clarity', text: 'survey.q.clarity', low: 'survey.q.clarity.low', high: 'survey.q.clarity.high' },
  { key: 'balance', text: 'survey.q.balance', low: 'survey.q.balance.low', high: 'survey.q.balance.high' },
]

export async function submitSurvey(http: string, sessionId: string, answer: SurveyRequest): Promise<void> {
  const res = await fetch(`${http}/sessions/${encodeURIComponent(sessionId)}/survey`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(answer),
  })
  if (!res.ok) throw new Error(`could not send the survey: ${res.status}`)
}
