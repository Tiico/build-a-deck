// PROTOTYPE — throwaway. Variant C: the measure.
//
// The deck's framing is a rule, written once, and the pictures obey it. Nobody frames forty
// pictures by hand; what a person actually does is state what the deck should look like and then
// deal with the handful of files that cannot answer — a drawing that reaches its own edge, a file
// with no air to spare, a photograph whose corners disagree so nothing was measured at all.
//
// So the surface is a rule and a list of objections. The deck is shown small and only as proof;
// the work is in the list, and the list is meant to empty. This is the shape that scales to a
// hundred cards, and the one that says plainly that framing is not a per-card decision.
import { useState } from 'react'
import { DECK, ratio, type Piece } from './deck.js'
import { DEFAULT_RULE, NO_NUDGE, airOf, drawnAt, laidOut, short, windowFor, type Nudge, type Rule } from './framing.js'

// What the rule cannot do to a given file, said in the words the designer would use.
type Objection = { piece: Piece; says: string; fix: string; to: Nudge }

function objectionsOf(rule: Rule, nudges: Record<string, Nudge>): Objection[] {
  const out: Objection[] = []
  for (const piece of DECK) {
    const nudge = nudges[piece.id] ?? NO_NUDGE
    const win = windowFor(piece, rule, nudge)
    if (short(piece, win)) {
      // The file has no material where the window reaches. Shrinking the window is the only
      // honest answer: the alternative is a silver edge on a printed card.
      const room = Math.min(piece.w / win.w, piece.h / win.h)
      out.push({ piece, says: 'Fönstret når utanför filen — här är ingenting ritat.', fix: `Krymp motivet till ${Math.round(rule.fill * room * 100)} %`, to: { ...nudge, zoom: nudge.zoom / room } })
      continue
    }
    if (airOf(piece) < 0.08) out.push({ piece, says: 'Filen är beskuren hårt redan — ingen luft att ge.', fix: 'Låt den vara som den är', to: nudge })
  }
  return out
}

export function BildC() {
  const [rule, setRule] = useState<Rule>(DEFAULT_RULE)
  const [nudges, setNudges] = useState<Record<string, Nudge>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const objections = objectionsOf(rule, nudges)
  const open = DECK.find((p) => p.id === openId)
  return (
    <div className="byd-proto-c">
      <aside className="byd-proto-c-rule">
        <h2>Så ramas den här leken</h2>
        <p className="byd-proto-hint">En regel, {DECK.length} bilder. Filerna rörs aldrig — det här är ett recept som ligger bredvid dem.</p>
        <label>
          Motivets höjd i ramen <output>{Math.round(rule.fill * 100)} %</output>
          <input type="range" min={0.4} max={1} step={0.01} value={rule.fill} onChange={(e) => setRule({ ...rule, fill: Number(e.target.value) })} />
        </label>
        <fieldset className="byd-proto-c-anchor">
          <legend>Motivet sitter</legend>
          {(['mitt', 'fot'] as const).map((a) => (
            <label key={a} className="byd-proto-tick">
              <input type="radio" name="anchor" checked={rule.anchor === a} onChange={() => setRule({ ...rule, anchor: a })} />
              {a === 'mitt' ? 'Centrerat i ramen' : 'På en gemensam marklinje'}
            </label>
          ))}
        </fieldset>
        <dl className="byd-proto-c-facts">
          <div>
            <dt>Ritat lika stort</dt>
            <dd>{DECK.filter((p) => Math.abs(drawnAt(p, windowFor(p, rule, nudges[p.id] ?? NO_NUDGE)) - rule.fill) < 0.02).length} av {DECK.length}</dd>
          </div>
          <div>
            <dt>Handgrepp</dt>
            <dd>{Object.keys(nudges).length}</dd>
          </div>
        </dl>
      </aside>

      <section className="byd-proto-c-proof">
        <h2>Leken som den blir</h2>
        <ul>
          {DECK.map((p) => (
            <li key={p.id}>
              <button type="button" aria-current={p.id === openId} onClick={() => setOpenId(p.id === openId ? null : p.id)} title="Öppna källan">
                <Small piece={p} rule={rule} nudge={nudges[p.id] ?? NO_NUDGE} width={132} />
                <span>{p.card}</span>
              </button>
            </li>
          ))}
        </ul>
        {open && <Source piece={open} rule={rule} nudge={nudges[open.id] ?? NO_NUDGE} onNudge={(n) => setNudges((all) => ({ ...all, [open.id]: n }))} onClose={() => setOpenId(null)} />}
      </section>

      <section className="byd-proto-c-list" aria-live="polite">
        <h2>{objections.length === 0 ? 'Inga invändningar' : `${objections.length} bilder kan inte svara på regeln`}</h2>
        {objections.length === 0 ? (
          <p className="byd-proto-hint">Alla {DECK.length} filerna ryms i måttet. Det är det här läget listan är till för att nå.</p>
        ) : (
          <ul>
            {objections.map(({ piece, says, fix, to }) => (
              <li key={piece.id}>
                <Small piece={piece} rule={rule} nudge={nudges[piece.id] ?? NO_NUDGE} width={72} />
                <div>
                  <strong>{piece.card}</strong>
                  <span>{says}</span>
                </div>
                <button type="button" className="byd-proto-primary" onClick={() => setNudges((all) => ({ ...all, [piece.id]: to }))}>
                  {fix}
                </button>
                <button type="button" onClick={() => setOpenId(piece.id)}>
                  Öppna källan
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Small({ piece, rule, nudge, width }: { piece: Piece; rule: Rule; nudge: Nudge; width: number }) {
  const win = windowFor(piece, rule, nudge)
  const l = laidOut(piece, win, width)
  return (
    <div className="byd-proto-card" style={{ width, height: width / ratio }}>
      <img src={piece.src} alt="" style={{ width: l.width, left: l.left, top: l.top }} />
    </div>
  )
}

// The source, opened as a drawer under the deck rather than as a place you go: the rule is still
// on screen, because the fix is nearly always to the rule and not to this one file.
function Source({ piece, rule, nudge, onNudge, onClose }: { piece: Piece; rule: Rule; nudge: Nudge; onNudge(n: Nudge): void; onClose(): void }) {
  const win = windowFor(piece, rule, nudge)
  const view = 300
  const scale = Math.min(view / piece.w, view / piece.h)
  return (
    <div className="byd-proto-c-source">
      <div className="byd-proto-a-canvas" style={{ width: piece.w * scale, height: piece.h * scale }}>
        <img src={piece.src} alt="" style={{ width: piece.w * scale, height: piece.h * scale }} />
        <span className="byd-proto-a-veil" style={{ left: win.x * scale, top: win.y * scale, width: win.w * scale, height: win.h * scale }} />
      </div>
      <div>
        <h3>
          {piece.card} <small>{`${piece.w}×${piece.h} px · ${Math.round(airOf(piece) * 100)} % luft`}</small>
        </h3>
        <p className="byd-proto-hint">Motivet mättes en gång ur filens bytes. Avvikelsen nedan gäller bara det här kortet.</p>
        <label>
          Storlek
          <input type="range" min={0.6} max={2} step={0.01} value={nudge.zoom} onChange={(e) => onNudge({ ...nudge, zoom: Number(e.target.value) })} />
        </label>
        <label>
          I sidled
          <input type="range" min={-0.5} max={0.5} step={0.01} value={nudge.dx} onChange={(e) => onNudge({ ...nudge, dx: Number(e.target.value) })} />
        </label>
        <label>
          I höjdled
          <input type="range" min={-0.5} max={0.5} step={0.01} value={nudge.dy} onChange={(e) => onNudge({ ...nudge, dy: Number(e.target.value) })} />
        </label>
        <button type="button" onClick={() => onNudge(NO_NUDGE)} disabled={nudge === NO_NUDGE}>
          Tillbaka till regeln
        </button>
        <button type="button" onClick={onClose}>
          Stäng
        </button>
      </div>
    </div>
  )
}
