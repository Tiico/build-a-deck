// A guest's address (#1278, DRIFT §9): the table and the seat in the query, the token in the
// fragment. A fragment is never sent — not in a request, not as a `Referer` — so the bearer secret
// that opens her seat stays on the phone, and the proxy in front of the box never logs it. Her name
// is in no address at all: the table tells her connection the name her token was bought with.
//
// The room code stays in the query: it is what the address is for (K12, «koden reser med dem»).

// An address on a guest's page, with her token where the browser keeps it to itself.
export function guestAddress(page: string, query: URLSearchParams, token: string): string {
  const q = query.toString()
  return `${page}${q ? `?${q}` : ''}#${new URLSearchParams({ token }).toString()}`
}

// The token of the page being shown. An old link — one handed out before, with `?token=` and
// `?name=` — is moved first: the token to the fragment, the name gone, and the page a claim link
// goes back to (`next`) cleaned the same way. The history entry is replaced rather than added to,
// so the old form is not left behind for Back to find. The owner's own seat from the editor
// (`owner=1`) keeps its name: it has no admission, and the name is hers.
export function takeGuestToken(): string | undefined {
  const url = new URL(location.href)
  const fragment = new URLSearchParams(url.hash.slice(1))
  const next = url.searchParams.get('next')
  const inner = next?.startsWith('/') && !next.startsWith('//') ? new URL(next, url.origin) : null
  if (!carries(url.searchParams) && !(inner && carries(inner.searchParams))) return fragment.get('token') ?? undefined
  const own = strip(url.searchParams)
  const carried = inner ? strip(inner.searchParams) : null
  if (inner) url.searchParams.set('next', inner.pathname + inner.search)
  const found = own ?? carried
  if (found !== null && !fragment.has('token')) fragment.set('token', found)
  url.hash = fragment.toString()
  history.replaceState(history.state, '', url.pathname + url.search + url.hash)
  return fragment.get('token') ?? undefined
}

// Whether a query holds what a guest's address no longer does: her token, or her name.
const carries = (q: URLSearchParams): boolean => q.has('token') || (q.has('name') && q.get('owner') !== '1')

// Takes the token and the guest's name out of a query, and says what the token was.
function strip(q: URLSearchParams): string | null {
  const token = q.get('token')
  if (q.has('token')) q.delete('token')
  if (q.has('name') && q.get('owner') !== '1') q.delete('name')
  return token
}

// Where a claim or a login lands (#690): the page it was given, its query told what it is told,
// and the fragment it was carried with — the guest's token — after it.
export function landingWith(page: string, mark: Record<string, string>, fragment: string): string {
  const at = page.indexOf('#')
  const path = at < 0 ? page : page.slice(0, at)
  const q = new URLSearchParams(mark).toString()
  return `${path}${q ? `${path.includes('?') ? '&' : '?'}${q}` : ''}${fragment || (at < 0 ? '' : page.slice(at))}`
}
