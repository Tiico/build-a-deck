// PROTOTYPE — the project's history (B4): a few days of edits to look at, and the real diff.
import { diffProjects } from '@byd/server/diff'
import type { ProjectDoc } from '@byd/server'

export type Version = { rev: number; at: string; label?: string; doc: ProjectDoc }
export { diffProjects }

const paper = { kind: 'shape' as const, id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect' as const, fill: '#f4ead8' }
const frame = { kind: 'shape' as const, id: 'frame', x: 3, y: 3, w: 57, h: 82, shape: 'rect' as const, stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 }
const title = { kind: 'text' as const, id: 'title', x: 6, y: 7, w: 51, h: 9, bind: { field: 'title' }, font: { family: 'Georgia, serif', sizePt: 13, weight: 800 as const }, color: '#1c1c1c' }
const body = { kind: 'text' as const, id: 'body', x: 6, y: 30, w: 51, h: 40, bind: { field: 'body' }, font: { family: 'system-ui', sizePt: 9 }, color: '#333333' }
const cost = { kind: 'text' as const, id: 'cost', x: 48, y: 6, w: 10, h: 9, bind: { field: 'cost' }, font: { family: 'system-ui', sizePt: 12, weight: 800 as const, align: 'center' as const }, color: '#8b2e2e' }

const doc = (rows: ProjectDoc['rows'], over: Partial<ProjectDoc> = {}): ProjectDoc => ({
  name: 'Skogens herrar',
  template: { faces: { front: { base: [paper, frame, title, cost, body], variants: {} }, back: { base: [{ ...paper, fill: '#2f4068' }], variants: {} } } },
  rows,
  icons: {},
  setup: { seats: ['A', 'B'], floor: 'table', deckZone: 'draw', zones: [] },
  ...over,
})

const card = (id: string, titleText: string, costValue: number, bodyText: string, antal = 1) => ({ id, fields: { title: titleText, cost: costValue, body: bodyText, antal } })

// Six days of ordinary work: cards added, a cost balanced, a card cut, the deck reordered, and
// the template changed. Two of them were worth naming.
export function history(): Version[] {
  const day = (n: number) => new Date(Date.UTC(2026, 8, n, 9, 30)).toISOString()
  const first = [card('drake', 'Drake', 5, 'Flygande.', 2), card('riddare', 'Riddare', 3, 'Sköld 1.')]
  const second = [...first, card('trollkarl', 'Trollkarl', 4, 'Dra ett kort.')]
  const third = [{ ...second[0]!, fields: { ...second[0]!.fields, cost: 4 } }, second[1]!, second[2]!]
  const fourth = [third[0]!, third[2]!, card('bonde', 'Bonde', 1, 'Skörda ett ax.', 3)]
  const fifth = [fourth[2]!, fourth[0]!, fourth[1]!]
  return [
    { rev: 1, at: day(1), doc: doc(first) },
    { rev: 2, at: day(2), doc: doc(second) },
    { rev: 3, at: day(3), label: 'Första blindtestet', doc: doc(third) },
    { rev: 4, at: day(4), doc: doc(fourth) },
    { rev: 5, at: day(5), doc: doc(fifth) },
    {
      rev: 6,
      at: day(6),
      label: 'Inför tryck',
      doc: doc(fifth, {
        name: 'Skogens andar',
        template: { faces: { front: { base: [paper, frame, title, { ...cost, color: '#2f4068' }, body], variants: {} }, back: { base: [{ ...paper, fill: '#2f4068' }], variants: {} } } },
      }),
    },
  ]
}

// A date as a designer reads it, not as a machine writes it.
export function when(iso: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86400_000)
  if (days <= 0) return 'i dag'
  if (days === 1) return 'i går'
  if (days < 7) return `för ${days} dagar sedan`
  return new Date(iso).toLocaleDateString('sv-SE')
}
