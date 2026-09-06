// PROTOTYPE — Variant C: "Bara namnet". One field, one button; the next free seat is yours.
import { useState } from 'react'
import { GAME, SEATS } from './data.js'
import { Done } from './VariantA.js'

export function VariantC() {
  const [name, setName] = useState('')
  const [done, setDone] = useState(false)
  const next = SEATS.find((s) => s.name === null)!
  const taken = SEATS.filter((s) => s.name !== null).map((s) => s.name)
  if (done) return <Done name={name} seat={next.id} />
  return (
    <div style={{ minHeight: '100vh', background: '#0d0f14', color: '#eee', fontFamily: 'system-ui', display: 'grid', alignContent: 'center', padding: '20px', boxSizing: 'border-box', gap: 14 }}>
      <div style={{ fontSize: 13, color: '#7d8597' }}>{GAME.name} · vid bordet: {taken.join(', ')}</div>
      <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>Vad heter du?</div>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} style={{ padding: '18px', borderRadius: 14, border: '1px solid #2c3242', background: '#1b1e27', color: '#fff', fontSize: 22 }} />
      <button disabled={!name} onClick={() => setDone(true)} style={{ padding: '20px', borderRadius: 14, border: 0, background: name ? '#7dd3a0' : '#242938', color: name ? '#0d0f14' : '#5b6478', fontSize: 20, fontWeight: 800 }}>Sätt dig</button>
      <div style={{ fontSize: 12, color: '#5b6478', textAlign: 'center' }}>Du får plats {next.id} · går att byta vid bordet</div>
    </div>
  )
}
