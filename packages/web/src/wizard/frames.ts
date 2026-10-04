import type { Element, FaceTemplate } from '@byd/template'
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

// What the frames hand the editor is the designer's from then on (A4), so every layer is named in
// the designer's language rather than by the id the frame finds it by: «cost Kostnad, costbg, …» was
// the frame's own vocabulary in a Swedish editor (#730).
export type Frame = { id: string; name: Key; front(fields: Field[], t: T): FaceTemplate; back(t: T): FaceTemplate }

const has = (fields: Field[], key: string) => fields.some((f) => f.key === key)
// The column a starter field is bound through (#476, L44): what the designer named it, except the
// title, which is the tool's own column and keeps its key. A frame binds by the field's place on
// the card — its key — so «Pris» still lands in the corner.
export const columnOf = (field: Field): string => (field.key === 'title' ? 'title' : field.label.trim())
const at = (fields: Field[], key: string): { field: string } => {
  const found = fields.find((f) => f.key === key)
  return { field: found ? columnOf(found) : key }
}
const plainBack = (fill: string, inner?: string) => (t: T): FaceTemplate => ({
  base: [
    { kind: 'shape', id: 'bg', name: t('wizard.layer.background'), x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill },
    ...(inner ? [{ kind: 'shape' as const, id: 'inner', name: t('wizard.layer.inner'), x: 4, y: 4, w: 55, h: 80, shape: 'rect' as const, fill: inner, radiusMm: 3 }] : []),
  ],
  variants: {},
})
// Where a picture goes, for a game that has a picture field (#730): a quiet plate under the picture's
// box, so a card whose cell is still empty shows where its picture will land, and the picture covers
// it once there is one. A game without a picture field gets neither; a plate there read as «bild hit».
const picture = (fields: Field[], t: T, box: { x: number; y: number; w: number; h: number }, mark: string): Element[] =>
  has(fields, 'art')
    ? [
        { kind: 'shape', id: 'artbg', name: t('wizard.layer.artbg'), ...box, shape: 'rect', fill: mark, radiusMm: 2 },
        { kind: 'image', id: 'art', name: t('wizard.layer.art'), ...box, bind: at(fields, 'art'), fit: 'cover' },
      ]
    : []

const classic: Frame = {
    id: 'classic',
    name: 'wizard.frame.classic',
    back: plainBack('#2f4068', '#3a4d7a'),
    front: (fields, t) => ({
      base: [
        { kind: 'shape', id: 'paper', name: t('wizard.layer.paper'), x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#f4ead8' },
        { kind: 'shape', id: 'frame', name: t('wizard.layer.frame'), x: 3, y: 3, w: 57, h: 82, shape: 'rect', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
        ...picture(fields, t, { x: 4, y: 4, w: 55, h: 36 }, '#e6d9c2'),
        { kind: 'text', id: 'title', name: t('wizard.layer.title'), x: 5, y: 42, w: 53, h: 9, bind: { field: 'title' }, font: { family: THEMED, sizePt: 13, weight: 800 }, color: '#1c1c1c' },
        ...(has(fields, 'body') ? [{ kind: 'text' as const, id: 'body', name: t('wizard.layer.body'), x: 5, y: 53, w: 53, h: 30, bind: at(fields, 'body'), font: { family: THEMED, sizePt: 8.5 }, color: '#333333' }] : []),
        // The circle belongs to the figure in it (L6): a card whose cost is empty gets neither, and a
        // figure wider than the circle shrinks into it rather than running out on both sides (#730).
        ...(has(fields, 'cost')
          ? [
              {
                kind: 'if' as const,
                id: 'hascost',
                when: { field: at(fields, 'cost').field, nonEmpty: true as const },
                children: [
                  { kind: 'shape' as const, id: 'costbg', name: t('wizard.layer.costbg'), x: 49, y: 4.5, w: 9, h: 9, shape: 'circle' as const, fill: '#8b2e2e' },
                  { kind: 'text' as const, id: 'cost', name: t('wizard.layer.cost'), x: 49.5, y: 5.5, w: 8, h: 7, bind: at(fields, 'cost'), font: { family: THEMED, sizePt: 14, weight: 800 as const, align: 'center' as const }, color: '#ffffff', fit: 'shrink' as const },
                ],
              },
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
    front: (fields, t) => ({
      base: [
        { kind: 'shape', id: 'paper', name: t('wizard.layer.paper'), x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#ffffff' },
        { kind: 'shape', id: 'frame', name: t('wizard.layer.frame'), x: 3, y: 3, w: 57, h: 82, shape: 'rect', stroke: '#111111', strokeMm: 0.4, radiusMm: 2 },
        { kind: 'text', id: 'title', name: t('wizard.layer.title'), x: 5, y: 6, w: 44, h: 10, bind: { field: 'title' }, font: { family: THEMED, sizePt: 15, weight: 800 }, color: '#111111' },
        ...(has(fields, 'cost') ? [{ kind: 'text' as const, id: 'cost', name: t('wizard.layer.cost'), x: 49, y: 6, w: 9, h: 10, bind: at(fields, 'cost'), font: { family: THEMED, sizePt: 15, weight: 800 as const, align: 'right' as const }, color: '#111111', fit: 'shrink' as const }] : []),
        { kind: 'shape', id: 'rule', name: t('wizard.layer.rule'), x: 5, y: 18, w: 53, h: 0.5, shape: 'rect', fill: '#111111' },
        ...(has(fields, 'body') ? [{ kind: 'text' as const, id: 'body', name: t('wizard.layer.body'), x: 5, y: 22, w: 53, h: 60, bind: at(fields, 'body'), font: { family: THEMED, sizePt: 10 }, color: '#222222' }] : []),
      ],
      variants: {},
    }),
  },
  {
    id: 'dark',
    name: 'wizard.frame.dark',
    back: plainBack('#0f1115', '#1b1d23'),
    front: (fields, t) => ({
      base: [
        { kind: 'shape', id: 'frame', name: t('wizard.layer.paper'), x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#1b1d23' },
        ...picture(fields, t, { x: 3, y: 3, w: 57, h: 48 }, '#2a2d36'),
        { kind: 'shape', id: 'plate', name: t('wizard.layer.plate'), x: 3, y: 53, w: 57, h: 32, shape: 'rect', fill: '#2a2d36', radiusMm: 2 },
        { kind: 'text', id: 'title', name: t('wizard.layer.title'), x: 5, y: 55, w: 53, h: 8, bind: { field: 'title' }, font: { family: THEMED, sizePt: 12, weight: 800 }, color: '#ffffff' },
        ...(has(fields, 'body') ? [{ kind: 'text' as const, id: 'body', name: t('wizard.layer.body'), x: 5, y: 64, w: 53, h: 20, bind: at(fields, 'body'), font: { family: THEMED, sizePt: 8.5 }, color: '#cfd3dc' }] : []),
        ...(has(fields, 'cost') ? [{ kind: 'text' as const, id: 'cost', name: t('wizard.layer.cost'), x: 48, y: 4, w: 11, h: 8, bind: at(fields, 'cost'), font: { family: THEMED, sizePt: 14, weight: 800 as const, align: 'center' as const }, color: '#ffffff', fit: 'shrink' as const }] : []),
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
