// PROTOTYPE — the project's history (B4): /prototype/history?variant=A|B|C. Question: how does a
// designer meet six days of their own edits without being taught git? All three read the same
// versions and the same diff, and draw the cards with the real compiler.
import { useState } from 'react'
import type { ProjectDoc } from '@byd/server'
import type { DocDiff, RowChange } from '@byd/server/diff'
import { CardPreview } from '../../editor/CardPreview.js'
import { Switcher } from './Switcher.js'
import { diffProjects, history, when, type Version } from './versions.js'
import '../../editor/editor.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'En lista med versioner' },
  { key: 'B', name: 'Skillnaden i korttabellen' },
  { key: 'C', name: 'En remsa att dra i' },
]
type Ctx = { versions: Version[]; name(rev: number, label: string | null): void }

export function HistoryPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [versions, setVersions] = useState<Version[]>(history)
  const name = (rev: number, label: string | null) =>
    setVersions((list) => list.map((v) => (v.rev === rev ? ({ ...v, ...(label ? { label } : {}) } as Version) : v)).map((v) => (v.rev === rev && !label ? stripLabel(v) : v)))
  const ctx: Ctx = { versions, name }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history2(q)
  }
  return (
    <div className="hi-stage">
      <div className="hi-state">
        <span>
          {versions.length} versioner · den äldsta {when(versions[0]!.at)} · namngivna: <b>{versions.filter((v) => v.label).length}</b> · ingen version skrivs om
        </span>
      </div>
      <V {...ctx} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}
const history2 = (q: URLSearchParams) => window.history.replaceState(null, '', `?${q.toString()}`)
const stripLabel = (v: Version): Version => {
  const { label: _label, ...rest } = v
  return rest
}

const WORDS: Record<RowChange['kind'], string> = { added: 'nytt kort', removed: 'borttaget', changed: 'ändrat' }
const cell = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))

// What a version changed, in words a designer already uses.
function Summary({ diff }: { diff: DocDiff }) {
  const parts: string[] = []
  const n = (kind: RowChange['kind']) => diff.rows.filter((r) => r.kind === kind).length
  if (n('added')) parts.push(`${n('added')} nya kort`)
  if (n('removed')) parts.push(`${n('removed')} borttagna`)
  if (n('changed')) parts.push(`${n('changed')} ändrade`)
  if (diff.reordered) parts.push('leken omordnad')
  if (diff.template) parts.push('mallen ändrad')
  if (diff.setup) parts.push('uppställningen ändrad')
  if (diff.icons) parts.push('symbolerna ändrade')
  if (diff.name) parts.push(`spelet döpt om till ${diff.name.to}`)
  return <>{parts.length === 0 ? 'inget ändrat' : parts.join(' · ')}</>
}

function Wall({ doc, mark, scale = 0.5 }: { doc: ProjectDoc; mark?: Map<string, string> | undefined; scale?: number }) {
  return (
    <div className="hi-wall">
      {doc.rows.map((r) => (
        <div key={r.id} className="hi-card" data-card-ref={r.id} data-change={mark?.get(r.id)}>
          <CardPreview id={`hi-${r.id}-${Math.round(scale * 100)}`} face={doc.template.faces['front']!} row={r.fields} icons={doc.icons} scale={scale} />
        </div>
      ))}
    </div>
  )
}

// ---------- A — a list of versions ----------
// The history as a list, newest first: a date, a name for the ones that got one, and a line of
// what changed. Picking one shows that version's deck and lets it be named or brought back.
function VariantA({ versions, name }: Ctx) {
  const [picked, setPicked] = useState(versions.length)
  const version = versions.find((v) => v.rev === picked)!
  const before = versions.find((v) => v.rev === picked - 1)
  const diff = before ? diffProjects(before.doc, version.doc) : null
  const newest = versions[versions.length - 1]!
  return (
    <div className="hi-a">
      <ol className="hi-list">
        {[...versions].reverse().map((v) => {
          const prior = versions.find((x) => x.rev === v.rev - 1)
          return (
            <li key={v.rev} data-on={picked === v.rev ? 'true' : undefined} data-named={v.label ? 'true' : undefined}>
              <button type="button" onClick={() => setPicked(v.rev)}>
                <b>{v.label ?? `Version ${v.rev}`}</b>
                <span>{when(v.at)}</span>
                <small>{prior ? <Summary diff={diffProjects(prior.doc, v.doc)} /> : 'spelet skapades'}</small>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="hi-a-main">
        <div className="hi-a-head">
          <h2>{version.label ?? `Version ${version.rev}`}</h2>
          <span>{when(version.at)}</span>
          <input
            aria-label="Namn på versionen"
            placeholder="Ge versionen ett namn…"
            defaultValue={version.label ?? ''}
            key={version.rev}
            onBlur={(e) => name(version.rev, e.target.value.trim() || null)}
          />
          {version.rev !== newest.rev && <button type="button">Återställ den här versionen</button>}
        </div>
        {diff && (
          <p className="hi-hint">
            Mot version {diff ? version.rev - 1 : ''}: <Summary diff={diff} />
          </p>
        )}
        <Wall doc={version.doc} mark={diff ? marks(diff) : undefined} />
      </div>
      <p className="hi-foot">A · historien som en lista · en version i taget, med vad den ändrade</p>
    </div>
  )
}

const marks = (diff: DocDiff): Map<string, string> => new Map(diff.rows.map((r) => [r.cardRef, r.kind]))

// ---------- B — the difference in the card table ----------
// The diff where the deck already lives: two versions chosen at the top, the table showing the
// older value struck through beside the newer one, and rows tinted for added and removed.
function VariantB({ versions }: Ctx) {
  const [from, setFrom] = useState(3)
  const [to, setTo] = useState(6)
  const a = versions.find((v) => v.rev === from)!
  const b = versions.find((v) => v.rev === to)!
  const diff = diffProjects(a.doc, b.doc)
  const fields = ['title', 'cost', 'body', 'antal']
  const rowsShown = [...b.doc.rows.map((r) => r.id), ...diff.rows.filter((r) => r.kind === 'removed').map((r) => r.cardRef)]
  const changeOf = (cardRef: string) => diff.rows.find((r) => r.cardRef === cardRef)
  const valueOf = (doc: ProjectDoc, cardRef: string, field: string) => doc.rows.find((r) => r.id === cardRef)?.fields[field]
  return (
    <div className="hi-b">
      <div className="hi-b-picker">
        <label>
          Från
          <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
            {versions.map((v) => (
              <option key={v.rev} value={v.rev}>
                {v.label ?? `Version ${v.rev}`} · {when(v.at)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Till
          <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
            {versions.map((v) => (
              <option key={v.rev} value={v.rev}>
                {v.label ?? `Version ${v.rev}`} · {when(v.at)}
              </option>
            ))}
          </select>
        </label>
        <span className="hi-hint">
          <Summary diff={diff} />
        </span>
      </div>
      <table className="hi-table">
        <thead>
          <tr>
            <th>id</th>
            {fields.map((f) => (
              <th key={f}>{f}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowsShown.map((cardRef) => {
            const change = changeOf(cardRef)
            return (
              <tr key={cardRef} data-change={change?.kind}>
                <td className="hi-id">
                  {cardRef}
                  {change && <i>{WORDS[change.kind]}</i>}
                </td>
                {fields.map((f) => {
                  const was = valueOf(a.doc, cardRef, f)
                  const now = valueOf(b.doc, cardRef, f)
                  const moved = change?.kind === 'changed' && change.fields.some((x) => x.field === f)
                  return (
                    <td key={f} data-moved={moved ? 'true' : undefined}>
                      {moved ? (
                        <>
                          <s>{cell(was)}</s> {cell(now)}
                        </>
                      ) : (
                        cell(change?.kind === 'removed' ? was : now)
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      {(diff.template || diff.setup || diff.icons) && (
        <p className="hi-hint">
          Utanför tabellen: {[diff.template && 'mallen', diff.setup && 'uppställningen', diff.icons && 'symbolerna'].filter(Boolean).join(', ')} ändrades. Det syns på korten, inte i en rad.
        </p>
      )}
      <div className="hi-b-cards">
        <div>
          <h2>Från</h2>
          <Wall doc={a.doc} scale={0.42} />
        </div>
        <div>
          <h2>Till</h2>
          <Wall doc={b.doc} mark={marks(diff)} scale={0.42} />
        </div>
      </div>
      <p className="hi-foot">B · skillnaden där leken bor · två versioner valda, det gamla överstruket bredvid det nya</p>
    </div>
  )
}

// ---------- C — a strip to drag through ----------
// No list and no table: a strip of every version along the top with the named ones pinned.
// Dragging the handle moves the whole deck back through its own history.
function VariantC({ versions, name }: Ctx) {
  const [at, setAt] = useState(versions.length)
  const version = versions.find((v) => v.rev === at)!
  const before = versions.find((v) => v.rev === at - 1)
  const diff = before ? diffProjects(before.doc, version.doc) : null
  return (
    <div className="hi-c">
      <div className="hi-strip">
        <input
          type="range"
          min={versions[0]!.rev}
          max={versions[versions.length - 1]!.rev}
          step={1}
          value={at}
          aria-label="Version"
          onChange={(e) => setAt(Number(e.target.value))}
        />
        <div className="hi-pins">
          {versions.map((v) => (
            <button
              key={v.rev}
              type="button"
              data-on={at === v.rev ? 'true' : undefined}
              data-named={v.label ? 'true' : undefined}
              onClick={() => setAt(v.rev)}
              title={v.label ?? `Version ${v.rev}`}
            >
              <span>{v.label ?? when(v.at)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="hi-c-head">
        <h2>{version.label ?? `Version ${version.rev}`}</h2>
        <span>{when(version.at)}</span>
        <span className="hi-hint">{diff ? <Summary diff={diff} /> : 'spelet skapades'}</span>
        <button type="button" onClick={() => name(version.rev, version.label ? null : `Milstolpe ${version.rev}`)}>
          {version.label ? 'Ta bort namnet' : 'Namnge den här'}
        </button>
      </div>
      <Wall doc={version.doc} mark={diff ? marks(diff) : undefined} scale={0.72} />
      <p className="hi-foot">C · en remsa att dra i · leken rör sig bakåt genom sin egen historia</p>
    </div>
  )
}
