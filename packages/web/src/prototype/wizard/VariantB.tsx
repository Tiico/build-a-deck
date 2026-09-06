// PROTOTYPE — Variant B: "Allt på en sida, levande kort". A single form; the card on the right
// takes shape as you fill in: frame, fields, the first row. No steps, just a page.
import { useState } from 'react'
import { CardPreview } from '../../editor/CardPreview.js'
import { FRAMES, initial, type WizardState } from './data.js'
import { DataStep, FieldList, FrameGallery, sampleRow } from './shared.js'

export function VariantB() {
  const [s, setS] = useState<WizardState>(initial)
  const frame = FRAMES.find((f) => f.id === s.frame)!
  const done = s.name.trim().length > 0 && s.rows.length > 0
  const inp: React.CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', fontSize: 16, width: '100%', boxSizing: 'border-box' }
  return (
    <div style={{ minHeight: '100vh', background: '#f6f5f1', color: '#1c1c1c', fontFamily: 'system-ui', display: 'grid', gridTemplateColumns: '1fr 420px' }}>
      <main style={{ padding: '40px 48px', display: 'grid', gap: 28, alignContent: 'start', maxWidth: 760 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Nytt spel</h1>
        <section><Label n={1}>Namn</Label><input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Skogens herrar" style={inp} /></section>
        <section><Label n={2}>Spelare</Label><div style={{ display: 'flex', gap: 8 }}>{[1, 2, 3, 4, 5, 6].map((n) => <button key={n} onClick={() => setS({ ...s, players: n })} style={{ width: 44, height: 44, borderRadius: 10, border: s.players === n ? '3px solid #3c8ce7' : '1px solid #ccc', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>{n}</button>)}</div></section>
        <section><Label n={3}>Fält på kortet</Label><FieldList fields={s.fields} onChange={(fields) => setS({ ...s, fields })} /></section>
        <section><Label n={4}>Ram</Label><FrameGallery state={s} onPick={(frame) => setS({ ...s, frame })} /></section>
        <section><Label n={5}>Kort</Label><DataStep state={s} onRows={(rows) => setS({ ...s, rows })} /></section>
        <section style={{ display: 'flex', gap: 10 }}>
          <button disabled={!done} style={{ background: done ? '#1c1c1c' : '#bbb', color: '#fff', border: 0, borderRadius: 10, padding: '12px 20px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Öppna bordet</button>
          <button disabled={!done} style={{ background: 'transparent', color: done ? '#1c1c1c' : '#bbb', border: '1px solid #ccc', borderRadius: 10, padding: '12px 20px', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>Till editorn</button>
        </section>
      </main>
      <aside style={{ background: '#e9e7e0', borderLeft: '1px solid #ddd', padding: 32, display: 'grid', alignContent: 'start', gap: 16, position: 'sticky', top: 0, height: '100vh', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.5, color: '#666' }}>{s.name || 'Ditt spel'} · {s.rows.length} kort · {s.players} spelare</div>
        <div style={{ display: 'grid', placeItems: 'center', padding: 12 }}>
          <CardPreview id="b-live" face={frame.face(s.fields)} row={s.rows[0] ?? sampleRow} icons={{}} scale={2} />
        </div>
        {s.rows.length > 1 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{s.rows.slice(1, 9).map((r, i) => <CardPreview key={i} id={`b-thumb-${i}`} face={frame.face(s.fields)} row={r} icons={{}} scale={0.35} />)}</div>}
      </aside>
    </div>
  )
}
function Label({ n, children }: { n: number; children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 8 }}><span style={{ width: 22, height: 22, borderRadius: 999, background: '#1c1c1c', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12 }}>{n}</span>{children}</div>
}
