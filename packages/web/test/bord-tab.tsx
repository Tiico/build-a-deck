import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import type { Running } from './fixture.js'
import { atWidth } from './viewport.js'

// Fliken **Bord** ur ett riktigt projekt på en riktig server, monterad som den skeppas — och
// zonernas rutor lästa av de lådor editorn faktiskt ritar.
//
// Det här är vad ett mätande prov på var en ny zon föds behöver, och det är detsamma vare sig
// zonen är en delad yta (#440) eller en hög (#443): uppställningens egna tal säger bara vad koden
// tänkte, medan den byggda fliken svarar på frågan issuet ställer.
//
// Rutorna läses i bildpunkter, men ingen bildpunkt pinnas: filten ritar varje zon genom samma
// linjära avbildning från millimeter till bildpunkter, så två rutor delar bildpunkter precis när
// de delar millimetrar. Måtten är därmed oberoende av vilken låda filten fick och av vilken
// maskin provet körs på — det enda som avläses är om två rutor möts.

export const DESK = { w: 1280, h: 800 }
// En låda åt filten att rita i. jsdom lägger ingenting ut, så renderaren får noll tillbaka när den
// frågar lådan hur stor den är och hela filten faller ihop. Talen är av samma storleksordning som
// den låda `felt-names.test.tsx` mäter upp i Chromium, men vilka som helst hade dugt: det som läses
// är om två rutor möts, och det svaret är detsamma i varje skala.
export const FELT_BOX = { w: 660, h: 500 }

export type Box = { x: number; y: number; w: number; h: number }
export const shares = (a: Box, b: Box): boolean => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)

/** Varje zons ruta som fliken ritar den, i den ordning fliken ritar dem. */
export function drawn(): { id: string; box: Box }[] {
  return [...document.querySelectorAll('[data-zone-handle]')].map((el) => {
    const s = (el as HTMLElement).style
    return { id: el.getAttribute('data-zone-handle')!, box: { x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) } }
  })
}

export const handleFor = (id: string): Promise<HTMLElement> =>
  waitFor(() => {
    const el = document.querySelector(`[data-zone-handle="${id}"]`)
    if (!el) throw new Error(`no handle for ${id} yet`)
    return el as HTMLElement
  })

let projects = 0

/**
 * Monterar fliken **Bord** och svarar med det som river ner den igen.
 *
 * `seats` ställer upp bordet som issuena beskriver det — så många platser, en räknare, och varje
 * plats med både sin egen yta och sin räknarzon. `null` lämnar uppställningen som dokumentet
 * bär den.
 */
export async function bordTab(run: Running, seats: number | null, doc: ProjectDoc = projectDoc()): Promise<() => void> {
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

/** Trycker en av panelens två knappar och svarar med den nya zonens id — den fliken just valde. */
export async function addZone(kind: 'area' | 'pile', n: number): Promise<string> {
  fireEvent.click(screen.getByRole('button', { name: kind === 'pile' ? '＋ Hög' : '＋ Yta' }))
  const id = `${kind === 'pile' ? 'hog' : 'yta'}-${n}`
  await handleFor(id)
  return id
}
