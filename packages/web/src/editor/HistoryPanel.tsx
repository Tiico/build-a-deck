import { useEffect, useMemo, useState } from 'react'
import type { DocDiff, RowChange, VersionChange } from '@byd/server/doc'
import type { VersionSummary } from '@byd/server'
import type { ProjectClient } from './ProjectClient.js'
import { byDay, historyRow, type HistoryRow } from './historyRow.js'
import { translate, useLang, useT, type T } from '../i18n/index.js'

// Without a catalogue of its own this module speaks Swedish, exactly as a surface mounted
// without a language provider does: the panel hands over its own `t` (A4).
const swedish: T = (key, params) => translate('sv', key, params)

// The project's history (B4), from the prototype: every save is a version, kept whole and never
// rewritten. It is presented as versions with a date and, for the ones that meant something, a
// name — never as commits, and never as a patch. Opening a version says what it changed in the
// words a designer already uses; bringing one back is an edit like any other.
//
// A row says what its save changed without being opened (#177). `Version N · i dag` fifteen times
// over is a list of timestamps and not a record of work, and the designer looking for the save
// where the duel cards changed had no way through it but to open all fifteen. The words a row
// says are `historyRow`'s; this file draws them.
export type HistoryPanelProps = { client: ProjectClient; onClose(): void; onRestored(): void; onCompare(rev: number, label: string | undefined): void }

export function HistoryPanel({ client, onClose, onRestored, onCompare }: HistoryPanelProps) {
  const t = useT()
  const { lang } = useLang()
  const [versions, setVersions] = useState<VersionSummary[] | null>(null)
  const [changes, setChanges] = useState<Record<number, VersionChange> | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [diffs, setDiffs] = useState<Record<number, DocDiff | 'first'>>({})
  const [error, setError] = useState<string | null>(null)
  const [asked, setAsked] = useState(0)
  // The clock the whole panel is read against, taken once when it opens: today must not turn into
  // yesterday between two rows of the same list.
  const now = useMemo(() => Date.now(), [asked])
  useEffect(() => {
    let live = true
    client.versions().then(
      (v) => live && setVersions(v),
      (err: unknown) => live && setError(err instanceof Error ? err.message : String(err)),
    )
    // Asked for beside the list and not after it, so the panel opens on its rows. What every
    // version changed is a bigger question than what the versions are, and a history of a year
    // must not be a second of white before anything at all is drawn.
    //
    // A summary that never comes leaves the rows without their line, which is what they already
    // look like while it is on its way: no error strip, because the history itself is readable
    // and a designer opening it came to read the history.
    client.changes().then(
      (c) => live && setChanges(Object.fromEntries(c.map((one) => [one.rev, one]))),
      () => undefined,
    )
    return () => {
      live = false
    }
  }, [client, asked])

  // What a version changed card by card is asked for when the row is opened, not for all of them
  // at once: the whole difference is what the comparison is for, and a long history should not be
  // a long wait for something nobody looked at.
  const show = (rev: number) => {
    if (open === rev) return setOpen(null)
    setOpen(rev)
    if (diffs[rev] !== undefined) return
    client.diff(rev).then(
      (d) => setDiffs((m) => ({ ...m, [rev]: d ?? 'first' })),
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    )
  }
  const name = async (rev: number, label: string | null) => {
    try {
      await client.nameVersion(rev, label)
      setAsked((n) => n + 1)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const restore = async (rev: number) => {
    try {
      await client.restore(rev)
      onRestored()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const days = versions ? byDay(versions, { now, lang, t }) : []
  return (
    <div className="byd-history" role="dialog" aria-label={t('history.title')} aria-modal="false">
      <header>
        <h2>{t('history.title')}</h2>
        <button type="button" aria-label={t('history.close')} onClick={onClose}>
          ×
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {/* The history scrolls; the head above it does not. At the depth a worked project reaches —
          twenty-odd versions over several days — the panel is more than twice its own height, and
          the way out of it must not be a screenful and a half above whatever is being read. */}
      <div className="byd-history-scroll">
        <p className="byd-history-lead">{t('history.lead')}</p>
        {!versions ? (
          <p>{t('history.loading')}</p>
        ) : (
          days.map((day) => (
            // The day is a region named by its own heading rather than by a copy of it: a reader who
            // hears the name and then the heading hears the same word twice for nothing.
            <section key={day.key} className="byd-history-day" aria-labelledby={dayId(day.key)}>
              <div className="byd-history-daymark">
                <h3 id={dayId(day.key)}>{day.day}</h3>
                <span>{day.count}</span>
              </div>
              <ol>
                {day.versions.map((v) => {
                  const said = historyRow(v, changes?.[v.rev], { now, lang, t, current: v.rev === client.rev })
                  const diff = diffs[v.rev]
                  return (
                    <li
                      key={v.rev}
                      data-rev={v.rev}
                      {...(v.rev === client.rev ? { 'data-current': 'true' } : {})}
                      data-named={v.label ? 'true' : undefined}
                      {...(changes === null ? { 'data-waiting': 'true' } : {})}
                    >
                      <button type="button" aria-expanded={open === v.rev} aria-label={said.spoken} onClick={() => show(v.rev)}>
                        <Row said={said} />
                        {v.rev === client.rev && <small>{t('history.current')}</small>}
                      </button>
                      {open === v.rev && (
                        <div className="byd-history-detail">
                          {/* Against the version before it, which is never the same document, so
                              an empty difference here means a change with no word rather than no
                              change at all — the same thing the row's own line says. */}
                          <p>{diff === undefined ? t('history.reading') : diff === 'first' ? t('history.created') : <Summary diff={diff} empty={t('history.diff.other')} />}</p>
                          <label>
                            {t('history.name')}
                            <input
                              aria-label={t('history.name.of', { rev: v.rev })}
                              placeholder={t('history.name.placeholder')}
                              defaultValue={v.label ?? ''}
                              onBlur={(e) => void name(v.rev, e.target.value.trim() || null)}
                            />
                          </label>
                          {v.rev !== client.rev && (
                            <>
                              <button type="button" aria-label={t('history.compare.of', { rev: v.rev })} onClick={() => onCompare(v.rev, v.label)}>
                                {t('history.compare')}
                              </button>
                              <button type="button" aria-label={t('history.restore.of', { rev: v.rev })} onClick={() => void restore(v.rev)}>
                                {t('history.restore')}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

const dayId = (key: string) => `byd-history-day-${key}`

// One row as it is read: the clock at the edge, the version's own heading, and under the heading
// one line carrying what the save changed and a chip for each part of the game that is not a card.
//
// The chips share the summary's line rather than standing in a column of their own, and that is
// the whole of why the row works at this width. Three chips are what the beställare allowed, and
// three chips beside a heading in a 372 px panel leave the heading about seventy pixels — the
// version number itself would be cut in half. On the summary's line they are the one thing that
// never gives way and the words ellipsise around them, which is the right way round: the chip is
// what the eye is scanning for when the question is "which version touched the template?".
//
// The line is drawn from the start, empty, and holds its height — the rows under it must not move
// when the summaries come back. And the chips are never the only place a thing is said: the
// button's name spells every one of them out as a sentence (L12), which is `said.spoken`.
function Row({ said }: { said: HistoryRow }) {
  return (
    <>
      <time>{said.time}</time>
      <span className="byd-history-what">
        <b className={said.version ? 'byd-history-named' : undefined}>{said.heading}</b>
        <span className="byd-history-line">
          <span data-said={said.words ? 'true' : 'waiting'}>
            {said.version && <em>{said.version}</em>}
            {said.words}
          </span>
          <span className="byd-history-parts">
            {said.chips.map((chip) => (
              <i key={chip.part} data-part={chip.part}>
                {chip.word}
              </i>
            ))}
            {said.count && <i data-part="many">{said.count}</i>}
          </span>
        </span>
      </span>
    </>
  )
}

// What a version changed, in the words a designer already uses. The template, the setup and the
// symbols are named as having moved: a diff of an element tree is a diff for a machine.
//
// `empty` is what a difference with nothing in it reads as, and it is the caller's because only
// the caller knows what that means. Two versions the designer picked herself may genuinely be the
// same document — restoring one makes a new version identical to an old one — so "Inget ändrat" is
// the truth there. Two consecutive versions never are, and the history says so in its own words.
export function Summary({ diff, empty }: { diff: DocDiff; empty?: string }) {
  const t = useT()
  const n = (kind: RowChange['kind']) => diff.rows.filter((r) => r.kind === kind).length
  const parts: string[] = []
  if (n('added')) parts.push(t('history.diff.added', { n: n('added') }))
  if (n('removed')) parts.push(t('history.diff.removed', { n: n('removed') }))
  if (n('changed')) parts.push(t('history.diff.changed', { n: n('changed') }))
  if (diff.reordered) parts.push(t('history.diff.reordered'))
  if (diff.columns) parts.push(t('history.diff.columns'))
  if (diff.template) parts.push(t('history.diff.template'))
  if (diff.setup) parts.push(t('history.diff.setup'))
  if (diff.rules) parts.push(t('history.diff.rules'))
  if (diff.icons) parts.push(t('history.diff.icons'))
  if (diff.name) parts.push(t('history.diff.renamed', { name: diff.name.to }))
  return <>{parts.length === 0 ? (empty ?? t('history.diff.none')) : `${parts.join(' · ')}.`}</>
}

// A date as a designer reads it, not as a machine writes it.
export function when(iso: string, now = Date.now(), t: T = swedish): string {
  const days = Math.floor((now - Date.parse(iso)) / 86400_000)
  if (days <= 0) return t('history.today')
  if (days === 1) return t('history.yesterday')
  if (days < 7) return t('history.daysAgo', { n: days })
  return new Date(iso).toLocaleDateString('sv-SE')
}
