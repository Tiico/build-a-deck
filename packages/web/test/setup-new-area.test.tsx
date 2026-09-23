// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { MAX_PLAYERS } from '@byd/server/doc'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'
import { addZone, bordTab, drawn, shares } from './bord-tab.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Var en ny delad yta föds (#440, K2, B5). En zon som läggs rakt ovanpå en annan är ingen
// placering formgivaren har gjort: hon måste dra undan den innan hon ser vad hon gjort, och tills
// dess står två rutor på samma millimetrar med den nya vald.
//
// Vad som mäts är zonernas rutor **ur den byggda fliken** och inte ur uppställningen: fliken
// monteras som den skeppas, ur ett riktigt projekt på en riktig server, ＋ Yta trycks som
// formgivaren trycker den, och rutorna läses av de lådor editorn faktiskt ritar — ett
// `[data-zone-handle]` per zon, en högs ruta dess kortkontur. Det är den enda läsning som svarar
// på frågan issuet ställer; uppställningens egna tal säger bara vad koden tänkte. Hur fliken
// monteras och hur rutorna läses står i `bord-tab.tsx`, som `setup-new-pile.test.tsx` mäter med
// också.

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

/** Trycker ＋ Yta och svarar med den nya zonens id — den fliken just valde. */
const addArea = (n: number): Promise<string> => addZone('area', n)

describe('en ny delad yta föds på ledig filt (#440)', () => {
  const seatCounts = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)

  it.each(seatCounts)('lägger två ytor på var sin filt vid %i platser', async (seats) => {
    const close = await bordTab(run, seats)
    try {
      const first = await addArea(1)
      const second = await addArea(2)
      const boxes = drawn()
      // Icke-vakuitet: läsningen hittar varje zon bordet har utom filten, som inget grepp ritas
      // på — de två högarna, tre zoner per plats och de två nya ytorna — och rutorna har en
      // storlek.
      expect({ seats, zones: boxes.length }).toEqual({ seats, zones: 2 + seats * 3 + 2 })
      expect(boxes.filter((b) => !(b.box.w > 0 && b.box.h > 0))).toEqual([])

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
})

// Regelns enda väg ut, och den som gör att ＋ Yta aldrig lägger en ruta ovanpå en annan: när
// filten är full säger uppställningen det, där den säger allt annat den vägrar — på samma rad som
// «Zonen togs bort» och «kopierad» står, och med samma röst (`role="status"`).
describe('en filt utan ledig plats säger det (#440)', () => {
  const covered = (): ProjectDoc => {
    const doc = projectDoc()
    const floor = doc.setup.zones.find((z) => z.id === doc.setup.floor)!.geometry
    return { ...doc, setup: { ...doc.setup, zones: [...doc.setup.zones, { id: 'duk', kind: 'area', name: 'Duk', visibility: 'all', geometry: floor }] } }
  }

  it('säger att filten är full i stället för att stapla tyst', async () => {
    const close = await bordTab(run, null, covered())
    try {
      const before = drawn().length
      fireEvent.click(screen.getByRole('button', { name: '＋ Yta' }))
      const said = screen.getByText(/Ingen ledig filt för en ny yta/)
      expect(said.getAttribute('role')).toBe('status')
      // Och inget lades: en yta som inte fick plats får inte ha hamnat någonstans ändå.
      expect(drawn().length).toBe(before)
    } finally {
      close()
    }
  })
})
