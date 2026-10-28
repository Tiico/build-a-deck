// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import type { Element } from '@byd/template'
import { DeckWall } from '../src/editor/DeckWall.js'
import { Language } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

// #1459: Fysisk kontroll läste bara kortens ytor, så en text på 2 pt på en ritad låda gav ingen
// anmärkning. Lådans ritade ytor står nu under en rad för lådan, i samma form som kortens rader, och
// varje anmärkning säger vilken yta den gäller och tar designern dit i fliken «Låda».

// Fyra kort: lådan är 65 × 90 × 3,5 mm, så locket är 65 × 3,5 mm och framsidan 65 × 90 mm.
const FRONT_GROUND: Element = { kind: 'shape', id: 'ground', x: -3, y: -3, w: 71, h: 96, shape: 'rect', fill: '#2b3a4a' }
const words = (sizePt: number): Element => ({ kind: 'text', id: 'egen', x: 5, y: 40, w: 55, h: 6, bind: { literal: 'SR' }, font: { family: 'sans-serif', sizePt }, color: '#f3ecdc' })
const drawn = (front: Element[]): ProjectDoc => ({ ...projectDoc(), box: { type: { id: 'box.tuck', version: 1 }, faces: { front: { base: front, variants: {} } } } })

const openChecks = (doc: ProjectDoc, { lang = 'sv', onOpenBoxFace }: { lang?: 'sv' | 'en'; onOpenBoxFace?: (face: string, element: string) => void } = {}) => {
  render(
    <Language lang={lang}>
      <DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} {...(onOpenBoxFace ? { onOpenBoxFace } : {})} />
    </Language>,
  )
  fireEvent.click(screen.getByRole('button', { name: lang === 'sv' ? /^Fysisk kontroll/ : /^Physical check/ }))
  return document.querySelector<HTMLElement>('.byd-wall-checks li[data-check="box-faces"]')
}

describe('lådans ytor i Fysisk kontroll (#1459)', () => {
  it('står som en rad för lådan, i kortens form, med felet och hur många ytor det gäller', () => {
    const row = openChecks(drawn([FRONT_GROUND, words(2)]))
    expect(row).not.toBeNull()
    expect(row?.dataset['severity']).toBe('error')
    const head = row?.querySelector(':scope > button')
    expect(head?.getAttribute('aria-expanded')).toBe('false')
    expect(head?.querySelector('b')?.textContent).toBe('Lådans ytor')
    expect(head?.querySelector('span')?.textContent).toBe('1 yta')
    expect(head?.querySelector('small')?.textContent).toBe('fel')
  })

  it('säger vilken yta det gäller och tar designern dit i fliken «Låda»', () => {
    const onOpenBoxFace = vi.fn()
    const row = openChecks(drawn([FRONT_GROUND, words(2)]), { onOpenBoxFace })
    fireEvent.click(row!.querySelector(':scope > button')!)
    const list = screen.getByRole('list', { name: 'Ytorna den gäller' })
    const go = list.querySelector('button')
    expect(go?.textContent).toBe('Framsida: för liten text, 2 pt är under 6 pt, som är minsta läsbara storlek för skriften. Till ytan i Låda ›')
    fireEvent.click(go!)
    expect(onOpenBoxFace).toHaveBeenCalledWith('front', 'egen')
  })

  it('säger ytan utan en väg dit när det inte finns någon flik att gå till', () => {
    const row = openChecks(drawn([FRONT_GROUND, words(2)]))
    fireEvent.click(row!.querySelector(':scope > button')!)
    const list = screen.getByRole('list', { name: 'Ytorna den gäller' })
    expect(list.querySelector('button')).toBeNull()
    expect(list.textContent).toBe('Framsida: för liten text, 2 pt är under 6 pt, som är minsta läsbara storlek för skriften.')
  })

  it('säger det på engelska för en engelsk läsare', () => {
    const row = openChecks(drawn([FRONT_GROUND, words(2)]), { lang: 'en', onOpenBoxFace: () => undefined })
    expect(row?.querySelector(':scope > button b')?.textContent).toBe('The box faces')
    expect(row?.querySelector(':scope > button span')?.textContent).toBe('1 face')
    fireEvent.click(row!.querySelector(':scope > button')!)
    expect(screen.getByRole('list', { name: 'The faces it is true of' }).querySelector('button')?.textContent).toMatch(/^Front: text too small, .* To the face in Box ›$/)
  })

  it('räknas bland felen, i foten och på kronans knapp', () => {
    const said = (doc: ProjectDoc) => {
      const { unmount } = render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />)
      const foot = document.querySelector('.byd-crown-foot')?.textContent ?? ''
      const crown = screen.getByRole('button', { name: /^Fysisk kontroll/ }).getAttribute('aria-label') ?? ''
      fireEvent.click(screen.getByRole('button', { name: /^Fysisk kontroll/ }))
      const lead = document.querySelector('.byd-wall-lead')?.textContent ?? ''
      unmount()
      return { foot: /Inga anmärkningar/.test(foot) ? 0 : /En anmärkning/.test(foot) ? 1 : Number(/(\d+) anmärkningar/.exec(foot)?.[1]), crown: Number(/\((\d+)\)/.exec(crown)?.[1] ?? 0), lead }
    }
    const plain = said(projectDoc())
    const faulty = said(drawn([FRONT_GROUND, words(2)]))
    expect(faulty.foot).toBe(plain.foot + 1)
    expect(faulty.crown).toBe(plain.crown + 1)
    expect(faulty.lead).toMatch(/fel måste rättas/)
  })

  it('säger ingenting om en neutral låda', () => {
    expect(openChecks(projectDoc())).toBeNull()
  })

  it('säger ingenting om en tom yta', () => {
    expect(openChecks(drawn([]))).toBeNull()
  })

  it('säger ingenting om en ritad yta utan anmärkningar', () => {
    expect(openChecks(drawn([FRONT_GROUND, words(9)]))).toBeNull()
  })
})
