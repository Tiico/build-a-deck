// PROTOTYPE — physical validation in the editor (E5): a deck with real faults to look at.
import type { ProjectDoc } from '@byd/server'
import type { Element } from '../../editor/types.js'

const paper = (fill = '#f4ead8'): Element => ({ kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill })

export function sampleDoc(): ProjectDoc {
  const front = {
    base: [
      paper(),
      { kind: 'shape', id: 'frame', x: 3, y: 3, w: 57, h: 82, shape: 'rect', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
      { kind: 'text', id: 'title', x: 6, y: 7, w: 45, h: 9, bind: { field: 'title' }, font: { family: 'Georgia, serif', sizePt: 13, weight: 800 }, color: '#1c1c1c' },
      { kind: 'shape', id: 'typmarke', x: 50, y: 6, w: 8, h: 8, shape: 'circle', fill: '#c0392b' },
      { kind: 'shape', id: 'typmarke2', x: 50, y: 16, w: 8, h: 8, shape: 'circle', fill: '#7d8f1f' },
      { kind: 'text', id: 'body', x: 6, y: 30, w: 51, h: 40, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 9 }, color: '#333333' },
      { kind: 'text', id: 'flavour', x: 6, y: 72, w: 51, h: 10, bind: { field: 'flavour' }, font: { family: 'Georgia, serif', sizePt: 5.5 }, color: '#9c937f' },
    ] as Element[],
    variants: {},
  }
  return {
    name: 'Skogens herrar',
    template: { faces: { front, back: { base: [paper('#2f4068')], variants: {} } } },
    rows: [
      { id: 'drake', fields: { title: 'Drake', body: 'Flygande. Anfaller vid gryningen.', flavour: 'Ur skogens djup.', antal: 2 } },
      { id: 'riddare', fields: { title: 'Riddare', body: 'Sköld 1.', flavour: 'Tjänar kronan.', antal: 1 } },
      { id: 'skogsande', fields: { title: 'Skogsande', body: 'Vaknar i skymningen.', flavour: '', antal: 1 } },
      { id: 'bonde', fields: { title: 'Bonde', body: 'Skördar ett ax.', flavour: 'Året är kort.', antal: 3 } },
    ],
    icons: {},
    setup: { seats: ['A'], floor: 'table', deckZone: 'draw', zones: [] },
  }
}
