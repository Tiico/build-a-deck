import { blocksView } from './notice.js'
import { StatusNotice, type StatusLinks, type Surface } from './StatusNotice.js'
import type { LiveStatus } from './useLiveStatus.js'

export type RouteStatusProps = {
  status: LiveStatus
  // Where this route puts a message that lands on top of a view it still holds. What replaces a
  // view is always the whole view, whichever route it is.
  over: Surface
  links: StatusLinks
  onRetry: () => void
}

// The one place a route says which of the nine states it is in. The state and the words come
// from the model; the route contributes only where the message stands and where its ways out
// lead.
export function RouteStatus({ status, over, links, onRetry }: RouteStatusProps) {
  if (!status.notice) return null
  const surface = blocksView(status.notice.state) ? 'page' : over
  return (
    <StatusNotice
      notice={status.notice}
      surface={surface}
      links={links}
      onRetry={onRetry}
      countdown={status.countdown}
      asOf={surface === 'page' ? null : status.asOf}
    />
  )
}
