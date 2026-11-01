import { createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'

// Stripe as the web's tests and the built app's journeys meet it (#1494): a stand-in on this machine
// for the few routes of Stripe's REST API the box asks (`stripeApi` in `src/payments.ts`), with a
// Checkout page and a customer portal page a browser can be sent to. No call leaves the machine,
// and `pnpm test` never meets Stripe. A test drives what Stripe would decide — a payment made, a
// subscription ended — and sends the webhook itself, signed as Stripe signs it, when it wants it to
// come: Stripe sends the browser back before its webhook, and the way back has to be tried so.
//
// Prices are those `BYD_STRIPE_PRICES` names, with VAT inside (#1521), and cost what A2 says.

export type StandInSub = { id: string; customer: string; price: string; status: string; cancelAtPeriodEnd: boolean; periodEnd: number }
export type StandIn = {
  url: string
  // Every price, by id: its currency, interval and amount in the smallest unit.
  prices: Map<string, { currency: string; interval: 'month' | 'year'; amount: number; taxBehavior: string }>
  subs: StandInSub[]
  // The Checkout sessions made, newest last, and what each was for.
  checkouts: { id: string; customer: string; price: string; successUrl: string; cancelUrl: string; form: Record<string, string> }[]
  portals: { customer: string; returnUrl: string }[]
  // A subscription made as paying at Checkout would make it.
  pay(customer: string, price: string): StandInSub
  // A webhook body about a customer, and its `Stripe-Signature` under `secret`.
  event(type: string, customer: string, secret: string): { body: string; signature: string }
  stop(): Promise<void>
}

// The period a subscription is paid to: the first of next month, 10:00 UTC, so that a date said on a
// page is the same on every run of the same month.
const periodEnd = (now = new Date()): number => Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 10) / 1000)

// `listen` binds the server where the calling suite takes its ports (#58, #289) and says the port.
export async function stripeStandIn(prices: Record<string, { currency: string; interval: 'month' | 'year'; amount: number }>, listen: (server: Server) => Promise<number>): Promise<StandIn> {
  let n = 0
  const id = (prefix: string) => `${prefix}_${++n}${Math.random().toString(36).slice(2, 8)}`
  const state: Omit<StandIn, 'url' | 'stop' | 'pay' | 'event'> = {
    prices: new Map(Object.entries(prices).map(([k, p]) => [k, { ...p, taxBehavior: 'inclusive' }])),
    subs: [],
    checkouts: [],
    portals: [],
  }
  const pay = (customer: string, price: string): StandInSub => {
    const sub = { id: id('sub'), customer, price, status: 'active', cancelAtPeriodEnd: false, periodEnd: periodEnd() }
    state.subs.push(sub)
    return sub
  }
  const asSub = (s: StandInSub) => ({ id: s.id, object: 'subscription', customer: s.customer, status: s.status, cancel_at_period_end: s.cancelAtPeriodEnd, items: { data: [{ price: { id: s.price }, current_period_end: s.periodEnd }] } })
  let url = ''
  const server: Server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c: Buffer) => (raw += String(c)))
    req.on('end', () => {
      const at = new URL(req.url ?? '/', 'http://x')
      const form = Object.fromEntries(new URLSearchParams(raw))
      const send = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
      const page = (html: string) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><meta charset="utf-8"><title>Stripe (testläge)</title><body style="font:16px system-ui;padding:40px">${html}</body>`)
      const path = at.pathname
      let m: RegExpExecArray | null
      if (req.method === 'POST' && path === '/v1/customers') return send(200, { id: id('cus'), object: 'customer' })
      if (req.method === 'POST' && path === '/v1/checkout/sessions') {
        const session = { id: id('cs_test'), customer: form['customer'] ?? '', price: form['line_items[0][price]'] ?? '', successUrl: form['success_url'] ?? '', cancelUrl: form['cancel_url'] ?? '', form }
        state.checkouts.push(session)
        return send(200, { id: session.id, url: `${url}/c/pay/${session.id}` })
      }
      if (req.method === 'GET' && (m = /^\/v1\/prices\/([^/]+)$/.exec(path))) {
        const price = state.prices.get(decodeURIComponent(m[1]!))
        if (!price) return send(404, { error: { message: 'No such price' } })
        return send(200, { id: m[1], object: 'price', currency: price.currency, unit_amount: price.amount, tax_behavior: price.taxBehavior, recurring: { interval: price.interval, interval_count: 1 } })
      }
      if (req.method === 'GET' && path === '/v1/subscriptions') return send(200, { object: 'list', data: state.subs.filter((s) => s.customer === at.searchParams.get('customer')).map(asSub) })
      if ((m = /^\/v1\/subscriptions\/([^/]+)$/.exec(path))) {
        const sub = state.subs.find((s) => s.id === decodeURIComponent(m![1]!))
        if (!sub) return send(404, { error: { message: 'No such subscription' } })
        if (req.method === 'DELETE') sub.status = 'canceled'
        else if (req.method === 'POST' && 'cancel_at_period_end' in form) sub.cancelAtPeriodEnd = form['cancel_at_period_end'] === 'true'
        return send(200, asSub(sub))
      }
      if (req.method === 'POST' && path === '/v1/billing_portal/sessions') {
        state.portals.push({ customer: form['customer'] ?? '', returnUrl: form['return_url'] ?? '' })
        return send(200, { id: id('bps'), url: `${url}/p/session/${encodeURIComponent(form['customer'] ?? '')}` })
      }
      // The pages a browser is sent to: Checkout, with a way to pay and a way back, and the portal.
      if (req.method === 'GET' && (m = /^\/c\/pay\/([^/]+)$/.exec(path))) {
        const session = state.checkouts.find((c) => c.id === m![1])
        if (!session) return page('<p>Ingen sådan kassa.</p>')
        return page(`<h1>Stripes kassa (testläge)</h1><p>${session.price}</p><form method="post" action="/c/pay/${session.id}"><button>Betala</button></form><p><a href="${session.cancelUrl}">Tillbaka</a></p>`)
      }
      if (req.method === 'POST' && (m = /^\/c\/pay\/([^/]+)$/.exec(path))) {
        const session = state.checkouts.find((c) => c.id === m![1])
        if (!session) return send(404, { error: { message: 'No such session' } })
        pay(session.customer, session.price)
        return res.writeHead(303, { location: session.successUrl }).end()
      }
      if (req.method === 'GET' && (m = /^\/p\/session\/([^/]+)$/.exec(path))) {
        const back = [...state.portals].reverse().find((p) => p.customer === decodeURIComponent(m![1]!))?.returnUrl ?? '/'
        return page(`<h1>Stripes kundportal (testläge)</h1><p><a href="${back}">Tillbaka</a></p>`)
      }
      return send(404, { error: { message: `stand-in has no ${req.method} ${path}` } })
    })
  })
  url = `http://127.0.0.1:${await listen(server)}`
  return {
    url,
    ...state,
    pay,
    event(type, customer, secret) {
      const t = Math.floor(Date.now() / 1000)
      const body = JSON.stringify({ id: id('evt'), object: 'event', type, created: t, data: { object: { id: id('sub'), object: 'subscription', customer } } })
      return { body, signature: `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}` }
    },
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
