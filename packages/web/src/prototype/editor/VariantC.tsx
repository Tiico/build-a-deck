// PROTOTYPE — Variant C: "Kortväggen". The whole deck rendered as a wall; click a card to edit its
// row in a side panel; click an element on any card to edit the template — every card follows.
// You always see the deck, never one card at a time.
import { useState } from 'react'
import type { Warning } from '@byd/template'
import { Preview } from './Preview.js'
import { FIELDS } from './data.js'
import { fieldOf, useDeck } from './state.js'

export function VariantC() {
  const { face, rows, setCell, patchElement } = useDeck()
  const [row, setRow] = useState<number | null>(0)
  const [sel, setSel] = useState<string | null>(null)
  const [warn, setWarn] = useState<Record<number, Warning[]>>({})
  const el = face.base.find((e) => e.id === sel)
  const warnCount = Object.values(warn).reduce((n, w) => n + w.length, 0)
  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '1fr 320px', gridTemplateRows: '48px 1fr', background: '#23262e', color: '#ddd', fontFamily: 'system-ui', fontSize: 13 }}>
      <header style={{ gridColumn: '1 / 3', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid #2f333d' }}>
        <b style={{ color: '#fff' }}>Skogens herrar</b> <span style={{ color: '#7d8597' }}>v0.7 · {rows.length} kort</span>
        <span style={{ marginLeft: 'auto', color: warnCount ? '#f0b64a' : '#7d8597' }}>{warnCount ? `${warnCount} varningar i leken` : 'inga varningar'}</span>
        <button style={{ background: '#3c8ce7', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 700 }}>Uppdatera bordet</button>
      </header>
      <main style={{ overflow: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, alignContent: 'start' }}>
        {rows.map((r, i) => (
          <div key={i} onClick={() => setRow(i)} style={{ borderRadius: 8, outline: row === i ? '3px solid #3c8ce7' : 'none', outlineOffset: 3, position: 'relative', cursor: 'pointer' }}>
            <Preview id={`c-${i}`} face={face} row={r} scale={0.6} selected={{ element: sel, onSelect: setSel }} onWarnings={(w) => setWarn((m) => (m[i]?.length === w.length ? m : { ...m, [i]: w }))} />
            {(warn[i]?.length ?? 0) > 0 && <span style={{ position: 'absolute', top: -6, right: -6, background: '#f0b64a', color: '#1c1c1c', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '1px 6px' }}>{warn[i]!.length}</span>}
            {Number(r['antal'] ?? 1) > 1 && <span style={{ position: 'absolute', bottom: -6, right: -6, background: '#1b1d23', color: '#fff', borderRadius: 999, fontSize: 11, padding: '1px 6px', border: '1px solid #444' }}>×{String(r['antal'])}</span>}
          </div>
        ))}
      </main>
      <aside style={{ borderLeft: '1px solid #2f333d', padding: 14, overflow: 'auto', background: '#1b1d23' }}>
        {el ? (
          <>
            <div style={hh}>Mall · {el.id} <span style={{ color: '#7d8597', fontWeight: 400 }}>(alla kort)</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['x', 'y', 'w', 'h'] as const).map((k) => <label key={k} style={lbl}>{k}<input type="number" step={0.5} value={fieldOf(el, k)} onChange={(e) => patchElement(el.id, { [k]: Number(e.target.value) } as never)} style={inp} /></label>)}
              {el.kind === 'text' && <label style={lbl}>pt<input type="number" step={0.5} value={el.font.sizePt} onChange={(e) => patchElement(el.id, { font: { ...el.font, sizePt: Number(e.target.value) } })} style={inp} /></label>}
              {el.kind === 'shape' && <label style={lbl}>fyllning<input type="color" value={el.fill ?? '#000000'} onChange={(e) => patchElement(el.id, { fill: e.target.value })} style={{ ...inp, padding: 2, height: 30 }} /></label>}
            </div>
            <button onClick={() => setSel(null)} style={{ marginTop: 12, background: 'transparent', color: '#9aa3b8', border: '1px solid #2f333d', borderRadius: 6, padding: '6px 10px' }}>Klar med mallen</button>
          </>
        ) : row !== null ? (
          <>
            <div style={hh}>Kort {row + 1}</div>
            {FIELDS.map((f) => (
              <label key={f.key} style={{ ...lbl, marginBottom: 8 }}>{f.label}
                {f.key === 'body' ? <textarea value={String(rows[row]![f.key] ?? '')} onChange={(e) => setCell(row, f.key, e.target.value)} rows={4} style={inp} /> : <input value={String(rows[row]![f.key] ?? '')} onChange={(e) => setCell(row, f.key, e.target.value)} style={inp} />}
              </label>
            ))}
            {(warn[row]?.length ?? 0) > 0 && <div style={{ marginTop: 8 }}>{warn[row]!.map((w, i) => <div key={i} style={{ fontSize: 12, color: '#f0b64a', padding: '3px 0' }}>⚠ {w.element}: {w.detail}</div>)}</div>}
            <p style={{ fontSize: 12, color: '#7d8597', marginTop: 14 }}>Tryck på ett element i vilket kort som helst för att ändra mallen.</p>
          </>
        ) : null}
      </aside>
    </div>
  )
}
const hh: React.CSSProperties = { fontWeight: 700, color: '#fff', marginBottom: 10 }
const lbl: React.CSSProperties = { display: 'grid', gap: 3, fontSize: 11, color: '#9aa3b8' }
const inp: React.CSSProperties = { background: '#0f1115', border: '1px solid #2a2d36', color: '#fff', borderRadius: 6, padding: '6px 8px', fontSize: 13, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
