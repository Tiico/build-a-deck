// PROTOTYPE — Variant A: "Bordet som platsväljare". A small table seen from above with the seats
// around it; tap a free one, give your name, sit. Taken seats show who is there.
import { useState } from 'react'
import { COLORS, GAME, SEATS } from './data.js'

export function VariantA() {
  const [pick, setPick] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [done, setDone] = useState(false)
  const pos: Record<string, React.CSSProperties> = {
    N: { top: -26, left: '50%', transform: 'translateX(-50%)' },
    S: { bottom: -26, left: '50%', transform: 'translateX(-50%)' },
    E: { right: -30, top: '50%', transform: 'translateY(-50%)' },
    W: { left: -30, top: '50%', transform: 'translateY(-50%)' },
  }
  if (done) return <Done name={name} seat={pick!} />
  return (
    <div style={{ minHeight: '100vh', background: '#14161c', color: '#eee', fontFamily: 'system-ui', display: 'grid', gridTemplateRows: 'auto 1fr auto', padding: '64px 20px 28px', boxSizing: 'border-box' }}>
      <div>
        <div style={{ fontSize: 13, color: '#9aa3b8' }}>Du är på väg in i</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{GAME.name} <span style={{ color: '#7d8597', fontWeight: 400 }}>{GAME.version}</span></div>
        <div style={{ fontSize: 13, color: '#9aa3b8', marginTop: 14 }}>{pick ? `Plats ${pick} vald` : 'Tryck på en ledig plats'}</div>
      </div>
      <div style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ position: 'relative', width: 220, height: 150, borderRadius: 16, background: 'radial-gradient(ellipse at 50% 40%, #2e6b46, #1f4a30 70%, #173a26)', boxShadow: 'inset 0 0 30px rgba(0,0,0,.45), 0 0 0 10px #4a2f1c' }}>
          {SEATS.map((s, i) => (
            <button
              key={s.id}
              disabled={s.name !== null}
              onClick={() => setPick(s.id)}
              style={{ position: 'absolute', ...pos[s.edge], padding: '8px 14px', borderRadius: 999, border: pick === s.id ? '3px solid #fff' : '3px solid transparent', background: s.name ? '#2a2e3a' : COLORS[i], color: s.name ? '#9aa3b8' : '#fff', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', minWidth: 60 }}
            >
              {s.name ?? 'ledig'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ditt namn" style={{ padding: '16px', borderRadius: 12, border: '1px solid #2c3242', background: '#1b1e27', color: '#fff', fontSize: 18 }} />
        <button disabled={!pick || !name} onClick={() => setDone(true)} style={{ padding: '18px', borderRadius: 12, border: 0, background: pick && name ? '#7dd3a0' : '#242938', color: pick && name ? '#0d0f14' : '#5b6478', fontSize: 18, fontWeight: 800 }}>Sätt dig</button>
      </div>
    </div>
  )
}

export function Done({ name, seat }: { name: string; seat: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#14161c', color: '#eee', fontFamily: 'system-ui', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 40 }}>🪑</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>{name} sitter på plats {seat}</div>
        <div style={{ fontSize: 13, color: '#9aa3b8', marginTop: 6 }}>→ /play öppnas</div>
      </div>
    </div>
  )
}
