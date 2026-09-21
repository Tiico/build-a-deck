// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The typeface catalog (#329, L27): variant C, «Provraden» — a sheet under the card where every
// hit sets the card's own heading and its rule text, in the card's own grade.
function canvas(over: Partial<React.ComponentProps<typeof TemplateCanvas>> = {}) {
  const props = {
    doc: projectDoc(),
    face: 'front',
    row: 'dragon',
    selectedElement: 'title',
    onSelectElement: vi.fn(),
    onPatch: vi.fn(),
    onCallOff: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onPlaceIcon: vi.fn(),
    onReorder: vi.fn(),
    onLock: vi.fn(),
    onRename: vi.fn(),
    onSelectFace: vi.fn(),
    group: null,
    onSelectGroup: vi.fn(),
    onGroupColumn: vi.fn(),
    onAddField: vi.fn(),
    onReset: vi.fn(),
    onReplaceFace: vi.fn(),
    onFontFile: vi.fn(async () => 'Rubrikserif'),
    onFontLicence: vi.fn(),
    onRemoveFont: vi.fn(),
    onCatalogFont: vi.fn(async () => undefined),
    ...over,
  }
  render(<TemplateCanvas {...(props as React.ComponentProps<typeof TemplateCanvas>)} />)
  return props
}

const googleAsked = () => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href') ?? '').filter((h) => h.includes('fonts.googleapis.com'))

// The measured criterion in #329, said here in the document and again on the wire in
// `packages/e2e/test/surfaces/font-catalog.spec.ts`: the catalog is never reached without an act
// of the designer's.
describe('the catalog is not reached until it is opened (L27)', () => {
  it('asks Google for nothing while the canvas is merely open', () => {
    canvas()
    expect(googleAsked()).toEqual([])
    expect(screen.getByRole('button', { name: /sök i google fonts/i })).toBeTruthy()
  })

  it('asks for the samples of what it shows, once the designer opens the picker', async () => {
    canvas()
    fireEvent.click(screen.getByRole('button', { name: /sök i google fonts/i }))
    await waitFor(() => expect(googleAsked()).toHaveLength(1))
    expect(googleAsked()[0]).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=/)
  })
})

// What settled the choice of room (L27): A and B set the family's name in nineteen points, and a
// heading in nineteen points looks well in nearly anything. C sets the card's own heading *and*
// its rule text, in the card's own grade — twelve-point body copy on a 63 mm card is the hard
// test, and it is the one the designer reads before she chooses.
//
// The sizes are asserted as the points the card sets them in and never as pixels: what a face
// measures is the machine's answer, and CI is not this machine.
describe('a sample is the card’s own words (L27)', () => {
  const open = async () => {
    canvas()
    fireEvent.click(screen.getByRole('button', { name: /sök i google fonts/i }))
    return (await screen.findByRole('list', { name: /träffar/i })).querySelectorAll('li')
  }

  it('sets the card’s heading and its rule text in each family, at the card’s own point size', async () => {
    const hits = await open()
    const first = hits[0]!
    const family = first.getAttribute('data-family')!
    const [heading, body] = [first.querySelector('.byd-font-catalog-heading'), first.querySelector('.byd-font-catalog-body')] as HTMLElement[]
    // The fixture's front: a title at 14 pt bound to `title`, a body at 9 pt bound to `body`,
    // and the row on the canvas is the dragon.
    expect([heading!.textContent, heading!.style.fontSize]).toEqual(['Drake', '14pt'])
    expect([body!.textContent, body!.style.fontSize]).toEqual(['Flygande.', '9pt'])
    expect(heading!.style.fontFamily).toContain(family)
    expect(body!.style.fontFamily).toContain(family)
  })
})

describe('finding a family and taking it (L27)', () => {
  const open = async () => {
    const props = canvas()
    fireEvent.click(screen.getByRole('button', { name: /sök i google fonts/i }))
    await screen.findByRole('list', { name: /träffar/i })
    return props
  }
  const hits = () => [...screen.getByRole('list', { name: /träffar/i }).querySelectorAll('li')].map((li) => li.getAttribute('data-family'))

  it('narrows to what the designer typed, and asks Google only for the faces it now shows', async () => {
    await open()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cinzel' } })
    await waitFor(() => expect(hits()).toEqual(['Cinzel', 'Cinzel Decorative']))
    expect(googleAsked()).toEqual(['https://fonts.googleapis.com/css2?family=Cinzel:wght@400..900&family=Cinzel+Decorative:wght@400;700;900&display=swap'])
  })

  it('says so when no family is called that, rather than showing an empty sheet', async () => {
    await open()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzzz' } })
    expect(await screen.findByText(/ingen familj heter så/i)).toBeTruthy()
  })

  // What pressing the row does: the family, with everything the project needs to hold it — the
  // licence and who drew it included, which is what the catalog exists to answer (L27).
  it('hands the whole catalog entry over, licence and all, when a family is taken', async () => {
    const { onCatalogFont } = await open()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cinzel' } })
    await waitFor(() => expect(hits()[0]).toBe('Cinzel'))
    fireEvent.click(screen.getByRole('button', { name: /lägg till cinzel$/i }))
    expect(onCatalogFont).toHaveBeenCalledWith({ family: 'Cinzel', category: 'serif', licence: 'OFL 1.1', by: 'Natanael Gama', weights: expect.stringContaining('..') })
  })

  it('offers no second copy of a family the project already holds', async () => {
    const doc = projectDoc()
    doc.fonts = { ...doc.fonts, Cinzel: { stack: '"Cinzel", serif', asset: `asset:${'c'.repeat(64)}`, source: 'catalog' } }
    canvas({ doc })
    fireEvent.click(screen.getByRole('button', { name: /sök i google fonts/i }))
    await screen.findByRole('list', { name: /träffar/i })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cinzel' } })
    const taken = await screen.findByRole('button', { name: /cinzel finns i projektet/i })
    expect((taken as HTMLButtonElement).disabled).toBe(true)
  })
})

// The list afterwards (L27). A catalog entry differs from an uploaded file in two ways, and the
// second is the one that means anything: the badge «Katalog», and that the licence stands filled
// in and struck through instead of being two empty boxes the designer is expected to be able to
// answer. `Licence` writes nothing until both halves are given, and an uploaded file carries
// neither — the catalog entry knows.
describe('a catalog entry in the list of fonts (L27)', () => {
  const shelfRow = (family: string) => screen.getByRole('list', { name: /typsnitt i spelet/i }).querySelector(`li[data-font="${family}"]`) as HTMLElement

  const withBoth = () => {
    const doc = projectDoc()
    doc.fonts = {
      Rubrikserif: { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` },
      Cinzel: { stack: '"Cinzel", serif', asset: `asset:${'c'.repeat(64)}`, source: 'catalog', licence: { licence: 'OFL 1.1', by: 'Natanael Gama' } },
    }
    return doc
  }

  it('marks it «Katalog», and says nothing of the kind about an uploaded file', () => {
    canvas({ doc: withBoth() })
    expect(shelfRow('Cinzel').textContent).toMatch(/katalog/i)
    expect(shelfRow('Rubrikserif').textContent).not.toMatch(/katalog/i)
  })

  it('stands with the licence answered and not open to being answered again', () => {
    canvas({ doc: withBoth() })
    const [licence, by] = [...shelfRow('Cinzel').querySelectorAll('input')] as HTMLInputElement[]
    expect([licence!.value, by!.value]).toEqual(['OFL 1.1', 'Natanael Gama'])
    expect([licence!.readOnly, by!.readOnly]).toEqual([true, true])
  })

  it('leaves an uploaded file’s two boxes empty and open, as they were', () => {
    canvas({ doc: withBoth() })
    const [licence, by] = [...shelfRow('Rubrikserif').querySelectorAll('input')] as HTMLInputElement[]
    expect([licence!.value, by!.value]).toEqual(['', ''])
    expect([licence!.readOnly, by!.readOnly]).toEqual([false, false])
  })
})

// «Att katalogen inte svarar sägs i panelen, inte tyst» (L27). Two ways it can fail to answer,
// and both are the designer's to see: the samples never arrive, or the family she pressed could
// not be brought home.
describe('a catalog that does not answer (L27)', () => {
  it('says the samples did not arrive rather than showing a sheet of fallback faces', async () => {
    canvas()
    fireEvent.click(screen.getByRole('button', { name: /sök i google fonts/i }))
    await screen.findByRole('list', { name: /träffar/i })
    const link = document.head.querySelector('link[href*="fonts.googleapis.com"]')!
    fireEvent.error(link)
    expect((await screen.findByRole('alert')).textContent).toMatch(/katalogen svarar inte/i)
  })

  it('says why the family she pressed is not in the project', async () => {
    const onCatalogFont = vi.fn(async () => {
      throw new Error('Katalogen svarade inte. Familjen kunde inte hämtas hem.')
    })
    canvas({ onCatalogFont })
    fireEvent.click(screen.getByRole('button', { name: /sök i google fonts/i }))
    await screen.findByRole('list', { name: /träffar/i })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cinzel' } })
    fireEvent.click(await screen.findByRole('button', { name: /lägg till cinzel$/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/kunde inte hämtas hem/i)
  })
})
