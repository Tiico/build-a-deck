// PROTOTYPE — the symbol library (E4): /prototype/symbols?variant=A|B|C. Question: where does a
// designer find a symbol, and how does it reach the card? All three variants fill the same thing:
// the project's icon set, which `{namn}` in card text and the icon row look up (L2).
import { useEffect, useRef, useState } from 'react'
import type { ProjectDoc } from '@byd/server'
import { CardPreview } from '../../editor/CardPreview.js'
import { Switcher } from './Switcher.js'
import { CATEGORIES, dataUrl, freeName, LIBRARY, search, type Symbol } from './library.js'
import '../../editor/editor.css'
import './proto.css'

const VARIANTS = [
  { key: 'A', name: 'Bibliotekspanel bredvid korten' },
  { key: 'B', name: 'Vid klammern, medan du skriver' },
  { key: 'C', name: 'Dra symbolen till kortet' },
]
type Ctx = {
  doc: ProjectDoc
  pick(symbol: Symbol, as?: string): string
  drop(name: string): void
  setBody(cardRef: string, text: string): void
  place(cardRef: string, symbol: Symbol): void
}
const DRAG_TYPE = 'text/x-byd-symbol'

function sampleDoc(): ProjectDoc {
  const front = {
    base: [
      { kind: 'shape' as const, id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect' as const, fill: '#f4ead8', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
      { kind: 'text' as const, id: 'title', x: 5, y: 6, w: 53, h: 9, bind: { field: 'title' }, font: { family: 'Georgia, serif', sizePt: 13, weight: 800 as const }, color: '#1c1c1c' },
      { kind: 'icons' as const, id: 'kostnad', x: 5, y: 17, w: 40, h: 6, bind: { field: 'kostnad' }, iconMm: 5, gapMm: 1 },
      { kind: 'text' as const, id: 'body', x: 5, y: 26, w: 53, h: 55, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 9 }, color: '#333' },
    ],
    variants: {},
  }
  return {
    name: 'Skogens herrar',
    template: { faces: { front, back: { base: [{ kind: 'shape' as const, id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect' as const, fill: '#2f4068' }], variants: {} } } },
    rows: [
      { id: 'drake', fields: { title: 'Drake', kostnad: '', body: 'Flygande.\n\nBetala {2} för att anfalla.', antal: 2 } },
      { id: 'riddare', fields: { title: 'Riddare', kostnad: '', body: 'Sköld 1.', antal: 1 } },
      { id: 'skogsande', fields: { title: 'Skogsande', kostnad: '', body: 'Vaknar i skymningen.', antal: 1 } },
    ],
    icons: {},
    setup: { seats: ['A'], floor: 'table', deckZone: 'draw', zones: [] },
  }
}

export function SymbolsPrototype() {
  const params = new URLSearchParams(location.search)
  const [variant, setVariant] = useState(params.get('variant') ?? 'A')
  const [doc, setDoc] = useState<ProjectDoc>(sampleDoc)
  // The licence of every symbol taken into the project: what has to follow into print (E4).
  const [licences, setLicences] = useState<Record<string, Symbol>>({})
  const pick = (symbol: Symbol, as?: string): string => {
    const existing = Object.entries(doc.icons).find(([, url]) => url === dataUrl(symbol))?.[0]
    if (existing && !as) return existing
    const name = freeName(as ?? symbol.name, doc.icons)
    setDoc((d) => ({ ...d, icons: { ...d.icons, [name]: dataUrl(symbol) } }))
    setLicences((l) => ({ ...l, [name]: symbol }))
    return name
  }
  const drop = (name: string) =>
    setDoc((d) => {
      const icons = { ...d.icons }
      delete icons[name]
      return { ...d, icons }
    })
  const setBody = (cardRef: string, text: string) => setDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === cardRef ? { ...r, fields: { ...r.fields, body: text } } : r)) }))
  // C places a symbol without naming it in text: it joins the card's icon row.
  const place = (cardRef: string, symbol: Symbol) => {
    const name = pick(symbol)
    setDoc((d) => ({ ...d, rows: d.rows.map((r) => (r.id === cardRef ? { ...r, fields: { ...r.fields, kostnad: `${String(r.fields['kostnad'] ?? '')} ${name}`.trim() } } : r)) }))
  }
  const ctx: Ctx = { doc, pick, drop, setBody, place }
  const V = variant === 'B' ? VariantB : variant === 'C' ? VariantC : VariantA
  const change = (k: string) => {
    setVariant(k)
    const q = new URLSearchParams(location.search)
    q.set('variant', k)
    history.replaceState(null, '', `?${q.toString()}`)
  }
  const used = Object.keys(doc.icons)
  return (
    <div className="sy-stage">
      <div className="sy-state">
        <span>
          symboler i spelet <b>{used.length}</b>
          {used.length > 0 && <> · {used.join(', ')}</>} · licenser: <b>{[...new Set(Object.values(licences).map((s) => s.licence))].join(', ') || '—'}</b>
        </span>
      </div>
      <V {...ctx} licences={licences} />
      <Switcher variants={VARIANTS} current={variant} onChange={change} />
    </div>
  )
}

type ViewProps = Ctx & { licences: Record<string, Symbol> }

function Wall({ doc, decorate }: { doc: ProjectDoc; decorate?: (cardRef: string) => React.ReactNode }) {
  return (
    <div className="sy-wall">
      {doc.rows.map((r) => (
        <div key={r.id} className="sy-card" data-card-ref={r.id}>
          <CardPreview id={`sy-${r.id}`} face={doc.template.faces['front']!} row={r.fields} icons={doc.icons} scale={0.62} />
          {decorate?.(r.id)}
        </div>
      ))}
    </div>
  )
}

function Glyph({ symbol, draggable = false }: { symbol: Symbol; draggable?: boolean }) {
  return (
    <img
      className="sy-glyph"
      src={dataUrl(symbol)}
      alt={symbol.name}
      draggable={draggable}
      onDragStart={draggable ? (e) => e.dataTransfer.setData(DRAG_TYPE, symbol.id) : undefined}
    />
  )
}

// ---------- A — a library panel beside the cards ----------
// A surface of its own: search, categories, a grid. Taking a symbol names it in the project's
// set, and the set stands at the top with its licences and a way to rename or drop one.
function VariantA({ doc, pick, drop, licences }: ViewProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const found = search(query, category)
  return (
    <div className="sy-a">
      <aside className="sy-panel">
        <h2>Symbolbibliotek</h2>
        <input type="search" placeholder="Sök symbol…" aria-label="Sök symbol" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="sy-cats">
          <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>Alla</button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
        <div className="sy-grid">
          {found.map((s) => (
            <button key={s.id} type="button" className="sy-tile" title={`${s.name} · ${s.licence}`} onClick={() => pick(s)}>
              <Glyph symbol={s} />
              <span>{s.name}</span>
            </button>
          ))}
          {found.length === 0 && <p className="sy-hint">Inget med det namnet.</p>}
        </div>
      </aside>
      <div className="sy-main">
        <section className="sy-set">
          <h2>I spelet</h2>
          {Object.keys(doc.icons).length === 0 ? (
            <p className="sy-hint">Inga ännu. Ta en symbol ur biblioteket, skriv sedan {'{namn}'} i korttexten.</p>
          ) : (
            <ul>
              {Object.entries(doc.icons).map(([name, url]) => (
                <li key={name}>
                  <img src={url} alt="" className="sy-glyph" />
                  <code>{'{' + name + '}'}</code>
                  <small>{licences[name]?.licence ?? '—'}</small>
                  <button type="button" onClick={() => drop(name)}>Ta bort</button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Wall doc={doc} />
      </div>
      <p className="sy-foot">A · biblioteket är en egen panel · symbolen får ett namn i uppsättningen och används som {'{namn}'}</p>
    </div>
  )
}

// ---------- B — at the brace, while writing ----------
// No panel at all. Typing `{` in a card's text opens a picker at the cursor: keep typing to
// search, Enter takes the symbol into the set and writes {namn} where the cursor stands.
function VariantB({ doc, pick, setBody, licences }: ViewProps) {
  const [open, setOpen] = useState<{ cardRef: string; from: number } | null>(null)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const found = search(query, null).slice(0, 8)
  useEffect(() => setCursor(0), [query])
  const insert = (cardRef: string, from: number, s: Symbol) => {
    const name = pick(s)
    const text = String(doc.rows.find((r) => r.id === cardRef)?.fields['body'] ?? '')
    setBody(cardRef, `${text.slice(0, from)}{${name}}${text.slice(from + 1 + query.length)}`)
    setOpen(null)
    setQuery('')
  }
  const onChange = (cardRef: string, el: HTMLTextAreaElement) => {
    setBody(cardRef, el.value)
    const upto = el.value.slice(0, el.selectionStart)
    const brace = upto.lastIndexOf('{')
    const word = brace >= 0 ? upto.slice(brace + 1) : ''
    if (brace >= 0 && !word.includes('}') && !word.includes('\n')) {
      setOpen({ cardRef, from: brace })
      setQuery(word)
    } else setOpen(null)
  }
  return (
    <div className="sy-b">
      <div className="sy-editing">
        <h2>Korttext</h2>
        {doc.rows.map((r) => (
          <label key={r.id} className="sy-field">
            <span>{String(r.fields['title'])}</span>
            <textarea
              ref={(el) => {
                areas.current[r.id] = el
              }}
              rows={3}
              aria-label={`Text för ${String(r.fields['title'])}`}
              value={String(r.fields['body'] ?? '')}
              onChange={(e) => onChange(r.id, e.currentTarget)}
              onKeyDown={(e) => {
                if (!open || open.cardRef !== r.id) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setCursor((c) => Math.min(found.length - 1, c + 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setCursor((c) => Math.max(0, c - 1))
                } else if (e.key === 'Enter' && found[cursor]) {
                  e.preventDefault()
                  insert(r.id, open.from, found[cursor]!)
                } else if (e.key === 'Escape') setOpen(null)
              }}
            />
            {open?.cardRef === r.id && found.length > 0 && (
              <div className="sy-pop" role="listbox" aria-label="Symboler">
                {found.map((s, i) => (
                  <button key={s.id} type="button" role="option" aria-selected={i === cursor} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(r.id, open.from, s)}>
                    <Glyph symbol={s} />
                    <span>{s.name}</span>
                    <small>{s.category}</small>
                  </button>
                ))}
              </div>
            )}
          </label>
        ))}
        <p className="sy-hint">Skriv {'{'} i texten så söker du i biblioteket där du står. Piltangenter väljer, Enter sätter in.</p>
        {Object.keys(licences).length > 0 && <p className="sy-hint">Licenser som följer med: {[...new Set(Object.values(licences).map((s) => `${s.name} ${s.licence}`))].join(' · ')}</p>}
      </div>
      <Wall doc={doc} />
      <p className="sy-foot">B · inget bibliotek att öppna · klammern är sökrutan, mitt i skrivandet</p>
    </div>
  )
}

// ---------- C — drag the symbol to the card ----------
// A tray under the cards. Drag a symbol onto a card and it joins that card's icon row; the
// placeholder frames and colour blocks go the same way. Nothing is typed and nothing is named.
function VariantC({ doc, place, licences }: ViewProps) {
  const [over, setOver] = useState<string | null>(null)
  const [category, setCategory] = useState<string>('Resurser')
  const shown = LIBRARY.filter((s) => s.category === category)
  const decorate = (cardRef: string) => (
    <div
      className="sy-target"
      data-over={over === cardRef ? 'true' : undefined}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(cardRef)
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(null)
        const id = e.dataTransfer.getData(DRAG_TYPE)
        const s = LIBRARY.find((x) => x.id === id)
        if (s) place(cardRef, s)
      }}
    >
      <span>släpp en symbol</span>
    </div>
  )
  return (
    <div className="sy-c">
      <Wall doc={doc} decorate={decorate} />
      <div className="sy-tray">
        <div className="sy-cats">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
        <div className="sy-tray-row">
          {shown.map((s) => (
            <figure key={s.id}>
              <Glyph symbol={s} draggable />
              <figcaption>{s.name}<br /><small>{s.licence}</small></figcaption>
            </figure>
          ))}
        </div>
        {Object.keys(licences).length > 0 && <p className="sy-hint">{Object.keys(licences).length} symboler i spelet, alla {[...new Set(Object.values(licences).map((s) => s.licence))].join(', ')} — följer med till trycket.</p>}
      </div>
      <p className="sy-foot">C · symbolen dras dit den ska sitta · ikonraden fylls utan att något skrivs</p>
    </div>
  )
}
