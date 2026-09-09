// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Language, LanguagePicker, chosenLang, detectLang, rememberLang, translate, useT, type T } from '../src/i18n/index.js'
import { en } from '../src/i18n/en.js'
import { sv } from '../src/i18n/sv.js'
import { svEditor } from '../src/i18n/sv.editor.js'
import { svPlay } from '../src/i18n/sv.play.js'
import { svAccount } from '../src/i18n/sv.account.js'
import { svStatus } from '../src/i18n/sv.status.js'
import { inviteToProject, requestLink } from '../src/account/api.js'
import { ProjectClient } from '../src/editor/ProjectClient.js'

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
    // The catalogue is written in one file per surface and merged into one. Two surfaces that
    // happen to pick the same key would silently overwrite each other, and one of the two texts
    // would simply never be seen; the count says whether that has happened.
    expect(Object.keys(sv)).toHaveLength(Object.keys(svEditor).length + Object.keys(svPlay).length + Object.keys(svAccount).length + Object.keys(svStatus).length)
  })

  // The glossary (A4): one concept, one word. What it retired is the code's own vocabulary leaking
  // into the reader's text — the game a designer made is not a "project" to them, and the surface
  // they play on is not a "session". `leken` is not on the list: a deck is not a game, and both
  // languages already held that difference. A test is what keeps the next key from bringing the
  // retired words back (#38).
  it('calls each thing by the one word the glossary gives it', () => {
    // Word-bounded so a compound that means something else is not caught, and case-insensitive
    // because a word at the start of a sentence is the same word.
    const says = (catalogue: Record<string, string>, words: string[]) =>
      Object.entries(catalogue)
        .filter(([, text]) => words.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(text)))
        .map(([key]) => key)
        .sort()

    expect(says(sv, ['projekt', 'projektet', 'session', 'sessionen', 'sessioner', 'rummet'])).toEqual([])
    // "room code" stays: the code is its own concept and not the table (K12), so the room is only
    // retired where it stands for the table itself.
    expect(says(en, ['project', 'session', 'sessions', 'the room(?!\\s+code)'])).toEqual([])
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

  it('says which language it is asking in, so what the server writes back comes in that language', async () => {
    const seen: { url: string; body: unknown }[] = []
    const real = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      document.documentElement.lang = 'en'
      await requestLink('http://server.test', 'ada@example.com', '/')
      await inviteToProject('http://server.test', 'p1', 'bo@example.com', 'editor')
      expect(seen.map((r) => (r.body as { lang?: string }).lang)).toEqual(['en', 'en'])
      // The page that never said which language it is in asks for nothing in particular.
      document.documentElement.lang = ''
      await requestLink('http://server.test', 'ada@example.com', '/')
      expect((seen.at(-1)?.body as { lang?: string }).lang).toBeUndefined()
    } finally {
      globalThis.fetch = real
      document.documentElement.lang = ''
    }
  })

  it('says what went wrong in the reader\'s language, not in the language the code was written in', async () => {
    const real = globalThis.fetch
    globalThis.fetch = (async () => new Response('{}', { status: 403 })) as typeof fetch
    const english: T = (key, params) => translate('en', key, params)
    try {
      await expect(inviteToProject('http://server.test', 'p1', 'bo@example.com', 'editor', english)).rejects.toThrow('only the owner can share the game')
      await expect(inviteToProject('http://server.test', 'p1', 'bo@example.com', 'editor')).rejects.toThrow('bara ägaren kan dela spelet')
    } finally {
      globalThis.fetch = real
    }
  })

  it('orders the printed rulebook in the language it was ordered in, so its one tool-written heading matches', async () => {
    const seen: string[] = []
    const real = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input))
      return new Response(JSON.stringify({ hash: 'a'.repeat(64) }), { status: 202, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      document.documentElement.lang = 'en'
      const client = Object.create(ProjectClient.prototype) as ProjectClient
      Object.assign(client, { http: 'http://server.test', id: 'p1' })
      await client.orderBooklet()
      expect(seen.at(-1)).toContain('lang=en')
    } finally {
      globalThis.fetch = real
      document.documentElement.lang = ''
    }
  })

  it('takes the language the address asks for before anything else', () => {
    history.replaceState(null, '', '/?lang=sv')
    expect(detectLang()).toBe('sv')
    history.replaceState(null, '', '/')
  })
})
