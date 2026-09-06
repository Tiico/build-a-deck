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
export const SurveyAnswer = z.object({
  who: z.string().min(1).max(64),
  seat: SeatId.nullable(),
  // Observers answer too, marked as such (C8).
  observer: z.boolean().optional(),
  answers: SurveyAnswers,
})
export type SurveyAnswer = z.infer<typeof SurveyAnswer>
export type SurveyRecord = SurveyAnswer & { sessionId: string; version: string; at: string }

export type SurveyStore = {
  add(record: SurveyRecord): Promise<void>
  list(sessionId: string): Promise<SurveyRecord[]>
}

export class MemorySurveyStore implements SurveyStore {
  private readonly records: SurveyRecord[] = []
  async add(record: SurveyRecord): Promise<void> {
    this.records.push(structuredClone(record))
  }
  async list(sessionId: string): Promise<SurveyRecord[]> {
    return this.records.filter((r) => r.sessionId === sessionId).map((r) => structuredClone(r))
  }
}
