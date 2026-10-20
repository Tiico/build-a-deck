import { describe, expect, it } from 'vitest'
import { translate } from '../src/i18n/index.js'

// The words the phone and the table say while a game is played (#714), per string.
describe('the play words (#714)', () => {
  it('says one card chosen in the singular', () => {
    expect(translate('sv', 'player.hint.selected.one', { n: 1 })).toBe('1 valt · dra upp för att spela')
    expect(translate('sv', 'player.hint.selected.other', { n: 2 })).toBe('2 valda · dra upp för att spela')
  })

  // A pile is called what its designer called it (B5): «Kortlek» on the felt, and not «draghögen»
  // in the sentences around it.
  it('names the pile a hand goes back to by its own name', () => {
    expect(translate('sv', 'player.hand.empty', { pile: 'Kortlek' })).toBe('Tom hand. Dra ett kort ur Kortlek.')
    expect(translate('sv', 'rewind.ask.body', { pile: 'Kortlek', where: 'före ”x”' })).toBe('Bordet visar hur det såg ut före ”x”. Kortlek blandas om.')
  })
})
