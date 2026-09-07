import type { FaceTemplate } from '@byd/template'

// The frame gallery (L6): a few looks that bind whatever fields the game has. Elements for
// fields the game lacks are left out, so a game without cost has no cost circle.
export type Field = { key: string; label: string; kind: 'text' | 'number' | 'image' }
export type Frame = { id: string; name: string; blurb: string; front(fields: Field[]): FaceTemplate; back: FaceTemplate }

const has = (fields: Field[], key: string) => fields.some((f) => f.key === key)
const plainBack = (fill: string, inner?: string): FaceTemplate => ({
  base: [
    { kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill },
    ...(inner ? [{ kind: 'shape' as const, id: 'inner', x: 4, y: 4, w: 55, h: 80, shape: 'rect' as const, fill: inner, radiusMm: 3 }] : []),
  ],
  variants: {},
})

const classic: Frame = {
    id: 'classic',
    name: 'Klassisk',
    blurb: 'Konstyta upptill, titel och text under, kostnad i hörnet.',
    back: plainBack('#2f4068', '#3a4d7a'),
    front: (fields) => ({
      base: [
        { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
        ...(has(fields, 'art')
          ? [{ kind: 'image' as const, id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'art' }, fit: 'cover' as const }]
          : [{ kind: 'shape' as const, id: 'art', x: 4, y: 4, w: 55, h: 36, shape: 'rect' as const, fill: '#c9b8a0', radiusMm: 2 }]),
        { kind: 'text', id: 'title', x: 5, y: 42, w: 53, h: 9, bind: { field: 'title' }, font: { family: 'Georgia, serif', sizePt: 13, weight: 800 }, color: '#1c1c1c' },
        ...(has(fields, 'body') ? [{ kind: 'text' as const, id: 'body', x: 5, y: 53, w: 53, h: 30, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 8.5 }, color: '#333' }] : []),
        ...(has(fields, 'cost')
          ? [
              { kind: 'shape' as const, id: 'costbg', x: 49, y: 4.5, w: 9, h: 9, shape: 'circle' as const, fill: '#8b2e2e' },
              { kind: 'text' as const, id: 'cost', x: 48, y: 5.5, w: 11, h: 8, bind: { field: 'cost' }, font: { family: 'system-ui', sizePt: 14, weight: 800 as const, align: 'center' as const }, color: '#fff', fit: 'fixed' as const },
            ]
          : []),
      ],
      variants: {},
    }),
}

export const DEFAULT_FRAME = classic
export const FRAMES: Frame[] = [
  classic,
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'Bara text på vit botten. Snabbast att läsa vid bordet.',
    back: plainBack('#111111'),
    front: (fields) => ({
      base: [
        { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#ffffff', stroke: '#111', strokeMm: 0.4, radiusMm: 2 },
        { kind: 'text', id: 'title', x: 5, y: 6, w: 44, h: 10, bind: { field: 'title' }, font: { family: 'system-ui', sizePt: 15, weight: 800 }, color: '#111' },
        ...(has(fields, 'cost') ? [{ kind: 'text' as const, id: 'cost', x: 49, y: 6, w: 9, h: 10, bind: { field: 'cost' }, font: { family: 'system-ui', sizePt: 15, weight: 800 as const, align: 'right' as const }, color: '#111', fit: 'fixed' as const }] : []),
        { kind: 'shape', id: 'rule', x: 5, y: 18, w: 53, h: 0.5, shape: 'rect', fill: '#111' },
        ...(has(fields, 'body') ? [{ kind: 'text' as const, id: 'body', x: 5, y: 22, w: 53, h: 60, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 10 }, color: '#222' }] : []),
      ],
      variants: {},
    }),
  },
  {
    id: 'dark',
    name: 'Mörk',
    blurb: 'Mörk ram, ljus text, konstyta som fyller halva kortet.',
    back: plainBack('#0f1115', '#1b1d23'),
    front: (fields) => ({
      base: [
        { kind: 'shape', id: 'frame', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#1b1d23' },
        ...(has(fields, 'art')
          ? [{ kind: 'image' as const, id: 'art', x: 3, y: 3, w: 57, h: 48, bind: { field: 'art' }, fit: 'cover' as const }]
          : [{ kind: 'shape' as const, id: 'art', x: 3, y: 3, w: 57, h: 48, shape: 'rect' as const, fill: '#3a4d7a', radiusMm: 2 }]),
        { kind: 'shape', id: 'plate', x: 3, y: 53, w: 57, h: 32, shape: 'rect', fill: '#2a2d36', radiusMm: 2 },
        { kind: 'text', id: 'title', x: 5, y: 55, w: 53, h: 8, bind: { field: 'title' }, font: { family: 'system-ui', sizePt: 12, weight: 800 }, color: '#fff' },
        ...(has(fields, 'body') ? [{ kind: 'text' as const, id: 'body', x: 5, y: 64, w: 53, h: 20, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 8 }, color: '#cfd3dc' }] : []),
        ...(has(fields, 'cost') ? [{ kind: 'text' as const, id: 'cost', x: 48, y: 4, w: 11, h: 8, bind: { field: 'cost' }, font: { family: 'system-ui', sizePt: 14, weight: 800 as const, align: 'center' as const }, color: '#fff', fit: 'fixed' as const }] : []),
      ],
      variants: {},
    }),
  },
]

export const DEFAULT_FIELDS: Field[] = [
  { key: 'title', label: 'Titel', kind: 'text' },
  { key: 'cost', label: 'Kostnad', kind: 'number' },
  { key: 'body', label: 'Text', kind: 'text' },
  { key: 'art', label: 'Illustration', kind: 'image' },
]
