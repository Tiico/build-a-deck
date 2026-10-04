import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Key, Messages } from './sv.js'

// The tool in the reader's own language (A4). The infrastructure is deliberately small: a
// catalogue per language, one lookup, and a React context that says which language is on. There
// is no message framework, because the whole need is a lookup and a substitution.
//
// What a designer wrote is never translated. The tool speaks the reader's language; the game
// speaks its own.
export type Lang = 'sv' | 'en'
export const LANGS: readonly Lang[] = ['sv', 'en']
export const LANG_NAMES: Record<Lang, string> = { sv: 'Svenska', en: 'English' }

// The catalogue travels in parts, one per surface and language, and a page fetches only the parts
// its surface speaks in the reader's language (#760). Until then every page carried both
// languages and every surface's words — the editor's six hundred messages on a phone that shows a
// strip of cards. `status` is the shell's: what every route can say whichever surface it is.
//
// `sv.ts` and `en.ts` still merge the whole catalogue, and are still where a key's type and the
// promise that both languages hold the same keys live; nothing at runtime imports them.
export const PARTS = ['status', 'play', 'account', 'editor'] as const
export type Part = (typeof PARTS)[number]

const FETCH: Record<Lang, Record<Part, () => Promise<Partial<Messages>>>> = {
  sv: {
    status: () => import('./sv.status.js').then((m) => m.svStatus),
    play: () => import('./sv.play.js').then((m) => m.svPlay),
    account: () => import('./sv.account.js').then((m) => m.svAccount),
    editor: () => import('./sv.editor.js').then((m) => m.svEditor),
  },
  en: {
    status: () => import('./en.status.js').then((m) => m.enStatus),
    play: () => import('./en.play.js').then((m) => m.enPlay),
    account: () => import('./en.account.js').then((m) => m.enAccount),
    editor: () => import('./en.editor.js').then((m) => m.enEditor),
  },
}

const held: Record<Lang, Partial<Messages>> = { sv: {}, en: {} }
const heldParts: Record<Lang, Set<Part>> = { sv: new Set(), en: new Set() }
const fetching = new Map<string, Promise<void>>()

/** Fetches these parts of the catalogue in this language, once; a part already held costs nothing. */
export function loadWords(lang: Lang, parts: readonly Part[]): Promise<void> {
  return Promise.all(
    parts.map((part) => {
      const id = `${lang}.${part}`
      const known = fetching.get(id)
      if (known) return known
      const asked = FETCH[lang][part]().then(
        (messages) => {
          Object.assign(held[lang], messages)
          heldParts[lang].add(part)
        },
        (err: unknown) => {
          // Not remembered as failed: the next page that asks may be on a line that works.
          fetching.delete(id)
          throw err
        },
      )
      fetching.set(id, asked)
      return asked
    }),
  ).then(() => undefined)
}

/** Whether every one of these parts is already held in this language. */
export function holdsWords(lang: Lang, parts: readonly Part[]): boolean {
  return parts.every((part) => heldParts[lang].has(part))
}

/** The parts held in this language: what a switch to another language has to fetch for it. */
export function heldWords(lang: Lang): Part[] {
  return PARTS.filter((part) => heldParts[lang].has(part))
}

/** Puts a catalogue in hand without fetching it — for a test, or a surface mounted on its own. */
export function holdWords(lang: Lang, messages: Partial<Messages>): void {
  Object.assign(held[lang], messages)
}

// The reader's language first; then Swedish, because Swedish is the catalogue, and then whatever
// else is held, so a caller that asks in a language the page never fetched is answered in the
// one it did. A message held in neither is a route that reached a word its parts do not carry —
// a bug, said on the console and drawn as its key rather than as nothing.
export function translate(lang: Lang, key: Key, params?: Record<string, string | number>): string {
  const message = held[lang][key] ?? held.sv[key] ?? held.en[key]
  if (message === undefined) {
    console.error(`i18n: «${key}» is not among the words this page fetched (${lang}: ${heldWords(lang).join(', ') || 'none'})`)
    return key
  }
  if (!params) return message
  return message.replace(/\{(\w+)(:s)?\}/g, (whole, name: string, owns: string | undefined) =>
    name in params ? (owns ? possessive(lang, String(params[name])) : String(params[name])) : whole,
  )
}

// Whose a thing is, in the reader's own language (A4).
//
// A possessive is grammar and not text, so it cannot be written into a message: `{name}s räknare`
// is right for `Ada` and wrong for both of the other two cases a seat's name comes in. It cannot
// live at the call site either — the call site has a name and no language. So a message asks for
// it, `{name:s}`, and the language answers.
//
// Swedish: a name takes a plain `s` (`Adas`), a single letter or an abbreviation takes a colon
// first (`A:s`, `TV:s`) — which is what the felt gets until a seat is claimed — and a name that
// already ends in the s-sound takes nothing at all (`Lars`, `Max`). The abbreviation is read off
// the last character rather than off the whole word: a name ends in a small letter and an
// abbreviation or a number does not, and that one difference decides all three Swedish cases in
// the order they are asked below.
//
// English: `Ada’s`, `A’s`, and `Lars’` — the apostrophe stays and only the s falls away. The
// letter is no special case there, which is the whole reason this is a rule per language and not
// one rule with a language-shaped hole in it.
const POSSESSIVE: Record<Lang, (name: string) => string> = {
  sv: (name) => {
    const last = name.slice(-1)
    if (last !== last.toLowerCase()) return `${name}:s`
    if (last === last.toUpperCase()) return `${name}:s`
    return 'sxz'.includes(last) ? name : `${name}s`
  },
  en: (name) => (name.slice(-1).toLowerCase() === 's' ? `${name}’` : `${name}’s`),
}
export function possessive(lang: Lang, name: string): string {
  return name === '' ? '' : POSSESSIVE[lang](name)
}

export type T = (key: Key, params?: Record<string, string | number>) => string

// `asked` is a language on its way: chosen, and still fetching its words. The page goes on in the
// one it has until they arrive, and the picker already shows what was chosen.
type LangState = { lang: Lang; asked: Lang | null; setLang(lang: Lang): void }
const LangContext = createContext<LangState | null>(null)

// Without a provider the tool speaks Swedish, which is what a surface mounted on its own — a
// preview, a test — should be.
export function useLang(): LangState {
  return useContext(LangContext) ?? { lang: 'sv', asked: null, setLang: () => undefined }
}

export function useT(): T {
  const { lang } = useLang()
  return useMemo(() => (key: Key, params?: Record<string, string | number>) => translate(lang, key, params), [lang])
}

// The language the tool speaks under this provider. Without one it is Swedish — the catalogue's
// own language — so a surface mounted on its own is never accidentally half-translated; the app
// itself passes what `detectLang` found. A switch here is remembered for the next visit.
//
// A switch fetches the other language's words for every part this page holds before it changes
// anything (#760). Until they are in hand the page stands as it was, whole and in the old
// language; then every word changes in one render. Never a blank frame, never a key, never half
// a page in each language.
export type LanguageProps = { lang?: Lang; children: ReactNode }
export function Language({ lang, children }: LanguageProps) {
  const [current, setCurrent] = useState<Lang>(lang ?? 'sv')
  const [asked, setAsked] = useState<Lang | null>(null)
  // The last language asked for: a choice overtaken by another before its words arrived is dropped.
  const wanted = useRef<Lang | null>(null)
  // The address wins over what was chosen a moment ago: a link with `?lang=` is a request.
  useEffect(() => {
    if (lang) setCurrent(lang)
  }, [lang])
  const value = useMemo(
    () => ({
      lang: current,
      asked,
      setLang: (next: Lang) => {
        wanted.current = next
        const speak = () => {
          rememberLang(next)
          wanted.current = null
          setAsked(null)
          setCurrent(next)
          document.documentElement.lang = next
        }
        const parts = heldWords(current)
        if (holdsWords(next, parts)) return speak()
        setAsked(next)
        void loadWords(next, parts).then(
          () => {
            if (wanted.current === next) speak()
          },
          () => {
            // A line that failed leaves the page in the language it could say everything in.
            if (wanted.current !== next) return
            wanted.current = null
            setAsked(null)
          },
        )
      },
    }),
    [current, asked],
  )
  useEffect(() => {
    document.documentElement.lang = current
  }, [current])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function LanguagePicker() {
  const { lang, asked, setLang } = useLang()
  return (
    <select aria-label="Språk / Language" value={asked ?? lang} onChange={(e) => setLang(e.target.value as Lang)}>
      {LANGS.map((l) => (
        <option key={l} value={l}>
          {LANG_NAMES[l]}
        </option>
      ))}
    </select>
  )
}

// Written out again in `detect.ts`, which may not reach for this one (it runs before the entry).
const REMEMBERED = 'byd.lang'

// What the reader chose, if they ever chose: a browser that refuses storage simply has no
// choice remembered, which is not an error.
export function chosenLang(): Lang | null {
  try {
    const kept = localStorage.getItem(REMEMBERED)
    return isLang(kept) ? kept : null
  } catch {
    return null
  }
}
export function rememberLang(lang: Lang | null): void {
  try {
    if (lang) localStorage.setItem(REMEMBERED, lang)
    else localStorage.removeItem(REMEMBERED)
  } catch {
    // A browser that refuses storage still switches language; it just forgets by the next visit.
  }
}

export { detectLang } from './detect.js'

// Which variety of the tool's language the reader reads a clock and a date in (#755). The
// catalogue is `en`, but `en` alone is the American reading, so a reader in en-GB was told
// «10:53 AM». The browser's own languages say which English it is; one of another language says
// nothing about this one, and then the catalogue's own code stands.
export function readerLocale(lang: Lang): string {
  const asked = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])
  return asked.find((l) => typeof l === 'string' && l.toLowerCase().split('-')[0] === lang) ?? lang
}

export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang)
export type { Key, Messages }
