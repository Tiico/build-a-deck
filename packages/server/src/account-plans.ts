import type { Sql } from 'postgres'
import type { AuthStore } from './auth.js'
import type { ProjectDoc, ProjectStore } from './projects.js'
import type { LogStore } from './store.js'
import { ProjectHost } from './project-actor.js'
import { CARD_MEASURES, cardsUsed, type CardMeasure } from './quota-cards.js'
import { checkPlansInUse, limitOf, plansFromEnv, tableWindowFrom, type Limit, type Plans } from './quotas.js'

// Which tier an account has (#1193, A2, #1192). A table of its own, beside the accounts, written by
// the operator today and by Stripe later — so that paying becomes a way to change tier and not a
// new model. An account without a row has the configuration's default. The row holds only the
// tier's name: what a tier allows is configuration (`quotas.ts`), never stored.

export type PlanSource = 'operator' | 'stripe'
export type AccountPlan = { plan: string; since: string; source: PlanSource }

export type AccountPlanStore = {
  // The account's own tier, or null when it has none and so has the default.
  planOf(account: string): Promise<AccountPlan | null>
  // Gives the account a tier, in place of any it had.
  setPlan(account: string, plan: string, source: PlanSource): Promise<void>
  // Takes the account's own tier away, so it has the default again; false when it had none.
  clearPlan(account: string): Promise<boolean>
  // Every tier some account has, once each, in order: what the start checks the configuration against.
  plansNamed(): Promise<string[]>
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
  async plansNamed(): Promise<string[]> {
    return [...new Set([...this.rows.values()].map((r) => r.plan))].sort()
  }
}

export class PostgresAccountPlanStore implements AccountPlanStore {
  constructor(private readonly sql: Sql) {}
  async planOf(account: string): Promise<AccountPlan | null> {
    const [row] = await this.sql<{ plan: string; since: Date; source: PlanSource }[]>`select plan, since, source from account_plans where account_id = ${account}`
    return row ? { plan: row.plan, since: row.since.toISOString(), source: row.source } : null
  }
  async setPlan(account: string, plan: string, source: PlanSource): Promise<void> {
    await this.sql`
      insert into account_plans (account_id, plan, since, source) values (${account}, ${plan}, now(), ${source})
      on conflict (account_id) do update set plan = excluded.plan, since = excluded.since, source = excluded.source
    `
  }
  async clearPlan(account: string): Promise<boolean> {
    const rows = await this.sql`delete from account_plans where account_id = ${account} returning account_id`
    return rows.length > 0
  }
  async plansNamed(): Promise<string[]> {
    const rows = await this.sql<{ plan: string }[]>`select distinct plan from account_plans order by plan`
    return rows.map((r) => r.plan)
  }
}

// The tiers the process starts with: `BYD_PLANS` read and held up against every tier an account
// has. Throws, saying why, when either fails; the start stops on it (#1192).
export async function plansAtStart(env: Record<string, string | undefined>, accountPlans: AccountPlanStore): Promise<Plans> {
  const plans = plansFromEnv(env)
  checkPlansInUse(plans, await accountPlans.plansNamed())
  return plans
}

// The tier an account is held to: its own, or the default.
export async function planOf(accountPlans: AccountPlanStore | undefined, plans: Plans, account: string): Promise<string> {
  return (await accountPlans?.planOf(account))?.plan ?? plans.default
}

// What an account uses of each measure that is built, and its ceiling on it (`null` is unlimited).
// Each measure is counted out of the domain's own data, never kept beside it, so the count cannot
// drift from the truth (#1192).
//
// Cards are a ceiling per game (#1195), and are said per game: every game the account owns, by id,
// with what it uses. `used` is the most any one of them uses, which is how near the account's games
// stand to the ceiling — none when it owns none.
export type Measured = { used: number; limit: Limit }
export type PerGame = Measured & { projects: { id: string; used: number }[] }
export type Usage = { plan: string; measures: { projects: Measured; openTables: Measured; tablesPer30Days: Measured } & Record<CardMeasure, PerGame> }
// `live` is the game as it stands (D3, #909): the running actor's document, or the saved version
// with the log's tail replayed — the same source «Mina spel» reads a name out of. Without it, the
// log is replayed, which is what a process with no actors running (the operator's script) has.
//
// The tables are counted out of the sessions and their bearer (#1196), the window back from `now`.
export type UsageStores = { projects: ProjectStore; tables: Pick<LogStore, 'tablesOf'>; accountPlans?: AccountPlanStore; live?: (id: string) => Promise<ProjectDoc | null> }
export async function usageOf(stores: UsageStores, plans: Plans, account: string, now = new Date()): Promise<Usage> {
  const plan = await planOf(stores.accountPlans, plans, account)
  const tables = await stores.tables.tablesOf(account, tableWindowFrom(now))
  const replay = new ProjectHost(stores.projects)
  const live = stores.live ?? ((id: string) => replay.live(id))
  const games: { id: string; used: Record<CardMeasure, number> }[] = []
  for (const id of await stores.projects.ownedIds(account)) {
    const doc = await live(id)
    if (doc) games.push({ id, used: cardsUsed(doc) })
  }
  const perGame = (m: CardMeasure): PerGame => ({ used: Math.max(0, ...games.map((g) => g.used[m])), limit: limitOf(plans, plan, m), projects: games.map((g) => ({ id: g.id, used: g.used[m] })) })
  const cards = Object.fromEntries(CARD_MEASURES.map((m) => [m, perGame(m)])) as Record<CardMeasure, PerGame>
  const measured = (used: number, m: 'projects' | 'openTables' | 'tablesPer30Days'): Measured => ({ used, limit: limitOf(plans, plan, m) })
  return { plan, measures: { projects: measured(await stores.projects.owned(account), 'projects'), ...cards, openTables: measured(tables.open, 'openTables'), tablesPer30Days: measured(tables.started, 'tablesPer30Days') } }
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

// What every account uses, for the price decision (#1192): read from the database and sent nowhere.
export async function usageReport(stores: { auth: Pick<AuthStore, 'listAccounts'> } & UsageStores, plans: Plans): Promise<({ email: string } & Usage)[]> {
  const out: ({ email: string } & Usage)[] = []
  for (const account of await stores.auth.listAccounts()) out.push({ email: account.email, ...(await usageOf(stores, plans, account.id)) })
  return out
}
