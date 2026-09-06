import type { Activity, Snapshot } from '@byd/protocol'
import { describeActivity } from '../table/describe.js'
import { targetsOf } from './PlaySheet.js'

// The table folded up small (C4): every public zone with its count, and what just happened.
export function TableSummary({ view, activity }: { view: Snapshot; activity: readonly Activity[] }) {
  const recent = [...activity].slice(-5).reverse()
  return (
    <div className="byd-summary">
      <div className="byd-summary-zones">
        {targetsOf(view)
          .filter((t) => t.id !== view.floor)
          .map((t) => (
            <div key={t.id} data-zone-summary={t.id}>
              <strong>{t.name}</strong>
              <span>{t.count} kort</span>
            </div>
          ))}
      </div>
      <h2>Senast</h2>
      <ol aria-label="Senast">
        {recent.map((l) => (
          <li key={l.seq}>{describeActivity(l, view)}</li>
        ))}
      </ol>
    </div>
  )
}
