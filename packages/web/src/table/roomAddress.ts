// The code is the address (#675, beslut C): the room's own address is the screen's origin and
// the code, and wherever it is shown to be passed on it reads `värd/KOD`, never the code alone
// (L77). `site` is what the words say, `url` is what a square or a copy carries — the very same
// address, with the server a development screen was pointed at, if any.
export function roomAddress(code: string, server: string | null): { site: string; url: string } {
  return { site: location.host, url: `${location.origin}/${code}${server ? `?${new URLSearchParams({ server }).toString()}` : ''}` }
}
