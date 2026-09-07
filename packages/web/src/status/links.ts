import { loginUrl } from '../account/api.js'
import type { StatusLinks } from './StatusNotice.js'

// Where a way out leads from a live route. `server` is carried along because a development
// front end talks to another origin, and a way home that drops it goes home to the wrong place.
export function statusLinks(opts: { server?: string | null; sessionId?: string | null }): StatusLinks {
  const q = new URLSearchParams()
  if (opts.server) q.set('server', opts.server)
  const suffix = q.size > 0 ? `?${q.toString()}` : ''
  const links: StatusLinks = { home: `/${suffix}`, login: loginUrl(location.pathname + location.search, opts.server ?? null) }
  if (opts.sessionId) {
    const seat = new URLSearchParams({ session: opts.sessionId })
    if (opts.server) seat.set('server', opts.server)
    links.rescan = `/join?${seat.toString()}`
  }
  return links
}
