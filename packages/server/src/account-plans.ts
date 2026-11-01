import type { Sql } from 'postgres'
import type { AuthStore } from './auth.js'
import type { RenderStore } from '@byd/render/queue'
import type { ProjectDoc, ProjectStore } from './projects.js'
import type { LogStore } from './store.js'
import { ProjectHost } from './project-actor.js'
import { CARD_MEASURES, cardsUsed, type CardMeasure } from './quota-cards.js'
import { checkPlansInUse, hasPrint, limitOf, plansFromEnv, tableWindowFrom, type Limit, type Plans } from './quotas.js'
import { readOnlyReasons, type FitCeilings, type GameStanding, type ReadOnlyWhy } from './read-only.js'

// Which tier an account has (#1193, A2, #1192). A table of its own, beside the accounts, written by
// the operator today and by Stripe later — so that paying becomes a way to change tier and not a
// new model. An account without a row has the configuration's default. The row holds only the
// tier's name: what a tier allows is configuration (`quotas.ts`), never stored.
//
// A row may be **lapsed** (#1491, G5, L2): the subscription behind the tier has run out. The row
// keeps the tier it names, so lifting the lapse gives it back, and while it is lapsed the account is
// held to the default, which is the free tier (A2), and what of its games lies over the free tier's
// ceilings is read-only (`read-only.ts`). Giving the account a tier again ends the lapse. The
// operator sets and lifts it today; Stripe writes the same when a subscription runs out.

export type PlanSource = 'operator' | 'stripe'
// `lapsed` is when the tier lapsed, absent while it holds.
export type AccountPlan = { plan: string; since: string; source: PlanSource; lapsed?: string }

export type AccountPlanStore = {
  // The account's own tier, or null when it has none and so has the default.
  planOf(account: string): Promise<AccountPlan | null>
  // Gives the account a tier, in place of any it had, and ends a lapse.
  setPlan(account: string, plan: string, source: PlanSource): Promise<void>
  // Takes the account's own tier away, so it has the default again; false when it had none.
  clearPlan(account: string): Promise<boolean>
  // Marks the account's own tier as lapsed; false when it has none. A tier already lapsed keeps the
  // moment it lapsed.
  lapse(account: string): Promise<boolean>
  // Lifts a lapse; false when the account's tier was not lapsed.
  unlapse(account: string): Promise<boolean>
  // Every tier some account has, once each, in order: what the start checks the configuration
  // against. A lapsed tier is named too, since lifting the lapse gives it back.
  plansNamed(): Promise<string[]>
  // Which Stripe customer is the account (#1493): linked once, when the account first asks for a
  // checkout, and never moved; a second link for the account keeps the first, and a customer
  // linked to another account is refused. The link is no tier, so taking the tier away keeps it.
  linkCustomer(account: string, customer: string): Promise<void>
  customerOf(account: string): Promise<string | null>
  accountOfCustomer(customer: string): Promise<string | null>
}

export class MemoryAccountPlanStore implements AccountPlanStore {
  private readonly rows = new Map<string, AccountPlan>()
  async planOf(account: string): Promise<AccountPlan | null> {
    const row = this.rows.get(account)
    return row ? { ...row } : null
  }
  async setPlan(account: string, plan: string, source: PlanSource): Promise<void> {
    this.rows.set(account, { plan, since: new Date().toISOString(), source })
  }
  async clearPlan(account: string): Promise<boolean> {
    return this.rows.delete(account)
  }
  async lapse(account: string): Promise<boolean> {
    const row = this.rows.get(account)
    if (!row) return false
    row.lapsed ??= new Date().toISOString()
    return true
  }
  async unlapse(account: string): Promise<boolean> {
    const row = this.rows.get(account)
    if (row?.lapsed === undefined) return false
    delete row.lapsed
    return true
  }
  async plansNamed(): Promise<string[]> {
    return [...new Set([...this.rows.values()].map((r) => r.plan))].sort()
  }
  private readonly customers = new Map<string, string>()
  async linkCustomer(account: string, customer: string): Promise<void> {
    if (this.customers.has(account)) return
    if ([...this.customers.values()].includes(customer)) throw new Error('customer linked to another account')
    this.customers.set(account, customer)
  }
  async customerOf(account: string): Promise<string | null> {
    return this.customers.get(account) ?? null
  }
  async accountOfCustomer(customer: string): Promise<string | null> {
    return [...this.customers].find(([, c]) => c === customer)?.[0] ?? null
  }
  // What an account that deletes itself leaves here, in memory (#1280); Postgres drops it with the
  // account.
  forget(account: string): void {
    this.rows.delete(account)
    this.customers.delete(account)
  }
}

export class PostgresAccountPlanStore implements AccountPlanStore {
  constructor(private readonly sql: Sql) {}
  async planOf(account: string): Promise<AccountPlan | null> {
    const [row] = await this.sql<{ plan: string; since: Date; source: PlanSource; lapsed_at: Date | null }[]>`select plan, since, source, lapsed_at from account_plans where account_id = ${account}`
    return row ? { plan: row.plan, since: row.since.toISOString(), source: row.source, ...(row.lapsed_at ? { lapsed: row.lapsed_at.toISOString() } : {}) } : null
  }
  async setPlan(account: string, plan: string, source: PlanSource): Promise<void> {
    await this.sql`
      insert into account_plans (account_id, plan, since, source) values (${account}, ${plan}, now(), ${source})
      on conflict (account_id) do update set plan = excluded.plan, since = excluded.since, source = excluded.source, lapsed_at = null
    `
  }
  async clearPlan(account: string): Promise<boolean> {
    const rows = await this.sql`delete from account_plans where account_id = ${account} returning account_id`
    return rows.length > 0
  }
  async lapse(account: string): Promise<boolean> {
    const rows = await this.sql`update account_plans set lapsed_at = coalesce(lapsed_at, now()) where account_id = ${account} returning account_id`
    return rows.length > 0
  }
  async unlapse(account: string): Promise<boolean> {
    const rows = await this.sql`update account_plans set lapsed_at = null where account_id = ${account} and lapsed_at is not null returning account_id`
    return rows.length > 0
  }
  async plansNamed(): Promise<string[]> {
    const rows = await this.sql<{ plan: string }[]>`select distinct plan from account_plans order by plan`
    return rows.map((r) => r.plan)
  }
  async linkCustomer(account: string, customer: string): Promise<void> {
    await this.sql`insert into stripe_customers (account_id, customer_id) values (${account}, ${customer}) on conflict (account_id) do nothing`
  }
  async customerOf(account: string): Promise<string | null> {
    const [row] = await this.sql<{ customer_id: string }[]>`select customer_id from stripe_customers where account_id = ${account}`
    return row?.customer_id ?? null
  }
  async accountOfCustomer(customer: string): Promise<string | null> {
    const [row] = await this.sql<{ account_id: string }[]>`select account_id::text from stripe_customers where customer_id = ${customer}`
    return row ? String(row.account_id) : null
  }
}

// The tiers the process starts with: `BYD_PLANS` read and held up against every tier an account
// has. Throws, saying why, when either fails; the start stops on it (#1192).
export async function plansAtStart(env: Record<string, string | undefined>, accountPlans: AccountPlanStore): Promise<Plans> {
  const plans = plansFromEnv(env)
  checkPlansInUse(plans, await accountPlans.plansNamed())
  return plans
}

// The tier an account is held to: its own, or the default when it has none or its own has lapsed.
export async function planOf(accountPlans: AccountPlanStore | undefined, plans: Plans, account: string): Promise<string> {
  const row = await accountPlans?.planOf(account)
  return row && row.lapsed === undefined ? row.plan : plans.default
}

// What an account uses of each measure that is built, and its ceiling on it (`null` is unlimited).
// A stock is counted out of the domain's own data, never kept beside it, so the count cannot drift
// from the truth (#1192): games out of `projects.owner`, cards out of each game as it stands, and
// storage out of what the versions of the account's games name (#1197). A flow that content
// addressing hides is read out of the log written as it happened: renderings out of the render log,
// over the thirty days up to `now`. Without a render queue nothing is rendered, and nothing counted.
//
// Cards are a ceiling per game (#1195), and are said per game: every game the account owns, by id,
// with what it uses. `used` is the most any one of them uses, which is how near the account's games
// stand to the ceiling — none when it owns none. `print` is whether the tier has the print package
// (#1490), a property and not a measure.
export type Measured = { used: number; limit: Limit }
export type PerGame = Measured & { projects: { id: string; used: number }[] }
//
// A lapsed account (#1491) is said by `plan`, the tier it is held to, which is the default, and by
// `lapsed`, its own tier and when it lapsed. `readOnly` is the games it owns that lie over the free
// tier's ceilings, by id and with the ceiling each lies over (#1511), and is empty for every account
// that has not lapsed. `ifLapsed` is the same answer for an account whose own tier still holds: the
// games that would be read-only if it lapsed now, which is what a cancellation says (#1494). An
// account on the default tier has nothing to lapse from, and so none.
export type HeldGame = { id: string; why: ReadOnlyWhy }
export type Usage = {
  plan: string
  print: boolean
  lapsed?: { plan: string; at: string }
  readOnly: HeldGame[]
  ifLapsed: HeldGame[]
  measures: { projects: Measured; openTables: Measured; tablesPer30Days: Measured; storageBytes: Measured; rendersPer30Days: Measured } & Record<CardMeasure, PerGame>
}
// `live` is the game as it stands (D3, #909): the running actor's document, or the saved version
// with the log's tail replayed — the same source «Mina spel» reads a name out of. Without it, the
// log is replayed, which is what a process with no actors running (the operator's script) has.
//
// The tables are counted out of the sessions and their bearer (#1196), the window back from `now`,
// and the renderings out of the render log over the same window (#1197).
export type UsageStores = { projects: ProjectStore; tables: Pick<LogStore, 'tablesOf'>; accountPlans?: AccountPlanStore; live?: (id: string) => Promise<ProjectDoc | null>; renders?: Pick<RenderStore, 'rendersBy'> }
export async function usageOf(stores: UsageStores, plans: Plans, account: string, now = new Date()): Promise<Usage> {
  const own = await stores.accountPlans?.planOf(account)
  const plan = own && own.lapsed === undefined ? own.plan : plans.default
  const tables = await stores.tables.tablesOf(account, tableWindowFrom(now))
  const live = liveOf(stores)
  const games: { id: string; used: Record<CardMeasure, number> }[] = []
  for (const id of await stores.projects.ownedIds(account)) {
    const doc = await live(id)
    if (doc) games.push({ id, used: cardsUsed(doc) })
  }
  const held = own ? listed(await overFree({ ...stores, live }, plans, account)) : []
  const readOnly = own?.lapsed === undefined ? [] : held
  const perGame = (m: CardMeasure): PerGame => ({ used: Math.max(0, ...games.map((g) => g.used[m])), limit: limitOf(plans, plan, m), projects: games.map((g) => ({ id: g.id, used: g.used[m] })) })
  const cards = Object.fromEntries(CARD_MEASURES.map((m) => [m, perGame(m)])) as Record<CardMeasure, PerGame>
  const measured = (used: number, m: 'projects' | 'openTables' | 'tablesPer30Days' | 'storageBytes' | 'rendersPer30Days'): Measured => ({ used, limit: limitOf(plans, plan, m) })
  const rendered = stores.renders ? await stores.renders.rendersBy(account, tableWindowFrom(now).getTime()) : 0
  return {
    plan,
    print: hasPrint(plans, plan),
    ...(own?.lapsed !== undefined ? { lapsed: { plan: own.plan, at: own.lapsed } } : {}),
    readOnly,
    ifLapsed: held,
    measures: {
      projects: measured(await stores.projects.owned(account), 'projects'),
      ...cards,
      openTables: measured(tables.open, 'openTables'),
      tablesPer30Days: measured(tables.started, 'tablesPer30Days'),
      storageBytes: measured(await stores.projects.stored(account), 'storageBytes'),
      rendersPer30Days: measured(rendered, 'rendersPer30Days'),
    },
  }
}

const liveOf = (stores: Pick<UsageStores, 'projects' | 'live'>): ((id: string) => Promise<ProjectDoc | null>) => {
  if (stores.live) return stores.live
  const replay = new ProjectHost(stores.projects)
  return (id) => replay.live(id)
}

// When a game last changed (#1491): its newest version, or the newest edit in the log after it,
// whichever is later. Read from the store, where an edit is committed before it is applied.
async function changedAt(projects: ProjectStore, id: string): Promise<string> {
  const [newest] = await projects.versions(id)
  const last = (await projects.readEdits(id, newest?.atSeq ?? 0)).at(-1)?.at
  return [newest?.at ?? '', last ?? ''].sort().at(-1) ?? ''
}

// The games of an account that are read-only (#1491, G5, L2): none unless its tier has lapsed, and
// then those that lie over the default tier's ceilings by the one rule in `read-only.ts`. Asked
// afresh every time, so a game deleted or a lapse lifted is felt at once. A game of somebody else's
// is held to its owner's: what a co-editor meets is the owner's read-only mode (D3).
export async function readOnlyOf(stores: Pick<UsageStores, 'projects' | 'accountPlans' | 'live'>, plans: Plans, owner: string): Promise<Set<string>> {
  if ((await stores.accountPlans?.planOf(owner))?.lapsed === undefined) return new Set()
  return new Set((await overFree(stores, plans, owner)).keys())
}
const listed = (over: Map<string, ReadOnlyWhy>): HeldGame[] => [...over].map(([id, why]) => ({ id, why })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
// The owner's games that lie over the default tier's ceilings, and why, whether or not its own tier
// has lapsed: the rule in `read-only.ts`, asked of every game as it stands.
async function overFree(stores: Pick<UsageStores, 'projects' | 'live'>, plans: Plans, owner: string): Promise<Map<string, ReadOnlyWhy>> {
  const live = liveOf(stores)
  const games: GameStanding[] = []
  for (const id of await stores.projects.ownedIds(owner)) {
    const doc = await live(id)
    if (!doc) continue
    const used = cardsUsed(doc)
    games.push({ id, changedAt: await changedAt(stores.projects, id), rows: used.cardRowsPerProject, copies: used.cardCopiesPerProject, assets: await stores.projects.weighed(id) })
  }
  const free = (m: keyof FitCeilings): Limit => limitOf(plans, plans.default, m)
  return readOnlyReasons({ projects: free('projects'), cardRowsPerProject: free('cardRowsPerProject'), cardCopiesPerProject: free('cardCopiesPerProject'), storageBytes: free('storageBytes') }, games)
}

// The operator's door to an account's tier (DRIFT §10): by address, over Tailscale, and no HTTP
// route. It never makes an account, and never writes a tier the configuration lacks, since that
// tier would stop the box's next start.
const address = (raw: string): string => raw.trim().toLowerCase()
type Refusal = { ok: false; why: string }
export async function setPlanByAddress(stores: { auth: Pick<AuthStore, 'accountByEmail'>; accountPlans: AccountPlanStore; plans: Plans }, email: string, plan: string): Promise<{ ok: true } | Refusal> {
  if (!(plan in stores.plans.plans)) return { ok: false, why: `no such tier: ${plan} (the tiers are ${Object.keys(stores.plans.plans).sort().join(', ')})` }
  const account = await stores.auth.accountByEmail(address(email))
  if (!account) return { ok: false, why: 'no such account' }
  await stores.accountPlans.setPlan(account.id, plan, 'operator')
  return { ok: true }
}
export async function clearPlanByAddress(stores: { auth: Pick<AuthStore, 'accountByEmail'>; accountPlans: AccountPlanStore }, email: string): Promise<{ ok: true } | Refusal> {
  const account = await stores.auth.accountByEmail(address(email))
  if (!account) return { ok: false, why: 'no such account' }
  return (await stores.accountPlans.clearPlan(account.id)) ? { ok: true } : { ok: false, why: 'no tier of its own' }
}
// A lapse set and lifted by hand (#1491), before Stripe writes it: only a tier of the account's own
// can lapse, since an account on the default has nothing to lapse from.
export async function lapsePlanByAddress(stores: { auth: Pick<AuthStore, 'accountByEmail'>; accountPlans: AccountPlanStore }, email: string): Promise<{ ok: true } | Refusal> {
  const account = await stores.auth.accountByEmail(address(email))
  if (!account) return { ok: false, why: 'no such account' }
  return (await stores.accountPlans.lapse(account.id)) ? { ok: true } : { ok: false, why: 'no tier of its own' }
}
export async function unlapsePlanByAddress(stores: { auth: Pick<AuthStore, 'accountByEmail'>; accountPlans: AccountPlanStore }, email: string): Promise<{ ok: true } | Refusal> {
  const account = await stores.auth.accountByEmail(address(email))
  if (!account) return { ok: false, why: 'no such account' }
  return (await stores.accountPlans.unlapse(account.id)) ? { ok: true } : { ok: false, why: 'not lapsed' }
}

// What every account uses, for the price decision (#1192): read from the database and sent nowhere.
export async function usageReport(stores: { auth: Pick<AuthStore, 'listAccounts'> } & UsageStores, plans: Plans, now: Date = new Date()): Promise<({ email: string } & Usage)[]> {
  const out: ({ email: string } & Usage)[] = []
  for (const account of await stores.auth.listAccounts()) out.push({ email: account.email, ...(await usageOf(stores, plans, account.id, now)) })
  return out
}
