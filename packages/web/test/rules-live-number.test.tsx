// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { renderRules, type Names } from '@byd/template'
import type { RuleDoc } from '@byd/server'
import type { ZoneView } from '@byd/protocol'
import { RuleShelf } from '../src/rules/RuleDrawer.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The living number in the book (#226, decided 2026-09-20): form B, the badge. `Draghögen ⟨18⟩`
// stands outside the clause rather than inside it, and its shape says how much the book knows —
// filled where the reader may read the zone, hollow where the count is all there is.
//
// What the badge is allowed to say is decided by `zoneTally` off the reader's own projection, and
// the proof that the hidden case leaks nothing is on the wire (`packages/server/test/rules-live.test.ts`),
// never here. This file is about what the book draws once the projection has answered.

const names: Names = { zones: { draw: 'Draghög', discard: 'Kasthög', 'hand:B': 'Annas hand' }, cards: { vargen: 'Vargen' } }
const doc: RuleDoc = {
  title: 'Skogens herrar',
  blocks: [
    { kind: 'text', id: 't1', text: 'Spelet slutar när [[zon:draw]] är tom. Lägg i [[zon:discard]].' },
    { kind: 'text', id: 't2', text: '[[zon:hand:B]] hålls dold. [[kort:vargen]] ligger någonstans.' },
  ],
}
const book = renderRules(doc, names)

const geometry = { x: 0, y: 0, w: 10, h: 10, rot: 0 }
const counted = (id: string, name: string, count: number): ZoneView => ({ mode: 'count', id, kind: 'pile', name, geometry, dynamic: false, count })
const read = (id: string, name: string, order: string[]): ZoneView => ({ mode: 'order', id, kind: 'pile', name, geometry, dynamic: false, order })

// Luckan hämtas med sin egen stilmall sedan #346, så den står inte i DOM:en i samma bildruta som
// knappen — den kommer när modulen är framme. Väntan ligger därför här, i det som ställer upp
// provet, och inte i något av påståendena: det som mäts efteråt är exakt detsamma som förut.
// Väntan frågar luckan i just den här renderingens `container`, eftersom ett av proven ställer
// två uppslag bredvid varandra i samma dokument.
const shelf = async (zones: ZoneView[] | null) => {
  const view = render(<RuleShelf rules={book} placement="table" startOpen {...(zones ? { live: { zones } } : {})} />)
  await within(view.container).findByRole('dialog', { name: 'Regler' })
  return view
}

describe('the living number beside a tagged zone (#226)', () => {
  it('shows the count the reader’s own projection reports, beside the name and not inside the clause', async () => {
    await shelf([read('discard', 'Kasthög', ['a', 'b', 'c'])])
    const tag = screen.getByText('Kasthög', { selector: '.byd-rules-ref' })
    expect(tag.querySelector('.byd-rules-tally')?.textContent).toBe('3')
    // The clause itself is untouched: the badge is a thing beside the sentence, which is what
    // made B cost 1,5 % where the suffix cost 14,6 %.
    expect(tag.firstChild?.textContent).toBe('Kasthög')
  })

  // Fylld = boken ser vad som ligger där; ihålig = räkningen är allt boken vet. Skillnaden är en
  // form och inte en mening, och meningen finns ändå — i örat.
  it('fills the badge where the book may read the zone and leaves it hollow where it may only count', async () => {
    await shelf([read('discard', 'Kasthög', ['a', 'b', 'c']), counted('draw', 'Draghög', 18)])
    expect(screen.getByText('Kasthög', { selector: '.byd-rules-ref' }).querySelector('.byd-rules-tally')?.getAttribute('data-tally')).toBe('read')
    expect(screen.getByText('Draghög', { selector: '.byd-rules-ref' }).querySelector('.byd-rules-tally')?.getAttribute('data-tally')).toBe('counted')
  })

  it('says out loud what the badge only shapes, in form A’s own words', async () => {
    await shelf([counted('draw', 'Draghög', 18), read('discard', 'Kasthög', ['a', 'b', 'c'])])
    expect(screen.getByRole('img', { name: 'Draghög, 18 kort, ordningen dold' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Kasthög, 3 kort' })).toBeTruthy()
  })

  // Punkt 3 i beslutet, och den som bär hela resonemanget: ett kort inne i en dold hög ritas
  // exakt som en tagg i en bok utan bord. Hade dolt fått en egen markering vore *frånvaron* av
  // en siffra ett meddelande, och man kunde läsa av vilka kort som ligger dolda.
  it('draws a card reference exactly as a book with no table under it draws it', async () => {
    const { container } = await shelf([counted('draw', 'Draghög', 18), read('discard', 'Kasthög', [])])
    const atTable = container.querySelector('[data-ref="vargen"]')!.outerHTML
    const withoutTable = (await shelf(null)).container.querySelector('[data-ref="vargen"]')!.outerHTML
    expect(atTable).toBe(withoutTable)
    expect(atTable).not.toContain('byd-rules-tally')
  })

  it('leaves every tag bare when no table is running, so the tag stands for the name', async () => {
    const { container } = await shelf(null)
    expect(container.querySelectorAll('.byd-rules-tally')).toHaveLength(0)
    expect(screen.getByText('Draghög', { selector: '.byd-rules-ref' }).getAttribute('role')).toBeNull()
  })

  // En bok skriven mot en annan version namnger zoner det här bordet inte har. Den säger namnet.
  it('gives no number to a zone this table has not got', async () => {
    await shelf([read('discard', 'Kasthög', ['a'])])
    expect(screen.getByText('Draghög', { selector: '.byd-rules-ref' }).querySelector('.byd-rules-tally')).toBeNull()
  })

  // Frågerutan läser bokens egen `text`, och den innehåller inte siffran (öppen punkt 7). Ett
  // levande tal i indexet hade gjort träfflistan till något som ändrar sig under handen: samma
  // fråga, ett annat svar, därför att någon drog ett kort. Brickan visar 18; boken nämner det inte.
  it('keeps the living number out of what the question box searches', async () => {
    await shelf([counted('draw', 'Draghög', 18)])
    expect(screen.getByText('Draghög', { selector: '.byd-rules-ref' }).querySelector('.byd-rules-tally')?.textContent).toBe('18')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Vad undrar du?' }), { target: { value: '18' } })
    expect(screen.getByText('Ingen regel nämner det. Fråga den som gjorde spelet.')).toBeTruthy()
    // Och det som verkligen står skrivet hittas fortfarande.
    fireEvent.change(screen.getByRole('searchbox', { name: 'Vad undrar du?' }), { target: { value: 'Draghög' } })
    expect(screen.queryByText('Ingen regel nämner det. Fråga den som gjorde spelet.')).toBeNull()
  })

  // Boken utan bord är bokens vanligaste tillstånd, och den ska läsa som den alltid gjort: inga
  // brickor, och `text` — det frågerutan söker i — oberörd av att ett bord finns eller inte.
  it('says exactly what the book’s own text says, whether or not a table is running', () => {
    expect(book.text).not.toMatch(/\d/)
  })
})
