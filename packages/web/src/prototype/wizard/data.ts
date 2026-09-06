// PROTOTYPE — throwaway. Frames for the gallery step, and the state a wizard builds up.
import type { FaceTemplate, Row } from '@byd/template'

export type Field = { key: string; label: string; kind: 'text' | 'number' | 'image' }
export const DEFAULT_FIELDS: Field[] = [
  { key: 'title', label: 'Titel', kind: 'text' },
  { key: 'cost', label: 'Kostnad', kind: 'number' },
  { key: 'body', label: 'Text', kind: 'text' },
]

export type Frame = { id: string; name: string; blurb: string; face(fields: Field[]): FaceTemplate }

const has = (fields: Field[], key: string) => fields.some((f) => f.key === key)

export const FRAMES: Frame[] = [
  {
    id: 'classic',
    name: 'Klassisk',
    blurb: 'Konstyta upptill, titel och text under, kostnad i hörnet.',
    face: (fields) => ({
      base: [
        { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
        { kind: 'shape', id: 'art', x: 4, y: 4, w: 55, h: 36, shape: 'rect', fill: '#c9b8a0', radiusMm: 2 },
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
  },
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'Bara text på vit botten. Snabbast att läsa vid bordet.',
    face: (fields) => ({
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
    blurb: 'Mörk ram, ljus text, konstyta som fyller hela kortet.',
    face: (fields) => ({
      base: [
        { kind: 'shape', id: 'frame', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#1b1d23' },
        { kind: 'shape', id: 'art', x: 3, y: 3, w: 57, h: 48, shape: 'rect', fill: '#3a4d7a', radiusMm: 2 },
        { kind: 'shape', id: 'plate', x: 3, y: 53, w: 57, h: 32, shape: 'rect', fill: '#2a2d36', radiusMm: 2 },
        { kind: 'text', id: 'title', x: 5, y: 55, w: 53, h: 8, bind: { field: 'title' }, font: { family: 'system-ui', sizePt: 12, weight: 800 }, color: '#fff' },
        ...(has(fields, 'body') ? [{ kind: 'text' as const, id: 'body', x: 5, y: 64, w: 53, h: 20, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 8 }, color: '#cfd3dc' }] : []),
        ...(has(fields, 'cost') ? [{ kind: 'text' as const, id: 'cost', x: 48, y: 4, w: 11, h: 8, bind: { field: 'cost' }, font: { family: 'system-ui', sizePt: 14, weight: 800 as const, align: 'center' as const }, color: '#fff', fit: 'fixed' as const }] : []),
      ],
      variants: {},
    }),
  },
]

export const SAMPLE_CSV = `title,cost,body
Drake,5,Flygande. När Drake anfaller: gör 2 skada på alla motståndare.
Riddare,3,Sköld 1. Kostar 1 mindre om du kontrollerar ett **Torn**.
Trollkarl,2,När du spelar Trollkarl: dra ett kort.
Tjuv,1,Ta ett slumpmässigt kort från en motståndares hand.`

// Comma or tab separated, first line is the header. Prototype-grade.
export function parseCsv(text: string): { headers: string[]; rows: Row[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const sep = lines[0]!.includes('\t') ? '\t' : ','
  const headers = lines[0]!.split(sep).map((h) => h.trim())
  const rows = lines.slice(1).map((l) => {
    const cells = l.split(sep)
    const row: Row = {}
    headers.forEach((h, i) => (row[h] = cells[i]?.trim() ?? ''))
    return row
  })
  return { headers, rows }
}

export type WizardState = { name: string; players: number; fields: Field[]; frame: string; rows: Row[] }
export const initial = (): WizardState => ({ name: '', players: 2, fields: DEFAULT_FIELDS, frame: 'classic', rows: [] })
