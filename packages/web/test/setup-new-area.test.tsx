// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { MAX_PLAYERS } from '@byd/server/doc'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { atWidth } from './viewport.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// Var en ny delad yta föds (#440, K2, B5). En zon som läggs rakt ovanpå en annan är ingen
// placering formgivaren har gjort: hon måste dra undan den innan hon ser vad hon gjort, och tills
// dess står två rutor på samma millimetrar med den nya vald.
//
// Vad som mäts är zonernas rutor **ur den byggda fliken** och inte ur uppställningen: fliken
// monteras som den skeppas, ur ett riktigt projekt på en riktig server, ＋ Yta trycks som
// formgivaren trycker den, och rutorna läses av de lådor editorn faktiskt ritar — ett
// `[data-zone-handle]` per zon, en högs ruta dess kortkontur. Det är den enda läsning som svarar
// på frågan issuet ställer; uppställningens egna tal säger bara vad koden tänkte.
//
// Rutorna läses i bildpunkter, men ingen bildpunkt pinnas: filten ritar varje zon genom samma
// linjära avbildning från millimeter till bildpunkter, så två rutor delar bildpunkter precis när
// de delar millimetrar. Måtten är därmed oberoende av vilken låda filten fick och av vilken
// maskin provet körs på — det enda som avläses är om två rutor möts.

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

const DESK = { w: 1280, h: 800 }
// Filtens låda i fliken vid 1280 × 800, mätt i Chromium av `felt-names.test.tsx`. jsdom lägger
// ingenting ut, så renderaren får noll tillbaka när den frågar lådan hur stor den är och hela
// filten faller ihop. Talet här är bara en låda att rita i: vilken som helst duger, eftersom det
// som läses är om rutor möts och inte var de ligger.
const FELT_BOX = { w: 660, h: 500 }

type Box = { x: number; y: number; w: number; h: number }
const shares = (a: Box, b: Box): boolean => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)

/** Varje zons ruta som fliken ritar den, i den ordning fliken ritar dem. */
function drawn(): { id: string; box: Box }[] {
  return [...document.querySelectorAll('[data-zone-handle]')].map((el) => {
    const s = (el as HTMLElement).style
    return { id: el.getAttribute('data-zone-handle')!, box: { x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) } }
  })
}

const handleFor = (id: string): Promise<HTMLElement> =>
  waitFor(() => {
    const el = document.querySelector(`[data-zone-handle="${id}"]`)
    if (!el) throw new Error(`no handle for ${id} yet`)
    return el as HTMLElement
  })

let projects = 0

/**
 * Fliken **Bord** ur ett riktigt projekt på en riktig server, monterad som den skeppas.
 *
 * `seats` ställer upp bordet som issuet beskriver det — så många platser, en räknare, och varje
 * plats med både sin egen yta och sin räknarzon. `null` lämnar uppställningen som dokumentet
 * bär den.
 */
async function bordTab(seats: number | null, doc: ProjectDoc = projectDoc()): Promise<() => void> {
  const clientBox = (side: 'Width' | 'Height') =>
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, `client${side}`) ?? ({ get: () => 0, configurable: true } as PropertyDescriptor)
  const before = { Width: clientBox('Width'), Height: clientBox('Height') }
  const hadObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  for (const [side, size] of [['Width', FELT_BOX.w] as const, ['Height', FELT_BOX.h] as const])
    Object.defineProperty(HTMLElement.prototype, `client${side}`, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains('byd-table-frame') ? size : 0
      },
    })
  class Stub {
    observe() {
      return undefined
    }
    disconnect() {
      return undefined
    }
  }
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = Stub

  const project = `p${++projects}`
  await run.projects.create(project, doc)
  atWidth(DESK.w)
  history.replaceState(null, '', `/editor?project=${project}&server=${encodeURIComponent(run.http)}`)
  const { unmount } = render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
  if (seats !== null) {
    fireEvent.click(screen.getByRole('button', { name: String(seats) }))
    fireEvent.click(screen.getByRole('button', { name: /Räknare$/ }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Yta per plats' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknarzon per plats' }))
    await handleFor('counters:A')
  }
  return () => {
    unmount()
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', before.Width)
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', before.Height)
    if (hadObserver) (globalThis as { ResizeObserver?: unknown }).ResizeObserver = hadObserver
    else delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  }
}

/** Trycker ＋ Yta och svarar med den nya zonens id — den fliken just valde. */
async function addArea(n: number): Promise<string> {
  fireEvent.click(screen.getByRole('button', { name: '＋ Yta' }))
  const id = `yta-${n}`
  await handleFor(id)
  return id
}

describe('en ny delad yta föds på ledig filt (#440)', () => {
  const seatCounts = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)

  it.each(seatCounts)('lägger två ytor på var sin filt vid %i platser', async (seats) => {
    const close = await bordTab(seats)
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
    const close = await bordTab(null, covered())
    try {
      const before = drawn().length
      fireEvent.click(screen.getByRole('button', { name: '＋ Yta' }))
      const said = screen.getByText(/Ingen ledig filt/)
      expect(said.getAttribute('role')).toBe('status')
      // Och inget lades: en yta som inte fick plats får inte ha hamnat någonstans ändå.
      expect(drawn().length).toBe(before)
    } finally {
      close()
    }
  })
})
