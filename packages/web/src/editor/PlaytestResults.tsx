import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { DocDiff, Playtest, PlaytestAnswer, PlaytestFlag, PlaytestQuestion, PlaytestTable, PlaytestVersion } from '@byd/server/doc'
import type { ProjectClient } from './ProjectClient.js'
import { Summary } from './HistoryPanel.js'
import { useRoving } from './roving.js'
import { chosenVersion, compareWith, decimal, meanOf, signed, silent, tableName, tablesFor, versionSums, whenEnded } from './playtestReading.js'
import { useLang, useT, type Key, type T } from '../i18n/index.js'
import { saidOr } from '../i18n/said.js'
import { clockWord } from './when.js'
import { versionWord } from '../i18n/version.js'
import { FlagGlyph } from '../glyphs.js'
import { cardLine, FlagThumb, LiftedCard } from './FlaggedCard.js'

// «Resultat» (#1010, beställarens val 2026-10-18): what the playtests said, read version by
// version. It is the Bord tab's second view and not a tab of its own — the answers belong to the
// tables they came from, and the header keeps its seven tabs. The prototype's variant B: the
// version first; how the players' answers fall on each question, held against the previous version
// that was answered, with what changed in between; then the tables, a filter per table, every
// written answer and every flag.
//
// Everything is counted by the server (`GET /projects/:id/playtest`): names, people, moves, and per
// version the distribution. An observer's answer is shown apart and marked, never counted.

export type PlaytestResultsProps = {
  client: ProjectClient
  // The table the view was opened for — from an ended table's row — or null for all of them.
  table: string | null
  onTable(id: string | null): void
  // The «Bord · Resultat» switch, at the head of the main column as it is over the Bord view's felt.
  switcher: ReactNode
}

const QUESTIONS: { key: PlaytestQuestion; name: Key; sub: Key }[] = [
  { key: 'fun', name: 'results.q.fun', sub: 'survey.q.fun' },
  { key: 'clarity', name: 'results.q.clarity', sub: 'results.q.clarity.sub' },
  { key: 'balance', name: 'results.q.balance', sub: 'survey.q.balance' },
]

export function PlaytestResults({ client, table, onTable, switcher }: PlaytestResultsProps) {
  const t = useT()
  const { lang } = useLang()
  const [data, setData] = useState<Playtest | null>(null)
  const [labels, setLabels] = useState<Record<number, string>>({})
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    client.playtest().then(
      (read) => live && setData(read),
      (err: unknown) => live && setFailed(saidOr(err, t('results.error'))),
    )
    // A version's name is the designer's (B4); without it a version is called by its number.
    client.versions().then(
      (versions) => live && setLabels(Object.fromEntries(versions.flatMap((v) => (v.label ? [[v.rev, v.label]] : [])))),
      () => undefined,
    )
    return () => {
      live = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new language is no reason to ask again
  }, [client])

  // The version opened: the one the reader picked, else the one the table she came from ended on,
  // else the newest a table has ended on.
  const [picked, setPicked] = useState<string | null>(null)
  const from = table !== null ? (data?.tables.find((x) => x.id === table)?.version ?? null) : null
  const version = data ? chosenVersion(data.versions, picked ?? from) : null
  const name = (v: string, form: 'name' | 'word' = 'name') => {
    const rev = Number(/^rev-(\d+)$/.exec(v)?.[1])
    const label = labels[rev]
    return label ? `${versionWord(v, t, form)} · ${label}` : versionWord(v, t, form)
  }

  const side = (
    <div className="byd-results-side">
      {data && data.versions.length > 0 && (
        <VersionList
          versions={data.versions}
          chosen={version}
          now={`rev-${client.rev}`}
          name={name}
          // The focus arriving in the list is not a new choice: the table the view was narrowed
          // to stays until another version is picked.
          onPick={(v) => {
            if (v === version) return
            setPicked(v)
            onTable(null)
          }}
        />
      )}
    </div>
  )
  if (!data)
    return (
      <div className="byd-results" data-results>
        {side}
        <div className="byd-results-main">
          {switcher}
          {failed ? <p role="alert">{failed}</p> : <p className="byd-results-quiet">{t('results.loading')}</p>}
        </div>
      </div>
    )
  const chosen = data.versions.find((v) => v.version === version) ?? null
  return (
    <div className="byd-results" data-results>
      {side}
      <div className="byd-results-main">
        {switcher}
        {chosen === null ? (
          <p className="byd-results-empty">
            {t('results.empty')}
            {data.versions.some((v) => v.running > 0) && ` ${runningWords(data.versions.reduce((n, v) => n + v.running, 0), t)}.`}
          </p>
        ) : (
          <VersionResults key={chosen.version} client={client} playtest={data} version={chosen} name={name} table={table} onTable={onTable} lang={lang} />
        )}
      </div>
    </div>
  )
}

const runningWords = (n: number, t: T) => t(n === 1 ? 'results.running.one' : 'results.running.other', { n })
const count = (n: number, one: Key, many: Key, t: T) => t(n === 1 ? one : many, { n })

// The versions the game's tables were played on, newest first: one choice, and a real one — a
// radio group, so a reader hears which version is open and the arrows move between them.
function VersionList({ versions, chosen, now, name, onPick }: { versions: readonly PlaytestVersion[]; chosen: string | null; now: string; name(v: string): string; onPick(v: string): void }) {
  const t = useT()
  const heading = useId()
  const ids = versions.map((v) => v.version)
  const { itemProps } = useRoving({ ids, selected: chosen, orientation: 'vertical', followFocus: true, onActivate: onPick })
  return (
    <section className="byd-results-versions" aria-labelledby={heading}>
      <h2 id={heading} className="byd-results-h">
        {t('results.versions')}
      </h2>
      <div role="radiogroup" aria-labelledby={heading}>
        {versions.map((v) => {
          const roving = itemProps(v.version)
          return (
            <button key={v.version} type="button" role="radio" aria-checked={v.version === chosen} className="byd-choice byd-results-pick" data-none={v.ended === 0} {...roving} onClick={() => onPick(v.version)}>
              <span>
                {name(v.version)}
                {v.version === now && <small> · {t('results.version.now')}</small>}
              </span>
              <small>{versionSums(v, t)}</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

type VersionResultsProps = { client: ProjectClient; playtest: Playtest; version: PlaytestVersion; name(v: string, form?: 'name' | 'word'): string; table: string | null; onTable(id: string | null): void; lang: 'sv' | 'en' }

function VersionResults({ client, playtest, version, name, table, onTable, lang }: VersionResultsProps) {
  const t = useT()
  const before = compareWith(playtest.versions, version.version)
  const tables = tablesFor(playtest.tables, version.version)
  const only = table !== null ? (tables.find((x) => x.id === table) ?? null) : null
  const shown = only ? [only] : tables
  // What changed between the version held against and this one, in the history's own words (B4).
  const [diff, setDiff] = useState<DocDiff | null>(null)
  useEffect(() => {
    if (!before) return
    let live = true
    client.diff(revOf(version.version), revOf(before.version)).then(
      (d) => live && setDiff(d),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [client, version.version, before])
  // The heading takes the focus when the view opens on a table from its row: the reader has just
  // left the row, and what she asked for starts here.
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (table !== null) heading.current?.focus()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- on arriving only
  }, [])

  // The tables' answers, players first and the observers apart (beställarens val 2026-10-18).
  const answers = shown.filter((x) => x.version === version.version).flatMap((x) => x.answers.map((a) => ({ a, table: x })))
  const players = answers.filter(({ a }) => !a.observer)
  const observers = answers.filter(({ a }) => a.observer)
  const written = players.filter(({ a }) => a.answers.change.trim() !== '').length
  const facts = [
    count(version.ended, 'results.ended.one', 'results.ended.other', t),
    t(version.players === 1 ? 'results.answered.one' : 'results.answered.other', { n: version.answered, of: version.players }),
    ...(version.observers > 0 ? [count(version.observers, 'results.observers.one', 'results.observers.other', t)] : []),
    count(version.flags, 'results.flags.one', 'results.flags.other', t),
    ...(version.running > 0 ? [count(version.running, 'results.stillRunning.one', 'results.stillRunning.other', t)] : []),
  ]
  return (
    <>
      <header className="byd-results-head">
        <h2 ref={heading} tabIndex={-1}>
          {name(version.version)}
        </h2>
        {version.ended > 0 ? <p className="byd-results-quiet">{facts.join(' · ')}</p> : version.running > 0 && <p className="byd-results-quiet">{t('results.version.waiting')}</p>}
        {before && diff && (
          <p className="byd-results-quiet">
            {t('results.changed', { version: name(before.version, 'word') })} <span className="byd-results-ink"><Summary diff={diff} /></span>
          </p>
        )}
      </header>
      {version.ended > 0 && (
        <>
          <Distribution version={version} before={before} name={name} lang={lang} />
          <section className="byd-results-sec" aria-labelledby="byd-results-tables">
            <h3 id="byd-results-tables">{t('results.tables.heading')}</h3>
            <div className="byd-results-filter" role="group" aria-label={t('results.filter')}>
              <button type="button" className="byd-choice" aria-pressed={only === null} onClick={() => onTable(null)}>
                {t('results.filter.all')}
              </button>
              {tables.map((x) => (
                <button key={x.id} type="button" className="byd-choice" aria-pressed={only === x} onClick={() => onTable(x.id)}>
                  <span className="byd-results-code">{tableName(x, t)}</span>
                </button>
              ))}
            </div>
            <ul className="byd-results-tables">
              {tables.map((x) => (
                <TableLine key={x.id} table={x} chosen={only === x} lang={lang} />
              ))}
            </ul>
          </section>
          <section className="byd-results-sec" aria-labelledby="byd-results-change">
            <h3 id="byd-results-change">
              {t('results.change')} <span className="byd-results-quiet">· {count(written, 'results.change.count.one', 'results.change.count.other', t)}</span>
            </h3>
            {players.length > 0 ? (
              <ul className="byd-results-answers">
                {players.map(({ a, table: x }) => (
                  <Answer key={`${x.id}:${a.seat ?? a.who}`} answer={a} table={x} />
                ))}
              </ul>
            ) : (
              <p className="byd-results-quiet">{t('results.answers.none')}</p>
            )}
            {only && silent(only).length > 0 && <p className="byd-results-quiet">{t('results.silent', { names: silent(only).map((p) => p.name).join(', ') })}</p>}
            {observers.length > 0 && (
              <>
                <h4 className="byd-results-h">{t('results.observers.heading')}</h4>
                <p className="byd-results-quiet">{t('results.observers.note')}</p>
                <ul className="byd-results-answers">
                  {observers.map(({ a, table: x }) => (
                    <Answer key={`${x.id}:${a.who}`} answer={a} table={x} />
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
      {(version.ended > 0 || version.flags > 0) && <Flags tables={shown} version={version.version} versionName={name(version.version)} origin={client.facesOrigin} lang={lang} />}
    </>
  )
}

// How the players answered each question, 1 to 5, held against the version before that was
// answered. The bars are drawn for the eye; what each cell holds is said in words in the cell
// itself, so the number after the slash is never a number nobody explained.
function Distribution({ version, before, name, lang }: { version: PlaytestVersion; before: PlaytestVersion | null; name(v: string, form?: 'name' | 'word'): string; lang: 'sv' | 'en' }) {
  const t = useT()
  if (version.answered === 0)
    return (
      <section className="byd-results-sec">
        <p className="byd-results-empty">{t('results.survey.none')}</p>
      </section>
    )
  const was = before ? name(before.version, 'word') : ''
  return (
    <section className="byd-results-sec" aria-labelledby="byd-results-survey">
      <h3 id="byd-results-survey">{count(version.answered, 'results.survey.one', 'results.survey.other', t)}</h3>
      <p className="byd-results-quiet">
        {t('results.survey.lead')}
        {before && ` ${t('results.survey.compare', { version: was })}`}
      </p>
      <table className="byd-results-dist" data-compare={before !== null}>
        <caption className="byd-offscreen">{before ? t('results.dist.caption.compare', { version: name(version.version, 'word'), before: was }) : t('results.dist.caption', { version: name(version.version, 'word') })}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="byd-offscreen">{t('results.question')}</span>
            </th>
            {[1, 2, 3, 4, 5].map((n) => (
              <th key={n} scope="col">
                {n}
              </th>
            ))}
            <th scope="col">{t('results.mean')}</th>
            {before && <th scope="col">{t('results.against', { version: versionWord(before.version, t, 'word') })}</th>}
          </tr>
        </thead>
        <tbody>
          {QUESTIONS.map((q) => {
            const now = version.distribution[q.key]
            const then = before?.distribution[q.key] ?? null
            const top = Math.max(1, ...now, ...(then ?? []))
            const mean = meanOf(now)
            const meanBefore = then ? meanOf(then) : null
            return (
              <tr key={q.key}>
                <th scope="row">
                  {t(q.name)}
                  <small>{t(q.sub)}</small>
                </th>
                {now.map((n, i) => (
                  <td key={i}>
                    <span className="byd-results-bars" aria-hidden="true">
                      <i className="byd-results-now" data-n={n} style={{ '--h': `${Math.round((n / top) * 100)}%` } as CSSProperties} />
                      {then && <i className="byd-results-was" style={{ '--h': `${Math.round(((then[i] ?? 0) / top) * 100)}%` } as CSSProperties} />}
                    </span>
                    <span className="byd-results-n" aria-hidden="true">
                      {n}
                      {then && <small> / {then[i] ?? 0}</small>}
                    </span>
                    <span className="byd-offscreen">{then ? t('results.cell.compare', { n, step: i + 1, was: then[i] ?? 0, version: was }) : t('results.cell', { n, step: i + 1 })}</span>
                  </td>
                ))}
                <td className="byd-results-mean">{decimal(mean, lang)}</td>
                {before && (
                  <td className="byd-results-delta">
                    {mean !== null && meanBefore !== null ? (
                      <>
                        <span aria-hidden="true">
                          {decimal(meanBefore, lang)} → {decimal(mean, lang)} <b data-change={Math.abs(mean - meanBefore) < 0.05 ? 'none' : mean < meanBefore ? 'down' : 'up'}>{signed(mean - meanBefore, lang)}</b>
                        </span>
                        <span className="byd-offscreen">{t('results.delta', { was: decimal(meanBefore, lang), now: decimal(mean, lang), diff: signed(mean - meanBefore, lang) })}</span>
                      </>
                    ) : (
                      '–'
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function TableLine({ table, chosen, lang }: { table: PlaytestTable; chosen: boolean; lang: 'sv' | 'en' }) {
  const t = useT()
  const players = table.people.filter((p) => !p.observer).length
  const answered = table.answers.filter((a) => !a.observer).length
  return (
    <li data-chosen={chosen}>
      <span className="byd-results-code">{tableName(table, t)}</span>
      {table.endedAt && <span>{whenEnded(table.endedAt, Date.now(), lang, t)}</span>}
      <b>{answered > 0 ? t('results.table.answered', { n: answered, of: players }) : t('results.table.none', { of: players })}</b>
      {table.flags.length > 0 ? <span className="byd-results-flagged">{count(table.flags.length, 'results.flags.one', 'results.flags.other', t)}</span> : <span>{t('results.table.noFlags')}</span>}
      <span>{count(table.moves, 'results.moves.one', 'results.moves.other', t)}</span>
    </li>
  )
}

function Answer({ answer, table }: { answer: PlaytestAnswer; table: PlaytestTable }) {
  const t = useT()
  const change = answer.answers.change.trim()
  return (
    <li className="byd-results-answer">
      <p className="byd-results-who">
        <b>{answer.who}</b>
        {answer.observer ? <em className="byd-results-badge">{t('results.observer')}</em> : answer.seat && <span>{t('results.seat', { seat: answer.seat })}</span>}
        <span>{t('results.atTable', { table: tableName(table, t) })}</span>
      </p>
      <p className="byd-results-scores">
        {QUESTIONS.map((q) => (
          <span key={q.key}>
            {t(q.name)} <b>{answer.answers[q.key]}</b>
          </span>
        ))}
      </p>
      {change ? (
        <blockquote className="byd-results-said">
          <span className="byd-offscreen">{t('results.change')} </span>
          {change}
        </blockquote>
      ) : (
        <p className="byd-results-quiet">{t('results.change.empty')}</p>
      )}
    </li>
  )
}

// Every flag raised on this version, in the order of the game, table by table: who, when in the
// game and on the clock, and what she wrote — and the card it was about, as it was (#1142), which
// a press lifts.
function Flags({ tables, version, versionName, origin, lang }: { tables: readonly PlaytestTable[]; version: string; versionName: string; origin: string; lang: 'sv' | 'en' }) {
  const t = useT()
  const flags = tables.flatMap((x) => x.flags.filter((f) => f.version === version).map((f) => ({ f, table: x })))
  const [lifted, setLifted] = useState<number | null>(null)
  const when = (f: PlaytestFlag, x: PlaytestTable) => `${t('results.flag.when', { n: f.move, of: x.moves })} · ${clockWord(f.at, lang)}`
  const up = lifted === null ? undefined : flags[lifted]
  return (
    <section className="byd-results-sec" aria-labelledby="byd-results-flags">
      <h3 id="byd-results-flags">
        {t('results.flags.heading')} <span className="byd-results-quiet">· {t('results.flags.order')}</span>
      </h3>
      {flags.length === 0 ? (
        <p className="byd-results-quiet">{t('results.flags.none')}</p>
      ) : (
        <ol className="byd-results-flags">
          {flags.map(({ f, table: x }, i) => (
            <li key={i} data-card={f.card ? 'true' : undefined}>
              {f.card && <FlagThumb origin={origin} card={f.card} onLift={() => setLifted(i)} />}
              <span className="byd-results-when">
                <FlagGlyph />
                {t('results.flag.when', { n: f.move, of: x.moves })}
                <span> · {clockWord(f.at, lang)}</span>
              </span>
              <p>
                <b>{f.who ?? t('results.flag.table')}</b>
                {f.observer && <em className="byd-results-badge">{t('results.observer')}</em>} <span className="byd-results-quiet">· {t('results.atTable', { table: tableName(x, t) })}</span>
                {f.note ? `: «${f.note}»` : ` ${t('results.flag.silent')}`}
              </p>
              {f.card && <p className="byd-results-card-line">{cardLine(f.card, t)}</p>}
            </li>
          ))}
        </ol>
      )}
      {up?.f.card && <LiftedCard origin={origin} flag={up.f} card={up.f.card} version={versionName} when={when(up.f, up.table)} onClose={() => setLifted(null)} />}
    </section>
  )
}

const revOf = (version: string): number => Number(/^rev-(\d+)$/.exec(version)?.[1] ?? 0)
