// A ceiling the server met (A2, #1192): its 402 carries the measure, the ceiling, what was used
// against it and whose ceiling it is — `you` when the one asking bears the cost, `owner` when the
// game's owner does, never who the owner is. The client hands it on as what it is, so that a surface
// can say it in the reader's words (A4, #1198) rather than as a fault, a status or the network.
// `frees` is when the next one fits under a rolling window (#1198), an ISO moment; only tables
// started per 30 days have it. `ownerName` is the owner's name beside `bearer: 'owner'` (#1198,
// beställarens beslut 3), when the server has one to give; never her address.
export type Quota = { measure: string; limit: number; used: number; bearer: 'you' | 'owner'; frees?: string; ownerName?: string }

// `message` is a surface's sentence for a write that did not happen, for one that says nothing more;
// `quota` is what a surface says it from, in its own place (`quotaWords`, #1198).
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
  const body = (await res.json().catch(() => null)) as { error?: unknown; quota?: unknown } | null
  return body?.error === 'quota' ? quotaIn(body.quota) : null
}

// The ceiling in a body that may carry one — a 402's, or a refusal on the editor's line — read
// field by field, so that what is not the contract is not taken for it.
export function quotaIn(raw: unknown): Quota | null {
  const q = (raw ?? {}) as Partial<Record<keyof Quota, unknown>>
  if (typeof q.measure !== 'string' || typeof q.limit !== 'number' || typeof q.used !== 'number' || (q.bearer !== 'you' && q.bearer !== 'owner')) return null
  return {
    measure: q.measure,
    limit: q.limit,
    used: q.used,
    bearer: q.bearer,
    ...(typeof q.frees === 'string' ? { frees: q.frees } : {}),
    ...(q.bearer === 'owner' && typeof q.ownerName === 'string' && q.ownerName !== '' ? { ownerName: q.ownerName } : {}),
  }
}
