// @vitest-environment jsdom
// What a picture is called in the library (#222, L22, beslut 6). Until now a picture had no name
// at all — the bytes are content-addressed and nothing remembered what the file was called — so
// the library named one by the cards drawn from it. The file name is now kept on the way in, and
// it is what a designer recognises: `skogsbryn.jpg` and not "Bild på dragon, knight".
//
// The pictures a game already holds have no name and must go on being named by their cards, which
// is what makes this a field added and never a migration.
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { MediaPanel } from '../src/editor/MediaPanel.js'
import { projectDoc } from './project-doc.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

const SKOG = '1'.repeat(64)
const BORG = '2'.repeat(64)
const BASE = 'http://api.local'

function deckWithArt(): ProjectDoc {
  const doc = projectDoc()
  doc.template.faces['front']!.base.push({ kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } })
  doc.rows[0]!.fields['art'] = `asset:${SKOG}`
  doc.rows[1]!.fields['art'] = `asset:${SKOG}`
  return doc
}

const tiles = () => screen.getAllByRole('listitem')

describe('a picture is called what its file was called (#222, beslut 6)', () => {
  it('names the picture by its file, wherever it is looked over and wherever it is chosen', () => {
    const doc = deckWithArt()
    doc.pictures = { [SKOG]: { name: 'skogsbryn.jpg' } }
    render(<MediaPanel doc={doc} assetBase={BASE} onReplaceRows={() => undefined} />)

    expect(within(tiles()[0]!).getByRole('img').getAttribute('alt')).toBe('skogsbryn.jpg')
    expect(screen.getByRole('button', { name: 'skogsbryn.jpg' })).toBeTruthy()
  })

  // The fallback beslut 6 names out loud. A deck made before there were names must read exactly as
  // it did, so a picture with no name of its own is still named by the cards drawn from it — and
  // one no card uses still says that instead.
  it('falls back to the cards drawn from a picture that has no name, and to the unused wording', () => {
    const doc = deckWithArt()
    doc.rules = { title: 'Regler', blocks: [{ kind: 'image', id: 'karta', asset: `asset:${BORG}`, alt: 'Kartan', px: { w: 800, h: 600 } }] }
    render(<MediaPanel doc={doc} assetBase={BASE} onReplaceRows={() => undefined} />)

    expect(within(tiles()[0]!).getByRole('img').getAttribute('alt')).toBe('Bild på dragon, knight')
    expect(within(tiles()[1]!).getByRole('img').getAttribute('alt')).toBe('Bild som inget kort använder')
  })
})

// Beslut 5 gives the library pictures no card is drawn from yet: one is uploaded here and cropped
// here before it goes anywhere. Such a picture is in the game only because the game says so — no
// row, no template literal and no rulebook block points at it — so the library has to list what
// the document knows about as well as what it can see in use, or an uploaded picture would vanish
// the moment it arrived.
describe('the library holds a picture no card is drawn from yet (#222, beslut 5)', () => {
  it('lists a picture the game has met, under its own name, and marks it as used by nothing', () => {
    const doc = deckWithArt()
    doc.pictures = { [BORG]: { name: 'borgen.png' } }
    render(<MediaPanel doc={doc} assetBase={BASE} onReplaceRows={() => undefined} />)

    expect(tiles().map((li) => li.getAttribute('data-asset'))).toEqual([SKOG, BORG])
    const met = tiles()[1]!
    expect(met.getAttribute('data-unused')).toBe('true')
    expect(within(met).getByRole('img').getAttribute('alt')).toBe('borgen.png')
    expect(within(met).getByText('inget kort använder den')).toBeTruthy()
  })

  // A picture the game met before it was ever named — the entry a crop taken back leaves behind —
  // is the same kind of picture and is listed the same way, named by nothing at all.
  it('lists a picture the game knows without a name, rather than losing it', () => {
    const doc = deckWithArt()
    doc.pictures = { [BORG]: {} }
    render(<MediaPanel doc={doc} assetBase={BASE} onReplaceRows={() => undefined} />)

    expect(tiles().map((li) => li.getAttribute('data-asset'))).toEqual([SKOG, BORG])
    expect(within(tiles()[1]!).getByRole('img').getAttribute('alt')).toBe('Bild som inget kort använder')
  })
})
