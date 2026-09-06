import type { ProjectDoc } from '@byd/server'
import type { Template } from '@byd/template'
import { twoSeatSetup } from './fixture.js'

// A small project for editor tests: three rows, a front with title and body, a plain back.
export const template: Template = {
  faces: {
    front: {
      base: [
        { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#333', strokeMm: 0.5, radiusMm: 3 },
        { kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14, weight: 700 }, color: '#111' },
        { kind: 'text', id: 'body', x: 5, y: 30, w: 53, h: 40, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#222' },
      ],
      variants: {},
    },
    back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' }], variants: {} },
  },
}

export function projectDoc(): ProjectDoc {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template,
    rows: [
      { id: 'dragon', fields: { title: 'Drake', body: 'Flygande.', antal: 2 } },
      { id: 'knight', fields: { title: 'Riddare', body: 'Sköld 1.', antal: 1 } },
      { id: 'wizard', fields: { title: 'Trollkarl', body: 'Dra ett kort.', antal: 1 } },
    ],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}
