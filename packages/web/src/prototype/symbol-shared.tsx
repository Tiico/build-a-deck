// PROTOTYPE — throwaway. The two pieces all three colour variants need, and nothing else: a
// symbol drawn in a colour, and a card that draws the text the cell holds. The layout around them
// is where the variants are allowed to disagree.
import { byId, maskUrl, CARD_BG } from './symbols-proto.js'

// A symbol as paint behind a shape. `mask` is what makes one asset serve every colour; the `-webkit-`
// twin is there because that is the spelling Chromium wants in print.
export function Sym({ id, ink, size = '1em' }: { id: string; ink: string; size?: string }) {
  const s = byId(id)
  if (!s) return <span className="byd-proto-sym-missing">{`{${id}}`}</span>
  const mask = maskUrl(s)
  return (
    <span
      className="byd-proto-sym"
      role="img"
      aria-label={s.name}
      style={{ width: size, height: size, background: ink, maskImage: mask, WebkitMaskImage: mask, maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }}
    />
  )
}

// One brace in a cell: the name, and whatever the variant lets be written after it.
export type Token = { name: string; arg: string | null; at: number; end: number }

export function tokensOf(text: string): Token[] {
  const out: Token[] = []
  const re = /\{([\p{L}\p{N}_-]+)(?:[:|]([^}]*))?\}/gu
  for (let m = re.exec(text); m; m = re.exec(text)) out.push({ name: m[1] ?? '', arg: m[2] ?? null, at: m.index, end: m.index + m[0].length })
  return out
}

// The card as the compiler would draw it: text with the symbols in it, on the deck's ground.
export function CardFace({ title, text, ink }: { title: string; text: string; ink(name: string, arg: string | null): string }) {
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const tk of tokensOf(text)) {
    if (tk.at > cursor) parts.push(text.slice(cursor, tk.at))
    parts.push(<Sym key={tk.at} id={tk.name} ink={ink(tk.name, tk.arg)} />)
    cursor = tk.end
  }
  parts.push(text.slice(cursor))
  return (
    <div className="byd-proto-face" style={{ background: CARD_BG }}>
      <h3>{title}</h3>
      <p>{parts}</p>
    </div>
  )
}
