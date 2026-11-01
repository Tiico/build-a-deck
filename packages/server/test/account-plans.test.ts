import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryAuthStore, MemoryLogStore, MemoryProjectStore, PostgresLogStore, type AuthStore, type LogStore } from '../src/index.js'
import { MemoryAccountPlanStore, clearPlanByAddress, lapsePlanByAddress, planOf, plansAtStart, setPlanByAddress, unlapsePlanByAddress, usageReport, type AccountPlanStore } from '../src/account-plans.js'
import type { ProjectStore } from '../src/projects.js'
import { DEFAULT_PLANS, plansFromEnv } from '../src/quotas.js'
import { twoSeatSetup } from './fixture.js'
import { template } from './deck.js'

// An account's tier (#1193, #1192): a table the operator writes today and Stripe writes later, so
// payment becomes a way to change tier rather than a new model. An account without a row has the
// default. Against the memory stores and against Postgres, whose queries are the ones the box
// answers with; the Postgres half runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_account_plans_${process.pid}_${Date.now()}`

type Backend = { auth: AuthStore; plans: AccountPlanStore; projects: ProjectStore; tables: LogStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  { name: 'memory', skip: false, open: async () => ({ auth: new MemoryAuthStore(), plans: new MemoryAccountPlanStore(), projects: new MemoryProjectStore(), tables: new MemoryLogStore(), close: () => Promise.resolve() }) },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      return {
        auth: store.auth(),
        plans: store.accountPlans(),
        projects: store.projects(),
        tables: store,
        close: async () => {
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

const tiers = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 2 }, pro: { projects: null } } }) })
const game = (name: string) => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

for (const backend of backends) {
  describe.skipIf(backend.skip)(`an account’s tier, in ${backend.name}`, () => {
    let db: Backend
    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })

    it('is nothing of its own until the operator sets one, and nothing again when it is taken away', async () => {
      const ada = await db.auth.ensureAccount('ada@example.com')
      expect(await db.plans.planOf(ada.id)).toBeNull()

      expect(await setPlanByAddress({ auth: db.auth, accountPlans: db.plans, plans: tiers }, ' Ada@Example.com ', 'pro')).toEqual({ ok: true })
      expect(await db.plans.planOf(ada.id)).toMatchObject({ plan: 'pro', source: 'operator' })
      expect(Date.parse((await db.plans.planOf(ada.id))!.since)).not.toBeNaN()

      // Set again, the row is replaced rather than doubled.
      expect(await setPlanByAddress({ auth: db.auth, accountPlans: db.plans, plans: tiers }, 'ada@example.com', 'free')).toEqual({ ok: true })
      expect(await db.plans.planOf(ada.id)).toMatchObject({ plan: 'free' })
      expect(await db.plans.plansNamed()).toEqual(['free'])

      expect(await clearPlanByAddress({ auth: db.auth, accountPlans: db.plans }, 'ada@example.com')).toEqual({ ok: true })
      expect(await db.plans.planOf(ada.id)).toBeNull()
      expect(await db.plans.plansNamed()).toEqual([])
      expect(await clearPlanByAddress({ auth: db.auth, accountPlans: db.plans }, 'ada@example.com')).toEqual({ ok: false, why: 'no tier of its own' })
    })

    // The operator's door never makes an account, and never writes a tier the box does not have:
    // that tier would stop the next start.
    it('is never set for an address with no account, nor to a tier the configuration lacks', async () => {
      await db.auth.ensureAccount('bo@example.com')
      expect(await setPlanByAddress({ auth: db.auth, accountPlans: db.plans, plans: tiers }, 'nobody@example.com', 'pro')).toEqual({ ok: false, why: 'no such account' })
      expect(await db.auth.accountByEmail('nobody@example.com')).toBeNull()
      expect(await setPlanByAddress({ auth: db.auth, accountPlans: db.plans, plans: tiers }, 'bo@example.com', 'proo')).toEqual({ ok: false, why: 'no such tier: proo (the tiers are free, pro)' })
      expect(await db.plans.plansNamed()).toEqual([])
    })

    // A tier the table names but BYD_PLANS lacks stops the start (#1192): a misspelling must never
    // quietly move a paying designer to the free tier.
    it('stops the start when the table names a tier the configuration lacks, and says which', async () => {
      const cy = await db.auth.ensureAccount('cy@example.com')
      await db.plans.setPlan(cy.id, 'pro', 'operator')
      await expect(plansAtStart({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: {} } }) }, db.plans)).rejects.toThrow(/account_plans names tiers BYD_PLANS does not have: pro/)
      // …and the built-in standard has no `pro` either: forgetting the variable is no way round it.
      await expect(plansAtStart({}, db.plans)).rejects.toThrow(/pro/)
      expect(await plansAtStart({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: {}, pro: {} } }) }, db.plans)).toMatchObject({ default: 'free' })
      await db.plans.clearPlan(cy.id)
      expect(await plansAtStart({}, db.plans)).toEqual(DEFAULT_PLANS)
    })

    // The operator's view of what each account uses (#1192), for the price decision: every account,
    // its tier and, for every measure built, what it uses and its ceiling.
    it('is reported with every account’s use, for the measures that are built', async () => {
      const dee = await db.auth.ensureAccount('dee@example.com')
      await db.projects.create(`dee-1-${backend.name}`, game('Ett'), dee.id)
      await db.projects.create(`dee-2-${backend.name}`, game('Två'), dee.id)
      // A table Dee bears (#1196), standing, and counted both as open and as started.
      await db.tables.createSession({ id: `dee-table-${backend.name}-${Date.now()}`, version: 'v1', setup: twoSeatSetup(), accountId: dee.id })
      await db.plans.setPlan(dee.id, 'pro', 'operator')
      const report = await usageReport({ auth: db.auth, accountPlans: db.plans, projects: db.projects, tables: db.tables }, tiers)
      // Cards per game, for every game the account owns (#1195): the log is replayed, since no
      // actor runs in the operator's process. And the tables the account bears (#1196), and its
      // storage and renderings (#1197).
      const games = [`dee-1-${backend.name}`, `dee-2-${backend.name}`].sort()
      const perGame = { used: 1, limit: null, projects: games.map((id) => ({ id, used: 1 })) }
      const none = { used: 0, limit: null }
      expect(report).toContainEqual(expect.objectContaining({ email: 'dee@example.com', plan: 'pro', measures: expect.objectContaining({ projects: { used: 2, limit: null }, cardRowsPerProject: perGame, cardCopiesPerProject: perGame, openTables: { used: 1, limit: null }, tablesPer30Days: { used: 1, limit: null }, storageBytes: none, rendersPer30Days: none }) }))
      expect(report).toContainEqual(expect.objectContaining({ email: 'bo@example.com', plan: 'free', measures: expect.objectContaining({ projects: { used: 0, limit: 2 }, cardRowsPerProject: { used: 0, limit: null, projects: [] }, openTables: { used: 0, limit: null }, tablesPer30Days: { used: 0, limit: null }, storageBytes: none, rendersPer30Days: none }) }))
      await db.plans.clearPlan(dee.id)
    })

    // A lapsed subscription (#1491, G5, L2): the account keeps its own tier in the table, marked as
    // lapsed, and is held to the default — the free tier — until the operator lifts the lapse or
    // gives it a tier again. Only an account with a tier of its own can lapse.
    it('lapses, is held to the default while lapsed, and is as before when lifted or given a tier again', async () => {
      const gus = await db.auth.ensureAccount('gus@example.com')
      const stores = { auth: db.auth, accountPlans: db.plans }
      expect(await lapsePlanByAddress({ ...stores, projects: db.projects, plans: tiers }, 'gus@example.com')).toEqual({ ok: false, why: 'no tier of its own' })
      expect(await lapsePlanByAddress({ ...stores, projects: db.projects, plans: tiers }, 'nobody@example.com')).toEqual({ ok: false, why: 'no such account' })
      await setPlanByAddress({ ...stores, plans: tiers }, 'gus@example.com', 'pro')
      expect(await planOf(db.plans, tiers, gus.id)).toBe('pro')

      expect(await lapsePlanByAddress({ ...stores, projects: db.projects, plans: tiers }, ' Gus@Example.com ')).toEqual({ ok: true })
      expect(await db.plans.planOf(gus.id)).toMatchObject({ plan: 'pro', source: 'operator', lapsed: expect.any(String) })
      expect(Date.parse((await db.plans.planOf(gus.id))!.lapsed!)).not.toBeNaN()
      expect(await planOf(db.plans, tiers, gus.id)).toBe('free')
      // The lapsed row still names its tier, so the start still holds BYD_PLANS to it.
      expect(await db.plans.plansNamed()).toContain('pro')

      expect(await unlapsePlanByAddress(stores, 'gus@example.com')).toEqual({ ok: true })
      expect((await db.plans.planOf(gus.id))?.lapsed).toBeUndefined()
      expect(await planOf(db.plans, tiers, gus.id)).toBe('pro')
      expect(await unlapsePlanByAddress(stores, 'gus@example.com')).toEqual({ ok: false, why: 'not lapsed' })

      // A tier given again ends the lapse.
      await lapsePlanByAddress({ ...stores, projects: db.projects, plans: tiers }, 'gus@example.com')
      await setPlanByAddress({ ...stores, plans: tiers }, 'gus@example.com', 'pro')
      expect(await planOf(db.plans, tiers, gus.id)).toBe('pro')
      await db.plans.clearPlan(gus.id)
    })

    // The report says the lapse, and which games are read-only, beside the tier it is held to.
    it('reports a lapsed account as held to the default, with its own tier, and its read-only games', async () => {
      const hal = await db.auth.ensureAccount('hal@example.com')
      const games = [`hal-1-${backend.name}`, `hal-2-${backend.name}`, `hal-3-${backend.name}`]
      for (const id of games) await db.projects.create(id, game(id), hal.id)
      await db.plans.setPlan(hal.id, 'pro', 'operator')
      await db.plans.lapse(hal.id)
      const report = await usageReport({ auth: db.auth, accountPlans: db.plans, projects: db.projects, tables: db.tables }, tiers)
      const line = report.find((l) => l.email === 'hal@example.com')!
      expect(line).toMatchObject({ plan: 'free', lapsed: { plan: 'pro' }, measures: { projects: { used: 3, limit: 2 } } })
      expect(line.readOnly).toHaveLength(1)
      expect(games).toContain(line.readOnly[0]?.id)
      expect(report.find((l) => l.email === 'bo@example.com')).toMatchObject({ readOnly: [] })
      expect(report.find((l) => l.email === 'bo@example.com')?.lapsed).toBeUndefined()
      for (const id of games) await db.projects.remove(id)
      await db.plans.clearPlan(hal.id)
    })

    // The print package is a property of the tier (#1490), and the report says whether each account
    // has it, so the operator sees it beside the ceilings; the beta's standard has it.
    it('says whether each account has the print package, by its tier', async () => {
      const withPrint = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 2 }, pro: { print: true } } }) })
      const eve = await db.auth.ensureAccount('eve@example.com')
      await db.auth.ensureAccount('fay@example.com')
      await db.plans.setPlan(eve.id, 'pro', 'operator')
      const report = await usageReport({ auth: db.auth, accountPlans: db.plans, projects: db.projects, tables: db.tables }, withPrint)
      expect(report).toContainEqual(expect.objectContaining({ email: 'eve@example.com', plan: 'pro', print: true }))
      expect(report).toContainEqual(expect.objectContaining({ email: 'fay@example.com', plan: 'free', print: false }))
      await db.plans.clearPlan(eve.id)
      expect(await usageReport({ auth: db.auth, accountPlans: db.plans, projects: db.projects, tables: db.tables }, DEFAULT_PLANS)).toContainEqual(expect.objectContaining({ email: 'eve@example.com', plan: 'free', print: true }))
    })
  })
}
