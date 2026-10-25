// A guest's address (#1278, DRIFT §9): the table and the seat in the query, the token in the
// fragment. A fragment is never sent — not in a request, not as a `Referer` — so the bearer secret
// that opens her seat stays on the phone, and the proxy in front of the box never logs it. Her name
// is in no address at all: the table tells her connection the name her token was bought with.
//
// The room code stays in the query: it is what the address is for (K12, «koden reser med dem»).
// This module is in the phone's first load, so what only the claim needs lives with the claim.

// An address on a guest's page, with her token where the browser keeps it to itself.
export function guestAddress(page: string, query: URLSearchParams, token: string): string {
  return `${page}?${query}#${new URLSearchParams({ token })}`
}

// The token of the page being shown. An old link — one handed out before, with `?token=` and
// `?name=` — is moved first: the token to the fragment and the name gone, in the same history
// entry, so the old form is not left behind for Back to find. The owner's own seat from the editor
// (`owner=1`) keeps its name: it has no admission, and the name is hers.
export function takeGuestToken(): string | undefined {
  const q = new URLSearchParams(location.search)
  const fragment = new URLSearchParams(location.hash.slice(1))
  const old = q.get('token')
  const named = q.has('name') && q.get('owner') !== '1'
  if (old !== null || named) {
    q.delete('token')
    if (named) q.delete('name')
    if (old && !fragment.has('token')) fragment.set('token', old)
    history.replaceState(history.state, '', `${location.pathname}?${q}#${fragment}`)
  }
  return fragment.get('token') ?? undefined
}
