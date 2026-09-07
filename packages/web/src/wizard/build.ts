import type { ProjectDoc } from '@byd/server'
import { DEFAULT_FRAME, FRAMES, type Field } from './frames.js'

export type WizardState = { name: string; players: number; fields: Field[]; frame: string; rows: Record<string, string>[] }

const SEAT_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

// The wizard's whole output (L6): exactly the document the editor edits — E3's condition.
// Seats sit around a 1200 × 800 mm table; each gets a hand that returns to the draw pile.
export function buildProject(state: WizardState): ProjectDoc {
  const frame = FRAMES.find((f) => f.id === state.frame) ?? DEFAULT_FRAME
  const seats = SEAT_IDS.slice(0, Math.max(1, Math.min(SEAT_IDS.length, state.players)))
  const hands = seats.map((seat, i) => ({
    id: `hand:${seat}`,
    kind: 'hand' as const,
    name: 'Hand',
    visibility: 'owner' as const,
    owner: seat,
    returnTo: 'draw',
    geometry: handGeometry(i, seats.length),
  }))
  const ids = new Set<string>()
  const rows = state.rows.map((row, i) => {
    const base = slug(row['title'] ?? '') || `kort-${i + 1}`
    let id = base
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`
    ids.add(id)
    return { id, fields: typedFields(row, state.fields) }
  })
  return {
    name: state.name.trim(),
    template: { faces: { front: frame.front(state.fields), back: frame.back } },
    rows,
    icons: {},
    setup: {
      seats,
      floor: 'table',
      deckZone: 'draw',
      zones: [
        { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-600, -400, 1200, 800) },
        { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-140, 0), shortcut: { label: 'Lägg underst', at: 'bottom' } },
        { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(140, 0), shortcut: { label: 'Kasta', at: 'top' } },
        ...hands,
      ],
    },
  }
}

// Hands go S, N, E, W, then the corners, so two players face each other.
function handGeometry(i: number, count: number) {
  const edges = count <= 2 ? ['S', 'N'] : count === 3 ? ['S', 'N', 'E'] : ['S', 'N', 'E', 'W', 'S', 'N', 'E', 'W']
  const edge = edges[i] ?? 'S'
  const shift = i >= 4 ? 300 : 0
  switch (edge) {
    case 'N':
      return rect(-250 + shift, -400, 500, 60)
    case 'E':
      return rect(540, -250 + shift, 60, 500)
    case 'W':
      return rect(-600, -250 + shift, 60, 500)
    default:
      return rect(-250 + shift, 340, 500, 60)
  }
}

// Numbers become numbers, antal defaults to 1, everything else stays text.
function typedFields(row: Record<string, string>, fields: Field[]): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const f of fields) {
    const v = row[f.key] ?? ''
    out[f.key] = f.kind === 'number' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v
  }
  for (const [k, v] of Object.entries(row)) if (!(k in out) && k !== 'antal') out[k] = v
  const antal = Number(row['antal'] ?? '')
  out['antal'] = Number.isFinite(antal) && antal > 0 ? Math.floor(antal) : 1
  return out
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
