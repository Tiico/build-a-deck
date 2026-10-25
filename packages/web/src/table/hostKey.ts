// The host key is shown once (DRIFT §9, #758). It opens the table's own screen, rotates the room
// code and kicks seats, so an address bar that keeps it hands all of that to a screen share, a
// photo of the television or a shared tab. The screen takes it out of the address on arrival —
// out of the history too, since the entry is replaced rather than pushed — and keeps it in the
// tab, so a reload still opens the table. A key in the address always wins: it is the newer link.
//
// It comes in the fragment (#1306), `/table?session=…#host=…`, which the browser sends in no request
// and no `Referer`: in the query, the page's own request carried it to the box and into the logs of
// whatever stands in front of it. A link from before that, with `?host=`, still opens the table.

const STORE = 'byd.host.'

export function takeHostKey(sessionId: string | null): string | undefined {
  if (!sessionId) return undefined
  const url = new URL(location.href)
  const fragment = new URLSearchParams(url.hash.slice(1))
  const given = fragment.get('host') ?? url.searchParams.get('host')
  if (given !== null) {
    keepHostKey(sessionId, given)
    url.searchParams.delete('host')
    fragment.delete('host')
    history.replaceState(history.state, '', url.pathname + url.search + (fragment.size > 0 ? `#${fragment.toString()}` : ''))
    return given || undefined
  }
  try {
    return sessionStorage.getItem(STORE + sessionId) ?? undefined
  } catch {
    return undefined
  }
}

// The key the tab opens this table with from now on: the one in the address, or the one a rotation
// handed the open screen (#820), which replaces the old one since that no longer opens anything.
export function keepHostKey(sessionId: string, key: string): void {
  try {
    sessionStorage.setItem(STORE + sessionId, key)
  } catch {
    // A tab that cannot keep it still opens the table now; a reload will ask for the link again.
  }
}
