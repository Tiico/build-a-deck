import type { Activity, Snapshot } from '@byd/protocol'
import { describeActivity } from '../table/describe.js'
import { overviewOf } from './PlaySheet.js'
import { Refusal, type RefusalHandle } from '../status/Refusal.js'
import { useT, type T } from '../i18n/index.js'

export type TableSummaryProps = {
  view: Snapshot
  // Which zones are tiled, and the phone asks for two complementary halves of one list (#465).
  // `piles` is the row above the hand — the hand comes first (#156, #200), and the piles are what
  // a hand acts on. `areas` is the fold under it: every other zone this reader may look into,
  // which is what C4 means by folding the whole table out.
  //
  // Halves, and not a list plus a copy of it. While the fold held the piles too, the phone drew
  // `Draghög · 10 kort` twice on one screen — once as a control and once as a mirror — and the
  // only thing telling them apart was a line of text on one of them. Every tile now stands in
  // exactly one of the two, and the two together are the whole of `overviewOf`.
  //
  // `all` is that whole list, which is what the halves are cut from. Nothing on the phone asks
  // for it; it is what the overview *is*, and what its own suite measures.
  zones?: 'piles' | 'areas' | 'all'
  // Whether the summary carries the recent lines itself. The phone keeps them in a fold of their
  // own, so the two were never meant to be the same question as which zones are shown.
  history?: boolean
  activity: readonly Activity[]
  // Draw the top card of that pile into this seat's hand (#79). Absent where nobody can: the
  // overview is a picture of the table as much as it is a way to act on it.
  onDraw?(zone: string): void
  // The answer to the last press, and which pile it was an answer to (#7).
  refusal?: RefusalHandle
  refusedZone?: string | null
}

type ZoneTile = ReturnType<typeof overviewOf>[number]

// Whether this reader can take the top card of that tile into a hand. The same terms the felt's
// ring keeps for the same verb (K14): a pile with a card in it, and a seat to draw into. The
// phone cannot tell which pile is the deck — the snapshot does not say, and `deckZone` never
// leaves the server — so the verb is offered per pile, exactly as the ring offers it.
const drawable = (view: Snapshot, tile: ZoneTile) => tile.kind === 'pile' && tile.count > 0 && view.seat !== null

// The table folded up small (C4): every zone this reader may look into, with its count, and what
// just happened. `overviewOf` and not `targetsOf` since #414 — an area in front of another seat
// is public and is read here, and it is still not somewhere a card of this reader's may go.
export function TableSummary({ view, activity, onDraw, refusal, refusedZone = null, zones = 'all', history = true }: TableSummaryProps) {
  const t = useT()
  return (
    <div className="byd-summary">
      <div className="byd-summary-zones">
        {overviewOf(view)
          .filter((zone) => (zones === 'all' ? true : zones === 'piles' ? zone.kind === 'pile' : zone.kind !== 'pile'))
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
      {history && <><h2>{t('play.latest')}</h2><RecentActivity view={view} activity={activity} /></>}
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

export function RecentActivity({ view, activity }: Pick<TableSummaryProps, 'view' | 'activity'>) {
  const t = useT()
  return <ol aria-label={t('play.latest')}>{[...activity].slice(-5).reverse().map(l => <li key={l.seq}>{describeActivity(l, view, t)}</li>)}</ol>
}
