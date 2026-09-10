import { loginUrl } from '../account/api.js'
import type { StatusLinks } from './StatusNotice.js'

// Where a way out leads from a live route. `server` is carried along because a development
// front end talks to another origin, and a way home that drops it goes home to the wrong place.
export function statusLinks(opts: { server?: string | null; code?: string | null }): StatusLinks {
  const q = new URLSearchParams()
  if (opts.server) q.set('server', opts.server)
  const suffix = q.size > 0 ? `?${q.toString()}` : ''
  const links: StatusLinks = { home: `/${suffix}`, login: loginUrl(location.pathname + location.search, opts.server ?? null) }
  // The way back to the seat picker is the room code (DRIFT §9), not the session: the code is
  // what buys a token, and a picker that cannot admit anyone is not a way out.
  if (opts.code) {
    const seat = new URLSearchParams({ code: opts.code })
    if (opts.server) seat.set('server', opts.server)
    links.rescan = `/join?${seat.toString()}`
  }
  return links
}

// Where a seat's own way out leads once the seat has been given up (#31): the picker it was
// chosen in, told that the person arriving there has just left one. Without a room code there is
// no picker to come back to — the code is what buys a token — so it is the way home instead, and
// the picker's acknowledgement goes unsaid rather than said in the wrong place.
export function wayBack(links: StatusLinks): string {
  return links.rescan === undefined ? (links.home ?? '/') : `${links.rescan}&left=1`
}
