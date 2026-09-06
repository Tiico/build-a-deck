// PROTOTYPE — Variant B: "Listan". Name on top, seats as a list with status and big buttons.
import { useState } from 'react'
import { COLORS, GAME, SEATS } from './data.js'
import { Done } from './VariantA.js'

export function VariantB() {
  const [name, setName] = useState('')
  const [done, setDone] = useState<string | null>(null)
  if (done) return <Done name={name} seat={done} />
  return (
    <div style={{ minHeight: '100vh', background: '#f2f0ea', color: '#1c1c1c', fontFamily: 'system-ui', padding: '64px 20px 28px', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 13, color: '#666' }}>Rum {GAME.code}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{GAME.name}</div>
      <label style={{ display: 'block', marginTop: 22, fontSize: 13, color: '#666' }}>Ditt namn</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="t.ex. Bo" style={{ width: '100%', boxSizing: 'border-box', padding: '16px', borderRadius: 12, border: '1px solid #ccc', background: '#fff', fontSize: 18, marginTop: 6 }} />
      <div style={{ marginTop: 26, fontSize: 13, color: '#666' }}>Välj plats</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        {SEATS.map((s, i) => (
          <button key={s.id} disabled={s.name !== null || !name} onClick={() => setDone(s.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 16px', borderRadius: 12, border: '1px solid #ddd', background: s.name ? '#e9e7e0' : '#fff', borderLeft: `8px solid ${COLORS[i]}`, fontSize: 17, fontWeight: 700, color: s.name ? '#999' : '#1c1c1c', textAlign: 'left' }}>
            <span>Plats {s.id}</span>
            <span style={{ fontWeight: 400, fontSize: 14 }}>{s.name ? `${s.name} sitter här` : name ? 'Sätt dig här →' : 'ledig'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
