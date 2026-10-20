// @vitest-environment jsdom
// The television is the host's screen and speaks the host's language (#756, beställarens beslut, A4).
// The editor's links to the table carry the language they were followed in as `?lang=`, and the
// table remembers it: a reload, an ended table's status page or the next table on that screen
// speaks it too. There is no language picker on the felt.
import { afterEach, describe, expect, it } from 'vitest'
import { joinUrl, observeUrl, onlineUrl, tableModeUrl, tvUrl } from '../src/editor/tableLinks.js'
import { chosenLang } from '../src/i18n/index.js'
import { rememberTableLang } from '../src/table/tableLang.js'

afterEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})

describe('the ways to the table carry the host’s language (#756)', () => {
  it('puts ?lang= on the television, the table mode, playing from here and watching', () => {
    for (const url of [tvUrl('s1', null, undefined, true, 'en'), tableModeUrl('s1', null, true, 'en'), onlineUrl('s1', null, 'A', true, undefined, 'en'), observeUrl('s1', null, true, undefined, 'en')]) {
      expect(new URL(url, 'http://x').searchParams.get('lang')).toBe('en')
    }
  })

  it('leaves the phones’ way in alone: a player follows her own browser', () => {
    expect(new URL(joinUrl('ABC123', null)).searchParams.has('lang')).toBe(false)
  })
})

describe('the table remembers the language it was opened in (#756)', () => {
  it('keeps a ?lang= it was opened with for the next visit', () => {
    history.replaceState(null, '', '/table?session=s1&mode=tv&lang=en')
    rememberTableLang()
    expect(chosenLang()).toBe('en')
  })

  it('remembers nothing when the address asks for no language, or for one the tool does not speak', () => {
    history.replaceState(null, '', '/table?session=s1&mode=tv')
    rememberTableLang()
    expect(chosenLang()).toBeNull()
    history.replaceState(null, '', '/table?session=s1&mode=tv&lang=de')
    rememberTableLang()
    expect(chosenLang()).toBeNull()
  })
})
