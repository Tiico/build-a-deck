// PROTOTYPE — throwaway. Seats as a joining phone would see them: two taken, two free.
export type SeatInfo = { id: string; name: string | null; edge: 'N' | 'E' | 'S' | 'W' }
export const SEATS: SeatInfo[] = [
  { id: 'N', name: 'Ada', edge: 'N' },
  { id: 'E', name: null, edge: 'E' },
  { id: 'S', name: 'Cy', edge: 'S' },
  { id: 'W', name: null, edge: 'W' },
]
export const COLORS = ['#3aa76d', '#3c8ce7', '#e05a4f', '#d99a1f']
export const GAME = { name: 'Skogens herrar', version: 'v0.7', code: 'KX7P' }
