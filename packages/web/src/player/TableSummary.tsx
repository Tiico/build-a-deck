import type { Activity, Snapshot } from '@byd/protocol'
import { describeActivity } from '../table/describe.js'
import { targetsOf } from './PlaySheet.js'
import { useT } from '../i18n/index.js'

// The table folded up small (C4): every public zone with its count, and what just happened.
export function TableSummary({ view, activity }: { view: Snapshot; activity: readonly Activity[] }) {
  const t = useT()
  const recent = [...activity].slice(-5).reverse()
  return (
    <div className="byd-summary">
      <div className="byd-summary-zones">
        {targetsOf(view, t)
          .filter((zone) => zone.id !== view.floor)
          .map((zone) => (
            <div key={zone.id} data-zone-summary={zone.id}>
              <strong>{zone.name}</strong>
              <span>{t(zone.count === 1 ? 'play.cards.one' : 'play.cards.other', { n: zone.count })}</span>
            </div>
          ))}
      </div>
      <h2>{t('play.latest')}</h2>
      <ol aria-label={t('play.latest')}>
        {recent.map((l) => (
          <li key={l.seq}>{describeActivity(l, view, t)}</li>
        ))}
      </ol>
    </div>
  )
}
