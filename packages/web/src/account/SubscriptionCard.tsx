import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useT, type T } from '../i18n/index.js'
import { OutGlyph } from '../glyphs.js'
import { myProjects, myUsage, proChange, proCheckout, proPortal, proStanding, type Interval, type ProStanding } from './api.js'
import { currencyOf, day, money, monthsFree, pricePhrase, tierParts } from './pro.js'

// «Abonnemang» in Profil (#1494, variant A, beställarens beslut 2026-11-01): the tier, Gratis and
// Pro on two lines, month or year, and the way to Stripe's Checkout; with Pro, what it costs and
// when it renews, «Säg upp Pro» as large as the purchase was, and Stripe's customer portal for the
// receipts and the card. Cancelling is a question in the card, in the form «Radera kontot?» asks
// in, that names the games that would become read-only when the period ends (`ifLapsed`, #1511),
// with «Behåll Pro» holding the focus. Nothing is a dark pattern: the way out is as near as the way in.
//
// The way back from Stripe (`?pro=paid`) comes before Stripe's webhook: the card says it waits,
// shows no purchase meanwhile so nobody pays twice, and reads the standing until the account is
// Pro. Without payments on the box the card is not there.

// How often the way back asks, and after how long it says the word is late.
const POLL_MS = 2000
const LATE_MS = 60_000

type Back = 'waiting' | 'paid' | 'cancelled' | null

export function SubscriptionCard({ http, onNavigate }: { http: string; onNavigate(url: string): void }) {
  const t = useT()
  const [standing, setStanding] = useState<ProStanding | null>(null)
  const [names, setNames] = useState<{ id: string; name: string }[]>([])
  const [period, setPeriod] = useState<Interval>('month')
  const [back, setBack] = useState<Back>(() => {
    const said = new URLSearchParams(location.search).get('pro')
    return said === 'paid' ? 'waiting' : said === 'cancelled' ? 'cancelled' : null
  })
  const [late, setLate] = useState(false)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<string | null>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  // The games that would become read-only, by name, read with the usage.
  const readNames = async () => {
    const [usage, games] = await Promise.all([myUsage(http), myProjects(http).catch(() => [])])
    const named = new Map(games.map((g) => [g.id, g.name]))
    setNames((usage?.ifLapsed ?? []).map((g) => ({ id: g.id, name: named.get(g.id) ?? g.id })))
  }

  useEffect(() => {
    let live = true
    void proStanding(http).then((s) => live && setStanding(s))
    void readNames()
    // The way back is said once: a reload does not say it again.
    const url = new URL(location.href)
    if (url.searchParams.has('pro')) {
      url.searchParams.delete('pro')
      history.replaceState(history.state, '', url.toString())
    }
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [http])

  // Sent here from a met ceiling (`#abonnemang`): the card is where the eye goes.
  useEffect(() => {
    if (standing && location.hash === '#abonnemang') {
      heading.current?.scrollIntoView?.({ block: 'start' })
      heading.current?.focus()
    }
  }, [standing !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Waiting for Stripe's word: ask until the account is Pro, and say when it is late.
  useEffect(() => {
    if (back !== 'waiting' || !standing) return
    if (standing.plan === standing.paid.plan) {
      setBack('paid')
      return
    }
    const timer = window.setTimeout(() => void proStanding(http).then((s) => s && setStanding(s)), POLL_MS)
    return () => window.clearTimeout(timer)
  }, [back, standing, http])
  useEffect(() => {
    if (back !== 'waiting') return
    const timer = window.setTimeout(() => setLate(true), LATE_MS)
    return () => window.clearTimeout(timer)
  }, [back])
  useEffect(() => {
    if (asking) keep.current?.focus()
  }, [asking])

  if (!standing) return null
  const currency = currencyOf(standing, t)
  const pro = standing.plan === standing.paid.plan
  const sub = standing.subscription
  const here = () => {
    const url = new URL(location.href)
    url.searchParams.delete('pro')
    return `${url.pathname}${url.search}`
  }

  const buy = async () => {
    if (!currency) return
    setBusy(true)
    setFault(null)
    const went = await proCheckout(http, { currency, interval: period, back: here() })
    setBusy(false)
    if ('url' in went) return onNavigate(went.url)
    if (went.error === 'subscribed') return setBack('waiting')
    setFault(t('profile.pro.stripe.down'))
  }
  const portal = async () => {
    setFault(null)
    const url = await proPortal(http, here())
    if (url) onNavigate(url)
    else setFault(t('profile.pro.stripe.down'))
  }
  const change = async (to: 'cancel' | 'resume') => {
    setBusy(true)
    setFault(null)
    const now = await proChange(http, to)
    setBusy(false)
    if (!now) return setFault(t(to === 'cancel' ? 'profile.pro.cancel.failed' : 'profile.pro.resume.failed'))
    setStanding(now)
    setAsking(false)
    setBack(null)
    void readNames()
  }

  const tier = pro ? t('profile.pro.paid') : t('profile.pro.free')
  return (
    <section className="byd-profile-card byd-pro" id="abonnemang" aria-labelledby="byd-profile-pro">
      <h2 id="byd-profile-pro" ref={heading} tabIndex={-1}>
        {t('profile.pro.title')} <span className="byd-pro-tier" data-tier={pro ? 'paid' : 'free'}>{tier}</span>
      </h2>
      {back === 'waiting' && !pro && (
        <>
          <p className="byd-pro-status" data-tone="waiting" role="status">
            <span className="byd-pro-spin" aria-hidden="true" />
            <b>{t('profile.pro.waiting.lead')}</b> {t('profile.pro.waiting')}
          </p>
          <p className="byd-profile-quiet byd-profile-small">{t(late ? 'profile.pro.waiting.long' : 'profile.pro.waiting.note')}</p>
        </>
      )}
      {back === 'paid' && pro && (
        <p className="byd-pro-status" data-tone="ok" role="status">
          <b>{t('profile.pro.paid.lead')}</b> {sub?.periodEnd ? t('profile.pro.paid.body', { date: day(sub.periodEnd, t) }) : t('profile.pro.paid.body.now')}
        </p>
      )}
      {back === 'cancelled' && !pro && (
        <p className="byd-pro-status" data-tone="neutral" role="status">
          <b>{t('profile.pro.cancelled.lead')}</b> {t('profile.pro.cancelled')}
        </p>
      )}
      {!pro && back !== 'waiting' && <FreeCard standing={standing} currency={currency} interval={period} onInterval={setPeriod} busy={busy} onBuy={() => void buy()} t={t} />}
      {pro && !sub && <p className="byd-profile-lead">{t('profile.pro.given')}</p>}
      {pro && sub && (
        <>
          {sub.status === 'past_due' && (
            <p className="byd-pro-status" data-tone="warn" role="status">
              <b>{t('profile.pro.failed.lead')}</b> {t('profile.pro.failed')}
            </p>
          )}
          {sub.cancelAtPeriodEnd ? (
            <p className="byd-pro-status" data-tone="neutral" role="status">
              <Lead text={sub.periodEnd ? t('profile.pro.ended', { lead: LEAD, date: day(sub.periodEnd, t) }) : t('profile.pro.ended.now', { lead: LEAD })} lead={t('profile.pro.ended.lead')} />
              {names.length > 0 && ` ${t('profile.pro.ended.games', { games: listed(names.map((g) => g.name), t) })}`}
            </p>
          ) : (
            <p className="byd-pro-price">{priceLine(standing, t)}</p>
          )}
        </>
      )}
      {pro && <ProLine standing={standing} t={t} />}
      {pro && sub && asking && (
        <div className="byd-pro-question" role="group" aria-labelledby="byd-pro-ask">
          <p id="byd-pro-ask">
            <b>{t('profile.pro.ask.lead')}</b> {sub.periodEnd ? t('profile.pro.ask.until', { date: day(sub.periodEnd, t) }) : t('profile.pro.ask.until.now')} {t(names.length > 0 ? 'profile.pro.ask.games' : 'profile.pro.ask.fits')}
          </p>
          {names.length > 0 && (
            <ul>
              {names.map((g) => (
                <li key={g.id}>{g.name}</li>
              ))}
            </ul>
          )}
          <p className="byd-profile-quiet byd-profile-small">{sub.periodEnd ? t('profile.pro.ask.keep', { date: day(sub.periodEnd, t) }) : t('profile.pro.ask.keep.now')}</p>
          <div className="byd-profile-row">
            <button type="button" className="byd-pro-danger byd-profile-button" disabled={busy} onClick={() => void change('cancel')}>
              {t('profile.pro.ask.yes')}
            </button>
            <button
              ref={keep}
              type="button"
              className="byd-secondary byd-profile-button"
              onClick={() => {
                setAsking(false)
                requestAnimationFrame(() => opener.current?.focus())
              }}
            >
              {t('profile.pro.ask.no')}
            </button>
          </div>
        </div>
      )}
      {pro && sub && !asking && (
        <div className="byd-profile-row">
          {sub.cancelAtPeriodEnd ? (
            <button type="button" className="byd-primary byd-profile-button" disabled={busy} onClick={() => void change('resume')}>
              {t('profile.pro.resume')}
            </button>
          ) : (
            <>
              {sub.status === 'past_due' && (
                <button type="button" className="byd-primary byd-profile-button" onClick={() => void portal()}>
                  {t('profile.pro.card')}
                </button>
              )}
              <button ref={opener} type="button" className="byd-secondary byd-profile-button" onClick={() => setAsking(true)}>
                {t('profile.pro.cancel')}
              </button>
            </>
          )}
          <button type="button" className="byd-pro-out byd-profile-button" onClick={() => void portal()}>
            {t(sub.cancelAtPeriodEnd ? 'profile.pro.receipts' : 'profile.pro.portal')}
            <OutGlyph />
          </button>
        </div>
      )}
      {fault && (
        <p className="byd-profile-fail-line" role="alert">
          {fault}
        </p>
      )}
    </section>
  )
}

// Where the lead of a sentence goes, so that it can be set in bold inside the reader's words.
const LEAD = '\u0001'
function Lead({ text, lead }: { text: string; lead: string }) {
  const [before, after] = text.split(LEAD) as [string, string | undefined]
  if (after === undefined) return <>{text}</>
  return (
    <>
      {before}
      <b>{lead}</b>
      {after}
    </>
  )
}

// «Drakhamnen och Sal's Saloon», «A, B och C», in the reader's language.
const listed = (names: string[], t: T): string => new Intl.ListFormat(t('quota.locale'), { type: 'conjunction' }).format(names)

function priceLine(standing: ProStanding, t: T): string {
  const sub = standing.subscription
  if (!sub) return ''
  const price = sub.amount === null ? (pricePhrase(standing, sub.currency, sub.interval, t) ?? '') : t(sub.interval === 'month' ? 'profile.pro.month' : 'profile.pro.year', { price: money(sub.amount, sub.currency, t) })
  if (sub.status === 'past_due') return t('profile.pro.retrying', { price })
  return sub.periodEnd ? t('profile.pro.renews', { price, date: day(sub.periodEnd, t) }) : price
}

// A tier's line, the first thing it gives beyond the other in bold.
function TierLine({ standing, of, t }: { standing: ProStanding; of: 'free' | 'paid'; t: T }) {
  const tier = standing[of]
  const { items, print } = tierParts(tier, of === 'free' ? standing.paid : standing.free, t)
  const first = of === 'paid' ? items.findIndex((i) => i.better) : -1
  const parts: ReactNode[] = items.map((item, i) => <Fragment key={i}>{i === first ? <b>{item.text}</b> : item.text}</Fragment>)
  const joined = parts.flatMap((part, i) => (i === 0 ? [part] : [', ', part]))
  const [before, after] = t(print ? 'profile.pro.items.print' : 'profile.pro.items', { items: LEAD }).split(LEAD) as [string, string]
  return (
    <>
      {before}
      {joined}
      {after}
    </>
  )
}

function ProLine({ standing, t }: { standing: ProStanding; t: T }) {
  const [before, after] = t('profile.pro.with', { items: LEAD }).split(LEAD) as [string, string]
  return (
    <p className="byd-profile-quiet byd-profile-small">
      {before}
      <TierLine standing={standing} of="paid" t={t} />
      {after}
    </p>
  )
}

function FreeCard({ standing, currency, interval, onInterval, busy, onBuy, t }: { standing: ProStanding; currency: string | null; interval: Interval; onInterval(i: Interval): void; busy: boolean; onBuy(): void; t: T }) {
  const price = currency ? pricePhrase(standing, currency, interval, t) : null
  const free = currency ? monthsFree(standing, currency) : 0
  const hasYear = currency ? standing.prices?.[currency]?.year !== undefined : false
  return (
    <>
      <dl className="byd-pro-compare">
        <dt>{t('profile.pro.free')}</dt>
        <dd>
          <TierLine standing={standing} of="free" t={t} />
        </dd>
        <dt>{t('profile.pro.paid')}</dt>
        <dd>
          <TierLine standing={standing} of="paid" t={t} />
        </dd>
      </dl>
      {price === null ? (
        <p className="byd-profile-fail-line">{t('profile.pro.no.prices')}</p>
      ) : (
        <div className="byd-pro-buy">
          {hasYear && (
            <fieldset className="byd-pro-period">
              <legend>{t('profile.pro.pay')}</legend>
              <label>
                <input type="radio" name="byd-pro-period" checked={interval === 'month'} onChange={() => onInterval('month')} />
                {t('profile.pro.per.month')}
              </label>
              <label>
                <input type="radio" name="byd-pro-period" checked={interval === 'year'} onChange={() => onInterval('year')} />
                {t('profile.pro.per.year')}
                {free > 0 && (
                  <>
                    {' '}
                    <small>{t(free === 1 ? 'profile.pro.free.months.one' : 'profile.pro.free.months.other', { n: free })}</small>
                  </>
                )}
              </label>
            </fieldset>
          )}
          <button type="button" className="byd-primary byd-profile-button byd-pro-buy-button" disabled={busy} onClick={onBuy}>
            {t('profile.pro.buy', { price })}
          </button>
        </div>
      )}
      <p className="byd-profile-quiet byd-profile-small">{t('profile.pro.buy.note')}</p>
    </>
  )
}
