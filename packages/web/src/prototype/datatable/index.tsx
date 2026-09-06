// PROTOTYPE — the editor's data table (L4) with sorting, filtering and bulk edits, on
// /prototype/datatable?variant=A|B|C. Question: how does a designer sort, find and change many
// cards at once without leaving the table? In memory; nothing is saved.
import { useMemo, useState } from 'react'
import { Switcher } from './Switcher.js'
import '../../editor/editor.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Kalkylark: rubriker sorterar, filterrad, kryssrutor' },
  { key: 'B', name: 'Verktygsfält: sök, filterchips, markering med åtgärdsrad' },
  { key: 'C', name: 'Frågerad och sparade vyer' },
]
type Row = { id: string; typ: string; kostnad: number; title: string; body: string; antal: number }
const TYPES = ['varelse', 'besvärjelse', 'fälla', 'butik']
const ROWS: Row[] = Array.from({ length: 24 }, (_, i) => ({
  id: `kort-${i + 1}`,
  typ: TYPES[i % 4]!,
  kostnad: (i * 7) % 6,
  title: ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Alv', 'Dvärg'][i % 12]! + (i >= 12 ? ' II' : ''),
  body: ['Flygande.', 'Sköld 1.', 'Dra ett kort.', 'Stjäl 2.', 'Hela 3.', 'Skjut.', 'Blockera.', 'Förbanna.', 'Sjung.', 'Krossa.', 'Smyg.', 'Gräv.'][i % 12]!,
  antal: 1 + (i % 3),
}))
const FIELDS: (keyof Row)[] = ['id', 'typ', 'kostnad', 'title', 'body', 'antal']

type Sort = { field: keyof Row; dir: 1 | -1 } | null
function useTable() {
  const [rows, setRows] = useState<Row[]>(ROWS)
  const [sort, setSort] = useState<Sort>(null)
  const [filters, setFilters] = useState<Partial<Record<keyof Row, string>>>({})
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const shown = useMemo(() => {
    let out = rows.filter((r) => FIELDS.every((f) => !filters[f] || String(r[f]).toLowerCase().includes((filters[f] ?? '').toLowerCase())))
    if (sort) out = [...out].sort((a, b) => (a[sort.field] < b[sort.field] ? -1 : a[sort.field] > b[sort.field] ? 1 : 0) * sort.dir)
    return out
  }, [rows, sort, filters])
  const toggleSort = (f: keyof Row) => setSort((s) => (s?.field === f ? (s.dir === 1 ? { field: f, dir: -1 } : null) : { field: f, dir: 1 }))
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const bulk = (field: keyof Row, value: string) => setRows((rs) => rs.map((r) => (selected.has(r.id) ? { ...r, [field]: field === 'antal' || field === 'kostnad' ? Number(value) : value } : r)))
  const remove = () => { setRows((rs) => rs.filter((r) => !selected.has(r.id))); setSelected(new Set()) }
  const duplicate = () => setRows((rs) => rs.flatMap((r) => (selected.has(r.id) ? [r, { ...r, id: `${r.id}-kopia` }] : [r])))
  return { rows, shown, sort, toggleSort, filters, setFilters, selected, setSelected, toggle, bulk, remove, duplicate }
}
type T = ReturnType<typeof useTable>

export function TableEditorPrototype() {
  const [variant, setVariant] = useState(new URLSearchParams(location.search).get('variant') ?? 'A')
  const t = useTable()
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => { setVariant(k); const q = new URLSearchParams(location.search); q.set('variant', k); history.replaceState(null, '', `?${q}`) }
  return (
    <div className="byd-editor pt-stage" data-mode="table">
      <header>
        <strong>Skogens herrar</strong>
        <span className="byd-editor-rev">rev 12</span>
        <nav role="tablist">
          <button role="tab" type="button" aria-selected="false">Kortvägg</button>
          <button role="tab" type="button" aria-selected="false">Mall</button>
          <button role="tab" type="button" aria-selected="true">Tabell</button>
        </nav>
        <span className="byd-editor-spacer" />
        <span className="pt-count">{t.shown.length} av {t.rows.length} kort{t.selected.size > 0 ? ` · ${t.selected.size} markerade` : ''}</span>
        <button type="button">Spara</button>
        <button type="button" className="byd-editor-primary">Uppdatera bordet</button>
      </header>
      <div />
      <V {...t} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

function SortHeader({ t, f, label }: { t: T; f: keyof Row; label?: string }) {
  const active = t.sort?.field === f
  return (
    <th aria-sort={active ? (t.sort?.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="pt-sort" data-active={active} onClick={() => t.toggleSort(f)}>
        {label ?? f} <span>{active ? (t.sort?.dir === 1 ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}
function Cells({ r }: { r: Row }) {
  return (
    <>
      <td className="byd-data-id">{r.id}</td>
      {FIELDS.slice(1).map((f) => (
        <td key={f}>
          {f === 'typ' ? (
            <select defaultValue={r.typ}>{TYPES.map((x) => <option key={x}>{x}</option>)}</select>
          ) : (
            <input type={f === 'antal' || f === 'kostnad' ? 'number' : 'text'} defaultValue={String(r[f])} aria-label={`${r.id} ${f}`} />
          )}
        </td>
      ))}
    </>
  )
}
function BulkBar({ t }: { t: T }) {
  const [field, setField] = useState<keyof Row>('typ')
  const [value, setValue] = useState('')
  if (t.selected.size === 0) return null
  return (
    <div className="pt-bulk" role="toolbar" aria-label="Markerade kort">
      <strong>{t.selected.size} markerade</strong>
      <label>
        Sätt
        <select value={field} onChange={(e) => setField(e.target.value as keyof Row)}>{FIELDS.slice(1).map((f) => <option key={f}>{f}</option>)}</select>
      </label>
      {field === 'typ' ? (
        <select value={value} onChange={(e) => setValue(e.target.value)}><option value="">…</option>{TYPES.map((x) => <option key={x}>{x}</option>)}</select>
      ) : (
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="värde" />
      )}
      <button type="button" disabled={!value} onClick={() => t.bulk(field, value)}>Tillämpa på alla markerade</button>
      <span className="pt-sep" />
      <button type="button" onClick={t.duplicate}>Duplicera</button>
      <button type="button" data-kind="danger" onClick={t.remove}>Ta bort</button>
      <button type="button" data-kind="quiet" onClick={() => t.setSelected(new Set())}>Avmarkera</button>
    </div>
  )
}

// ---------- A — a spreadsheet: sortable headers, a filter row under them, a checkbox column ----------
function VariantA(t: T) {
  const all = t.shown.length > 0 && t.shown.every((r) => t.selected.has(r.id))
  return (
    <div className="byd-table-wrap pt-a">
      <BulkBar t={t} />
      <table className="byd-data">
        <thead>
          <tr>
            <th><input type="checkbox" aria-label="markera alla" checked={all} onChange={() => t.setSelected(all ? new Set() : new Set(t.shown.map((r) => r.id)))} /></th>
            {FIELDS.map((f) => <SortHeader key={f} t={t} f={f} />)}
            <th></th>
          </tr>
          <tr className="pt-filters">
            <th></th>
            {FIELDS.map((f) => (
              <th key={f}>
                <input placeholder="filtrera…" value={t.filters[f] ?? ''} onChange={(e) => t.setFilters({ ...t.filters, [f]: e.target.value })} aria-label={`filtrera ${f}`} />
              </th>
            ))}
            <th>{Object.values(t.filters).some(Boolean) && <button type="button" onClick={() => t.setFilters({})}>rensa</button>}</th>
          </tr>
        </thead>
        <tbody>
          {t.shown.map((r) => (
            <tr key={r.id} aria-selected={t.selected.has(r.id) ? 'true' : 'false'}>
              <td><input type="checkbox" checked={t.selected.has(r.id)} onChange={() => t.toggle(r.id)} aria-label={`markera ${r.id}`} /></td>
              <Cells r={r} />
              <td><button type="button" aria-label={`ta bort ${r.id}`}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="byd-data-add">+ Nytt kort</button>
    </div>
  )
}

// ---------- B — a toolbar above the table: search, filter chips, sort menu; rows select on click ----------
function VariantB(t: T) {
  const [q, setQ] = useState('')
  const chips = TYPES.filter((x) => t.filters.typ === x)
  const rows = t.shown.filter((r) => !q || Object.values(r).some((v) => String(v).toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="byd-table-wrap pt-b">
      <div className="pt-toolbar" role="toolbar" aria-label="Tabellverktyg">
        <input className="pt-search" placeholder="Sök i alla fält…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="pt-chips">
          {TYPES.map((x) => (
            <button key={x} type="button" className="pt-chip" aria-pressed={chips.includes(x)} onClick={() => t.setFilters({ ...t.filters, typ: t.filters.typ === x ? '' : x })}>
              {x}
            </button>
          ))}
        </span>
        <label className="pt-sortmenu">
          Sortera
          <select value={t.sort ? `${t.sort.field}:${t.sort.dir}` : ''} onChange={(e) => { const [f, d] = e.target.value.split(':'); t.toggleSort(f as keyof Row); if (d === '-1' && t.sort?.field === f) t.toggleSort(f as keyof Row) }}>
            <option value="">som skapade</option>
            {FIELDS.map((f) => <option key={f} value={`${f}:1`}>{f} ↑</option>)}
          </select>
        </label>
        <span className="byd-editor-spacer" />
        <button type="button" onClick={() => t.setSelected(new Set(rows.map((r) => r.id)))}>Markera alla synliga</button>
      </div>
      <BulkBar t={t} />
      <table className="byd-data">
        <thead><tr><th>id</th>{FIELDS.slice(1).map((f) => <th key={f}>{f}</th>)}<th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} aria-selected={t.selected.has(r.id) ? 'true' : 'false'} onClick={(e) => { if ((e.target as HTMLElement).tagName === 'TD' || e.shiftKey || e.metaKey) t.toggle(r.id) }}>
              <Cells r={r} />
              <td><button type="button" aria-label={`ta bort ${r.id}`}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pt-hint">klicka på en rad (utanför fälten) för att markera · shift-klick för fler · sortering och filter i verktygsfältet</p>
      <button type="button" className="byd-data-add">+ Nytt kort</button>
    </div>
  )
}

// ---------- C — a query line and saved views; selection by the query itself ----------
function VariantC(t: T) {
  const [query, setQuery] = useState('typ = fälla')
  const [views, setViews] = useState<string[]>(['Alla kort', 'Fällor', 'Dyra kort (kostnad ≥ 4)', 'Saknar text'])
  const parsed = useMemo(() => {
    const m = /^\s*(\w+)\s*(=|>=|<=|innehåller)\s*(.+?)\s*$/.exec(query)
    if (!m) return null
    const [, f, op, v] = m
    return (r: Row) => {
      const x = r[f as keyof Row]
      if (x === undefined) return false
      if (op === '=') return String(x) === v
      if (op === '>=') return Number(x) >= Number(v)
      if (op === '<=') return Number(x) <= Number(v)
      return String(x).toLowerCase().includes((v ?? '').toLowerCase())
    }
  }, [query])
  const rows = t.rows.filter((r) => !parsed || parsed(r))
  const sorted = t.sort ? [...rows].sort((a, b) => (a[t.sort!.field] < b[t.sort!.field] ? -1 : 1) * t.sort!.dir) : rows
  return (
    <div className="pt-c">
      <aside className="pt-views">
        <h2>Vyer</h2>
        <ul>{views.map((v) => <li key={v}><button type="button" aria-pressed={v === 'Fällor'}>{v}</button></li>)}</ul>
        <button type="button" onClick={() => setViews((vs) => [...vs, `Vy ${vs.length + 1}: ${query}`])}>+ Spara som vy</button>
      </aside>
      <div className="byd-table-wrap">
        <div className="pt-query">
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="fråga" />
          <span className="pt-hint">fält = värde · fält &gt;= tal · fält innehåller text</span>
          <button type="button" onClick={() => t.setSelected(new Set(rows.map((r) => r.id)))}>Markera träffarna ({rows.length})</button>
        </div>
        <BulkBar t={t} />
        <table className="byd-data">
          <thead><tr>{FIELDS.map((f) => <SortHeader key={f} t={t} f={f} />)}<th></th></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id} aria-selected={t.selected.has(r.id) ? 'true' : 'false'}>
                <Cells r={r} />
                <td><button type="button" aria-label={`ta bort ${r.id}`}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
