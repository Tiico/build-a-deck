// PROTOTYPE — Variant C: "Guidad editor". The steps as a checklist in a left rail; the main
// area is the deck wall, growing as data is pasted. The wizard is the editor with a guide,
// and it ends there — no page change.
import { useState } from 'react'
import { CardPreview } from '../../editor/CardPreview.js'
import { FRAMES, initial, type WizardState } from './data.js'
import { DataStep, FieldList, FrameGallery, sampleRow } from './shared.js'

const STEPS = ['Namn', 'Spelare', 'Fält', 'Ram', 'Kort'] as const

export function VariantC() {
  const [s, setS] = useState<WizardState>(initial)
  const [open, setOpen] = useState(0)
  const frame = FRAMES.find((f) => f.id === s.frame)!
  const doneSteps = [s.name.trim().length > 0, true, s.fields.length > 0, true, s.rows.length > 0]
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid #2f333d', background: '#0f1115', color: '#fff', fontSize: 14, width: '100%', boxSizing: 'border-box' }
  return (
    <div style={{ height: '100vh', background: '#23262e', color: '#ddd', fontFamily: 'system-ui', display: 'grid', gridTemplateColumns: '360px 1fr', gridTemplateRows: '48px 1fr' }}>
      <header style={{ gridColumn: '1 / 3', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', borderBottom: '1px solid #2f333d' }}>
        <b style={{ color: '#fff' }}>{s.name || 'Nytt spel'}</b>
        <span style={{ color: '#7d8597' }}>{s.rows.length} kort · {s.players} spelare</span>
        <span style={{ flex: 1 }} />
        <button disabled={!doneSteps.every(Boolean)} style={{ background: doneSteps.every(Boolean) ? '#3c8ce7' : '#2a2d36', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 700 }}>Öppna bordet</button>
      </header>
      <aside style={{ borderRight: '1px solid #2f333d', overflow: 'auto', background: '#1b1d23' }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ borderBottom: '1px solid #2f333d' }}>
            <button onClick={() => setOpen(i)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', background: open === i ? '#23262e' : 'transparent', border: 0, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', background: doneSteps[i] ? '#3aa76d' : '#2a2d36', fontSize: 12 }}>{doneSteps[i] ? '✓' : i + 1}</span>{label}
            </button>
            {open === i && (
              <div style={{ padding: '4px 16px 18px' }}>
                {i === 0 && <input autoFocus value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Skogens herrar" style={inp} />}
                {i === 1 && <div style={{ display: 'flex', gap: 6 }}>{[1, 2, 3, 4, 5, 6].map((n) => <button key={n} onClick={() => setS({ ...s, players: n })} style={{ width: 40, height: 40, borderRadius: 8, border: s.players === n ? '2px solid #3c8ce7' : '1px solid #2f333d', background: '#0f1115', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{n}</button>)}</div>}
                {i === 2 && <FieldList dark fields={s.fields} onChange={(fields) => setS({ ...s, fields })} />}
                {i === 3 && <div style={{ display: 'grid', gap: 8 }}>{FRAMES.map((f) => <button key={f.id} onClick={() => setS({ ...s, frame: f.id })} style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: s.frame === f.id ? '2px solid #3c8ce7' : '1px solid #2f333d', background: '#0f1115', color: '#fff', cursor: 'pointer' }}><b>{f.name}</b><div style={{ fontSize: 12, color: '#9aa3b8' }}>{f.blurb}</div></button>)}</div>}
                {i === 4 && <DataStep dark state={s} onRows={(rows) => setS({ ...s, rows })} />}
              </div>
            )}
          </div>
        ))}
        <div style={{ padding: 16, fontSize: 12, color: '#7d8597' }}>Allt här går att ändra senare — det här är editorn, med en guide.</div>
      </aside>
      <main style={{ overflow: 'auto', padding: 16 }}>
        {s.rows.length === 0 ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <div style={{ textAlign: 'center', color: '#7d8597' }}>
              <CardPreview id="c-sample" face={frame.face(s.fields)} row={sampleRow} icons={{}} scale={1.4} />
              <p style={{ marginTop: 16 }}>Så här ser ett kort ut med ramen <b style={{ color: '#fff' }}>{frame.name}</b>. Klistra in dina kort i steg 5 så fylls väggen.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, alignContent: 'start' }}>
            {s.rows.map((r, i) => <CardPreview key={i} id={`c-${i}`} face={frame.face(s.fields)} row={r} icons={{}} scale={0.6} />)}
          </div>
        )}
      </main>
    </div>
  )
}
// Keep the gallery import used for parity with the other variants.
void FrameGallery
