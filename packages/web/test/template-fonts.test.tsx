// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TemplateCanvas } from '../src/editor/TemplateCanvas.js'
import { projectDoc } from './project-doc.js'
import type { ProjectDoc } from '../src/editor/types.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// The type a game is set in (B3): the family is chosen where the element is designed, and the
// file behind it belongs to the project, so a version prints as it was drawn.
function canvas(over: Partial<React.ComponentProps<typeof TemplateCanvas>> = {}) {
  const props = { ...bare(), ...over }
  render(<TemplateCanvas {...props} />)
  return props
}

function bare() {
  return {
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
  }
}

describe('choosing the type an element is set in (B3)', () => {
  it('offers the fonts the project has, and writes the chosen family onto the element', () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: 'sans-serif' }, Rubrikserif: { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    const { onPatch } = canvas({ doc })

    const pick = screen.getByLabelText(/^typsnitt$/i) as HTMLSelectElement
    expect([...pick.options].map((o) => o.value)).toEqual(['sans-serif', 'Rubrikserif'])
    expect(pick.value).toBe('sans-serif')
    fireEvent.change(pick, { target: { value: 'Rubrikserif' } })
    expect(onPatch).toHaveBeenCalledWith('title', { font: { family: 'Rubrikserif', sizePt: 14, weight: 700 } }, undefined)
  })

  it('keeps a family the project no longer names, rather than silently moving the element to another one', () => {
    const doc = projectDoc()
    doc.fonts = { Rubrikserif: { stack: '"Rubrikserif", sans-serif' } }
    canvas({ doc })
    const pick = screen.getByLabelText(/^typsnitt$/i) as HTMLSelectElement
    expect([...pick.options].map((o) => o.value)).toContain('sans-serif')
    expect(pick.value).toBe('sans-serif')
  })

  it('draws the card in the font the project pinned, so the canvas shows what will be printed', () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    canvas({ doc, assetBase: 'http://server.test' })
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    expect(css).toContain('@font-face')
    expect(css).toContain('http://server.test/assets/' + 'a'.repeat(64))
    expect(css).toContain('font-family:"Rubrikserif", sans-serif')
  })
})

describe('the fonts the game carries (B3)', () => {
  it('says which of them travel to the printer and which do not', () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: 'sans-serif' }, Rubrikserif: { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    canvas({ doc })
    const shelf = screen.getByRole('list', { name: /typsnitt i spelet/i })
    const rows = within(shelf).getAllByRole('listitem')
    expect(rows.map((r) => r.getAttribute('data-font'))).toEqual(['sans-serif', 'Rubrikserif'])
    expect(rows[0]!.textContent).toMatch(/följer inte med/i)
    expect(rows[1]!.textContent).toMatch(/följer med/i)
  })

  it('takes a font file into the game and states what it is licensed under', async () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { Rubrikserif: { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    const { onFontFile, onFontLicence } = canvas({ doc })

    const file = new File([new Uint8Array([119, 79, 70, 50])], 'Rubrikserif.woff2', { type: 'font/woff2' })
    const upload = screen.getByLabelText(/ladda upp typsnitt/i) as HTMLInputElement
    fireEvent.change(upload, { target: { files: [file] } })
    await waitFor(() => expect(onFontFile).toHaveBeenCalledWith(file))

    // Only the designer knows the licence, so it is asked for beside the family, and both halves
    // are needed before anything is written (E4: a licence without a holder credits no one).
    fireEvent.change(screen.getByLabelText(/licens för rubrikserif/i), { target: { value: 'OFL-1.1' } })
    fireEvent.blur(screen.getByLabelText(/licens för rubrikserif/i))
    expect(onFontLicence).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/upphovsperson för rubrikserif/i), { target: { value: 'Typverket' } })
    fireEvent.blur(screen.getByLabelText(/upphovsperson för rubrikserif/i))
    expect(onFontLicence).toHaveBeenCalledWith('Rubrikserif', { licence: 'OFL-1.1', by: 'Typverket' })
  })

  it('lets a font that no card is set in go, and keeps one that is in use', () => {
    const doc: ProjectDoc = { ...projectDoc(), fonts: { 'sans-serif': { stack: 'sans-serif' }, Rubrikserif: { stack: '"Rubrikserif", sans-serif', asset: `asset:${'a'.repeat(64)}` } } }
    const { onRemoveFont } = canvas({ doc })
    const shelf = screen.getByRole('list', { name: /typsnitt i spelet/i })
    const rows = within(shelf).getAllByRole('listitem')
    // The template's text is set in sans-serif, so that one has no way out while it is used.
    expect(within(rows[0]!).queryByRole('button', { name: /ta bort/i })).toBeNull()
    fireEvent.click(within(rows[1]!).getByRole('button', { name: /ta bort/i }))
    expect(onRemoveFont).toHaveBeenCalledWith('Rubrikserif')
  })
})

// A typeface dropped where typefaces are chosen (#294). The upload control is itself the
// receiver — the compact local pattern the owner picked in #291, not a second box beside it and
// not the whole canvas — so the drop is a second way into the one path the picker already takes.
//
// The bytes are carried for real in every one of these. A `File` that never arrived stringifies
// to `[object File]` and a test that only counted calls would pass over it, so what is asserted
// is what came out of `arrayBuffer()` on the far side: if the drop hands the surface anything
// other than the designer's file, these go red.
describe('dropping a typeface on the upload (#294)', () => {
  const WOFF2 = new Uint8Array([119, 79, 70, 50, 0, 1, 0, 0])
  const TTF = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0])
  const upload = () => screen.getByLabelText(/ladda upp typsnitt/i).closest('label') as HTMLLabelElement
  const files = (given: File[]) => ({ dataTransfer: { files: given, items: given.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })), types: ['Files'], getData: () => '' } })

  // What the far side actually received, read out of the file itself.
  function taking() {
    const got: { name: string; type: string; bytes: number[] }[] = []
    const onFontFile = vi.fn(async (file: File) => {
      got.push({ name: file.name, type: file.type, bytes: [...new Uint8Array(await file.arrayBuffer())] })
      return 'Rubrikserif'
    })
    return { got, onFontFile }
  }

  it('takes the dropped file down the same path the picker takes, bytes and all', async () => {
    const { got, onFontFile } = taking()
    canvas({ onFontFile })

    const file = new File([WOFF2], 'Rubrikserif.woff2', { type: 'font/woff2' })
    // Both halves are cancelled, which is what keeps the browser from leaving the editor and
    // opening the typeface as a page of its own.
    expect(fireEvent.dragOver(upload(), files([file]))).toBe(false)
    expect(fireEvent.drop(upload(), files([file]))).toBe(false)

    await waitFor(() => expect(got).toEqual([{ name: 'Rubrikserif.woff2', type: 'font/woff2', bytes: [...WOFF2] }]))
    expect(onFontFile).toHaveBeenCalledTimes(1)
  })

  // The four words of the pattern, on the one control: a file is over it, a file is going up, it
  // is there, something went wrong. The mark under the drag is the table's own `data-over`
  // (#222), so a designer meets one drag language in the tool and not two.
  it('marks itself while a file is over it, and lets the mark go again', () => {
    const { onFontFile } = taking()
    canvas({ onFontFile })
    const file = new File([WOFF2], 'Rubrikserif.woff2', { type: 'font/woff2' })

    expect(upload().getAttribute('data-over')).toBeNull()
    fireEvent.dragOver(upload(), files([file]))
    expect(upload().getAttribute('data-over')).toBe('true')
    // Dragged away again and nothing let go: the mark is about the drag and not about the file.
    fireEvent.dragLeave(upload(), files([file]))
    expect(upload().getAttribute('data-over')).toBeNull()
    expect(onFontFile).not.toHaveBeenCalled()

    fireEvent.dragOver(upload(), files([file]))
    fireEvent.drop(upload(), files([file]))
    expect(upload().getAttribute('data-over')).toBeNull()
  })


  it('says the file is on its way, and says what went wrong when it does not arrive', async () => {
    let refuse: (why: Error) => void = () => undefined
    const onFontFile = vi.fn(
      () =>
        new Promise<string>((_ok, no) => {
          refuse = no
        }),
    )
    canvas({ onFontFile })

    fireEvent.drop(upload(), files([new File([WOFF2], 'Rubrikserif.woff2', { type: 'font/woff2' })]))
    // While the bytes travel the control says so out loud, rather than going quietly dead: an
    // off-screen `disabled` is a state nobody can see.
    await screen.findByText(/laddar upp/i)
    refuse(new Error('Filen är inget typsnitt: WOFF2, WOFF, TTF eller OTF'))
    const said = await screen.findByRole('alert')
    expect(said.textContent).toMatch(/WOFF2, WOFF, TTF eller OTF/)
    expect(screen.queryByText(/laddar upp/i)).toBeNull()
  })

  // Two files is a question the control cannot answer, and a control that answered it by taking
  // the first one would have thrown the other away without saying so (#294).

  it('refuses a handful of files with a word, and takes none of them', () => {
    const { onFontFile } = taking()
    canvas({ onFontFile })
    const two = [new File([WOFF2], 'Rubrikserif.woff2', { type: 'font/woff2' }), new File([TTF], 'Rubrikgrotesk.ttf', { type: '' })]

    fireEvent.drop(upload(), files(two))
    expect(onFontFile).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/ett typsnitt i taget/i)
  })

  // What a browser really hands over for a typeface off the desktop: no type at all (#312). The
  // picker's `accept` never sees a dropped file, so a surface that sorted the drop by
  // `File.type` would refuse exactly the files the fix in #312 made work.
  it('takes a dropped TTF the browser had no name for', async () => {
    const { got, onFontFile } = taking()
    canvas({ onFontFile })
    const file = new File([TTF], 'Rubrikgrotesk.ttf', { type: '' })
    expect(file.type).toBe('')

    fireEvent.drop(upload(), files([file]))
    await waitFor(() => expect(got).toEqual([{ name: 'Rubrikgrotesk.ttf', type: '', bytes: [...TTF] }]))
  })

  // The far end of the drop, which is the whole point of it: a family an element can be set in,
  // with the two lines only the designer can write standing beside it (B3, E4). The project's
  // half of this — a file becoming an asset and a family named after it — is proven against a
  // real server in `project-client.test.ts`; what is proven here is that the drop reaches it and
  // that nothing about the shelf is different for a family that arrived this way.
  it('leaves the dropped typeface in the picker, with its licence beside it', async () => {
    function Shelf() {
      const [doc, setDoc] = useState<ProjectDoc>(projectDoc())
      const props = {
        doc,
        onFontFile: async (file: File) => {
          const family = file.name.replace(/\.[^.]+$/, '')
          const bytes = new Uint8Array(await file.arrayBuffer())
          // Named by its bytes, as the project names every asset (#310, E1).
          setDoc((was) => ({ ...was, fonts: { ...was.fonts, [family]: { stack: `"${family}", sans-serif`, asset: `asset:${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').padEnd(64, '0')}` } } }))
          return family
        },
        onFontLicence: onFontLicence,
      }
      return <TemplateCanvas {...({ ...bare(), ...props } as React.ComponentProps<typeof TemplateCanvas>)} />
    }
    const onFontLicence = vi.fn()
    render(<Shelf />)

    fireEvent.drop(upload(), files([new File([WOFF2], 'Rubrikserif.woff2', { type: 'font/woff2' })]))

    // In the picker an element is set from, beside the families the project already had.
    const pick = await screen.findByLabelText(/^typsnitt$/i)
    await waitFor(() => expect([...(pick as HTMLSelectElement).options].map((o) => o.value)).toContain('Rubrikserif'))
    // And on the shelf, saying it travels to the printer, with the two lines the file cannot say.
    const row = within(screen.getByRole('list', { name: /typsnitt i spelet/i })).getByText('Rubrikserif').closest('li')!
    expect(row.textContent).toMatch(/följer med/i)
    fireEvent.change(within(row).getByLabelText(/licens för rubrikserif/i), { target: { value: 'OFL-1.1' } })
    fireEvent.change(within(row).getByLabelText(/upphovsperson för rubrikserif/i), { target: { value: 'Typverket' } })
    fireEvent.blur(within(row).getByLabelText(/upphovsperson för rubrikserif/i))
    expect(onFontLicence).toHaveBeenCalledWith('Rubrikserif', { licence: 'OFL-1.1', by: 'Typverket' })
  })

  // The picker closes while a file is going up (`disabled`), and the drop has to close with it:
  // two typefaces on their way at once is two families named out of one gesture, and the second
  // upload finishing first would say the first one was done.
  it('takes nothing while a file is already on its way', async () => {
    const onFontFile = vi.fn(() => new Promise<string>(() => undefined))
    canvas({ onFontFile })

    fireEvent.drop(upload(), files([new File([WOFF2], 'Rubrikserif.woff2', { type: 'font/woff2' })]))
    await screen.findByText(/laddar upp/i)
    fireEvent.drop(upload(), files([new File([TTF], 'Rubrikgrotesk.ttf', { type: '' })]))
    expect(onFontFile).toHaveBeenCalledTimes(1)
  })
})
