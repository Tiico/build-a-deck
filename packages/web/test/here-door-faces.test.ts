import { describe, expect, it } from 'vitest'
import { doorFaces } from '../src/editor/HereDoor.js'

// The door is the designer's own face (L63): the actor lists people in the order they came, and an
// account with the game open in two tabs is there once, as its first tab, so the second tab finds
// itself by its address.
describe('whose face the door is (L63, #1250)', () => {
  const ada = { id: 'a1', name: 'Ada', email: 'ada@example.com' }
  const ada2 = { id: 'a2', name: 'Ada', email: 'ada@example.com' }
  const bo = { id: 'b1', name: 'Bo', email: 'bo@example.com' }
  const crowd = ['c', 'd', 'e', 'f', 'g'].map((id) => ({ id, name: id.toUpperCase() }))

  it('is this editor, wherever it came in, and the others are the rest in their order', () => {
    expect(doorFaces([bo, ada], ada)).toEqual({ you: ada, shown: [bo], more: 0 })
    expect(doorFaces([ada, bo], ada2)).toEqual({ you: ada, shown: [bo], more: 0 })
    expect(doorFaces([ada], null)).toEqual({ you: ada, shown: [], more: 0 })
  })

  it('draws three others, and from four the last says the rest', () => {
    expect(doorFaces([ada, bo, ...crowd.slice(0, 2)], ada).shown).toHaveLength(3)
    expect(doorFaces([ada, bo, ...crowd.slice(0, 2)], ada).more).toBe(0)
    expect(doorFaces([ada, bo, ...crowd], ada)).toEqual({ you: ada, shown: [bo, crowd[0]], more: 4 })
  })
})
