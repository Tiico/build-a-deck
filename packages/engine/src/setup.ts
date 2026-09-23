import type { GameVersionId } from '@byd/protocol'
import type { ComponentInstance, SetupDef, TableState, Zone } from './state.js'
import type { TypeRegistry } from './typedef.js'

export function validateSetup(setup: SetupDef, registry: TypeRegistry): void {
  const zoneIds = new Set<string>()
  for (const z of setup.zones) {
    if (zoneIds.has(z.id)) throw new Error(`duplicate zone ${z.id}`)
    zoneIds.add(z.id)
    if (z.kind === 'hand') {
      if (!z.owner) throw new Error(`hand zone ${z.id} needs an owner`)
      if (!setup.seats.includes(z.owner)) throw new Error(`hand zone ${z.id} owner ${z.owner} is not a seat`)
      if (!z.returnTo) throw new Error(`hand zone ${z.id} needs returnTo`)
    }
    if (z.owner && !setup.seats.includes(z.owner)) throw new Error(`zone ${z.id} owner ${z.owner} is not a seat`)
  }
  for (const z of setup.zones) {
    if (z.returnTo && !zoneIds.has(z.returnTo)) throw new Error(`zone ${z.id} returnTo ${z.returnTo} does not exist`)
  }
  // A released seat yields one shuffle outcome, so all of its hands must return to the same pile.
  const returnBySeat = new Map<string, string>()
  for (const z of setup.zones) {
    if (z.kind !== 'hand' || !z.owner || !z.returnTo) continue
    const prior = returnBySeat.get(z.owner)
    if (prior && prior !== z.returnTo) throw new Error(`seat ${z.owner} has hands returning to both ${prior} and ${z.returnTo}`)
    returnBySeat.set(z.owner, z.returnTo)
  }
  const floor = setup.zones.find((z) => z.id === setup.floor)
  if (!floor) throw new Error(`floor ${setup.floor} is not a zone`)
  if (floor.kind !== 'area') throw new Error(`floor ${setup.floor} must be an area`)
  if (new Set(setup.seats).size !== setup.seats.length) throw new Error('duplicate seat ids')
  for (const c of setup.components) {
    if (!zoneIds.has(c.zone)) throw new Error(`component ${c.cardRef} placed in unknown zone ${c.zone}`)
    const def = registry.get(c.type)
    if (!def.faces.includes(c.face)) throw new Error(`component ${c.cardRef} has face ${c.face} not in type ${def.id}`)
  }
  for (const z of setup.zones) {
    if (!z.bottom) continue
    if (z.kind !== 'pile') throw new Error(`zone ${z.id} is not a pile and cannot have a bottom card`)
    const card = setup.components.find((c) => c.cardRef === z.bottom?.cardRef)
    if (card && !registry.get(card.type).faces.includes(z.bottom.face)) throw new Error(`bottom card ${z.bottom.cardRef} of ${z.id} has no face ${z.bottom.face}`)
  }
}

// Builds zones and components from a setup. Used both for the initial state and for `setup.reset`.
export function materialise(
  setup: SetupDef,
  startId: number,
): { zones: Record<string, Zone>; components: Record<string, ComponentInstance>; nextId: number } {
  const zones: Record<string, Zone> = {}
  for (const z of setup.zones) zones[z.id] = { ...z, order: [], dynamic: false }
  const components: Record<string, ComponentInstance> = {}
  let n = startId
  for (const spec of setup.components) {
    const id = `c${n++}`
    const inst: ComponentInstance = {
      id,
      type: spec.type,
      cardRef: spec.cardRef,
      zone: spec.zone,
      face: spec.face,
      x: spec.x ?? 0,
      y: spec.y ?? 0,
      rot: spec.rot ?? 0,
      shownTo: [],
      peekedBy: [],
      publicOverride: false,
    }
    if (spec.counter !== undefined) inst.counter = spec.counter
    components[id] = inst
    zones[spec.zone]?.order.push(id)
  }
  // A pile's bottom card lies last whatever order the deck listed it in, on the face the pile
  // chose for it (K23). One copy of the row: the last one listed, so a row with several copies
  // keeps the rest where the deck put them.
  for (const zone of Object.values(zones)) {
    if (!zone.bottom || zone.kind !== 'pile') continue
    const at = zone.order.map((id) => components[id]?.cardRef).lastIndexOf(zone.bottom.cardRef)
    if (at < 0) continue
    const [id] = zone.order.splice(at, 1) as [string]
    zone.order.push(id)
    const card = components[id]
    if (card) card.face = zone.bottom.face
  }
  return { zones, components, nextId: n }
}

export function initialState(version: GameVersionId, setup: SetupDef, registry: TypeRegistry): TableState {
  validateSetup(setup, registry)
  const { zones, components, nextId } = materialise(setup, 0)
  const seats: TableState['seats'] = {}
  for (const id of setup.seats) seats[id] = { id, name: null }
  return { version, seq: 0, setup, zones, components, seats, nextId, ended: false, played: false, rewind: null }
}
