import { useRef } from 'react'
import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'
import { pieceKind } from '../components.js'
import { useFocusTrap } from '../editor/focusTrap.js'
import { useT } from '../i18n/index.js'
import { floorName, intentsForPlace, zoneName } from '../table/keyboard.js'
import { PieceFigure } from '../table/Piece.js'
import { byZone, colourOf, ownerName, piecesOn, thingOf } from './PhonePieces.js'
import './piece-sheet.css'

// The sheet behind «Flytta till…» for a chosen piece (#1476). It opens only after a press, so it
// and its rules travel in a chunk of their own and never in the first frame's sheet (L40).
// The zones a piece can be moved to: the floor first, then every area that is not a seat's
// counters, another seat's too (B5) — never a hand (K32) and never a pile.
export function pieceZones(view: Snapshot): string[] {
  const areas = view.zones.filter((z) => z.kind === 'area' && z.id !== view.floor && !(z.owner !== undefined && z.id === `counters:${z.owner}`))
  return [view.floor, ...areas.map((z) => z.id)]
}

export default function PieceSheet({ view, seat, c, onMove, onClose }: { view: Snapshot; seat: string; c: VisibleComponentState; onMove(intents: Intent[]): void; onClose(): void }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  useFocusTrap(box, { onEscape: onClose })
  const kind = pieceKind(c) ?? 'meeple'
  const here = byZone(piecesOn(view))
  const thing = thingOf(view, c, t)
  const what = c.cardRef === seat ? t('player.piece.yours.lower', { kind: t(`piece.kind.${kind}`) }) : ownerName(view, c) ? t('player.piece.theirs', { owner: ownerName(view, c) ?? '', kind: t(`piece.kind.${kind}`) }) : t(`piece.kind.${kind}`)
  return (
    <div className="byd-sheet-backdrop" onPointerDown={onClose}>
      <div className="byd-sheet byd-piece-sheet" role="dialog" aria-modal="true" aria-labelledby="piece-sheet-title" data-piece-sheet onPointerDown={(e) => e.stopPropagation()} ref={box}>
        <p className="byd-sheet-title" id="piece-sheet-title">
          {t('player.piece.move.title', { what })}
        </p>
        <div className="byd-piece-places">
          {pieceZones(view)
            .filter((zone) => zone !== c.zone)
            .map((zone, i) => {
              const lying = here.get(zone) ?? []
              return (
                <button
                  key={zone}
                  type="button"
                  data-zone={zone}
                  autoFocus={i === 0}
                  onClick={() => onMove(intentsForPlace(view, { key: `z:${zone}`, label: '', hint: '', zone, kind: 'area' }, thing, [c.id]))}
                >
                  <span>{zone === view.floor ? floorName(view, t) : zoneName(view, zone, t)}</span>
                  {lying.length > 0 && <span className="byd-offscreen">{t(lying.length === 1 ? 'player.piece.here.one' : 'player.piece.here.other', { n: lying.length })}</span>}
                  <span className="byd-piece-here" aria-hidden="true">
                    {lying.slice(0, 6).map((p) => (
                      <span key={p.id} className="byd-piece" aria-hidden="true">
                        <PieceFigure kind={pieceKind(p) ?? 'meeple'} colour={colourOf(view, p)} lying={p.face === 'lying'} rot={0} />
                      </span>
                    ))}
                    {lying.length > 6 && <small aria-hidden="true">+{lying.length - 6}</small>}
                  </span>
                </button>
              )
            })}
        </div>
        <button type="button" className="byd-secondary" onClick={onClose}>
          {t('player.dice.close')}
        </button>
      </div>
    </div>
  )
}
