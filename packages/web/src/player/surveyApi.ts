// The survey after a session (G3): short, structured, one per participant, sent once the log is
// locked. `http` is the server origin.
import type { Key } from '../i18n/index.js'

export type SurveyAnswers = { fun: number; clarity: number; balance: number; change: string }
export type SurveyRequest = { who: string; seat: string | null; observer?: boolean; answers: SurveyAnswers }

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
  const res = await fetch(`${http}/sessions/${encodeURIComponent(sessionId)}/survey`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(answer),
  })
  if (!res.ok) throw new Error(`could not send the survey: ${res.status}`)
}
