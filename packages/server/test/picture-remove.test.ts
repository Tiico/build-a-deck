import { describe, expect, it } from 'vitest'
import { applyEdit } from '../src/edits.js'
import type { ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// A picture taken out of the game (#318, L22 beslut 4). The bytes are content-addressed and
// shared, so what goes is the project's own reference — the record under the hash — and every
// cell the template draws as a picture that still points at it. One intent, so that the cards
// emptied and the picture gone are one step back.
const SKOG = '1'.repeat(64)
const BORG = '2'.repeat(64)
const KARTA = '3'.repeat(64)

const base = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: {
      faces: {
        front: {
          base: [
            { kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' } },
            { kind: 'text', id: 'note', x: 4, y: 44, w: 55, h: 10, bind: { field: 'note' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#222' },
          ],
          variants: {},
        },
      },
    },
    rows: [
      { id: 'dragon', fields: { title: 'Drake', art: `asset:${SKOG}`, note: `asset:${SKOG}`, antal: 1 } },
      { id: 'knight', fields: { title: 'Riddare', art: `asset:${BORG}`, antal: 1 } },
      { id: 'wizard', fields: { title: 'Trollkarl', art: `asset:${SKOG}`, antal: 1 } },
    ],
    icons: {},
    pictures: { [SKOG]: { name: 'skogsbryn.jpg', crop: { x: 0.1, y: 0, w: 0.5, h: 1 } }, [BORG]: { name: 'borgen.png' }, [KARTA]: { name: 'karta.png' } },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('a picture is taken out of the game (#318)', () => {
  it('drops the record and empties every picture cell drawn from it, and nothing else', () => {
    const doc = applyEdit(base(), { v: 'removePicture', hash: SKOG })

    expect(doc.pictures).toEqual({ [BORG]: { name: 'borgen.png' }, [KARTA]: { name: 'karta.png' } })
    expect(doc.rows.map((r) => r.fields['art'])).toEqual(['', `asset:${BORG}`, ''])
    // A text column that happens to hold the same string is not a picture, and is left alone.
    expect(doc.rows[0]?.fields['note']).toBe(`asset:${SKOG}`)
    expect(doc.rows.map((r) => r.fields['title'])).toEqual(['Drake', 'Riddare', 'Trollkarl'])
  })

  it('takes a picture no card uses by dropping its record alone', () => {
    const before = base()
    const doc = applyEdit(before, { v: 'removePicture', hash: KARTA })

    expect(doc.pictures).toEqual({ [SKOG]: before.pictures?.[SKOG], [BORG]: before.pictures?.[BORG] })
    expect(doc.rows).toEqual(before.rows)
  })

  // A picture may be on cards without the game ever having filed a record for it: every deck
  // made before there were records is like that. Taking it out still empties the cards.
  it('empties the cards even when the game holds no record of the picture', () => {
    const older = { ...base(), pictures: undefined }
    const doc = applyEdit(older, { v: 'removePicture', hash: SKOG })

    expect(doc.rows.map((r) => r.fields['art'])).toEqual(['', `asset:${BORG}`, ''])
    expect(doc.pictures ?? {}).toEqual({})
  })

  // A picture the template carries by itself (#320) goes the way a cell's does: the element
  // stays, bound to nothing, so the frame is empty rather than the layer gone or a column drawn
  // where none was chosen. One intent still, so the cards, the template and the record are one
  // step back.
  it('lets go of a picture the template carries, leaving the element with an empty frame', () => {
    const before = base()
    before.template.faces['front']!.base.push({ kind: 'image', id: 'logo', x: 20, y: 60, w: 23, h: 23, bind: { literal: `asset:${SKOG}` } })
    before.template.faces['front']!.variants['elite'] = { override: [{ kind: 'image', id: 'logo', x: 0, y: 60, w: 23, h: 23, bind: { literal: `asset:${SKOG}` } }] }
    const doc = applyEdit(before, { v: 'removePicture', hash: SKOG })

    expect(doc.template.faces['front']?.base[2]).toEqual({ kind: 'image', id: 'logo', x: 20, y: 60, w: 23, h: 23, bind: { literal: '' } })
    expect(doc.template.faces['front']?.variants['elite']?.override?.[0]).toMatchObject({ bind: { literal: '' } })
    expect(doc.rows.map((r) => r.fields['art'])).toEqual(['', `asset:${BORG}`, ''])
    // A face that never carried the picture is the same object it was.
    const untouched = base()
    expect(applyEdit(untouched, { v: 'removePicture', hash: KARTA }).template.faces['front']).toBe(untouched.template.faces['front'])
  })
})
