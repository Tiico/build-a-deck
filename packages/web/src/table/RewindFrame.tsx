import type { ReactNode } from 'react'
import type { Activity, Snapshot } from '@byd/protocol'
import { standingRewind, whereTo, whoDecides } from './rewind.js'
import { useT } from '../i18n/index.js'

// A proposed rewind (C, K13), drawn over the table it would bring back: the frame and the three
// words that say it is a proposal, where it would take the table and who is waited on. The table
// screen and the observer draw it with this one component (#485), so what the room sees and what
// someone watching it sees can never be two different pictures of the same moment.
export function RewindFrame({ view, activity, children }: { view: Snapshot; activity: readonly Activity[]; children: ReactNode }) {
  const t = useT()
  const proposal = standingRewind(view)
  if (!proposal?.preview) return <>{children}</>
  return (
    <div className="byd-rewind-preview" data-rewind-preview={proposal.id}>
      {children}
      <div className="byd-rewind-label">
        <span>{t('rewind.proposal')}</span>
        <span>{t('rewind.looked', { where: whereTo(view, proposal, activity, t) })}</span>
        <span>{t('rewind.waiting', { who: whoDecides(view, proposal, t) })}</span>
      </div>
    </div>
  )
}
