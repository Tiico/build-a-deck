// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Language, LanguagePicker, chosenLang, detectLang, rememberLang, translate, useT } from '../src/i18n/index.js'
import { en } from '../src/i18n/en.js'
import { sv } from '../src/i18n/sv.js'

function Sample() {
  const t = useT()
  return <p>{t('editor.tab.wall')}</p>
}

describe('the tool in the reader\'s own language (A4)', () => {
  it('says the same thing in both languages, and every message exists in both', () => {
    expect(translate('sv', 'editor.tab.wall')).toBe('Kortvägg')
    expect(translate('en', 'editor.tab.wall')).toBe('Card wall')
    // Swedish is the catalogue; English is checked against it key by key, so a message can
    // never be half-translated without the compiler saying so. This is the runtime half.
    expect(Object.keys(en).sort()).toEqual(Object.keys(sv).sort())
    expect(Object.values(en).every((m) => m.trim() !== '')).toBe(true)
  })

  it('puts what a message is about into it, rather than gluing sentences together', () => {
    expect(translate('sv', 'wall.cards.other', { n: 3 })).toContain('3')
    expect(translate('en', 'wall.cards.other', { n: 3 })).toContain('3')
    expect(translate('en', 'wall.cards.one', { n: 1 })).toBe('1 card')
  })

  it('renders in Swedish without being told, and in the language it is given', () => {
    const { unmount } = render(<Sample />)
    expect(screen.getByText('Kortvägg')).toBeTruthy()
    unmount()
    render(
      <Language lang="en">
        <Sample />
      </Language>,
    )
    expect(screen.getByText('Card wall')).toBeTruthy()
  })

  it('switches language where the reader is, and says so to the page itself', async () => {
    const user = userEvent.setup()
    render(
      <Language>
        <LanguagePicker />
        <Sample />
      </Language>,
    )
    expect(screen.getByText('Kortvägg')).toBeTruthy()
    expect(document.documentElement.lang).toBe('sv')
    await user.selectOptions(screen.getByRole('combobox', { name: /språk|language/i }), 'en')
    expect(screen.getByText('Card wall')).toBeTruthy()
    // Assistive technology reads the page in the language the page claims to be in.
    expect(document.documentElement.lang).toBe('en')
  })

  it('carries on where a browser refuses to remember anything', () => {
    // This environment has no local storage at all, which is what a locked-down browser looks
    // like: choosing a language must still work, and detection must still answer.
    expect(() => rememberLang('en')).not.toThrow()
    expect(chosenLang()).toBeNull()
    expect(detectLang()).toBe('en')
  })

  it('takes the language the address asks for before anything else', () => {
    history.replaceState(null, '', '/?lang=sv')
    expect(detectLang()).toBe('sv')
    history.replaceState(null, '', '/')
  })
})
