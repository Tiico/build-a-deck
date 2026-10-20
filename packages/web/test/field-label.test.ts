import { describe, expect, it } from 'vitest'
import { fieldLabel } from '../src/editor/fields.js'
import { translate } from '../src/i18n/index.js'

// The two columns the tool owns are shown in the designer's own language (#476, L44): `antal`
// always was, and the card's title now is too, so the guided start and the editor's table say the
// same word for it. Every other column is its name, as written.
describe('the name a column is shown by (#476)', () => {
  const sv = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('sv', key, params)
  const en = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate('en', key, params)

  it('shows the title and antal in the reader s language, and every other column as it is named', () => {
    expect(fieldLabel('title', sv)).toBe('Titel')
    expect(fieldLabel('title', en)).toBe('Title')
    expect(fieldLabel('antal', sv)).toBe('Antal')
    expect(fieldLabel('Pris', sv)).toBe('Pris')
  })
})
