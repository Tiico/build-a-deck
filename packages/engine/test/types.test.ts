import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, STANDARD_TYPES, TOKEN_COUNTER, TypeRegistry } from '../src/index.js'

// The types every table knows (B1, B2): the standard card, and a counter token — a component
// with a value and one face, which is what a seat's life, gold or score is (C4).
describe('the standard types', () => {
  it('registers the card and the counter token together', () => {
    const registry = new TypeRegistry(STANDARD_TYPES)
    expect(registry.get({ id: CARD_STANDARD_63x88.id, version: 1 }).behaviours.counter).toBe(false)
    const token = registry.get({ id: TOKEN_COUNTER.id, version: 1 })
    expect(TOKEN_COUNTER.id).toBe('token.counter')
    expect(token.behaviours).toMatchObject({ counter: true, stackable: false, shufflable: false, flippable: false })
    expect(token.faces).toEqual(['front'])
  })
})
