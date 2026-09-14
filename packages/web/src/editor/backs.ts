// The ready-made backs (L17). Each one is an ordinary element list — a bottom that reaches into
// the bleed, a pattern over it, an inner edge, sometimes a medallion — so a designer who picks
// one can take it apart and change it afterwards. A starting point, not a locked picture.
//
// The bottom reaches 3 mm past the trim on every side, which is the type's bleed: a background
// that stops at the trim leaves a white edge when the knife wanders (E5).
//
// The ids are the document's and never move, so they are written in the same language every
// other id in this codebase is (`frame`, `title`, `art`). The word on each layer is the tool's
// suggestion in the designer's own language and becomes theirs to rename — the same boundary a
// new field's label stands on (A4).
import type { Element } from '@byd/template'
import type { Key, T } from '../i18n/index.js'

type Pattern = NonNullable<Extract<Element, { kind: 'shape' }>['pattern']>

const bottom = (t: T, fill: string, pattern?: Pattern): Element => ({
  kind: 'shape',
  id: 'bottom',
  name: t('canvas.back.layer.bottom'),
  x: -3,
  y: -3,
  w: 69,
  h: 94,
  shape: 'rect',
  fill,
  ...(pattern ? { pattern } : {}),
})

const edge = (t: T, stroke: string): Element => ({ kind: 'shape', id: 'edge', name: t('canvas.back.layer.edge'), x: 4, y: 4, w: 55, h: 80, shape: 'rect', radiusMm: 3, stroke, strokeMm: 0.6 })

export type Back = { id: string; name: Key; base(t: T): Element[] }

// A factory per back, and deliberately so: a designer who picks the same back twice must not be
// handed the same element objects the first pick put in the document.
export const BACKS: readonly Back[] = [
  { id: 'plain', name: 'canvas.back.plain', base: (t) => [bottom(t, '#2f4068')] },
  { id: 'diamonds', name: 'canvas.back.diamonds', base: (t) => [bottom(t, '#2f4068', { kind: 'diamonds', color: '#3a4d7a', scaleMm: 7 }), edge(t, '#8ea2cc')] },
  { id: 'stripes', name: 'canvas.back.stripes', base: (t) => [bottom(t, '#6d2230', { kind: 'stripes', color: '#7d2b3a', scaleMm: 5, angleDeg: 45 }), edge(t, '#d9a7b0')] },
  { id: 'grid', name: 'canvas.back.grid', base: (t) => [bottom(t, '#1f3b2f', { kind: 'grid', color: '#2f5a47', scaleMm: 5 }), edge(t, '#8fc2ab')] },
  { id: 'dots', name: 'canvas.back.dots', base: (t) => [bottom(t, '#24262e', { kind: 'dots', color: '#343846', scaleMm: 4 }), edge(t, '#8d93a8')] },
  { id: 'chevron', name: 'canvas.back.chevron', base: (t) => [bottom(t, '#2b2350', { kind: 'chevron', color: '#3b3070', scaleMm: 6 }), edge(t, '#a79ad6')] },
  {
    id: 'medallion',
    name: 'canvas.back.medallion',
    base: (t) => [
      bottom(t, '#2f4068', { kind: 'diamonds', color: '#3a4d7a', scaleMm: 7 }),
      edge(t, '#8ea2cc'),
      { kind: 'shape', id: 'medallion', name: t('canvas.back.layer.medallion'), x: 16, y: 29, w: 31, h: 31, shape: 'circle', fill: '#1d2a48', stroke: '#8ea2cc', strokeMm: 0.6 },
      { kind: 'shape', id: 'star', name: t('canvas.back.layer.star'), x: 22, y: 35, w: 19, h: 19, shape: 'star', corners: 5, innerRatio: 0.45, fill: '#c9b05f' },
    ],
  },
]
