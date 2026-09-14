// PROTOTYPE — throwaway. Variant A: the colour is in the list.
//
// Colour is chosen in the same grasp as the symbol. Typing `{` in a cell opens the library where
// the cursor stands, as it does today, and the list now carries a row of inks across the top:
// the arrow keys walk the symbols, the number keys pick the ink, and Enter writes both. The claim
// is that a symbol's colour is part of what the designer means by it — a red sword is not a sword
// that was later painted — so the colour belongs at the moment of choosing and nowhere else.
//
// It writes `{svärd:rost}`, naming the ink rather than the hex, so a deck can repaint its inks
// without touching forty cells.
import { useRef, useState } from 'react'
import { INKS, SYMBOLS, CARD_BG, contrast } from './symbols-proto.js'
import { CardFace, Sym } from './symbol-shared.js'

const inkOf = (name: string | null): string => INKS.find((i) => i.name === name)?.hex ?? '#1c1c1c'

export function SymbolA() {
  const [text, setText] = useState('Betala {mynt:guld} {mynt:guld} och kasta en {tarning:natt}.\nSkada {svard:rost} 2 mot allt i zonen.')
  const [openAt, setOpenAt] = useState<number | null>(null)
  const [at, setAt] = useState(0)
  const [ink, setInk] = useState(0)
  const field = useRef<HTMLTextAreaElement>(null)
  const write = (i: number, k: number) => {
    const symbol = SYMBOLS[i]
    const chosen = INKS[k]
    if (!symbol || chosen === undefined || openAt === null) return
    const next = `${text.slice(0, openAt)}{${symbol.id}:${chosen.name}}${text.slice(openAt + 1)}`
    setText(next)
    setOpenAt(null)
    field.current?.focus()
  }
  return (
    <div className="byd-proto-sym-a">
      <section className="byd-proto-cell">
        <h2>Tabellen — cellen <code>text</code> på kortet Drake</h2>
        <div className="byd-proto-cellbox">
          <textarea
            ref={field}
            value={text}
            rows={5}
            aria-label="Korttext"
            onChange={(e) => {
              const caret = e.target.selectionStart
              const typedBrace = e.target.value.length === text.length + 1 && e.target.value[caret - 1] === '{'
              setText(e.target.value)
              setOpenAt(typedBrace ? caret - 1 : null)
              if (typedBrace) {
                setAt(0)
                setInk(0)
              }
            }}
            onKeyDown={(e) => {
              if (openAt === null) return
              if (e.key === 'ArrowDown') (e.preventDefault(), setAt((n) => Math.min(SYMBOLS.length - 1, n + 1)))
              if (e.key === 'ArrowUp') (e.preventDefault(), setAt((n) => Math.max(0, n - 1)))
              if (e.key === 'ArrowRight') (e.preventDefault(), setInk((n) => (n + 1) % INKS.length))
              if (e.key === 'ArrowLeft') (e.preventDefault(), setInk((n) => (n - 1 + INKS.length) % INKS.length))
              if (/^[1-8]$/.test(e.key)) (e.preventDefault(), setInk(Number(e.key) - 1))
              if (e.key === 'Enter') (e.preventDefault(), write(at, ink))
              if (e.key === 'Escape') setOpenAt(null)
            }}
          />
          {openAt !== null && (
            <div className="byd-proto-list" role="listbox" aria-label="Symboler">
              <div className="byd-proto-inks" role="group" aria-label="Färg">
                {INKS.map((i, k) => (
                  <button key={i.hex} type="button" aria-pressed={k === ink} onMouseDown={(e) => e.preventDefault()} onClick={() => setInk(k)} title={`${i.name} — ${k + 1}`}>
                    <span style={{ background: i.hex }} />
                    <em>{k + 1}</em>
                  </button>
                ))}
                <span className="byd-proto-inkname">{INKS[ink]?.name}</span>
              </div>
              {SYMBOLS.map((s, i) => (
                <button key={s.id} type="button" role="option" aria-selected={i === at} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => write(i, ink)}>
                  <span className="byd-proto-chipswatch">
                    <Sym id={s.id} ink={INKS[ink]?.hex ?? '#1c1c1c'} size="20px" />
                  </span>
                  <span>{s.name}</span>
                  <small>{`{${s.id}:${INKS[ink]?.name}}`}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="byd-proto-hint">Skriv <kbd>{'{'}</kbd> i texten. Piltangenterna upp och ner går i symbolerna, höger och vänster i färgerna, siffrorna 1–8 tar en färg direkt.</p>
      </section>

      <aside className="byd-proto-preview">
        <h2>Kortet</h2>
        <CardFace title="Drake" text={text} ink={(_, arg) => inkOf(arg)} />
        <h3>Ikonraden</h3>
        <div className="byd-proto-iconrow" style={{ background: CARD_BG }}>
          <Sym id="svard" ink={inkOf('rost')} size="22px" />
          <Sym id="skold" ink={inkOf('djup')} size="22px" />
          <Sym id="hjarta" ink={inkOf('rost')} size="22px" />
        </div>
        <p className="byd-proto-hint">Raden läser en kolumn där namnen står utan klamrar, så färgen skrivs som <code>svard:rost skold:djup</code>.</p>
        <table className="byd-proto-contrast">
          <caption>Mot kortets botten</caption>
          <tbody>
            {INKS.map((i) => (
              <tr key={i.hex} data-fail={contrast(i.hex, CARD_BG) < 3}>
                <td>
                  <span style={{ background: i.hex }} /> {i.name}
                </td>
                <td>{contrast(i.hex, CARD_BG).toFixed(1)}:1</td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
    </div>
  )
}
