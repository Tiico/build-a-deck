// PROTOTYPE — throwaway. Variant B: the chip in the cell.
//
// Writing stays exactly what it is today — `{svärd}`, no colour, nothing new to learn — and what
// is written is drawn in the cell as a chip rather than as four characters of text. A chip is
// clicked and painted. The claim is the opposite of A's: colour is an afterthought, arrived at
// once the card reads right, and forcing a decision at the moment of writing puts a colour picker
// in the way of writing a sentence.
//
// The cost is that the cell is no longer a plain text box, which is a real thing to weigh: a
// designer who selects a line and retypes it has to get back exactly the text they had.
import { useState } from 'react'
import { INKS, CARD_BG, contrast, byId } from './symbols-proto.js'
import { Sym, tokensOf } from './symbol-shared.js'

export function SymbolB() {
  const [text, setText] = useState('Betala {mynt} {mynt} och kasta en {tarning}.\nSkada {svard} 2 mot allt i zonen.')
  // Colour lives on the use, not on the name: the second {mynt} is a different use and can be a
  // different colour, which is what "per use" has to mean if it means anything.
  const [inks, setInks] = useState<Record<number, string>>({})
  const [openAt, setOpenAt] = useState<number | null>(null)
  // Where the chip that opened the popover sits, so the popover hangs off it rather than off the
  // bottom of the column.
  const [anchor, setAnchor] = useState({ left: 0, top: 0 })
  const [raw, setRaw] = useState(false)
  const tokens = tokensOf(text)
  const inkAt = (at: number) => inks[at] ?? '#1c1c1c'
  return (
    <div className="byd-proto-sym-b">
      <section className="byd-proto-cell">
        <h2>Tabellen — cellen <code>text</code> på kortet Drake</h2>
        {raw ? (
          <textarea value={text} rows={5} aria-label="Korttext som text" onChange={(e) => setText(e.target.value)} />
        ) : (
          <div className="byd-proto-chipbox" aria-label="Korttext">
            <Rendered text={text} tokens={tokens} inkAt={inkAt} openAt={openAt} onOpen={setOpenAt} onAnchor={setAnchor} />
            {openAt !== null && (
              <div className="byd-proto-pop" role="dialog" aria-label="Färg" style={{ left: anchor.left, top: anchor.top }}>
                <header>
                  <span className="byd-proto-chipswatch">
                    <Sym id={tokens.find((t) => t.at === openAt)?.name ?? ''} ink={inkAt(openAt)} size="20px" />
                  </span>
                  <span>{byId(tokens.find((t) => t.at === openAt)?.name ?? '')?.name}</span>
                  <button type="button" onClick={() => setOpenAt(null)} aria-label="Stäng">
                    ×
                  </button>
                </header>
                <div className="byd-proto-inks">
                  {INKS.map((i) => (
                    <button key={i.hex} type="button" aria-pressed={inkAt(openAt) === i.hex} onClick={() => setInks((all) => ({ ...all, [openAt]: i.hex }))} title={i.name}>
                      <span style={{ background: i.hex }} />
                    </button>
                  ))}
                </div>
                <p>
                  {contrast(inkAt(openAt), CARD_BG).toFixed(1)}:1 mot kortets botten
                  {contrast(inkAt(openAt), CARD_BG) < 3 && <strong> — för svagt, kravet är 3:1</strong>}
                </p>
                <button type="button" onClick={() => setInks((all) => ({ ...all, [openAt]: '#1c1c1c' }))}>
                  Tillbaka till bläck
                </button>
              </div>
            )}
          </div>
        )}
        <label className="byd-proto-tick">
          <input type="checkbox" checked={raw} onChange={(e) => (setRaw(e.target.checked), setOpenAt(null))} /> Visa cellen som ren text
        </label>
        <p className="byd-proto-hint">Skrivandet är oförändrat: <code>{'{svard}'}</code> som förut. Klicka på ett chip för att måla det. Färgen sitter på just det bruket — de två mynten kan vara olika.</p>
      </section>

      <aside className="byd-proto-preview">
        <h2>Kortet</h2>
        <div className="byd-proto-face" style={{ background: CARD_BG }}>
          <h3>Drake</h3>
          <p>
            <Rendered text={text} tokens={tokens} inkAt={inkAt} openAt={null} onOpen={() => {}} flat />
          </p>
        </div>
        <h3>Vad som lagras</h3>
        <pre className="byd-proto-code">{JSON.stringify({ text, färger: Object.fromEntries(Object.entries(inks).map(([k, v]) => [`tecken ${k}`, v])) }, null, 1)}</pre>
      </aside>
    </div>
  )
}

function Rendered({ text, tokens, inkAt, openAt, onOpen, onAnchor, flat = false }: { text: string; tokens: ReturnType<typeof tokensOf>; inkAt(at: number): string; openAt: number | null; onOpen(at: number | null): void; onAnchor?: (a: { left: number; top: number }) => void; flat?: boolean }) {
  const out: React.ReactNode[] = []
  let cursor = 0
  for (const tk of tokens) {
    if (tk.at > cursor) out.push(<span key={`t${cursor}`}>{text.slice(cursor, tk.at)}</span>)
    const sym = <Sym id={tk.name} ink={inkAt(tk.at)} />
    out.push(
      flat ? (
        <span key={tk.at}>{sym}</span>
      ) : (
        <button key={tk.at} type="button" className="byd-proto-chip" aria-pressed={openAt === tk.at} onClick={(e) => {
            onAnchor?.({ left: e.currentTarget.offsetLeft, top: e.currentTarget.offsetTop + e.currentTarget.offsetHeight + 6 })
            onOpen(openAt === tk.at ? null : tk.at)
          }}
          aria-label={`Färga ${tk.name}`}
        >
          {sym}
        </button>
      ),
    )
    cursor = tk.end
  }
  out.push(<span key="tail">{text.slice(cursor)}</span>)
  return <>{out}</>
}
