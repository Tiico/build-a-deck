// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { DeckWall } from '../src/editor/DeckWall.js'
import { Language } from '../src/i18n/index.js'
import { projectDoc } from './project-doc.js'

// Fysisk kontroll säger när lådan inte rymmer leken (#1412, #1406). Raden är skivans enda nya UI:
// antalet kort som inte får plats och måtten i ord, på läsarens språk (A4). Fliken och nätet där
// låsen ändras är nästa skiva (#1413).

// 120 kort på 63 × 88 × 0,3 mm: leken är 36 mm och lådan som följer den 38 mm djup.
const deck = (box?: ProjectDoc['box']): ProjectDoc => {
  const doc = projectDoc()
  doc.rows = [
    { id: 'dragon', fields: { title: 'Drake', body: 'Flygande.', antal: 100 } },
    { id: 'knight', fields: { title: 'Riddare', body: 'Sköld 1.', antal: 20 } },
  ]
  if (box) doc.box = box
  return doc
}
const tuck = { id: 'box.tuck', version: 1 }

const openChecks = (doc: ProjectDoc, lang: 'sv' | 'en' = 'sv') => {
  render(
    <Language lang={lang}>
      <DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />
    </Language>,
  )
  fireEvent.click(screen.getByRole('button', { name: lang === 'sv' ? /^Fysisk kontroll/ : /^Physical check/ }))
  return document.querySelector<HTMLElement>('.byd-wall-checks li[data-check="box"]')
}

describe('lådan i Fysisk kontroll (#1412)', () => {
  it('säger hur många kort ett låst djup inte rymmer, och måtten i ord', () => {
    const row = openChecks(deck({ type: tuck, locked: { depth: 34.5 } }))
    expect(row).not.toBeNull()
    expect(row?.dataset['severity']).toBe('warning')
    expect(row?.textContent).toContain('12 kort får inte plats i lådan.')
    expect(row?.textContent).toContain('Leken är 36 mm, och det låsta djupet rymmer 32,5 mm.')
  })

  it('säger ett kort i singular', () => {
    const doc = deck({ type: tuck, locked: { depth: 34.5 } })
    doc.rows[1]!.fields['antal'] = 9
    expect(openChecks(doc)?.textContent).toContain('Ett kort får inte plats i lådan.')
  })

  it('säger det på engelska för en engelsk läsare', () => {
    const row = openChecks(deck({ type: tuck, locked: { depth: 34.5 } }), 'en')
    expect(row?.textContent).toContain('12 cards do not fit in the box.')
    expect(row?.textContent).toContain('The deck is 36 mm, and the locked depth holds 32.5 mm.')
  })

  it('säger vilket mått som är för smalt när kortet inte ryms alls', () => {
    const row = openChecks(deck({ type: tuck, locked: { width: 64 } }))
    expect(row?.textContent).toContain('120 kort får inte plats i lådan.')
    expect(row?.textContent).toContain('Kortet är 63 mm brett, men den låsta bredden lämnar 62 mm innanför luften.')
  })

  it('säger ingenting om en låda som följer leken', () => {
    expect(openChecks(deck())).toBeNull()
  })

  it('räknas bland anmärkningarna i foten och på kronans knapp', () => {
    const remarks = (doc: ProjectDoc) => {
      const { unmount } = render(<DeckWall doc={doc} face="front" selectedRow={null} onSelectRow={() => undefined} onSelectElement={() => undefined} />)
      const foot = document.querySelector('.byd-crown-foot')?.textContent ?? ''
      const crown = screen.getByRole('button', { name: /^Fysisk kontroll/ }).getAttribute('aria-label') ?? ''
      unmount()
      return { foot: /Inga anmärkningar/.test(foot) ? 0 : /En anmärkning/.test(foot) ? 1 : Number(/(\d+) anmärkningar/.exec(foot)?.[1]), crown: Number(/\((\d+)\)/.exec(crown)?.[1] ?? 0) }
    }
    const following = remarks(deck())
    const locked = remarks(deck({ type: tuck, locked: { depth: 34.5 } }))
    expect(locked.foot).toBe(following.foot + 1)
    expect(locked.crown).toBe(following.crown + 1)
  })
})
