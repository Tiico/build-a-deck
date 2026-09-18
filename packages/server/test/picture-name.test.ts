import { describe, expect, it } from 'vitest'
import { applyEdit } from '../src/edits.js'
import { ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// What the file was called on the designer's disk (#222, L22, beslut 6). Until now a picture in
// this tool had no name at all: the bytes are content-addressed, and a library could therefore
// only say which cards were drawn from a picture. The name is the second thing that is true of
// the picture itself, so it goes where the crop went — the record under the picture's own hash.
const SKOG = '1'.repeat(64)
const BORG = '2'.repeat(64)

const base = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: { faces: { front: { base: [], variants: {} } } },
    rows: [{ id: 'dragon', fields: { title: 'Drake', art: `asset:${SKOG}`, antal: 1 } }],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('a picture carries the name of the file it came from (#222, beslut 6)', () => {
  it('files the name under the picture, beside whatever else is known about it', () => {
    const doc = ProjectDoc.parse({ ...base(), pictures: { [SKOG]: { name: 'skogsbryn.jpg', crop: { x: 0.1, y: 0, w: 0.5, h: 1 } } } })

    expect(doc.pictures?.[SKOG]).toEqual({ name: 'skogsbryn.jpg', crop: { x: 0.1, y: 0, w: 0.5, h: 1 } })
  })

  // A field added, and nothing else: every document ever written is still this document. The
  // pictures already in a game have no name and go on being named by the cards drawn from them,
  // which is the whole reason this may not be a migration.
  it('leaves a document written before there were names exactly as it was', () => {
    const older = { ...base(), pictures: { [SKOG]: { crop: { x: 0.1, y: 0, w: 0.5, h: 1 } }, [BORG]: {} } }

    expect(ProjectDoc.parse(older)).toEqual(ProjectDoc.parse(older))
    expect(ProjectDoc.parse(older).pictures).toEqual(older.pictures)
  })

  // A file name is whatever the designer's disk holds, which is to say anything at all. It is
  // stored, so it is bounded and checked where it enters the document rather than trusted by the
  // surfaces that later read it out.
  it('refuses a name that is a path, that is not one line, or that is longer than a name', () => {
    const bad = (name: unknown) => () => ProjectDoc.parse({ ...base(), pictures: { [SKOG]: { name } } })

    // A name is a name and never a way to somewhere: nothing downstream may join it to a path.
    expect(bad('../../etc/passwd')).toThrow()
    expect(bad('bilder\\skog.jpg')).toThrow()
    // One line of readable text. A newline breaks every place the name is read out as a label,
    // and a bidi override turns `gpj.exe` into what it is not.
    expect(bad('skog\njpg')).toThrow()
    expect(bad('skog\u202egpj.exe')).toThrow()
    expect(bad('skog\u0000.jpg')).toThrow()
    // Something, and not more than a person reads.
    expect(bad('')).toThrow()
    expect(bad('   ')).toThrow()
    expect(bad('s'.repeat(200))).toThrow()
    expect(bad(7)).toThrow()
    // And the ordinary name a designer's disk hands over goes in untouched, accents and all.
    expect(ProjectDoc.parse({ ...base(), pictures: { [SKOG]: { name: 'skogsbryn (färdig) #2.jpg' } } }).pictures?.[SKOG]?.name).toBe('skogsbryn (färdig) #2.jpg')
  })
})

// Taking a picture into the game is an edit like every other (D3): one intent, applied by the one
// pure function, so the editor's copy and the truth on the server cannot disagree about what the
// game now holds. It is also the edit that makes a picture exist in the library before any card
// is drawn from it — which is what beslut 5 asks for and beslut 4 lets stand.
describe('taking a picture into the game is one edit (#222, beslut 5)', () => {
  it('puts the picture in the game under the name its file had', () => {
    const doc = applyEdit(base(), { v: 'addPicture', hash: BORG, name: 'borgen.png' })

    expect(doc.pictures).toEqual({ [BORG]: { name: 'borgen.png' } })
  })

  it('keeps what the game already knew about a picture it is handed again', () => {
    const cropped = applyEdit(base(), { v: 'setCrop', hash: SKOG, crop: { x: 0.1, y: 0, w: 0.5, h: 1 } })

    const doc = applyEdit(cropped, { v: 'addPicture', hash: SKOG, name: 'skogsbryn.jpg' })

    expect(doc.pictures?.[SKOG]).toEqual({ name: 'skogsbryn.jpg', crop: { x: 0.1, y: 0, w: 0.5, h: 1 } })
  })

  // A file whose name says nothing usable is still a picture the game has met, and the library is
  // where it has to turn up. Without an entry it would be bytes nobody could find again.
  it('takes a picture with no name at all as one the game has simply met', () => {
    expect(applyEdit(base(), { v: 'addPicture', hash: BORG }).pictures).toEqual({ [BORG]: {} })
  })

  // Checked where the value enters and not only where the document is written: an intent arrives
  // from a browser and nothing between the two reads the schema.
  it('refuses a name the document would refuse, rather than storing it and failing at the save', () => {
    expect(() => applyEdit(base(), { v: 'addPicture', hash: BORG, name: '../../etc/passwd' })).toThrow()
    expect(() => applyEdit(base(), { v: 'addPicture', hash: BORG, name: 's'.repeat(200) })).toThrow()
  })
})
