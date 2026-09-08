import { useEffect, useState } from 'react'
import type { DocDiff, RowChange } from '@byd/server/doc'
import type { VersionSummary } from '@byd/server'
import type { ProjectClient } from './ProjectClient.js'
import { translate, useT, type T } from '../i18n/index.js'

// Without a catalogue of its own this module speaks Swedish, exactly as a surface mounted
// without a language provider does: the panel hands over its own `t` (A4).
const swedish: T = (key, params) => translate('sv', key, params)

// The project's history (B4), from the prototype: every save is a version, kept whole and never
// rewritten. It is presented as versions with a date and, for the ones that meant something, a
// name — never as commits, and never as a patch. Opening a version says what it changed in the
// words a designer already uses; bringing one back is an edit like any other.
export type HistoryPanelProps = { client: ProjectClient; onClose(): void; onRestored(): void; onCompare(rev: number, label: string | undefined): void }

export function HistoryPanel({ client, onClose, onRestored, onCompare }: HistoryPanelProps) {
  const t = useT()
  const [versions, setVersions] = useState<VersionSummary[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [diffs, setDiffs] = useState<Record<number, DocDiff | 'first'>>({})
  const [error, setError] = useState<string | null>(null)
  const [asked, setAsked] = useState(0)
  useEffect(() => {
    let live = true
    client.versions().then(
      (v) => live && setVersions(v),
      (err: unknown) => live && setError(err instanceof Error ? err.message : String(err)),
    )
    return () => {
      live = false
    }
  }, [client, asked])

  // What a version changed is asked for when it is opened, not for all of them at once: a long
  // history would otherwise be a long wait for something nobody looked at.
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
  return (
    <div className="byd-history" role="dialog" aria-label={t('history.title')} aria-modal="false">
      <header>
        <h2>{t('history.title')}</h2>
        <button type="button" aria-label={t('history.close')} onClick={onClose}>
          ×
        </button>
      </header>
      <p className="byd-history-lead">{t('history.lead')}</p>
      {error && <p role="alert">{error}</p>}
      {!versions ? (
        <p>{t('history.loading')}</p>
      ) : (
        <ol>
          {versions.map((v) => {
            const diff = diffs[v.rev]
            return (
              <li key={v.rev} data-rev={v.rev} {...(v.rev === client.rev ? { 'data-current': 'true' } : {})} data-named={v.label ? 'true' : undefined}>
                <button type="button" aria-expanded={open === v.rev} onClick={() => show(v.rev)}>
                  <b>{v.label ?? t('history.version', { rev: v.rev })}</b>
                  <span>{when(v.at, Date.now(), t)}</span>
                  {v.rev === client.rev && <small>{t('history.current')}</small>}
                </button>
                {open === v.rev && (
                  <div className="byd-history-detail">
                    <p>{diff === undefined ? t('history.reading') : diff === 'first' ? t('history.created') : <Summary diff={diff} />}</p>
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
      )}
    </div>
  )
}

// What a version changed, in the words a designer already uses. The template, the setup and the
// symbols are named as having moved: a diff of an element tree is a diff for a machine.
export function Summary({ diff }: { diff: DocDiff }) {
  const t = useT()
  const n = (kind: RowChange['kind']) => diff.rows.filter((r) => r.kind === kind).length
  const parts: string[] = []
  if (n('added')) parts.push(t('history.diff.added', { n: n('added') }))
  if (n('removed')) parts.push(t('history.diff.removed', { n: n('removed') }))
  if (n('changed')) parts.push(t('history.diff.changed', { n: n('changed') }))
  if (diff.reordered) parts.push(t('history.diff.reordered'))
  if (diff.template) parts.push(t('history.diff.template'))
  if (diff.setup) parts.push(t('history.diff.setup'))
  if (diff.icons) parts.push(t('history.diff.icons'))
  if (diff.name) parts.push(t('history.diff.renamed', { name: diff.name.to }))
  return <>{parts.length === 0 ? t('history.diff.none') : `${parts.join(' · ')}.`}</>
}

// A date as a designer reads it, not as a machine writes it.
export function when(iso: string, now = Date.now(), t: T = swedish): string {
  const days = Math.floor((now - Date.parse(iso)) / 86400_000)
  if (days <= 0) return t('history.today')
  if (days === 1) return t('history.yesterday')
  if (days < 7) return t('history.daysAgo', { n: days })
  return new Date(iso).toLocaleDateString('sv-SE')
}
