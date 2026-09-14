// PROTOTYPE — throwaway. Variant B: the grid.
//
// No workspace and no door to open: the deck itself is the editing surface. Every card is live,
// the drawing is dragged inside its own frame, and the source is opened in place by turning one
// tile over rather than by leaving for another screen. The argument is that uniformity is a thing
// you see rather than a thing you set — six cards side by side say more than any number — and
// that a picture is best placed against its neighbours, not against an empty canvas.
//
// The ruler across the grid is what a naked eye cannot do: one line at the drawings' common top
// and one at their foot, drawn straight through every card, so an outlier is a line that bends.
import { useState } from 'react'
import { DECK, ratio, type Piece } from './deck.js'
import { DEFAULT_RULE, NO_NUDGE, drawnAt, laidOut, short, windowFor, type Nudge, type Rule } from './framing.js'

export function BildB() {
  const [rule, setRule] = useState<Rule>(DEFAULT_RULE)
  const [nudges, setNudges] = useState<Record<string, Nudge>>({})
  const [ruler, setRuler] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const set = (id: string, next: Nudge) => setNudges((n) => ({ ...n, [id]: next }))
  const width = 190
  return (
    <div className="byd-proto-b">
      <header className="byd-proto-b-bar">
        <label>
          Motivets höjd <output>{Math.round(rule.fill * 100)} %</output>
          <input type="range" min={0.4} max={1} step={0.01} value={rule.fill} onChange={(e) => setRule({ ...rule, fill: Number(e.target.value) })} />
        </label>
        <div className="byd-proto-seg" role="group" aria-label="Motivet sitter">
          {(['mitt', 'fot'] as const).map((a) => (
            <button key={a} type="button" className="byd-choice" aria-pressed={rule.anchor === a} onClick={() => setRule({ ...rule, anchor: a })}>
              {a === 'mitt' ? 'Centrerat' : 'Marklinje'}
            </button>
          ))}
        </div>
        <label className="byd-proto-tick">
          <input type="checkbox" checked={ruler} onChange={(e) => setRuler(e.target.checked)} /> Linjal genom leken
        </label>
        <button type="button" onClick={() => setNudges({})} disabled={Object.keys(nudges).length === 0}>
          Släpp alla handgrepp ({Object.keys(nudges).length})
        </button>
      </header>
      <div className="byd-proto-b-grid" data-ruler={ruler}>
        {ruler && (
          <>
            <span className="byd-proto-b-line" style={{ top: `calc(var(--card-h) * ${(1 - rule.fill) / 2})` }} />
            <span className="byd-proto-b-line" style={{ top: `calc(var(--card-h) * ${1 - (1 - rule.fill) / 2})` }} />
          </>
        )}
        {DECK.map((p) => (
          <Tile
            key={p.id}
            piece={p}
            rule={rule}
            nudge={nudges[p.id] ?? NO_NUDGE}
            width={width}
            open={openId === p.id}
            onOpen={() => setOpenId(openId === p.id ? null : p.id)}
            onNudge={(n) => set(p.id, n)}
          />
        ))}
      </div>
    </div>
  )
}

function Tile({ piece, rule, nudge, width, open, onOpen, onNudge }: { piece: Piece; rule: Rule; nudge: Nudge; width: number; open: boolean; onOpen(): void; onNudge(n: Nudge): void }) {
  const [dragging, setDragging] = useState(false)
  const win = windowFor(piece, rule, nudge)
  const l = laidOut(piece, win, width)
  const scale = width / win.w
  // Turned over, the tile shows the file whole with the window lit on it — the source, opened
  // without leaving the deck. The frame keeps its place in the grid so nothing jumps.
  const fileScale = Math.min(width / piece.w, width / ratio / piece.h)
  return (
    <figure className="byd-proto-b-tile" data-open={open} data-touched={nudge !== NO_NUDGE}>
      <div
        className="byd-proto-card byd-proto-b-frame"
        style={{ width, height: width / ratio }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
        }}
        onPointerMove={(e) => dragging && onNudge({ ...nudge, dx: nudge.dx - e.movementX / scale / win.w, dy: nudge.dy - e.movementY / scale / win.h })}
        onPointerUp={() => setDragging(false)}
        role="application"
        aria-label={`Placera motivet på ${piece.card}`}
      >
        {open ? (
          <div className="byd-proto-b-source" style={{ width: piece.w * fileScale, height: piece.h * fileScale }}>
            <img src={piece.src} alt="" style={{ width: piece.w * fileScale, height: piece.h * fileScale }} />
            <span className="byd-proto-a-veil" style={{ left: win.x * fileScale, top: win.y * fileScale, width: win.w * fileScale, height: win.h * fileScale }} />
          </div>
        ) : (
          <img src={piece.src} alt="" style={{ width: l.width, left: l.left, top: l.top }} />
        )}
      </div>
      <figcaption>
        <span>{piece.card}</span>
        <output title="Så stort motivet ritas i ramen">{Math.round(drawnAt(piece, win) * 100)} %</output>
        <input aria-label={`Storlek på ${piece.card}`} type="range" min={0.6} max={2} step={0.01} value={nudge.zoom} onChange={(e) => onNudge({ ...nudge, zoom: Number(e.target.value) })} />
        <button type="button" aria-pressed={open} onClick={onOpen}>
          {open ? 'Stäng källan' : 'Öppna källan'}
        </button>
      </figcaption>
      {short(piece, win) && <p className="byd-proto-warn">Når utanför filen</p>}
    </figure>
  )
}
