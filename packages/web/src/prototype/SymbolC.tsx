// PROTOTYPE — throwaway. Variant C: the game's roles.
//
// The deck does not get a colour wheel. It names what its colours mean — fara, kostnad, vinst —
// and a use picks a meaning: `{svärd|fara}`. The colour behind a role is set once, in the game's
// own palette, and changing it repaints every card at once.
//
// This is the variant that takes E5 seriously. A free colour per use is forty chances to write an
// unreadable card and forty chances to say the same thing in two different reds; a role is one
// place to check contrast, one place to check that two roles do not collapse under deuteranopia,
// and one place to fix both. The price is that a designer who just wants a blue sword has to
// name why it is blue.
import { useState } from 'react'
import { INKS, SYMBOLS, CARD_BG, contrast } from './symbols-proto.js'
import { CardFace, Sym } from './symbol-shared.js'

type Role = { id: string; hex: string }
const START: Role[] = [
  { id: 'fara', hex: '#8f2d20' },
  { id: 'kostnad', hex: '#7a5c00' },
  { id: 'vinst', hex: '#2f6136' },
  { id: 'neutral', hex: '#1c1c1c' },
]

// Two roles that read as one colour to a colour-blind reader are two roles that say nothing (E5).
// The simulation is the green-blind matrix the checks already use, applied to the pair.
const deuter = (hex: string): [number, number, number] => {
  const n = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as [number, number, number]
  return [0.625 * r + 0.375 * g, 0.7 * r + 0.3 * g, 0.3 * g + 0.7 * b]
}
const apart = (a: string, b: string): number => {
  const [x, y] = [deuter(a), deuter(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

export function SymbolC() {
  const [roles, setRoles] = useState<Role[]>(START)
  const [text, setText] = useState('Betala {mynt|kostnad} {mynt|kostnad} och kasta en {tarning|neutral}.\nSkada {svard|fara} 2, dra sedan {droppe|vinst} 1.')
  const [openAt, setOpenAt] = useState<number | null>(null)
  const [at, setAt] = useState(0)
  const [role, setRole] = useState(0)
  const hexOf = (id: string | null) => roles.find((r) => r.id === id)?.hex ?? '#1c1c1c'
  const collisions = roles.flatMap((a, i) => roles.slice(i + 1).filter((b) => apart(a.hex, b.hex) < 40).map((b) => [a, b] as const))
  return (
    <div className="byd-proto-sym-c">
      <aside className="byd-proto-c-rule">
        <h2>Spelets färger</h2>
        <p className="byd-proto-hint">Fyra betydelser, fyra färger. Ändra en här och varje kort som säger den betydelsen målas om.</p>
        <ul className="byd-proto-roles">
          {roles.map((r, i) => (
            <li key={r.id} data-fail={contrast(r.hex, CARD_BG) < 3}>
              <Sym id="svard" ink={r.hex} size="22px" />
              <input
                aria-label={`Namn på ${r.id}`}
                value={r.id}
                onChange={(e) => setRoles((all) => all.map((x, k) => (k === i ? { ...x, id: e.target.value } : x)))}
              />
              <div className="byd-proto-inks">
                {INKS.map((ink) => (
                  <button key={ink.hex} type="button" aria-pressed={r.hex === ink.hex} title={ink.name} onClick={() => setRoles((all) => all.map((x, k) => (k === i ? { ...x, hex: ink.hex } : x)))}>
                    <span style={{ background: ink.hex }} />
                  </button>
                ))}
              </div>
              <output>{contrast(r.hex, CARD_BG).toFixed(1)}:1</output>
            </li>
          ))}
        </ul>
        {collisions.length > 0 && (
          <p className="byd-proto-warn">
            {collisions.map(([a, b]) => `${a.id} och ${b.id}`).join('; ')} blir samma färg för en grönblind läsare.
          </p>
        )}
        {collisions.length === 0 && <p className="byd-proto-hint">Alla fyra går att skilja åt vid simulerad grönblindhet.</p>}
      </aside>

      <section className="byd-proto-cell">
        <h2>Tabellen — cellen <code>text</code> på kortet Drake</h2>
        <div className="byd-proto-cellbox">
          <textarea
            value={text}
            rows={5}
            aria-label="Korttext"
            onChange={(e) => {
              const caret = e.target.selectionStart
              const typedBrace = e.target.value.length === text.length + 1 && e.target.value[caret - 1] === '{'
              setText(e.target.value)
              setOpenAt(typedBrace ? caret - 1 : null)
            }}
            onKeyDown={(e) => {
              if (openAt === null) return
              if (e.key === 'ArrowDown') (e.preventDefault(), setAt((n) => Math.min(SYMBOLS.length - 1, n + 1)))
              if (e.key === 'ArrowUp') (e.preventDefault(), setAt((n) => Math.max(0, n - 1)))
              if (e.key === 'Tab') (e.preventDefault(), setRole((n) => (n + 1) % roles.length))
              if (e.key === 'Escape') setOpenAt(null)
              if (e.key === 'Enter') {
                e.preventDefault()
                const s = SYMBOLS[at]
                const r = roles[role]
                if (!s || !r) return
                setText(`${text.slice(0, openAt)}{${s.id}|${r.id}}${text.slice(openAt + 1)}`)
                setOpenAt(null)
              }
            }}
          />
          {openAt !== null && (
            <div className="byd-proto-list" role="listbox" aria-label="Symboler">
              <div className="byd-proto-rolestrip" role="group" aria-label="Betydelse">
                {roles.map((r, k) => (
                  <button key={r.id} type="button" aria-pressed={k === role} onMouseDown={(e) => e.preventDefault()} onClick={() => setRole(k)}>
                    <span style={{ background: r.hex }} />
                    {r.id}
                  </button>
                ))}
                <small>
                  <kbd>Tab</kbd> byter betydelse
                </small>
              </div>
              {SYMBOLS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={i === at}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const r = roles[role]
                    if (!r) return
                    setText(`${text.slice(0, openAt)}{${s.id}|${r.id}}${text.slice(openAt + 1)}`)
                    setOpenAt(null)
                  }}
                >
                  <Sym id={s.id} ink={roles[role]?.hex ?? '#1c1c1c'} size="20px" />
                  <span>{s.name}</span>
                  <small>{`{${s.id}|${roles[role]?.id}}`}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <h2>Kortet</h2>
        <CardFace title="Drake" text={text} ink={(_, arg) => hexOf(arg)} />
      </section>
    </div>
  )
}
