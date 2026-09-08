import { useEffect, useState } from 'react'
import type { DocDiff, RowChange } from '@byd/server/diff'
import type { VersionSummary } from '@byd/server'
import type { ProjectClient } from './ProjectClient.js'

// The project's history (B4), from the prototype: every save is a version, kept whole and never
// rewritten. It is presented as versions with a date and, for the ones that meant something, a
// name — never as commits, and never as a patch. Opening a version says what it changed in the
// words a designer already uses; bringing one back is an edit like any other.
export type HistoryPanelProps = { client: ProjectClient; onClose(): void; onRestored(): void; onCompare(rev: number, label: string | undefined): void }

export function HistoryPanel({ client, onClose, onRestored, onCompare }: HistoryPanelProps) {
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
    <div className="byd-history" role="dialog" aria-label="Historik" aria-modal="false">
      <header>
        <h2>Historik</h2>
        <button type="button" aria-label="Stäng historiken" onClick={onClose}>
          ×
        </button>
      </header>
      <p className="byd-history-lead">Varje sparning är en version. Ingen av dem skrivs om; den du tar tillbaka blir nästa version.</p>
      {error && <p role="alert">{error}</p>}
      {!versions ? (
        <p>Laddar historiken…</p>
      ) : (
        <ol>
          {versions.map((v) => {
            const diff = diffs[v.rev]
            return (
              <li key={v.rev} data-rev={v.rev} {...(v.rev === client.rev ? { 'data-current': 'true' } : {})} data-named={v.label ? 'true' : undefined}>
                <button type="button" aria-expanded={open === v.rev} onClick={() => show(v.rev)}>
                  <b>{v.label ?? `Version ${v.rev}`}</b>
                  <span>{when(v.at)}</span>
                  {v.rev === client.rev && <small>öppen nu</small>}
                </button>
                {open === v.rev && (
                  <div className="byd-history-detail">
                    <p>{diff === undefined ? 'Läser…' : diff === 'first' ? 'Spelet skapades.' : <Summary diff={diff} />}</p>
                    <label>
                      Namn
                      <input
                        aria-label={`Namn på version ${v.rev}`}
                        placeholder="Ge versionen ett namn…"
                        defaultValue={v.label ?? ''}
                        onBlur={(e) => void name(v.rev, e.target.value.trim() || null)}
                      />
                    </label>
                    {v.rev !== client.rev && (
                      <>
                        <button type="button" aria-label={`Jämför version ${v.rev} i tabellen`} onClick={() => onCompare(v.rev, v.label)}>
                          Jämför med den här i tabellen
                        </button>
                        <button type="button" aria-label={`Återställ version ${v.rev}`} onClick={() => void restore(v.rev)}>
                          Ta tillbaka den här versionen
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
  const n = (kind: RowChange['kind']) => diff.rows.filter((r) => r.kind === kind).length
  const parts: string[] = []
  if (n('added')) parts.push(`${n('added')} nya kort`)
  if (n('removed')) parts.push(`${n('removed')} borttagna`)
  if (n('changed')) parts.push(`${n('changed')} ändrade`)
  if (diff.reordered) parts.push('leken omordnad')
  if (diff.template) parts.push('mallen ändrad')
  if (diff.setup) parts.push('uppställningen ändrad')
  if (diff.icons) parts.push('symbolerna ändrade')
  if (diff.name) parts.push(`spelet döpt om till ${diff.name.to}`)
  return <>{parts.length === 0 ? 'Inget ändrat.' : `${parts.join(' · ')}.`}</>
}

// A date as a designer reads it, not as a machine writes it.
export function when(iso: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86400_000)
  if (days <= 0) return 'i dag'
  if (days === 1) return 'i går'
  if (days < 7) return `för ${days} dagar sedan`
  return new Date(iso).toLocaleDateString('sv-SE')
}
