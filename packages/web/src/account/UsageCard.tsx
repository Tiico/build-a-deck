import { useEffect, useState } from 'react'
import { useT, type T } from '../i18n/index.js'
import { myProjects, myUsage, type Usage } from './api.js'
import { bytes } from './quota-words.js'

// What the account uses, on the profile (#1198, variant A): every measure that has a ceiling, with
// what is used against it, and the cards of every game the account owns. It is there only when some
// ceiling is set, so in the beta — every ceiling `null` — the profile is what it was (#1192, beslut 7),
// and no surface hints at a price that does not exist. Tables test leaders start and pictures
// co-editors upload count against the owner (A2), and the card says so.
//
// The measures it says are the ones a ceiling is asked at. Renders are measured and have a place in
// the configuration, but no door asks their ceiling yet (#1197), so a bar for them would promise one.

// The measures in the order the profile says them.
const SAID = ['projects', 'cardRowsPerProject', 'cardCopiesPerProject', 'openTables', 'tablesPer30Days', 'storageBytes'] as const
type Said = (typeof SAID)[number]

// Near is from four fifths, as the prototype drew it; full is when one more would not fit.
const fill = (used: number, limit: number): 'full' | 'near' | undefined => (used >= limit ? 'full' : limit > 0 && used / limit >= 0.8 ? 'near' : undefined)

export function UsageCard({ http }: { http: string }) {
  const t = useT()
  const [usage, setUsage] = useState<{ usage: Usage; names: Record<string, string> } | null>(null)
  useEffect(() => {
    let live = true
    void myUsage(http).then(async (usage) => {
      if (!usage || !SAID.some((m) => typeof usage.measures[m]?.limit === 'number')) return
      // A game is said by its name, read off the account's own list; a list that cannot be read only
      // costs the rows their names.
      const names = Object.fromEntries((await myProjects(http).catch(() => [])).map((p) => [p.id, p.name]))
      if (live) setUsage({ usage, names })
    })
    return () => {
      live = false
    }
  }, [http])
  if (!usage) return null
  const m = usage.usage.measures
  const limited = (measure: Said): { used: number; limit: number; projects?: { id: string; used: number }[] } | null => {
    const one = m[measure]
    return one && typeof one.limit === 'number' ? { ...one, limit: one.limit } : null
  }
  const rows = limited('cardRowsPerProject')
  const copies = limited('cardCopiesPerProject')
  return (
    <section className="byd-profile-card" aria-labelledby="byd-profile-usage">
      <h2 id="byd-profile-usage">{t('profile.usage.title')}</h2>
      <p className="byd-profile-quiet byd-profile-small">{t('profile.usage.lead')}</p>
      <dl className="byd-usage">
        <Row label={t('profile.usage.projects')} at={limited('projects')} t={t} />
        {rows && <Games label={t(copies ? 'profile.usage.rows.alone' : 'profile.usage.rows')} at={rows} names={usage.names} t={t} />}
        {copies && <Games label={t('profile.usage.copies')} at={copies} names={usage.names} t={t} />}
        <Row label={t('profile.usage.open')} at={limited('openTables')} t={t} />
        <Row label={t('profile.usage.started')} sub={t('profile.usage.started.sub')} at={limited('tablesPer30Days')} t={t} />
        <Row label={t('profile.usage.storage')} sub={t('profile.usage.storage.sub')} at={limited('storageBytes')} t={t} amount={(n) => bytes(n, t, m['storageBytes']?.limit ?? n)} />
      </dl>
      <p className="byd-profile-quiet byd-profile-small">{t('profile.usage.locked')}</p>
    </section>
  )
}

// One measure: its name, a bar, and «used av limit». The bar says nothing the words do not, so it is
// not read out.
function Row({ label, sub, at, t, amount = String, game = false }: { label: string; sub?: string; at: { used: number; limit: number } | null; t: T; amount?: (n: number) => string; game?: boolean }) {
  if (!at) return null
  const state = fill(at.used, at.limit)
  return (
    <div className="byd-usage-row" {...(game ? { 'data-game': '' } : {})}>
      <dt>
        {label}
        {sub && <small>{sub}</small>}
      </dt>
      <dd>
        <span className="byd-usage-bar" aria-hidden="true" {...(state ? { 'data-fill': state } : {})}>
          <i style={{ ['--byd-usage-p' as string]: `${Math.min(100, at.limit === 0 ? 100 : Math.round((at.used / at.limit) * 100))}%` }} />
        </span>
        <span className="byd-usage-n" {...(state === 'full' ? { 'data-fill': 'full' } : {})}>
          {t('profile.usage.of', { used: amount(at.used), limit: amount(at.limit) })}
        </span>
      </dd>
    </div>
  )
}

// Cards per game: the ceiling is per game, so each game the account owns is a row of its own.
function Games({ label, at, names, t }: { label: string; at: { limit: number; projects?: { id: string; used: number }[] }; names: Record<string, string>; t: T }) {
  return (
    <div className="byd-usage-row" data-group="">
      <dt>{label}</dt>
      <dd>
        <dl className="byd-usage">
          {(at.projects ?? []).map((game) => (
            <Row key={game.id} label={names[game.id] ?? game.id} at={{ used: game.used, limit: at.limit }} t={t} game />
          ))}
        </dl>
      </dd>
    </div>
  )
}
