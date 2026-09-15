import { useEffect, useState } from 'react'
import './prototype.css'

// Throwaway comparisons on the existing routes. No server writes; discard after a design choice.
export function usePrototypeVariant() {
  const [variant, setVariant] = useState(() => new URLSearchParams(location.search).get('variant') ?? 'A')
  const choose = (value: string) => {
    const next = new URL(location.href)
    next.searchParams.set('variant', value)
    history.replaceState(null, '', next)
    setVariant(value)
  }
  return [variant, choose] as const
}
export function PrototypeSwitcher({ variant, names, choose, reset }: { variant: string; names: string[]; choose(value: string): void; reset(): void }) {
  const keys = ['A', 'B', 'C']
  const index = Math.max(0, keys.indexOf(variant))
  const cycle = (delta: number) => choose(keys[(index + delta + keys.length) % keys.length]!)
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable], [role="slider"], [role="tablist"], [role="dialog"]')) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      cycle(event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [variant])
  if (!import.meta.env.DEV) return null
  const original = new URL(location.href)
  original.searchParams.delete('variant')
  return <nav className="ux-switch" aria-label="Prototypvarianter">
    <button aria-label="Föregående variant" onClick={() => cycle(-1)}>←</button>
    <span><small>PROTOTYP · SPARAR INGENTING</small><strong>{keys[index]} — {names[index]}</strong></span>
    <button aria-label="Nästa variant" onClick={() => cycle(1)}>→</button>
    <button onClick={reset}>Återställ</button><a href={original.href}>Original</a>
  </nav>
}
