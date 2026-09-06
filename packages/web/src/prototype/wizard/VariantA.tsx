// PROTOTYPE — Variant A: "En fråga per sida". One big question per screen, progress dots,
// back and next. The Typeform shape: focus, and nothing else on screen.
import { useState } from 'react'
import { CardPreview } from '../../editor/CardPreview.js'
import { FRAMES, initial, type WizardState } from './data.js'
import { DataStep, FieldList, FrameGallery, sampleRow } from './shared.js'

const STEPS = ['Namn', 'Spelare', 'Fält', 'Ram', 'Kort', 'Spela'] as const

export function VariantA() {
  const [s, setS] = useState<WizardState>(initial)
  const [step, setStep] = useState(0)
  const frame = FRAMES.find((f) => f.id === s.frame)!
  const canNext = [s.name.trim().length > 0, s.players >= 1, s.fields.length > 0, true, s.rows.length > 0, true][step]
  const inp: React.CSSProperties = { fontSize: 28, padding: '12px 0', border: 0, borderBottom: '2px solid #ccc', background: 'transparent', width: '100%', outline: 'none' }
  return (
    <div style={{ minHeight: '100vh', background: '#f6f5f1', color: '#1c1c1c', fontFamily: 'system-ui', display: 'grid', gridTemplateRows: '56px 1fr 72px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 40px' }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: i === step ? '#1c1c1c' : '#999' }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', background: i < step ? '#3c8ce7' : i === step ? '#1c1c1c' : '#ddd', color: '#fff', fontWeight: 700 }}>{i + 1}</span>
            {label}{i < STEPS.length - 1 && <span style={{ width: 24, height: 1, background: '#ddd', margin: '0 4px' }} />}
          </div>
        ))}
      </header>
      <main style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
        <div style={{ width: 'min(720px, 100%)' }}>
          {step === 0 && (<><h1 style={h1}>Vad heter spelet?</h1><input autoFocus value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Skogens herrar" style={inp} /></>)}
          {step === 1 && (<><h1 style={h1}>Hur många spelare?</h1><div style={{ display: 'flex', gap: 10 }}>{[1, 2, 3, 4, 5, 6].map((n) => <button key={n} onClick={() => setS({ ...s, players: n })} style={{ width: 64, height: 64, borderRadius: 12, border: s.players === n ? '3px solid #3c8ce7' : '1px solid #ccc', background: '#fff', fontSize: 22, fontWeight: 700, cursor: 'pointer' }}>{n}</button>)}</div><p style={sub}>Ger {s.players} platser med varsin hand. Går att ändra senare.</p></>)}
          {step === 2 && (<><h1 style={h1}>Vad står det på ett kort?</h1><p style={sub}>Fälten blir kolumner i din tabell och rutor på kortet.</p><FieldList fields={s.fields} onChange={(fields) => setS({ ...s, fields })} /></>)}
          {step === 3 && (<><h1 style={h1}>Välj en ram</h1><p style={sub}>Fälten binds automatiskt. Allt går att ändra i editorn sen.</p><FrameGallery state={s} onPick={(frame) => setS({ ...s, frame })} /></>)}
          {step === 4 && (<><h1 style={h1}>Dina kort</h1><DataStep state={s} onRows={(rows) => setS({ ...s, rows })} /></>)}
          {step === 5 && (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'center' }}><div><h1 style={h1}>{s.name} är klart att testa</h1><p style={sub}>{s.rows.length} kort · {s.players} spelare · ramen {frame.name}</p><button style={cta}>Öppna bordet</button><button style={{ ...cta, background: 'transparent', color: '#1c1c1c', border: '1px solid #ccc', marginLeft: 10 }}>Till editorn</button></div><div style={{ display: 'grid', placeItems: 'center' }}><CardPreview id="a-final" face={frame.face(s.fields)} row={s.rows[0] ?? sampleRow} icons={{}} scale={1.6} /></div></div>)}
        </div>
      </main>
      <footer style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 40px', borderTop: '1px solid #e5e3dc' }}>
        <button disabled={step === 0} onClick={() => setStep(step - 1)} style={{ ...cta, background: 'transparent', color: step === 0 ? '#bbb' : '#1c1c1c', border: '1px solid #ccc' }}>← Tillbaka</button>
        {step < 5 && <button disabled={!canNext} onClick={() => setStep(step + 1)} style={{ ...cta, opacity: canNext ? 1 : 0.4 }}>Nästa →</button>}
      </footer>
    </div>
  )
}
const h1: React.CSSProperties = { fontSize: 30, margin: '0 0 8px', fontWeight: 800 }
const sub: React.CSSProperties = { color: '#666', margin: '0 0 18px' }
const cta: React.CSSProperties = { background: '#1c1c1c', color: '#fff', border: 0, borderRadius: 10, padding: '12px 20px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }
