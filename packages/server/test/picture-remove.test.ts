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
})
