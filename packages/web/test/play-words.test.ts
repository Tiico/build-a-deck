import { describe, expect, it } from 'vitest'
import { translate } from '../src/i18n/index.js'

// The words the phone and the table say while a game is played (#714), per string.
describe('the play words (#714)', () => {
  it('says one card chosen in the singular', () => {
    expect(translate('sv', 'player.hint.selected.one', { n: 1 })).toBe('1 valt · dra upp för att spela')
    expect(translate('sv', 'player.hint.selected.other', { n: 2 })).toBe('2 valda · dra upp för att spela')
  })
})
