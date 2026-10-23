import type { PrintManifest } from '../src/index.js'

const CARD = { id: 'card.standard.63x88', version: 1 }

// A small game that has everything a print order has to keep straight: cards on the base back,
// a card group with a back of its own (L7), a card in two copies, card ids a file system would
// not take as they are and that fold to one name, and dice the partner may or may not pack (#1140).
export const CONTRACT_MANIFEST: PrintManifest = {
  cards: [
    { cardRef: 'eld', type: CARD, faces: { front: 'front:eld', back: 'back:bas' } },
    { cardRef: 'vatten', type: CARD, faces: { front: 'front:vatten', back: 'back:bas' } },
    { cardRef: 'Älg på väg', type: CARD, faces: { front: 'front:alg', back: 'back:bas' } },
    { cardRef: 'Älg på väg', type: CARD, faces: { front: 'front:alg', back: 'back:bas' } },
    { cardRef: 'drake', type: CARD, faces: { front: 'front:drake', back: 'back:skurk' } },
    { cardRef: 'troll', type: CARD, faces: { front: 'front:troll', back: 'back:skurk' } },
    // Folds to the same file name as «Älg på väg», and is another card.
    { cardRef: 'Alg på väg', type: CARD, faces: { front: 'front:alg-2', back: 'back:bas' } },
  ],
  hardware: [
    { type: { id: 'die.d6', version: 1 }, count: 2 },
    { type: { id: 'die.d20', version: 1 }, count: 1 },
  ],
}
