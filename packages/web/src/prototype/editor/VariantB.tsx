// PROTOTYPE — Variant B: "Kalkylbladet först". The whole surface is the table, one row per card;
// a preview of the selected row sits on the right with its warnings; the template is a mode you
// switch into. Data is the star (E1) — this is where the designer already lives.
import { useState } from 'react'
import type { Warning } from '@byd/template'
import { Preview } from './Preview.js'
import { FIELDS } from './data.js'
import { useDeck } from './state.js'

export function VariantB() {
  const { face, rows, setCell, patchElement } = useDeck()
  const [row, setRow] = useState(0)
  const [mode, setMode] = useState<'data' | 'template'>('data')
  const [warnings, setWarnings] = useState<Warning[]>([])
  const title = face.base.find((e) => e.id === 'title')
  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateColumns: '1fr 340px', gridTemplateRows: '48px 1fr', background: '#f6f5f1', color: '#1c1c1c', fontFamily: 'system-ui', fontSize: 13 }}>
      <header style={{ gridColumn: '1 / 3', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid #ddd', background: '#fff' }}>
        <b>Skogens herrar</b> <span style={{ color: '#888' }}>v0.7</span>
        <div style={{ marginLeft: 20, display: 'flex', background: '#eee', borderRadius: 8, padding: 3 }}>
          {(['data', 'template'] as const).map((m) => <button key={m} onClick={() => setMode(m)} style={{ border: 0, borderRadius: 6, padding: '6px 14px', background: mode === m ? '#fff' : 'transparent', fontWeight: 600, boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,.15)' : 'none' }}>{m === 'data' ? 'Kort' : 'Mall'}</button>)}
        </div>
        <span style={{ marginLeft: 'auto', color: '#888' }}>{rows.length} kort · {rows.reduce((n, r) => n + Number(r['antal'] ?? 1), 0)} exemplar</span>
        <button style={{ background: '#1c1c1c', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 700 }}>Uppdatera bordet</button>
      </header>
      <main style={{ overflow: 'auto', padding: 16 }}>
        {mode === 'data' ? (
          <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fff', border: '1px solid #ddd' }}>
            <thead><tr><th style={th}>#</th>{FIELDS.map((f) => <th key={f.key} style={th}>{f.label}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} onClick={() => setRow(i)} style={{ background: i === row ? '#e8f0fe' : 'transparent' }}>
                  <td style={{ ...td, color: '#999', padding: '0 10px', width: 30 }}>{i + 1}</td>
                  {FIELDS.map((f) => <td key={f.key} style={td}><input value={String(r[f.key] ?? '')} onChange={(e) => setCell(i, f.key, e.target.value)} style={cell} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 24 }}>
            <div style={{ display: 'grid', placeItems: 'center', background: '#e9e7e0', borderRadius: 12, padding: 24 }}>
              <Preview id="b-tpl" face={face} row={rows[row]!} scale={2.4} selected={{ element: 'title' }} />
            </div>
            <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Titel</div>
              {title?.kind === 'text' && (
                <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#666' }}>Storlek pt
                  <input type="number" step={0.5} value={title.font.sizePt} onChange={(e) => patchElement('title', { font: { ...title.font, sizePt: Number(e.target.value) } })} style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6 }} />
                </label>
              )}
              <p style={{ fontSize: 12, color: '#888' }}>Mallen redigeras här: element, fält, varianter. Alla 30 kort följer.</p>
            </div>
          </div>
        )}
      </main>
      <aside style={{ borderLeft: '1px solid #ddd', background: '#fff', padding: 16, overflow: 'auto' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, color: '#888', marginBottom: 10 }}>Kort {row + 1} · {String(rows[row]!['title'])}</div>
        <div style={{ display: 'grid', placeItems: 'center', background: '#e9e7e0', borderRadius: 12, padding: 16 }}>
          <Preview id="b-side" face={face} row={rows[row]!} scale={1.6} onWarnings={setWarnings} />
        </div>
        <div style={{ marginTop: 14 }}>
          {warnings.length === 0 ? <div style={{ color: '#3a8a3a', fontSize: 12 }}>✓ Inga varningar på detta kort</div> : warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: '#b7791f', padding: '4px 0' }}>⚠ {w.element}: {w.detail}</div>)}
        </div>
      </aside>
    </div>
  )
}
const th: React.CSSProperties = { textAlign: 'left', padding: '10px', color: '#666', fontWeight: 600, borderBottom: '1px solid #ddd', position: 'sticky', top: 0, background: '#fafafa' }
const td: React.CSSProperties = { padding: 0, borderBottom: '1px solid #eee' }
const cell: React.CSSProperties = { background: 'transparent', border: 0, padding: '9px 10px', width: '100%', boxSizing: 'border-box', fontSize: 13 }
