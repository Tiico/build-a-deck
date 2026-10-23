// A ceiling the server met (A2, #1192): its 402 carries the measure, the ceiling, what was used
// against it and whose ceiling it is — `you` when the one asking bears the cost, `owner` when the
// game's owner does, never who the owner is. The client hands it on as what it is, so that a surface
// can say it in the reader's words (A4, #1198) rather than as a fault, a status or the network.
export type Quota = { measure: string; limit: number; used: number; bearer: 'you' | 'owner' }

// `message` is the surface's sentence for a write that did not happen, until #1198 says how a met
// ceiling is put into words; `quota` is what that will be said from.
export class QuotaReached extends Error {
  override name = 'QuotaReached'
  constructor(
    readonly quota: Quota,
    message: string,
  ) {
    super(message)
  }
}

// The ceiling a refusal names, or null when the answer is not a met ceiling — another status, or a
// 402 whose body is not the contract, which is then the failure it is and nothing more.
export async function quotaOf(res: Response): Promise<Quota | null> {
  if (res.status !== 402) return null
  const body = (await res.json().catch(() => null)) as { error?: unknown; quota?: Partial<Quota> } | null
  const q = body?.error === 'quota' ? body.quota : undefined
  if (!q || typeof q.measure !== 'string' || typeof q.limit !== 'number' || typeof q.used !== 'number' || (q.bearer !== 'you' && q.bearer !== 'owner')) return null
  return { measure: q.measure, limit: q.limit, used: q.used, bearer: q.bearer }
}
