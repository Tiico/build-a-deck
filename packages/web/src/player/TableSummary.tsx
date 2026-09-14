import type { Activity, Snapshot } from '@byd/protocol'
import { describeActivity } from '../table/describe.js'
import { targetsOf } from './PlaySheet.js'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'
import { useT, type T } from '../i18n/index.js'

export type TableSummaryProps = {
  view: Snapshot
  activity: readonly Activity[]
  // Draw the top card of that pile into this seat's hand (#79). Absent where nobody can: the
  // overview is a picture of the table as much as it is a way to act on it.
  onDraw?(zone: string): void
  // The answer to the last press, and which pile it was an answer to (#7).
  refusal?: RefusalHandle
  refusedZone?: string | null
}

type ZoneTile = ReturnType<typeof targetsOf>[number]

// Whether this reader can take the top card of that tile into a hand. The same terms the felt's
// ring keeps for the same verb (K14): a pile with a card in it, and a seat to draw into. The
// phone cannot tell which pile is the deck — the snapshot does not say, and `deckZone` never
// leaves the server — so the verb is offered per pile, exactly as the ring offers it.
const drawable = (view: Snapshot, tile: ZoneTile) => tile.kind === 'pile' && tile.count > 0 && view.seat !== null

// The table folded up small (C4): every public zone with its count, and what just happened.
export function TableSummary({ view, activity, onDraw, refusal, refusedZone = null }: TableSummaryProps) {
  const t = useT()
  const recent = [...activity].slice(-5).reverse()
  return (
    <div className="byd-summary">
      <div className="byd-summary-zones">
        {targetsOf(view, t)
          .filter((zone) => zone.id !== view.floor)
          .map((zone) =>
            onDraw && drawable(view, zone) ? (
              // The tile is the control, not a control inside it (UX-37, #82): the verb is read
              // in it at the tile's own width, and the whole tile is the hit area.
              <button
                key={zone.id}
                type="button"
                data-zone-summary={zone.id}
                data-zone-draw={zone.id}
                onClick={() => onDraw(zone.id)}
                className={refusedZone === zone.id ? 'byd-status-refused-control' : undefined}
                {...(refusedZone === zone.id && refusal ? refusal.control : {})}
              >
                <Tile zone={zone} t={t} />
                <em>{t('kbd.verb.toHand')}</em>
              </button>
            ) : (
              <div key={zone.id} data-zone-summary={zone.id}>
                <Tile zone={zone} t={t} />
              </div>
            ),
          )}
      </div>
      {refusal && <Refusal handle={refusal} />}
      <h2>{t('play.latest')}</h2>
      <ol aria-label={t('play.latest')}>
        {recent.map((l) => (
          <li key={l.seq}>{describeActivity(l, view, t)}</li>
        ))}
      </ol>
    </div>
  )
}

// What every tile says, whether or not it can be pressed: the designer's name for the zone, and
// how much lies in it.
function Tile({ zone, t }: { zone: ZoneTile; t: T }) {
  return (
    <>
      <strong>{zone.name}</strong>
      <span>{t(zone.count === 1 ? 'play.cards.one' : 'play.cards.other', { n: zone.count })}</span>
    </>
  )
}
