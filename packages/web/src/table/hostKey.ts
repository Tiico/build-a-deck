// The host key is shown once (DRIFT §9, #758). It opens the table's own screen, rotates the room
// code and kicks seats, so an address bar that keeps it hands all of that to a screen share, a
// photo of the television or a shared tab. The screen takes it out of the address on arrival —
// out of the history too, since the entry is replaced rather than pushed — and keeps it in the
// tab, so a reload still opens the table. A key in the address always wins: it is the newer link.

const STORE = 'byd.host.'

export function takeHostKey(sessionId: string | null): string | undefined {
  if (!sessionId) return undefined
  const url = new URL(location.href)
  const given = url.searchParams.get('host')
  if (given !== null) {
    try {
      sessionStorage.setItem(STORE + sessionId, given)
    } catch {
      // A tab that cannot keep it still opens the table now; a reload will ask for the link again.
    }
    url.searchParams.delete('host')
    history.replaceState(history.state, '', url.pathname + url.search + url.hash)
    return given || undefined
  }
  try {
    return sessionStorage.getItem(STORE + sessionId) ?? undefined
  } catch {
    return undefined
  }
}
