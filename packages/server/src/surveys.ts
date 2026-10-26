import { z } from 'zod'
import { SeatId } from '@byd/protocol'

// The survey after a session (G3): short, structured, one per participant, tied to the version
// the session ended on. Stored beside the log, never in it: the log is locked by then.
export const SurveyAnswers = z.object({
  fun: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  balance: z.number().int().min(1).max(5),
  change: z.string().max(500),
})
export type SurveyAnswer = {
  who: string
  seat: string | null
  // Observers answer too, marked as such (C8).
  observer?: boolean
  answers: z.infer<typeof SurveyAnswers>
}
export type SurveyRecord = SurveyAnswer & { sessionId: string; version: string; at: string }

// What a phone sends (G3, #1021): its answers, and the admission it sat or watched under. Who
// answered is the admission's to say, not the body's — the name and the seat are read from the
// token the server tries, and `seat`/`observer` only say which of the two the phone believes it
// is, so a token for one seat cannot answer for another. Without a token the sender is the
// project's own host, playing or watching from the editor's ways in (`owner=1`), whose login is
// her admission; she is the one sender who names herself, since she sat down without buying one.
export const SurveyBody = z.object({
  token: z.string().min(1).max(256).optional(),
  seat: SeatId.nullable().optional(),
  observer: z.boolean().optional(),
  who: z.string().trim().min(1).max(64).optional(),
  answers: SurveyAnswers,
})
export type SurveyBody = z.infer<typeof SurveyBody>

// One answer per seat and per observer at a table (#1021): a second one replaces the first. The
// phone remembers that it answered only in the tab's own storage, and a phone that forgot asks
// again and is answered — so the answer that stands is the latest one, never two that count twice.
// An observer is known by the name her admission was bought under, which is how «Bord du spelat
// vid» already tells whether she answered.
export type SurveyStore = {
  put(record: SurveyRecord): Promise<void>
  list(sessionId: string): Promise<SurveyRecord[]>
}

// What a phone asks before it shows the survey (#1355): whether the seat or the observer it sat or
// watched under has answered, and whether her admission was erased (#1281), which takes her answers.
// The phone shows the thanks from what the server says, never from the tab's own storage.
export const SurveyAsk = SurveyBody.omit({ answers: true })
export type SurveyAsk = z.infer<typeof SurveyAsk>
export type SurveyStanding = { answered: boolean; forgotten: boolean }

export const sameSender = (a: Pick<SurveyRecord, 'sessionId' | 'observer' | 'who' | 'seat'>, b: Pick<SurveyRecord, 'sessionId' | 'observer' | 'who' | 'seat'>): boolean =>
  a.sessionId === b.sessionId && (a.observer ?? false) === (b.observer ?? false) && (a.observer ? a.who === b.who : a.seat === b.seat)

export class MemorySurveyStore implements SurveyStore {
  private records: SurveyRecord[] = []
  async put(record: SurveyRecord): Promise<void> {
    this.records = [...this.records.filter((r) => !sameSender(r, record)), structuredClone(record)]
  }
  async list(sessionId: string): Promise<SurveyRecord[]> {
    return this.records.filter((r) => r.sessionId === sessionId).map((r) => structuredClone(r))
  }
  // An erasure's (#1279): each of the table's answers kept as it is, kept with what `change` gives
  // instead, or dropped for null — the memory store's share of what Postgres does in its transaction.
  rewrite(sessionId: string, change: (record: SurveyRecord, index: number) => SurveyRecord | null): void {
    let i = 0
    this.records = this.records.flatMap((r) => {
      if (r.sessionId !== sessionId) return [r]
      const next = change(structuredClone(r), i++)
      return next ? [next] : []
    })
  }
}
