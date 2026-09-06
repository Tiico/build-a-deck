// The survey after a session (G3): short, structured, one per participant, sent once the log is
// locked. `http` is the server origin.
export type SurveyAnswers = { fun: number; clarity: number; balance: number; change: string }
export type SurveyRequest = { who: string; seat: string | null; observer?: boolean; answers: SurveyAnswers }

export const QUESTIONS: { key: 'fun' | 'clarity' | 'balance'; text: string; low: string; high: string }[] = [
  { key: 'fun', text: 'Hur kul var det?', low: 'segt', high: 'jättekul' },
  { key: 'clarity', text: 'Hur tydliga var reglerna?', low: 'förvirrande', high: 'glasklara' },
  { key: 'balance', text: 'Hur balanserat kändes det?', low: 'någon körde över', high: 'jämnt' },
]

export async function submitSurvey(http: string, sessionId: string, answer: SurveyRequest): Promise<void> {
  const res = await fetch(`${http}/sessions/${encodeURIComponent(sessionId)}/survey`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(answer),
  })
  if (!res.ok) throw new Error(`could not send the survey: ${res.status}`)
}
