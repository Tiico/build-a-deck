// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { DeckWall, type DeckWallProps } from '../src/editor/DeckWall.js'
import { Language } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

// Lådan i kortväggens fot (#1415, L91, introduktion 2): från första kortet står en liten neutral låda
// längst ut i foten, med sina mått, och den blir tjockare för varje kort. När leken är spelbar blir
// raden en knapp till fliken «Låda». Måtten är `boxOf`:s, samma som nätet och Fysisk kontroll.

const withCards = (...antal: number[]): ProjectDoc => {
  const doc = projectDoc()
  doc.rows = antal.map((n, i) => ({ id: `card-${i}`, fields: { title: `Kort ${i}`, antal: n } }))
  return doc
}
const wall = (doc: ProjectDoc, more: Partial<DeckWallProps> = {}, lang: 'sv' | 'en' = 'sv') =>
  render(
    <Language lang={lang}>
      <DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} box={{}} {...more} />
    </Language>,
  )
const foot = () => document.querySelector<HTMLElement>('.byd-crown-foot')!
const box = () => foot().querySelector<HTMLElement>('.byd-wall-box')
// Hur djup den lilla lådan ritas: hur långt symbolens sida når bortom framsidan, som växer med leken.
const drawnDepth = () => {
  const xs = (box()?.querySelector('.byd-wall-box-side')?.getAttribute('points') ?? '').split(' ').map((p) => Number(p.split(',')[0]))
  return Math.max(...xs) - Math.min(...xs)
}

describe('lådan i kortväggens fot (#1415)', () => {
  it('står inte där när leken är tom', () => {
    wall({ ...projectDoc(), rows: [] })
    expect(box()).toBeNull()
  })

  it('står inte där när varje rad har antal 0', () => {
    wall(withCards(0, 0))
    expect(box()).toBeNull()
  })

  it('står längst ut i foten från första kortet, med lådans mått', () => {
    wall(withCards(1))
    expect(box()).not.toBeNull()
    // 1 kort: 0,3 mm + 2 mm luft, uppåt till en halv millimeter.
    expect(box()!.textContent).toBe('Lådan 65 × 90 × 2,5 mm')
    expect(foot().lastElementChild).toBe(box())
    // Symbolen säger inget själv: måtten står i ord.
    expect(box()!.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('växer med antalet kort', () => {
    const { unmount } = wall(withCards(1))
    const one = drawnDepth()
    unmount()
    wall(withCards(100, 8))
    expect(box()!.textContent).toBe('Lådan 65 × 90 × 34,5 mm')
    expect(drawnDepth()).toBeGreaterThan(one)
  })

  it('växer när ett kort läggs till, utan att något annat i foten flyttar sig', () => {
    const { rerender } = wall(withCards(12))
    expect(box()!.textContent).toBe('Lådan 65 × 90 × 6 mm')
    const before = drawnDepth()
    rerender(
      <Language lang="sv">
        <DeckWall doc={withCards(12, 1)} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} box={{}} />
      </Language>,
    )
    expect(box()!.textContent).toBe('Lådan 65 × 90 × 6 mm')
    rerender(
      <Language lang="sv">
        <DeckWall doc={withCards(12, 4)} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} box={{}} />
      </Language>,
    )
    expect(box()!.textContent).toBe('Lådan 65 × 90 × 7 mm')
    expect(drawnDepth()).toBeGreaterThan(before)
  })

  it('räknar inte ett förslags kort, som inte är lekens än (#1002)', () => {
    const doc = withCards(1, 50)
    wall(doc, { proposed: new Set(['card-1']) })
    expect(box()!.textContent).toBe('Lådan 65 × 90 × 2,5 mm')
  })

  it('är ingen knapp förrän leken är spelbar', () => {
    wall(withCards(3))
    expect(box()!.tagName).toBe('SPAN')
    expect(foot().querySelector('button.byd-wall-box')).toBeNull()
  })

  it('blir en knapp till fliken «Låda» när leken är spelbar, med ett namn och nåbar med tangentbordet', () => {
    const onOpen = vi.fn()
    wall(withCards(100, 8), { box: { onOpen } })
    const button = screen.getByRole('button', { name: 'Låda 65 × 90 × 34,5 mm' })
    expect(button).toBe(box())
    expect(button.getAttribute('type')).toBe('button')
    expect(button.tabIndex).toBe(0)
    // Pilen är en glyf och inget ord.
    expect(button.textContent).toBe('Låda 65 × 90 × 34,5 mm')
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('säger måtten på läsarens språk', () => {
    wall(withCards(100, 8), { box: { onOpen: () => undefined } }, 'en')
    expect(screen.getByRole('button', { name: 'Box 65 × 90 × 34.5 mm' })).toBeTruthy()
  })

  it('står inte där när editorn inte ber om den', () => {
    wall(withCards(3), { box: undefined })
    expect(box()).toBeNull()
  })
})
