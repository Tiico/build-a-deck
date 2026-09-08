// PROTOTYPE — the floating variant switcher. Hidden in production builds.
// The house switcher, kept slim enough to sit at the foot of a 390 px phone without covering
// the surface it is switching between.
import { useEffect } from 'react'

export type Variant = { key: string; name: string }

export function Switcher({ variants, current, onChange }: { variants: Variant[]; current: string; onChange(key: string): void }) {
  if (new URLSearchParams(location.search).has('bare')) return null
  const idx = Math.max(0, variants.findIndex((v) => v.key === current))
  const go = (d: number) => onChange(variants[(idx + d + variants.length) % variants.length]!.key)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      // The variants themselves live on the arrow keys, so switching between them is a chord.
      if (!e.altKey) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (import.meta.env.PROD) return null
  const v = variants[idx]!
  return (
    <div
      style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '4px 8px',
        background: '#111', color: '#fff', fontSize: 11, lineHeight: 1.3,
        fontFamily: 'ui-monospace, monospace', borderTop: '1px solid #333',
      }}
    >
      <button onClick={() => go(-1)} style={btn} aria-label="Föregående variant">←</button>
      <span>PROTOTYP · {v.key} — {v.name}</span>
      <button onClick={() => go(1)} style={btn} aria-label="Nästa variant">→</button>
    </div>
  )
}
const btn: React.CSSProperties = { background: '#333', color: '#fff', border: 0, borderRadius: 999, width: 24, height: 24, cursor: 'pointer', flex: '0 0 auto' }
