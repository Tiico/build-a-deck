// PROTOTYPE — throwaway. Two questions, six answers; delete the five that lose.
//
//   /prototyp?yta=bild&variant=A      What should opening a picture's source and framing it look
//                                     like, when the point is that a deck's differing files end
//                                     up framed alike?
//   /prototyp?yta=symbol&variant=A    What should choosing a symbol's colour look like, when the
//                                     colour belongs to the one place the symbol is used?
//
// The variants are mounted inside the editor's own chrome — its header, its tabs, its tokens —
// because every one of them looks fine in a vacuum and the question is which one survives the
// density of the real thing.
import { useEffect, useState, type ReactElement } from 'react'
import { BildA } from './BildA.js'
import { BildB } from './BildB.js'
import { BildC } from './BildC.js'
import { SymbolA } from './SymbolA.js'
import { SymbolB } from './SymbolB.js'
import { SymbolC } from './SymbolC.js'
import '../editor/editor.css'
import './prototype.css'

type Surface = 'bild' | 'symbol'
type Entry = { key: string; name: string; view: () => ReactElement }

const SURFACES: Record<Surface, { tab: string; entries: Entry[] }> = {
  bild: {
    tab: 'Bilder',
    entries: [
      { key: 'A', name: 'Ramverkstaden — en bild i taget, leken som facit', view: () => <BildA /> },
      { key: 'B', name: 'Rutnätet — hela leken på en gång, ingen lucka', view: () => <BildB /> },
      { key: 'C', name: 'Måttet — en regel för leken, en lista över avvikarna', view: () => <BildC /> },
    ],
  },
  symbol: {
    tab: 'Symboler',
    entries: [
      { key: 'A', name: 'Färgen i listan — färg och symbol väljs i ett grepp', view: () => <SymbolA /> },
      { key: 'B', name: 'Chippet i cellen — det skrivna klickas och färgas om', view: () => <SymbolB /> },
      { key: 'C', name: 'Rollpaletten — spelet namnger sina färger, bruket väljer roll', view: () => <SymbolC /> },
    ],
  },
}

const paramsNow = () => new URLSearchParams(location.search)

export function PrototypePage() {
  const [search, setSearch] = useState(() => location.search)
  const params = new URLSearchParams(search)
  const surface: Surface = params.get('yta') === 'symbol' ? 'symbol' : 'bild'
  const { entries } = SURFACES[surface]
  const at = Math.max(
    0,
    entries.findIndex((e) => e.key === (params.get('variant') ?? 'A')),
  )
  const go = (nextSurface: Surface, key: string) => {
    const next = paramsNow()
    next.set('yta', nextSurface)
    next.set('variant', key)
    history.replaceState(null, '', `${location.pathname}?${next.toString()}`)
    setSearch(`?${next.toString()}`)
  }
  const step = (delta: number) => {
    const entry = entries[(at + delta + entries.length) % entries.length]
    if (entry) go(surface, entry.key)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return
      if (e.key === 'ArrowLeft') step(-1)
      if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const current = entries[at]
  return (
    <div className="byd-editor byd-proto">
      <header>
        <span className="byd-editor-home">Skogens herrar</span>
        <nav role="tablist" aria-label="Lägen">
          {(['bild', 'symbol'] as Surface[]).map((s) => (
            <button key={s} className="byd-choice" role="tab" type="button" aria-selected={surface === s} onClick={() => go(s, 'A')}>
              {SURFACES[s].tab}
            </button>
          ))}
        </nav>
        <span className="byd-editor-saved">prototyp — inget sparas</span>
      </header>
      <main className="byd-proto-stage">{current?.view()}</main>
      <div className="byd-proto-bar" role="group" aria-label="Variant">
        <button type="button" onClick={() => step(-1)} aria-label="Föregående variant">
          ←
        </button>
        <span>
          <strong>{current?.key}</strong> {current?.name}
        </span>
        <button type="button" onClick={() => step(1)} aria-label="Nästa variant">
          →
        </button>
      </div>
    </div>
  )
}
