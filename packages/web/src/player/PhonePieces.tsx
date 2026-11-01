import type { Intent, Snapshot, VisibleComponentState } from '@byd/protocol'
import { pieceKind } from '../components.js'
import { useT, type T } from '../i18n/index.js'
import { floorName, pieceWhat, zoneName, type Thing } from '../table/keyboard.js'
import { PieceFigure } from '../table/Piece.js'
import { seatColor } from '../table/seatColor.js'

// A seat's wooden pieces on the phone (#1476, prototype #1472 telefonen A). The phone never draws
// the table (C2), so a piece is reached by the zone it lies in: «Framför mig» shows the seat's own
// pieces wherever they lie, «Bordet» those on the floor and those of the other seats, each a tile
// with its figure. A press chooses one — anybody's (B5) — and the bar over the tabs says which and
// offers «Lägg ner» and «Flytta till…», whose sheet lists the zones with what already lies there.
// It is the hand's path (#1147) and the keyboard's «Flytta till» (K16): a `move` and a `flip`, and
// no new gesture and no new verb.

export const piecesOn = (view: Snapshot): VisibleComponentState[] => {
  const areas = new Set(view.zones.filter((z) => z.kind === 'area').map((z) => z.id))
  return view.components.filter((c) => pieceKind(c) !== null && areas.has(c.zone))
}

export const colourOf = (view: Snapshot, c: VisibleComponentState) => {
  const i = view.seats.findIndex((s) => s.id === c.cardRef)
  return i < 0 ? '#8a93a8' : seatColor(i)
}
export const ownerName = (view: Snapshot, c: VisibleComponentState): string | null =>
  c.cardRef ? (view.seats.find((s) => s.id === c.cardRef)?.name ?? c.cardRef) : null

// What a reader hears a piece called, the felt's words without the felt's keys.
export const pieceLabel = (view: Snapshot, c: VisibleComponentState, t: T): string =>
  t('player.piece.label', { what: pieceWhat(t, pieceKind(c) ?? 'meeple', ownerName(view, c), c.face === 'lying', 1), zone: zoneName(view, c.zone, t) })

function Tile({ view, c, chosen, onChoose }: { view: Snapshot; c: VisibleComponentState; chosen: boolean; onChoose(c: VisibleComponentState): void }) {
  const t = useT()
  const lying = c.face === 'lying'
  return (
    <button type="button" className="byd-piece-tile" data-phone-piece={c.id} aria-pressed={chosen ? 'true' : 'false'} aria-label={pieceLabel(view, c, t)} onClick={() => onChoose(c)}>
      <span className="byd-piece" aria-hidden="true">
        <PieceFigure kind={pieceKind(c) ?? 'meeple'} colour={colourOf(view, c)} lying={lying} rot={0} />
      </span>
      {lying && <small aria-hidden="true">{t('player.piece.lying')}</small>}
    </button>
  )
}

function Group({ view, title, count, pieces, chosen, onChoose }: { view: Snapshot; title: string; count?: number; pieces: VisibleComponentState[]; chosen: string | null; onChoose(c: VisibleComponentState): void }) {
  return (
    <section className="byd-piece-group">
      <h3>
        <span>{title}</span>
        {count !== undefined && <span>{count}</span>}
      </h3>
      <div className="byd-piece-tiles">
        {pieces.map((c) => (
          <Tile key={c.id} view={view} c={c} chosen={chosen === c.id} onChoose={onChoose} />
        ))}
      </div>
    </section>
  )
}

export const byZone = (pieces: VisibleComponentState[]) => {
  const out = new Map<string, VisibleComponentState[]>()
  for (const c of pieces) out.set(c.zone, [...(out.get(c.zone) ?? []), c])
  return out
}

// «Framför mig»: the seat's own pieces, a group per zone they lie in, its own zones first.
export function MyPieces({ view, seat, chosen, onChoose }: { view: Snapshot; seat: string; chosen: string | null; onChoose(c: VisibleComponentState): void }) {
  const t = useT()
  const mine = piecesOn(view).filter((c) => c.cardRef === seat)
  if (mine.length === 0) return null
  const groups = [...byZone(mine)].sort(([a], [b]) => Number(view.zones.find((z) => z.id === b)?.owner === seat) - Number(view.zones.find((z) => z.id === a)?.owner === seat))
  const kinds = new Set(mine.map((c) => pieceKind(c)))
  const kind = kinds.size === 1 ? [...kinds][0] : null
  return (
    <section className="byd-pieces" data-pieces="mine" aria-labelledby="pieces-mine-title">
      <h2 className="byd-panel-title" id="pieces-mine-title">
        {kind ? t('player.pieces.mine.kind', { kinds: t(`piece.kinds.${kind}`), n: mine.length }) : t('player.pieces.mine', { n: mine.length })}
      </h2>
      {groups.map(([zone, pieces]) => (
        <Group key={zone} view={view} title={zone === view.floor ? floorName(view, t) : zoneName(view, zone, t)} count={pieces.length} pieces={pieces} chosen={chosen} onChoose={onChoose} />
      ))}
    </section>
  )
}

// «Bordet»: what lies on the floor, whoever's it is, and then every other seat's pieces.
export function TablePieces({ view, seat, chosen, onChoose }: { view: Snapshot; seat: string; chosen: string | null; onChoose(c: VisibleComponentState): void }) {
  const t = useT()
  const all = piecesOn(view)
  const floor = all.filter((c) => c.zone === view.floor)
  const theirs = view.seats.filter((s) => s.id !== seat).map((s) => ({ seat: s, pieces: all.filter((c) => c.cardRef === s.id && c.zone !== view.floor) })).filter((g) => g.pieces.length > 0)
  const none = all.filter((c) => !c.cardRef && c.zone !== view.floor)
  if (floor.length === 0 && theirs.length === 0 && none.length === 0) return null
  return (
    <section className="byd-pieces" data-pieces="table" aria-labelledby="pieces-table-title">
      <h2 className="byd-panel-title" id="pieces-table-title">
        {t('player.pieces.table')}
      </h2>
      {floor.length > 0 && <Group view={view} title={floorName(view, t)} count={floor.length} pieces={floor} chosen={chosen} onChoose={onChoose} />}
      {theirs.map(({ seat: s, pieces }) => (
        <Group key={s.id} view={view} title={s.name ?? s.id} count={pieces.length} pieces={pieces} chosen={chosen} onChoose={onChoose} />
      ))}
      {none.length > 0 && <Group view={view} title={t('player.pieces.none')} count={none.length} pieces={none} chosen={chosen} onChoose={onChoose} />}
    </section>
  )
}

export const thingOf = (view: Snapshot, c: VisibleComponentState, t: T): Thing => ({
  key: `piece:${c.id}`,
  kind: 'piece',
  id: c.id,
  name: t(`piece.kind.${pieceKind(c) ?? 'meeple'}`),
  zone: c.zone,
  piece: pieceKind(c) ?? 'meeple',
  owner: ownerName(view, c),
  lying: c.face === 'lying',
  count: 1,
})

// The bar over the tabs while a piece is chosen: which, and what can be done with it.
export function PieceBar({ view, seat, c, onFlip, onMove, onClear }: { view: Snapshot; seat: string; c: VisibleComponentState; onFlip(intents: Intent[]): void; onMove(): void; onClear(): void }) {
  const t = useT()
  const kind = pieceKind(c) ?? 'meeple'
  const lying = c.face === 'lying'
  const whose = c.cardRef === seat ? t('player.piece.yours', { kind: t(`piece.kind.${kind}`) }) : ownerName(view, c) ? t('player.piece.theirs', { owner: ownerName(view, c) ?? '', kind: t(`piece.kind.${kind}`) }) : t(`piece.kind.${kind}`)
  return (
    <section className="byd-hand-bar byd-piece-bar" data-piece-bar aria-label={t('player.piece.actions')}>
      <p>
        <span className="byd-piece" aria-hidden="true">
          <PieceFigure kind={kind} colour={colourOf(view, c)} lying={lying} rot={0} />
        </span>
        <strong>{t('player.piece.where', { what: whose, zone: c.zone === view.floor ? floorName(view, t) : zoneName(view, c.zone, t) })}</strong>
        <button type="button" onClick={onClear}>
          {t('player.hand.clear')}
        </button>
      </p>
      <div className="byd-bar-plays">
        {kind === 'meeple' && (
          <button type="button" data-piece-flip onClick={() => onFlip([{ v: 'flip', component: c.id, face: lying ? 'standing' : 'lying' }])}>
            {t(lying ? 'ring.piece.raise' : 'ring.piece.lay')}
          </button>
        )}
        <button type="button" className="byd-bar-main" data-piece-move aria-haspopup="dialog" onClick={onMove}>
          {t('player.piece.move')}
        </button>
      </div>
    </section>
  )
}
