// The operator's way round a Stripe webhook that never came (#1493, ops/RUNBOOK.md, DRIFT §12): an
// account's subscriptions read from Stripe and written to its tier exactly as the webhook would.
// Run over Tailscale with the box's own database, BYD_PLANS and Stripe variables.
//   DATABASE_URL=… BYD_PLANS='…' STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… BYD_STRIPE_PRICES='…' \
//     pnpm --filter @byd/server stripe sync ada@example.com
import { PostgresLogStore } from '../src/store-postgres.js'
import { paymentsFromEnv, stripeApi, syncByAddress } from '../src/payments.js'
import { plansFromEnv } from '../src/quotas.js'

const [verb, email] = process.argv.slice(2)
const url = process.env['DATABASE_URL']
const config = paymentsFromEnv(process.env, plansFromEnv(process.env))
if (!url || verb !== 'sync' || !email || !config) {
  console.error('usage: stripe sync <address>   (DATABASE_URL, BYD_PLANS and the Stripe variables)')
  process.exit(2)
}
const store = PostgresLogStore.connect(url)
try {
  const done = await syncByAddress({ auth: store.auth(), accountPlans: store.accountPlans(), stripe: stripeApi(config.secretKey), config }, email)
  console.log(JSON.stringify({ msg: 'stripe', verb, email, ...done }))
  process.exitCode = done.ok ? 0 : 1
} finally {
  await store.close()
}
