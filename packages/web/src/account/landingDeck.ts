import type { Element, FaceTemplate, Row } from '@byd/template'
import type { Lang } from '../i18n/index.js'

// The deck the landing page plays with (#1009, beställarens beslut A): «Skogens herrar», five cards
// and a back, made up for the page and written as an ordinary template. It is drawn by the same
// `CardPreview` every other card in the tool is drawn by, so the page never draws a card of its
// own: what a visitor sees on the felt is what the editor would show for the same rows.
//
// Nothing in it is fetched. The pictures are shapes and the type is the system's own face, so the
// first screen waits for no template, font or file — the start page's own rule (G1, #231).

const W = 63
const H = 88
const BLEED = 3
const PAPER = '#f7f1e3'
const INK = '#1c1c1c'
const AMBER = '#f0b64a'
const WHITE = '#ffffff'
const FAMILY = 'system-ui, sans-serif'

// The picture's colour, one per motif, so each card is told apart at a glance on a phone.
const MOON = '#5b7bd5'
const FOX = '#d27a3c'
const HUES: Record<string, string> = { moon: MOON, tree: '#3f8f5a', waves: '#4f9aa0', fox: FOX, crown: '#9a6ad0' }

const rect = (id: string, x: number, y: number, w: number, h: number, style: Partial<Extract<Element, { kind: 'shape' }>>): Element => ({ kind: 'shape', id, x, y, w, h, shape: 'rect', ...style })
const circle = (id: string, x: number, y: number, d: number, style: Partial<Extract<Element, { kind: 'shape' }>>): Element => ({ kind: 'shape', id, x, y, w: d, h: d, shape: 'circle', ...style })
const when = (motif: string, children: Element[]): Element => ({ kind: 'if', id: `if-${motif}`, when: { field: 'motif', equals: motif }, children })

// The picture's box, and its centre, which every motif is drawn around.
const ART = { x: 4, y: 14, w: 55, h: 42 }
const CX = ART.x + ART.w / 2
const CY = ART.y + ART.h / 2

const motifs: Element[] = [
  // A crescent: a white disc with a disc of the picture's own colour laid over its side.
  when('moon', [circle('moon', CX - 11, CY - 12, 24, { fill: WHITE, opacity: 0.92 }), circle('moon-cut', CX - 4, CY - 15, 22, { fill: MOON }), circle('star', CX + 11, CY - 4, 2, { fill: WHITE })]),
  when('tree', [
    { kind: 'shape', id: 'tree-top', x: CX - 9, y: CY - 16, w: 18, h: 14, shape: 'polygon', corners: 3, fill: WHITE, opacity: 0.92 },
    { kind: 'shape', id: 'tree-low', x: CX - 12, y: CY - 7, w: 24, h: 17, shape: 'polygon', corners: 3, fill: WHITE, opacity: 0.92 },
    rect('tree-trunk', CX - 1.5, CY + 9, 3, 6, { fill: WHITE, opacity: 0.92 }),
  ]),
  when('waves', [-8, 0, 8].map((dy, i) => rect(`wave-${i}`, CX - 15, CY + dy - 1.25, 30, 2.5, { fill: WHITE, radiusMm: 1.25, opacity: 0.9 }))),
  when('fox', [
    {
      kind: 'shape',
      id: 'fox',
      x: CX - 14,
      y: CY - 13,
      w: 28,
      h: 26,
      shape: 'polygon',
      fill: WHITE,
      opacity: 0.92,
      points: [
        { x: 0, y: 0 },
        { x: 9, y: 7 },
        { x: 19, y: 7 },
        { x: 28, y: 0 },
        { x: 26, y: 13 },
        { x: 14, y: 26 },
        { x: 2, y: 13 },
      ],
    },
    circle('fox-eye-l', CX - 6, CY + 1, 2.4, { fill: FOX }),
    circle('fox-eye-r', CX + 3.6, CY + 1, 2.4, { fill: FOX }),
  ]),
  when('crown', [
    {
      kind: 'shape',
      id: 'crown',
      x: CX - 15,
      y: CY - 12,
      w: 30,
      h: 20,
      shape: 'polygon',
      fill: WHITE,
      opacity: 0.92,
      points: [
        { x: 0, y: 4 },
        { x: 8, y: 11 },
        { x: 15, y: 0 },
        { x: 22, y: 11 },
        { x: 30, y: 4 },
        { x: 27, y: 20 },
        { x: 3, y: 20 },
      ],
    },
    rect('crown-foot', CX - 12, CY + 10, 24, 3, { fill: WHITE, radiusMm: 1.5, opacity: 0.92 }),
  ]),
]

export const LANDING_FACE: FaceTemplate = {
  variants: {},
  base: [
    rect('paper', -BLEED, -BLEED, W + 2 * BLEED, H + 2 * BLEED, { fill: PAPER }),
    { kind: 'text', id: 'title', x: 4, y: 4, w: 44, h: 9, bind: { field: 'title' }, font: { family: FAMILY, sizePt: 15, weight: 800, lineHeight: 1.05 }, color: INK, fit: 'shrink', valign: 'middle' },
    circle('cost-disc', 50, 3.5, 9, { fill: AMBER }),
    { kind: 'text', id: 'cost', x: 50, y: 3.5, w: 9, h: 9, bind: { field: 'cost' }, font: { family: FAMILY, sizePt: 14, weight: 800, align: 'center' }, color: INK, fit: 'fixed', valign: 'middle' },
    rect('art', ART.x, ART.y, ART.w, ART.h, { fill: { field: 'motif', map: HUES, else: '#6f7a90' }, radiusMm: 2.5 }),
    circle('art-light', ART.x - 6, ART.y - 10, 34, { fill: WHITE, opacity: 0.16 }),
    ...motifs,
    { kind: 'text', id: 'typ', x: 4, y: 58.5, w: 55, h: 5, bind: { field: 'typ' }, font: { family: FAMILY, sizePt: 8.5, weight: 700, letterSpacing: 0.08 }, color: '#5b4a3a', fit: 'fixed' },
    { kind: 'text', id: 'body', x: 4, y: 64.5, w: 55, h: 19.5, bind: { field: 'body' }, font: { family: FAMILY, sizePt: 10.5, lineHeight: 1.2 }, color: INK, fit: 'shrink' },
  ],
}

// The back every pile on the felt shows: diamonds on green inside a paper frame, an amber ring.
export const LANDING_BACK: FaceTemplate = {
  variants: {},
  base: [
    rect('ground', -BLEED, -BLEED, W + 2 * BLEED, H + 2 * BLEED, { fill: '#1d3a2b', pattern: { kind: 'diamonds', color: '#2a5240', scaleMm: 6 } }),
    rect('frame', 2.5, 2.5, W - 5, H - 5, { stroke: PAPER, strokeMm: 2.5, radiusMm: 3 }),
    circle('ring', W / 2 - 12, H / 2 - 12, 24, { stroke: AMBER, strokeMm: 1.8 }),
  ],
}

type Card = { id: string; motif: string; cost: number; title: string; typ: string; body: string }

const CARDS: Record<Lang, Card[]> = {
  sv: [
    { id: 'uggla', motif: 'moon', cost: 2, title: 'Ugglans råd', typ: 'TROLLDOM', body: 'Titta på de tre översta korten. Lägg tillbaka dem i valfri ordning.' },
    { id: 'ek', motif: 'tree', cost: 4, title: 'Ekens väktare', typ: 'VÄSEN', body: 'Kan inte anfallas av kort med kostnad 1.' },
    { id: 'dimma', motif: 'waves', cost: 1, title: 'Dimmans stig', typ: 'PLATS', body: 'Alla spelare drar ett kort.' },
    { id: 'rav', motif: 'fox', cost: 3, title: 'Rävens list', typ: 'TROLLDOM', body: 'Byt ett kort i handen mot det översta i kasthögen.' },
    { id: 'mossa', motif: 'crown', cost: 5, title: 'Mossans drottning', typ: 'VÄSEN', body: 'När hon spelas: ta upp ett kort från kasthögen.' },
  ],
  en: [
    { id: 'uggla', motif: 'moon', cost: 2, title: "The Owl's Counsel", typ: 'SORCERY', body: 'Look at the top three cards. Put them back in any order.' },
    { id: 'ek', motif: 'tree', cost: 4, title: 'Oakwarden', typ: 'SPIRIT', body: 'Cannot be attacked by cards that cost 1.' },
    { id: 'dimma', motif: 'waves', cost: 1, title: 'Mistpath', typ: 'PLACE', body: 'Every player draws a card.' },
    { id: 'rav', motif: 'fox', cost: 3, title: "Fox's Ruse", typ: 'SORCERY', body: 'Swap a card in your hand for the top of the discard pile.' },
    { id: 'mossa', motif: 'crown', cost: 5, title: 'Queen of Moss', typ: 'SPIRIT', body: 'When she is played: take a card from the discard pile.' },
  ],
}

export type LandingCard = { id: string; title: string; row: Row }

export function landingCards(lang: Lang): LandingCard[] {
  return CARDS[lang].map(({ id, title, ...rest }) => ({ id, title, row: { title, ...rest, cost: String(rest.cost) } }))
}
