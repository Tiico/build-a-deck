// The operator's door to an account's tier (#1193, A2, DRIFT §10, §12): run over Tailscale against
// the box's database, never through HTTP.
//   DATABASE_URL=… BYD_PLANS='…' pnpm --filter @byd/server plan set ada@example.com pro
//   DATABASE_URL=… pnpm --filter @byd/server plan clear ada@example.com
// `BYD_PLANS` is the box's own: a tier it does not have is refused here, since that tier would stop
// the box's next start. An address with no account is refused too; this never makes an account.
// `clear` gives the account the default tier again.
import { PostgresLogStore } from '../src/store-postgres.js'
import { clearPlanByAddress, setPlanByAddress } from '../src/account-plans.js'
import { plansFromEnv } from '../src/quotas.js'

const [verb, email, plan] = process.argv.slice(2)
const url = process.env['DATABASE_URL']
if (!url || !email || (verb === 'set' ? !plan : verb !== 'clear')) {
  console.error('usage: plan set <address> <tier> | plan clear <address>   (DATABASE_URL, and BYD_PLANS for set)')
  process.exit(2)
}
const store = PostgresLogStore.connect(url)
try {
  const stores = { auth: store.auth(), accountPlans: store.accountPlans() }
  const done = verb === 'set' ? await setPlanByAddress({ ...stores, plans: plansFromEnv(process.env) }, email, plan ?? '') : await clearPlanByAddress(stores, email)
  console.log(JSON.stringify({ msg: 'plan', verb, email, ...(verb === 'set' ? { plan } : {}), ...done }))
  process.exitCode = done.ok ? 0 : 1
} finally {
  await store.close()
}
