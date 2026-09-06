// PROTOTYPE — throwaway. A deck to edit: the seed template and thirty rows, compiled for real.
import type { FaceTemplate, Row, Template } from '@byd/template'

export const NAMES = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Vargar', 'Fälla', 'Eldstorm', 'Helande', 'Skugga', 'Gruva', 'Torn', 'Marknad', 'Skog', 'Hamn', 'Kung', 'Drottning', 'Narr', 'Spion', 'Lejon', 'Örn', 'Orm', 'Björn', 'Räv', 'Uggla']
const BODIES = ['När detta kort spelas: dra ett kort.', 'Sköld 1. Kostar 1 mindre om du kontrollerar ett **Torn**.', 'Gör {2}{eld} skada på valfri varelse.', 'Hela 3 liv. Om du har färre än 5 liv: hela 5 i stället, och dra sedan ett kort om du kontrollerar en {skog}.']
const TYPES = ['varelse', 'varelse', 'besvärjelse', 'land']

export const FIELDS = [
  { key: 'title', label: 'Titel', kind: 'text' },
  { key: 'typ', label: 'Typ', kind: 'text' },
  { key: 'cost', label: 'Kostnad', kind: 'number' },
  { key: 'body', label: 'Text', kind: 'text' },
  { key: 'antal', label: 'Antal', kind: 'number' },
] as const

export function initialRows(): Row[] {
  return NAMES.map((n, i) => ({ title: n, typ: TYPES[i % TYPES.length]!, cost: 1 + (i % 5), body: BODIES[i % BODIES.length]!, antal: 1 + (i % 3) }))
}

export const front: FaceTemplate = {
  variantBy: 'typ',
  base: [
    { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
    { kind: 'shape', id: 'art', x: 4, y: 4, w: 55, h: 36, shape: 'rect', fill: '#c9b8a0', radiusMm: 2 },
    { kind: 'text', id: 'title', x: 5, y: 42, w: 53, h: 9, bind: { field: 'title' }, font: { family: 'Georgia, serif', sizePt: 13, weight: 800 }, color: '#1c1c1c' },
    { kind: 'text', id: 'typ', x: 5, y: 50, w: 53, h: 5, bind: { field: 'typ' }, font: { family: 'system-ui', sizePt: 7 }, color: '#7a6a55', fit: 'fixed' },
    { kind: 'text', id: 'body', x: 5, y: 56, w: 53, h: 27, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 8.5 }, color: '#333' },
    { kind: 'shape', id: 'costbg', x: 49, y: 4.5, w: 9, h: 9, shape: 'circle', fill: '#8b2e2e' },
    { kind: 'text', id: 'cost', x: 48, y: 5.5, w: 11, h: 8, bind: { field: 'cost' }, font: { family: 'system-ui', sizePt: 14, weight: 800, align: 'center' }, color: '#fff', fit: 'fixed' },
  ],
  variants: {
    besvärjelse: { override: [{ kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#e6ecf7', stroke: '#2f4068', strokeMm: 0.6, radiusMm: 3 }] },
    land: { override: [{ kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#e4efdc', stroke: '#2e5a2e', strokeMm: 0.6, radiusMm: 3 }], remove: ['costbg', 'cost'] },
  },
}

export const template: Template = {
  faces: {
    front,
    back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' }], variants: {} },
  },
}

// A tiny icon set so {eld} and {skog} resolve; {2} does not, on purpose — that is a warning.
const svg = (color: string) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.5" fill="${color}"/></svg>`)}`
export const ICONS: Record<string, string> = { eld: svg('#d9542b'), skog: svg('#3a8a3a') }
