import type { ProjectDoc } from '@byd/server'
import { openingSetup } from '@byd/server/doc'
import type { Template } from '@byd/template'

/** What a table in this suite is made of: how many sit at it, what they count, and the deck. */
export type Game = {
  players?: number
  counters?: { name: string; start: number }[]
  /** How many different cards. Each becomes one row; `copies` says how many of each are dealt. */
  cards?: number
  copies?: number
  name?: string
}

// A card with a title and a body and nothing else. The template is deliberately plain: a journey
// here is about a card arriving somewhere, being turned over, or being hidden from someone, and
// what is drawn on its face is the template suite's question and never this one's.
function template(): Template {
  return {
    faces: {
      front: {
        base: [
          { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#333', strokeMm: 0.5, radiusMm: 3 },
          { kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14, weight: 700 }, color: '#111' },
          { kind: 'text', id: 'body', x: 5, y: 30, w: 53, h: 40, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 9 }, color: '#222' },
        ],
        variants: {},
      },
      back: { base: [{ kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' }], variants: {} },
    },
  }
}

/**
 * A game as a project document — the same thing the wizard writes and the editor opens, so a
 * table started from it is started the way every table is started (L4, L5).
 *
 * Every card gets a title nothing else on the table shares. That is not decoration: it is what
 * lets a spec say "this card, and only this card, reached that hand", and what lets the spec
 * about hidden information look for a name in the bytes on the wire and know that finding it
 * means a leak (B6).
 */
export function gameDoc(game: Game = {}): ProjectDoc {
  const players = game.players ?? 4
  const counters = game.counters ?? [{ name: 'Liv', start: 20 }]
  const cards = game.cards ?? 12
  const copies = game.copies ?? 1
  const setup = openingSetup({ players, counters })
  return {
    name: game.name ?? 'Provspelet',
    template: template(),
    rows: Array.from({ length: cards }, (_, i) => ({
      id: `kort-${i + 1}`,
      fields: { title: cardTitle(i), body: `Rad ${i + 1}.`, antal: copies },
    })),
    icons: {},
    fonts: { 'sans-serif': { stack: 'sans-serif', asset: `asset:${'a'.repeat(64)}` } },
    setup,
  }
}

// Titles a person could tell apart across a room and a test can tell apart in a byte stream.
// They are words and not `kort-7`, because a leak spec that searches for `kort-7` in a frame
// would also match the component's own identifier, and then it could never tell a card's
// *identity* leaking from a card's *existence* being known — and only the first is a leak.
const WORDS = ['Björn', 'Varg', 'Räv', 'Lo', 'Järv', 'Älg', 'Hjort', 'Grävling', 'Utter', 'Mård', 'Hare', 'Ekorre', 'Korp', 'Uggla', 'Falk', 'Örn']
export const cardTitle = (i: number): string => `${WORDS[i % WORDS.length]} ${Math.floor(i / WORDS.length) + 1}`
