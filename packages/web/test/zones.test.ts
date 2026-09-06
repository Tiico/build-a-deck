import { describe, expect, it } from 'vitest'
import type { ZoneView } from '@byd/protocol'
import { zoneAt } from '../src/zones.js'

const zone = (id: string, kind: ZoneView['kind'], x: number, y: number, w: number, h: number): ZoneView => ({
  mode: 'order',
  id,
  kind,
  name: id,
  geometry: { x, y, w, h, rot: 0 },
  dynamic: false,
  order: [],
})

const zones: ZoneView[] = [
  zone('table', 'area', -500, -300, 1000, 600),
  zone('discard', 'pile', 200, 0, 0, 0),
  zone('hand:A', 'hand', -300, 320, 600, 100),
  zone('market', 'area', -100, -100, 200, 200),
]

describe('zoneAt (K2)', () => {
  it('a point inside a zone rectangle lands in that zone, with position relative to it', () => {
    expect(zoneAt(zones, 'table', -250, 350)).toEqual({ zone: 'hand:A', x: 50, y: 30 })
  })

  it('a point outside every rectangle lands on the floor', () => {
    expect(zoneAt(zones, 'table', 900, 900)).toEqual({ zone: 'table', x: 1400, y: 1200 })
  })

  it('piles are points and are never hit — a card dropped on a pile is a stack, not a move', () => {
    expect(zoneAt(zones, 'table', 200, 0).zone).toBe('table')
  })

  it('the smallest zone wins when rectangles nest, so a market inside the table is reachable', () => {
    expect(zoneAt(zones, 'table', 0, 0)).toEqual({ zone: 'market', x: 100, y: 100 })
  })
})
