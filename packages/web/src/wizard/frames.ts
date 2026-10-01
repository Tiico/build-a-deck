import type { FaceTemplate } from '@byd/template'
import type { Key, T } from '../i18n/index.js'

// The frame gallery (L6): a few looks that bind whatever fields the game has. Elements for
// fields the game lacks are left out, so a game without cost has no cost circle.
export type Field = { key: string; label: string; kind: 'text' | 'number' | 'image' }

// En startram säger var saker står och inte vad de är satta i (L57, #633). Typsnittet var ramens
// enligt #420 — en familj per ram — men kommer nu ur temat som väljs bredvid den, «Utseende»: temat
// sätter varje text i sin rubrikfamilj eller, för prosan, i sin brödtextfamilj, genom samma
// redigering som när ett tema väljs i Speltema (`setTheme`). Ramen skriver därför sina texter i
// `THEMED`, en plats och inget typsnitt, och `buildProject` lägger temat över den i samma andetag;
// ingen ram lämnar guiden utan att ha blivit satt.
//
// Kravet bakom #420 står kvar: temats familjer följer med som projektets egna filer, så den
// guidade starten faller aldrig på den fysiska kontrollen (`wizard-frame-fonts.test.tsx`).
export const THEMED = ''

export type Frame = { id: string; name: Key; front(fields: Field[]): FaceTemplate; back: FaceTemplate }

const has = (fields: Field[], key: string) => fields.some((f) => f.key === key)
// The column a starter field is bound through (#476, L44): what the designer named it, except the
// title, which is the tool's own column and keeps its key. A frame binds by the field's place on
// the card — its key — so «Pris» still lands in the corner.
export const columnOf = (field: Field): string => (field.key === 'title' ? 'title' : field.label.trim())
const at = (fields: Field[], key: string): { field: string } => {
  const found = fields.find((f) => f.key === key)
  return { field: found ? columnOf(found) : key }
}
const plainBack = (fill: string, inner?: string): FaceTemplate => ({
  base: [
    { kind: 'shape', id: 'bg', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill },
    ...(inner ? [{ kind: 'shape' as const, id: 'inner', x: 4, y: 4, w: 55, h: 80, shape: 'rect' as const, fill: inner, radiusMm: 3 }] : []),
  ],
  variants: {},
})

const classic: Frame = {
    id: 'classic',
    name: 'wizard.frame.classic',
    back: plainBack('#2f4068', '#3a4d7a'),
    front: (fields) => ({
      base: [
        { kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#f4ead8' },
        { kind: 'shape', id: 'frame', x: 3, y: 3, w: 57, h: 82, shape: 'rect', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
        ...(has(fields, 'art')
          ? [{ kind: 'image' as const, id: 'art', x: 4, y: 4, w: 55, h: 36, bind: at(fields, 'art'), fit: 'cover' as const }]
          : [{ kind: 'shape' as const, id: 'art', x: 4, y: 4, w: 55, h: 36, shape: 'rect' as const, fill: '#c9b8a0', radiusMm: 2 }]),
        { kind: 'text', id: 'title', x: 5, y: 42, w: 53, h: 9, bind: { field: 'title' }, font: { family: THEMED, sizePt: 13, weight: 800 }, color: '#1c1c1c' },
        ...(has(fields, 'body') ? [{ kind: 'text' as const, id: 'body', x: 5, y: 53, w: 53, h: 30, bind: at(fields, 'body'), font: { family: THEMED, sizePt: 8.5 }, color: '#333' }] : []),
        ...(has(fields, 'cost')
          ? [
              { kind: 'shape' as const, id: 'costbg', x: 49, y: 4.5, w: 9, h: 9, shape: 'circle' as const, fill: '#8b2e2e' },
              { kind: 'text' as const, id: 'cost', x: 48, y: 5.5, w: 11, h: 8, bind: at(fields, 'cost'), font: { family: THEMED, sizePt: 14, weight: 800 as const, align: 'center' as const }, color: '#fff', fit: 'fixed' as const },
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
    name: 'wizard.frame.minimal',
    back: plainBack('#111111'),
    front: (fields) => ({
      base: [
        { kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#ffffff' },
        { kind: 'shape', id: 'frame', x: 3, y: 3, w: 57, h: 82, shape: 'rect', stroke: '#111', strokeMm: 0.4, radiusMm: 2 },
        { kind: 'text', id: 'title', x: 5, y: 6, w: 44, h: 10, bind: { field: 'title' }, font: { family: THEMED, sizePt: 15, weight: 800 }, color: '#111' },
        ...(has(fields, 'cost') ? [{ kind: 'text' as const, id: 'cost', x: 49, y: 6, w: 9, h: 10, bind: at(fields, 'cost'), font: { family: THEMED, sizePt: 15, weight: 800 as const, align: 'right' as const }, color: '#111', fit: 'fixed' as const }] : []),
        { kind: 'shape', id: 'rule', x: 5, y: 18, w: 53, h: 0.5, shape: 'rect', fill: '#111' },
        ...(has(fields, 'body') ? [{ kind: 'text' as const, id: 'body', x: 5, y: 22, w: 53, h: 60, bind: at(fields, 'body'), font: { family: THEMED, sizePt: 10 }, color: '#222' }] : []),
      ],
      variants: {},
    }),
  },
  {
    id: 'dark',
    name: 'wizard.frame.dark',
    back: plainBack('#0f1115', '#1b1d23'),
    front: (fields) => ({
      base: [
        { kind: 'shape', id: 'frame', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#1b1d23' },
        ...(has(fields, 'art')
          ? [{ kind: 'image' as const, id: 'art', x: 3, y: 3, w: 57, h: 48, bind: at(fields, 'art'), fit: 'cover' as const }]
          : [{ kind: 'shape' as const, id: 'art', x: 3, y: 3, w: 57, h: 48, shape: 'rect' as const, fill: '#3a4d7a', radiusMm: 2 }]),
        { kind: 'shape', id: 'plate', x: 3, y: 53, w: 57, h: 32, shape: 'rect', fill: '#2a2d36', radiusMm: 2 },
        { kind: 'text', id: 'title', x: 5, y: 55, w: 53, h: 8, bind: { field: 'title' }, font: { family: THEMED, sizePt: 12, weight: 800 }, color: '#fff' },
        ...(has(fields, 'body') ? [{ kind: 'text' as const, id: 'body', x: 5, y: 64, w: 53, h: 20, bind: at(fields, 'body'), font: { family: THEMED, sizePt: 8.5 }, color: '#cfd3dc' }] : []),
        ...(has(fields, 'cost') ? [{ kind: 'text' as const, id: 'cost', x: 48, y: 4, w: 11, h: 8, bind: at(fields, 'cost'), font: { family: THEMED, sizePt: 14, weight: 800 as const, align: 'center' as const }, color: '#fff', fit: 'fixed' as const }] : []),
      ],
      variants: {},
    }),
  },
]

// The fields every new game starts with. The keys are each field's place on the card, which is how
// a frame finds it; the labels are the tool's suggestion in the designer's own language, and are
// the columns the game gets (#476, L44) — except the title's, which is the tool's own column.
export const defaultFields = (t: T): Field[] => [
  { key: 'title', label: t('wizard.field.default.title'), kind: 'text' },
  { key: 'cost', label: t('wizard.field.default.cost'), kind: 'number' },
  { key: 'body', label: t('wizard.field.default.body'), kind: 'text' },
  { key: 'art', label: t('wizard.field.default.art'), kind: 'image' },
]
