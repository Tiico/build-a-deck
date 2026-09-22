// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { MAX_PLAYERS } from '@byd/server/doc'
import { projectDoc } from './project-doc.js'
import { startServer, twoSeatSetup, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { addZone, bordTab, drawn, shares, type Box } from './bord-tab.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Var en ny hög föds (#443, K2, B5). ＋ Hög la varje hög på konstanten `point(0, 150)`, så ett
// andra tryck la den nya högen på millimetern ovanpå den förra — och vald direkt, så det första
// formgivaren ser är en markerad kortrygg ovanpå en annan.
//
// Mätt ur den byggda fliken, som ytans prov mäter (#440): fliken monteras som den skeppas, ur ett
// riktigt projekt på en riktig server, knappen trycks som formgivaren trycker den, och rutorna
// läses av de lådor editorn faktiskt ritar. En hög har ingen area i dokumentet, så det är först
// här — på greppet, som är kortryggen — frågan «täcker de varandra» går att ställa alls.

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const seatCounts = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)
const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

describe('en ny hög föds på ledig filt (#443)', () => {
  it.each(seatCounts)('lägger två högar på var sin kortrygg vid %i platser', async (seats) => {
    const close = await bordTab(run, seats)
    try {
      const first = await addZone('pile', 1)
      const second = await addZone('pile', 2)
      const boxes = drawn()
      // Icke-vakuitet: läsningen hittar varje zon bordet har utom filten, som inget grepp ritas
      // på — receptets två högar, tre zoner per plats och de två nya högarna — och rutorna har en
      // storlek.
      expect({ seats, zones: boxes.length }).toEqual({ seats, zones: 2 + seats * 3 + 2 })
      expect(boxes.filter((b) => !(b.box.w > 0 && b.box.h > 0))).toEqual([])
      // Och att de ritas som kortryggar, vilket är vad som gör mätningen till en mätning: en ny
      // hög har samma ruta som receptets egen draghög.
      const size = (id: string) => {
        const b = boxes.find((z) => z.id === id)!.box
        return `${b.w}×${b.h}`
      }
      expect({ seats, made: [size(first), size(second)] }).toEqual({ seats, made: [size('draw'), size('draw')] })

      const where = `vid ${seats} platser`
      for (const made of [first, second]) {
        const mine = boxes.find((b) => b.id === made)!
        const over = boxes.filter((b) => b.id !== made && b.id !== 'table' && shares(b.box, mine.box)).map((b) => b.id)
        expect({ where, zone: made, over }).toEqual({ where, zone: made, over: [] })
      }
    } finally {
      close()
    }
  })

  // Den första högen på ett färskt bord hamnar där den alltid har hamnat, så inget recepbord
  // ritas om — sagt om den byggda fliken och inte bara om dokumentet.
  //
  // Mätt utan att pinna en enda bildpunkt. Bordets två högar står kvar där uppställningen lade
  // dem, för platsantalet flyttar bara filten, händerna och platsernas egna zoner; deras avstånd
  // på skärmen är därmed deras avstånd i millimeter, och det är den linjalen resten läses med.
  // Talen hämtas ur uppställningen själv, så provet följer fixturen i stället för att pinna den.
  it('lägger den första högen där den alltid har legat, mätt mot bordets egna högar', async () => {
    const close = await bordTab(run, 2)
    try {
      const made = await addZone('pile', 1)
      const at = (id: string) => centre(drawn().find((b) => b.id === id)!.box)
      const [draw, discard, mine] = [at('draw'), at('discard'), at(made)]
      const mmOf = (id: string) => twoSeatSetup().zones.find((z) => z.id === id)!.geometry
      const apart = mmOf('discard').x - mmOf('draw').x
      const perMm = (discard.x - draw.x) / apart
      // Icke-vakuitet: det finns en linjal att mäta med. En filt som inte ritades alls ger noll
      // bildpunkter mellan högarna, och varje mätning nedan skulle bli oändlig eller noll.
      expect({ ruler: apart !== 0, drawn: perMm > 0 }).toEqual({ ruler: true, drawn: true })
      const mm = { x: mmOf('draw').x + (mine.x - draw.x) / perMm, y: mmOf('draw').y + (mine.y - draw.y) / perMm }
      expect({ x: Math.round(mm.x), y: Math.round(mm.y) }).toEqual({ x: 0, y: 150 })
    } finally {
      close()
    }
  })

  // Och inte heller ovanpå en yta som redan står där: ＋ Yta lägger sin ruta på 300 × 120 mm strax
  // nedanför filtens mitt, vilket är precis där högens önskeplats ligger. En regel som bara såg
  // andra högar hade lagt kortryggen mitt i den ytan.
  it('viker undan för en delad yta som redan står på önskeplatsen', async () => {
    const close = await bordTab(run, 2)
    try {
      const area = await addZone('area', 1)
      const pile = await addZone('pile', 1)
      const boxes = drawn()
      const mine = boxes.find((b) => b.id === pile)!
      expect(boxes.find((b) => b.id === area)).toBeDefined()
      const over = boxes.filter((b) => b.id !== pile && b.id !== 'table' && shares(b.box, mine.box)).map((b) => b.id)
      expect({ zone: pile, over }).toEqual({ zone: pile, over: [] })
    } finally {
      close()
    }
  })
})

// Regelns enda väg ut: när filten inte har en ledig kortrygg säger uppställningen det, där den
// säger allt annat den vägrar, i stället för att stapla tyst eller falla på ett kast ur
// `applyEdit`. Högen har egna ord, eftersom en full filt för en yta på 300 × 120 mm och en full
// filt för en kortrygg på 63 × 88 mm är två olika påståenden.
describe('en filt utan ledig kortrygg säger det (#443)', () => {
  const covered = (): ProjectDoc => {
    const doc = projectDoc()
    const floor = doc.setup.zones.find((z) => z.id === doc.setup.floor)!.geometry
    return { ...doc, setup: { ...doc.setup, zones: [...doc.setup.zones, { id: 'duk', kind: 'area', name: 'Duk', visibility: 'all', geometry: floor }] } }
  }

  it('säger att filten är full i stället för att stapla tyst', async () => {
    const close = await bordTab(run, null, covered())
    try {
      const before = drawn().length
      fireEvent.click(screen.getByRole('button', { name: '＋ Hög' }))
      const said = screen.getByText(/Ingen ledig filt för en ny hög/)
      expect(said.getAttribute('role')).toBe('status')
      // Och inget lades: en hög som inte fick plats får inte ha hamnat någonstans ändå.
      expect(drawn().length).toBe(before)
    } finally {
      close()
    }
  })
})
