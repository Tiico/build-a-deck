// PROTOTYPE — Variant A: "Trepanel". Layers on the left, the template large in the middle with
// selectable elements, properties on the right, the data table as a strip along the bottom
// whose selected row drives the preview. The Figma shape.
import { useState } from 'react'
import type { Warning } from '@byd/template'
import { Preview } from './Preview.js'
import { FIELDS } from './data.js'
import { fieldOf, useDeck } from './state.js'

export function VariantA() {
  const { face, rows, setCell, patchElement } = useDeck()
  const [row, setRow] = useState(0)
  const [sel, setSel] = useState<string | null>('title')
  const [warnings, setWarnings] = useState<Warning[]>([])
  const el = face.base.find((e) => e.id === sel)
  const num = (label: string, key: 'x' | 'y' | 'w' | 'h') =>
    el && 'x' in el ? (
      <label style={lbl}>
        {label}
        <input type="number" step={0.5} value={fieldOf(el, key)} onChange={(e) => patchElement(el.id, { [key]: Number(e.target.value) } as never)} style={inp} />
      </label>
    ) : null

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '220px 1fr 280px', gridTemplateRows: '44px 1fr 200px', background: '#1b1d23', color: '#ddd', fontFamily: 'system-ui', fontSize: 13 }}>
      <header style={{ gridColumn: '1 / 4', display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', borderBottom: '1px solid #2a2d36' }}>
        <b style={{ color: '#fff' }}>Skogens herrar</b> <span style={{ color: '#7d8597' }}>v0.7 · framsida</span>
        <span style={{ marginLeft: 'auto', color: warnings.length ? '#f0b64a' : '#7d8597' }}>{warnings.length ? `${warnings.length} varningar på kort ${row + 1}` : 'inga varningar'}</span>
        <button style={btn}>Uppdatera bordet</button>
      </header>
      <aside style={{ borderRight: '1px solid #2a2d36', padding: 12, overflow: 'auto' }}>
        <div style={h}>Lager</div>
        {[...face.base].reverse().map((e) => (
          <div key={e.id} onClick={() => setSel(e.id)} style={{ padding: '6px 8px', borderRadius: 6, background: sel === e.id ? '#2f3a55' : 'transparent', cursor: 'pointer', display: 'flex', gap: 8 }}>
            <span style={{ color: '#7d8597', width: 44 }}>{e.kind}</span>
            <span>{e.id}</span>
          </div>
        ))}
        <div style={{ ...h, marginTop: 18 }}>Varianter</div>
        {['bas', ...Object.keys(face.variants)].map((v) => (
          <div key={v} style={{ padding: '6px 8px', color: v === 'bas' ? '#fff' : '#9aa3b8' }}>{v}</div>
        ))}
      </aside>
      <main style={{ display: 'grid', placeItems: 'center', background: 'repeating-conic-gradient(#20232b 0 25%, #1b1d23 0 50%) 0 0 / 24px 24px', overflow: 'auto' }}>
        <Preview id="a-main" face={face} row={rows[row]!} scale={2.6} selected={{ element: sel, onSelect: setSel }} onWarnings={setWarnings} />
      </main>
      <aside style={{ borderLeft: '1px solid #2a2d36', padding: 12, overflow: 'auto' }}>
        <div style={h}>Egenskaper {el ? `· ${el.id}` : ''}</div>
        {el && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {num('X mm', 'x')}{num('Y mm', 'y')}{num('Bredd', 'w')}{num('Höjd', 'h')}
            {el.kind === 'text' && (
              <>
                <label style={{ ...lbl, gridColumn: '1 / 3' }}>Fält<select value={'field' in el.bind ? el.bind.field : ''} onChange={(e) => patchElement(el.id, { bind: { field: e.target.value } })} style={inp}>{FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></label>
                <label style={lbl}>Storlek pt<input type="number" step={0.5} value={el.font.sizePt} onChange={(e) => patchElement(el.id, { font: { ...el.font, sizePt: Number(e.target.value) } })} style={inp} /></label>
                <label style={lbl}>Vikt<select value={el.font.weight ?? 400} onChange={(e) => patchElement(el.id, { font: { ...el.font, weight: Number(e.target.value) as 400 } })} style={inp}><option>400</option><option>600</option><option>700</option><option>800</option></select></label>
                <label style={lbl}>Färg<input type="color" value={el.color} onChange={(e) => patchElement(el.id, { color: e.target.value })} style={{ ...inp, padding: 2, height: 30 }} /></label>
                <label style={lbl}>Anpassning<select value={el.fit ?? 'shrink'} onChange={(e) => patchElement(el.id, { fit: e.target.value as 'shrink' })} style={inp}><option value="shrink">krymp</option><option value="fixed">fast</option></select></label>
              </>
            )}
            {el.kind === 'shape' && <label style={lbl}>Fyllning<input type="color" value={el.fill ?? '#000000'} onChange={(e) => patchElement(el.id, { fill: e.target.value })} style={{ ...inp, padding: 2, height: 30 }} /></label>}
          </div>
        )}
        {warnings.length > 0 && (
          <>
            <div style={{ ...h, marginTop: 18, color: '#f0b64a' }}>Varningar</div>
            {warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: '#f0b64a', padding: '4px 0' }}>{w.element}: {w.code} — {w.detail}</div>)}
          </>
        )}
      </aside>
      <section style={{ gridColumn: '1 / 4', borderTop: '1px solid #2a2d36', overflow: 'auto', background: '#15171c' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead><tr>{FIELDS.map((f) => <th key={f.key} style={th}>{f.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} onClick={() => setRow(i)} style={{ background: i === row ? '#2f3a55' : i % 2 ? '#181a20' : 'transparent', cursor: 'pointer' }}>
                {FIELDS.map((f) => (
                  <td key={f.key} style={td}><input value={String(r[f.key] ?? '')} onChange={(e) => setCell(i, f.key, e.target.value)} style={cell} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
const h: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: '#7d8597', marginBottom: 8 }
const lbl: React.CSSProperties = { display: 'grid', gap: 3, fontSize: 11, color: '#9aa3b8' }
const inp: React.CSSProperties = { background: '#0f1115', border: '1px solid #2a2d36', color: '#fff', borderRadius: 6, padding: '6px 8px', fontSize: 13, width: '100%', boxSizing: 'border-box' }
const btn: React.CSSProperties = { background: '#3c8ce7', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 700 }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', color: '#7d8597', fontWeight: 600, position: 'sticky', top: 0, background: '#15171c' }
const td: React.CSSProperties = { padding: 0, borderBottom: '1px solid #20232b' }
const cell: React.CSSProperties = { background: 'transparent', border: 0, color: '#ddd', padding: '7px 10px', width: '100%', boxSizing: 'border-box', fontSize: 12 }
