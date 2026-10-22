import { describe, expect, it } from 'vitest'
import { translate } from '../src/i18n/index.js'

// The words the phone and the table say while a game is played (#714), per string.
describe('the play words (#714)', () => {
  it('says one card chosen in the singular', () => {
    expect(translate('sv', 'player.hint.selected.one', { n: 1 })).toBe('1 valt')
    expect(translate('sv', 'player.hint.selected.other', { n: 2 })).toBe('2 valda')
  })

  // A pile is called what its designer called it (B5): «Kortlek» on the felt, and not «draghögen»
  // in the sentences around it.
  it('names the pile a hand goes back to by its own name', () => {
    expect(translate('sv', 'player.hand.empty', { pile: 'Kortlek' })).toBe('Du har inga kort. Dra ett kort från Kortlek.')
    expect(translate('sv', 'rewind.ask.body', { pile: 'Kortlek', where: 'före ”x”' })).toBe('Bordet visar hur det såg ut före ”x”. Kortlek blandas om.')
  })

  // A quarter turn and turning a card over are two physical acts, and «Turn» named both: the ring
  // said «Turn» for the one and the phone «Turn up» for the other (#1134). The beställare chose
  // Rotate and Rotera; «Vrid» beside «Vänd» was one letter-shape from the same word.
  it('names a quarter turn with a word that never names turning a card over', () => {
    expect((['ring.rotate', 'kbd.verb.rotate', 'kbd.card.rotated', 'activity.rotate'] as const).map((key) => translate('en', key, { name: 'wizard', zone: 'Play', who: 'Ada' }))).toEqual([
      'Rotate',
      'Rotate 90°',
      'wizard, card in Play, rotated',
      'Ada rotated a card',
    ])
    expect((['ring.rotate', 'kbd.verb.rotate', 'kbd.card.rotated', 'activity.rotate'] as const).map((key) => translate('sv', key, { name: 'wizard', zone: 'Spelyta', who: 'Ada' }))).toEqual([
      'Rotera',
      'Rotera 90°',
      'wizard, kort i Spelyta, roterat',
      'Ada roterade ett kort',
    ])
  })
})
