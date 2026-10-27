// A guest's address (#1278, DRIFT §9): the table and the seat in the query, the token in the
// fragment. A fragment is never sent — not in a request, not as a `Referer` — so the bearer secret
// that opens her seat stays on the phone, and the proxy in front of the box never logs it. Her name
// is in no address at all: the table tells her connection the name her token was bought with.
//
// The room code stays in the query: it is what the address is for (K12, «koden reser med dem»).
// This module is in the phone's first load, under a budget (phone-bundle.spec.ts), so what only the
// claim needs lives with the claim. A token is base64url and goes into the fragment as it is.

// An address on a guest's page, with her token where the browser keeps it to itself.
export function guestAddress(page: string, query: URLSearchParams, token: string): string {
  return `${page}?${query}#token=${token}`
}

// The token of the page being shown. An old link — one handed out before, with `?token=` and
// `?name=` — is moved first: the token to the fragment and the name gone, in the same history
// entry, so the old form is not left behind for Back to find. Only a guest's page asks: the owner's
// own seat from the editor (`owner=1`) has no admission, and no name in its address since #1306.
export function takeGuestToken(): string | undefined {
  const q = new URLSearchParams(location.search)
  const old = q.get('token')
  const token = new URLSearchParams(location.hash.slice(1)).get('token') ?? old ?? undefined
  if (old !== null || q.has('name')) {
    q.delete('token')
    q.delete('name')
    history.replaceState(history.state, '', `${location.pathname}?${q}${token ? `#token=${token}` : ''}`)
  }
  return token
}
