// The host's own seat at a table of computers she started in this browser (L77, #1286): the seat
// she sat down at and the name she sat under, by table. «Öppna bordet» leads her back to it, and the
// seat at `/online` sits down under the name (#1306): it is in no address, since the page's address
// goes to the box with every load of it. A browser that refuses storage simply forgets, and the
// way in is then the room's own address, or the seat sits down under her account's name.
//
// Its own module, without the editor's words, because the table's seat reads it too (#760).

const HOST_SEATS = 'byd.hostSeat'
export type HostSeat = { seat: string; name: string }
const hostSeats = (): Record<string, HostSeat> => {
  try {
    return (JSON.parse(localStorage.getItem(HOST_SEATS) ?? 'null') as Record<string, HostSeat> | null) ?? {}
  } catch {
    return {}
  }
}
export function rememberHostSeat(session: string, seat: HostSeat): void {
  try {
    localStorage.setItem(HOST_SEATS, JSON.stringify({ ...hostSeats(), [session]: seat }))
  } catch {
    // Forgotten, as everything else the tool remembers is in a browser without storage.
  }
}
export const hostSeatAt = (session: string): HostSeat | null => hostSeats()[session] ?? null

// A link from before #1306 named her in its query (`?name=`). The name is taken out of the address
// in the same history entry, as a guest's is (#1278), so that neither a reload nor Back sends it.
export function dropOwnerName(): void {
  const q = new URLSearchParams(location.search)
  if (!q.has('name')) return
  q.delete('name')
  history.replaceState(history.state, '', `${location.pathname}?${q}${location.hash}`)
}
