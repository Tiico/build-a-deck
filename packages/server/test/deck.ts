import type { Template } from '@byd/template'
import type { Deck } from '../src/store.js'
import { CARDS } from './fixture.js'

// A small deck for texture tests: one template, one row per card, no icons.
export const template: Template = {
  faces: {
    front: {
      base: [
        { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#333', strokeMm: 0.5, radiusMm: 3 },
        { kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14, weight: 700 }, color: '#111' },
      ],
      variants: {},
    },
    back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' }], variants: {} },
  },
}

export const deck: Deck = {
  template,
  rows: Object.fromEntries(CARDS.map((c) => [c, { title: c }])),
  icons: {},
}
