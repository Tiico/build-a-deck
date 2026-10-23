import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryAuthStore, MemoryProjectStore, PostgresLogStore, type AuthStore } from '../src/index.js'
import { MemoryAccountPlanStore, clearPlanByAddress, plansAtStart, setPlanByAddress, usageReport, type AccountPlanStore } from '../src/account-plans.js'
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

type Backend = { auth: AuthStore; plans: AccountPlanStore; projects: ProjectStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  { name: 'memory', skip: false, open: async () => ({ auth: new MemoryAuthStore(), plans: new MemoryAccountPlanStore(), projects: new MemoryProjectStore(), close: () => Promise.resolve() }) },
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
      await db.plans.setPlan(dee.id, 'pro', 'operator')
      const report = await usageReport({ auth: db.auth, accountPlans: db.plans, projects: db.projects }, tiers)
      // Cards per game, for every game the account owns (#1195): the log is replayed, since no
      // actor runs in the operator's process. Storage and renderings are the account's (#1197).
      const games = [`dee-1-${backend.name}`, `dee-2-${backend.name}`].sort()
      const perGame = { used: 1, limit: null, projects: games.map((id) => ({ id, used: 1 })) }
      const none = { used: 0, limit: null }
      expect(report).toContainEqual(expect.objectContaining({ email: 'dee@example.com', plan: 'pro', measures: expect.objectContaining({ projects: { used: 2, limit: null }, cardRowsPerProject: perGame, cardCopiesPerProject: perGame, storageBytes: none, rendersPer30Days: none }) }))
      expect(report).toContainEqual(expect.objectContaining({ email: 'bo@example.com', plan: 'free', measures: expect.objectContaining({ projects: { used: 0, limit: 2 }, cardRowsPerProject: { used: 0, limit: null, projects: [] }, storageBytes: none, rendersPer30Days: none }) }))
      await db.plans.clearPlan(dee.id)
    })
  })
}
