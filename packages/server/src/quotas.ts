import { z } from 'zod'

// Quotas (A2, #1192): tiers, measures and ceilings, and nothing else — no HTTP, no store.
//
// A **tier** is a name and a ceiling per measure. A **measure** is something an account uses and the
// server can count. A **ceiling** is a whole number or `null`, and `null` is unlimited.
//
// The tiers are configuration and never numbers in the code: `BYD_PLANS` is read once at start, the
// way `BYD_CORPUS_ACCOUNTS` is (DRIFT §7), and a price decision is a changed variable and a restart.
// Without it every ceiling is `null`. That is the beta's state (DESIGN-BESLUT I) and the state a box
// lands in when the variable is forgotten, so a deploy can never shut a designer out by mistake. A
// variable that is there but cannot be read stops the start instead: an error must never quietly
// become unlimited, nor quietly become closed.
//
// A ceiling only stops growth. Nothing is deleted, locked or hidden by one, and an account over its
// ceiling — the ceiling lowered, the tier changed — may still read, play, export, delete and shrink
// (G5). Which is why the one question here is whether a measure may *grow*.

// Every measure the PRD names (#1192), so a configuration written for all of them is read today.
// Which of them the server counts yet is `BUILT_MEASURES`; the rest are unlimited by not being asked.
export const MEASURES = ['projects', 'cardRowsPerProject', 'cardCopiesPerProject', 'openTables', 'tablesPer30Days', 'storageBytes', 'rendersPer30Days'] as const
export type Measure = (typeof MEASURES)[number]
// What `GET /me/usage` and the operator's usage script say: the measures the server counts today.
export const BUILT_MEASURES = ['projects', 'cardRowsPerProject', 'cardCopiesPerProject', 'openTables', 'tablesPer30Days'] as const satisfies readonly Measure[]
export type BuiltMeasure = (typeof BUILT_MEASURES)[number]

export type Limit = number | null
const Ceiling = z.number().int().min(0).nullable()
// Strict, so a misspelt measure stops the start rather than quietly leaving a tier unlimited. A
// measure a tier does not name is unlimited on it, so a new measure never shuts out anyone whose
// configuration is older than it.
const Plan = z.strictObject(Object.fromEntries(MEASURES.map((m) => [m, Ceiling.optional()])) as Record<Measure, z.ZodOptional<typeof Ceiling>>)
export type Plan = z.infer<typeof Plan>
const PlanName = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, 'a tier is named in lower-case letters, digits, - and _')
export const Plans = z
  .strictObject({ default: PlanName, plans: z.record(PlanName, Plan) })
  .refine((p) => Object.keys(p.plans).length > 0, { message: 'name at least one tier', path: ['plans'] })
  .refine((p) => p.default in p.plans, { error: (issue) => `the default tier «${String((issue.input as { default?: unknown }).default)}» is not one of the tiers`, path: ['default'] })
export type Plans = z.infer<typeof Plans>

// The built-in standard: one tier, free, with no ceiling anywhere.
export const DEFAULT_PLANS: Plans = { default: 'free', plans: { free: Object.fromEntries(MEASURES.map((m) => [m, null])) as Plan } }

// The tiers the box was given. Throws, saying what is wrong, when `BYD_PLANS` is there and cannot
// be read; the caller stops the start on it.
export function plansFromEnv(env: Record<string, string | undefined>): Plans {
  const raw = (env['BYD_PLANS'] ?? '').trim()
  if (raw === '') return DEFAULT_PLANS
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (e) {
    throw new Error(`BYD_PLANS is not JSON: ${(e as Error).message}`)
  }
  const parsed = Plans.safeParse(json)
  if (!parsed.success) throw new Error(`BYD_PLANS does not hold: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`)
  return parsed.data
}

// A tier the table of account tiers names but the configuration does not have stops the start
// (#1192), so a misspelling never quietly moves a paying designer to the free tier. Throws, naming
// the tiers; never the accounts that have them (DRIFT §8).
export function checkPlansInUse(plans: Plans, named: readonly string[]): void {
  const stray = [...new Set(named)].filter((name) => !(name in plans.plans)).sort()
  if (stray.length > 0) throw new Error(`account_plans names tiers BYD_PLANS does not have: ${stray.join(', ')}`)
}

// The ceiling on a measure for a tier. A measure the tier does not name is unlimited; so is a tier
// the configuration does not have, which the start refuses to begin with and which can only appear
// while the process runs (a tier set by hand under another configuration) — it is never read as the
// default, for the same reason the start refuses it.
export function limitOf(plans: Plans, plan: string, measure: Measure): Limit {
  return plans.plans[plan]?.[measure] ?? null
}

// What the start writes about the tiers (DRIFT §8), as `ai-keys` and `corpus` do: their names, the
// default and whether any ceiling is set at all. Never who has which tier.
export function plansLine(plans: Plans): Record<string, unknown> {
  const limited = Object.values(plans.plans).some((plan) => Object.values(plan).some((limit) => limit !== null && limit !== undefined))
  return { msg: 'plans', plans: Object.keys(plans.plans).sort(), default: plans.default, limited, ...(limited ? {} : { warning: 'no ceiling is set; nothing is limited' }) }
}

// Where a ceiling stood when it was met: the measure, the ceiling and what was used against it.
// `frees` is when a measure counted over a rolling window has room again (#1198): only
// `tablesPer30Days` has one, since open tables make room by being ended, which no date can say.
export type QuotaMet = { measure: Measure; limit: number; used: number; frees?: string }

// Whether a measure may grow by `n` from `used` under `limit`: null when it may, and the ceiling
// that was met when it may not. Something that does not grow is never refused, over the ceiling or not.
export function growth(measure: Measure, limit: Limit, used: number, n: number): QuotaMet | null {
  if (limit === null || n <= 0 || used + n <= limit) return null
  return { measure, limit, used }
}

// What a store throws when a write it was asked to make within a ceiling would cross it. The store
// counts and writes in one step (#1192): two requests at the ceiling's last place give exactly one.
export class QuotaReached extends Error {
  constructor(readonly quota: QuotaMet) {
    super(`quota ${quota.measure} reached: ${quota.used} of ${quota.limit}`)
    this.name = 'QuotaReached'
  }
}

// Tables, the second and third measures (#1196, #1192 question 3): tables open at once, the ceiling
// that guards the box's memory (DRIFT §1), and tables started over a rolling 30 days, the one that
// follows use — rolling and not by the calendar month, so that no day of the month is better than
// another. Both are counted out of the sessions and their bearer (#1194), and both are asked only
// when a table is started.
export const TABLE_WINDOW_MS = 30 * 24 * 3600 * 1000
// Where the window counted back from `now` begins: a start after it is in it.
export const tableWindowFrom = (now: Date): Date => new Date(now.getTime() - TABLE_WINDOW_MS)
// What an account bears of them: the tables of its that have not ended, and those started in the window.
export type TableUse = { open: number; started: number }
// The ceilings a table is opened within, and where the window begins.
export type TableCeilings = { openTables: Limit; tablesPer30Days: Limit; since: Date }
// The ceiling one more table would cross, or null when it may be opened. Open tables are asked
// first: it is the ceiling that guards the box, and the one a table that ends makes room under.
export function tableGrowth(ceilings: TableCeilings, used: TableUse): QuotaMet | null {
  return growth('openTables', ceilings.openTables, used.open, 1) ?? growth('tablesPer30Days', ceilings.tablesPer30Days, used.started, 1)
}

// Which start in the window has to fall out before one more table fits under a met
// `tablesPer30Days`, counted from the oldest and from 0: the oldest when the account stands at its
// ceiling, and later ones when it stands over it, since the oldest falling out then makes no room.
export const startThatFrees = (met: QuotaMet): number => met.used - met.limit
// The ceiling met, with when there is room again (#1198): `start` is the moment, in milliseconds,
// of the start `startThatFrees` names, which leaves the window 30 days on. There is none under a
// ceiling of 0, and then no date is said, since no date makes room.
export function withFrees(met: QuotaMet, start: number | undefined): QuotaMet {
  return start === undefined ? met : { ...met, frees: new Date(start + TABLE_WINDOW_MS).toISOString() }
}
