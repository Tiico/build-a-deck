// PROTOTYPE — throwaway. Variant A: the workshop.
//
// One picture at a time, opened from the deck's image tray onto a surface of its own. The file is
// shown whole and dimmed; the window is the lit rectangle over it, dragged and scaled directly.
// The deck stands under it as a strip of already-framed cards, because the judgement is never
// "is this picture framed well" but "is it framed like the others" — so the others have to be in
// the same eyeful. A ghost of the neighbouring card can be laid over the window for the one
// question a strip cannot answer: does the drawing stand at the same height.
import { useRef, useState } from 'react'
import { DECK, ratio, type Piece } from './deck.js'
import { DEFAULT_RULE, NO_NUDGE, airOf, drawnAt, laidOut, short, windowFor, type Nudge, type Rule } from './framing.js'

export function BildA() {
  const [rule, setRule] = useState<Rule>(DEFAULT_RULE)
  const [nudges, setNudges] = useState<Record<string, Nudge>>({})
  const [openId, setOpenId] = useState(DECK[0]?.id ?? '')
  const [ghost, setGhost] = useState(true)
  const open = DECK.find((p) => p.id === openId) ?? DECK[0]
  if (!open) return null
  const nudge = nudges[open.id] ?? NO_NUDGE
  const set = (next: Nudge) => setNudges((n) => ({ ...n, [open.id]: next }))
  const win = windowFor(open, rule, nudge)
  const neighbour = DECK[(DECK.findIndex((p) => p.id === open.id) + 1) % DECK.length]

  return (
    <div className="byd-proto-a">
      <section className="byd-proto-a-source">
        <h2>
          Källa — <strong>{open.card}</strong> <small>{`${open.w}×${open.h} px · ${Math.round(airOf(open) * 100)} % luft`}</small>
        </h2>
        <SourceCanvas piece={open} rule={rule} nudge={nudge} onNudge={set} ghost={ghost ? neighbour : undefined} />
        <div className="byd-proto-a-tools">
          <label>
            Storlek
            <input type="range" min={0.6} max={2} step={0.01} value={nudge.zoom} onChange={(e) => set({ ...nudge, zoom: Number(e.target.value) })} />
          </label>
          <label className="byd-proto-tick">
            <input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} /> Lägg grannkortet över
          </label>
          <button type="button" onClick={() => set(NO_NUDGE)} disabled={nudge === NO_NUDGE}>
            Tillbaka till lekens mått
          </button>
        </div>
        {short(open, win) && <p className="byd-proto-warn">Fönstret når utanför filen — bilden är inte ritad så långt ut.</p>}
      </section>

      <aside className="byd-proto-a-rule">
        <h2>Lekens mått</h2>
        <p className="byd-proto-hint">Gäller alla {DECK.length} bilderna. Det är det här som gör filerna enhetliga; fönstret ovan är bara den här bildens avvikelse från det.</p>
        <label>
          Motivets höjd <output>{Math.round(rule.fill * 100)} %</output>
          <input type="range" min={0.4} max={1} step={0.01} value={rule.fill} onChange={(e) => setRule({ ...rule, fill: Number(e.target.value) })} />
        </label>
        <div className="byd-proto-seg" role="group" aria-label="Motivet sitter">
          {(['mitt', 'fot'] as const).map((a) => (
            <button key={a} type="button" className="byd-choice" aria-pressed={rule.anchor === a} onClick={() => setRule({ ...rule, anchor: a })}>
              {a === 'mitt' ? 'Centrerat' : 'På en gemensam marklinje'}
            </button>
          ))}
        </div>
        <h3>Kortet</h3>
        <Card piece={open} rule={rule} nudge={nudge} width={150} />
      </aside>

      <footer className="byd-proto-a-strip">
        <h2>Leken</h2>
        <ul>
          {DECK.map((p) => {
            const n = nudges[p.id] ?? NO_NUDGE
            return (
              <li key={p.id}>
                <button type="button" aria-current={p.id === open.id} onClick={() => setOpenId(p.id)}>
                  <Card piece={p} rule={rule} nudge={n} width={92} />
                  <span>{p.card}</span>
                  {n !== NO_NUDGE && <em title="Justerad för hand">•</em>}
                </button>
              </li>
            )
          })}
        </ul>
      </footer>
    </div>
  )
}

// The file, whole, with the window lit over it. The drag is on the window rather than on the
// picture, because what the designer is placing is the window: the file never moves.
function SourceCanvas({ piece, rule, nudge, onNudge, ghost }: { piece: Piece; rule: Rule; nudge: Nudge; onNudge(n: Nudge): void; ghost?: Piece | undefined }) {
  const box = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const win = windowFor(piece, rule, nudge)
  // The file drawn to fit the surface; everything below is in those same screen pixels.
  const view = 420
  const scale = Math.min(view / piece.w, view / piece.h)
  const fw = piece.w * scale
  const fh = piece.h * scale
  const move = (e: React.PointerEvent) => {
    if (!dragging) return
    onNudge({ ...nudge, dx: nudge.dx + e.movementX / scale / win.w, dy: nudge.dy + e.movementY / scale / win.h })
  }
  return (
    <div className="byd-proto-a-canvas" ref={box} style={{ width: fw, height: fh }}>
      <img src={piece.src} alt="" style={{ width: fw, height: fh }} />
      <div className="byd-proto-a-veil" style={{ left: win.x * scale, top: win.y * scale, width: win.w * scale, height: win.h * scale }} />
      <div
        className="byd-proto-a-win"
        style={{ left: win.x * scale, top: win.y * scale, width: win.w * scale, height: win.h * scale }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
        }}
        onPointerMove={move}
        onPointerUp={() => setDragging(false)}
        role="application"
        aria-label="Fönstret ur filen"
      >
        {ghost && (
          <img
            className="byd-proto-a-ghost"
            src={ghost.src}
            alt=""
            style={(() => {
              const gw = windowFor(ghost, rule, NO_NUDGE)
              const l = laidOut(ghost, gw, win.w * scale)
              return { width: l.width, left: l.left, top: l.top }
            })()}
          />
        )}
      </div>
    </div>
  )
}

// The picture as the card shows it: the window, nothing else. Every surface in every variant
// draws a card through this, so a thumbnail can never crop differently from the workspace.
export function Card({ piece, rule, nudge, width }: { piece: Piece; rule: Rule; nudge: Nudge; width: number }) {
  const win = windowFor(piece, rule, nudge)
  const l = laidOut(piece, win, width)
  return (
    <div className="byd-proto-card" style={{ width, height: width / ratio }} data-drawn={Math.round(drawnAt(piece, win) * 100)}>
      <img src={piece.src} alt="" style={{ width: l.width, left: l.left, top: l.top }} />
    </div>
  )
}
