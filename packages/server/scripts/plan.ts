// The operator's door to an account's tier (#1193, A2, DRIFT §10, §12): run over Tailscale against
// the box's database, never through HTTP.
//   DATABASE_URL=… BYD_PLANS='…' pnpm --filter @byd/server plan set ada@example.com pro
//   DATABASE_URL=… pnpm --filter @byd/server plan clear ada@example.com
//   DATABASE_URL=… pnpm --filter @byd/server plan lapse ada@example.com
//   DATABASE_URL=… pnpm --filter @byd/server plan unlapse ada@example.com
// `BYD_PLANS` is the box's own: a tier it does not have is refused here, since that tier would stop
// the box's next start. An address with no account is refused too; this never makes an account.
// `clear` gives the account the default tier again. `lapse` marks the account's own tier as lapsed
// (#1491, G5, L2): it is held to the default, and what of its games lies over the default's
// ceilings is read-only, until `unlapse` lifts it or `set` gives it a tier again.
import { PostgresLogStore } from '../src/store-postgres.js'
import { clearPlanByAddress, lapsePlanByAddress, setPlanByAddress, unlapsePlanByAddress } from '../src/account-plans.js'
import { plansFromEnv } from '../src/quotas.js'

const [verb, email, plan] = process.argv.slice(2)
const url = process.env['DATABASE_URL']
const verbs = ['set', 'clear', 'lapse', 'unlapse']
if (!url || !email || !verbs.includes(verb ?? '') || (verb === 'set' && !plan)) {
  console.error('usage: plan set <address> <tier> | plan clear <address> | plan lapse <address> | plan unlapse <address>   (DATABASE_URL, and BYD_PLANS for set and lapse)')
  process.exit(2)
}
const store = PostgresLogStore.connect(url)
try {
  const stores = { auth: store.auth(), accountPlans: store.accountPlans() }
  const done =
    verb === 'set'
      ? await setPlanByAddress({ ...stores, plans: plansFromEnv(process.env) }, email, plan ?? '')
      : verb === 'lapse'
        ? await lapsePlanByAddress({ ...stores, projects: store.projects(), plans: plansFromEnv(process.env) }, email)
        : verb === 'unlapse'
          ? await unlapsePlanByAddress(stores, email)
          : await clearPlanByAddress(stores, email)
  console.log(JSON.stringify({ msg: 'plan', verb, email, ...(verb === 'set' ? { plan } : {}), ...done }))
  process.exitCode = done.ok ? 0 : 1
} finally {
  await store.close()
}
