import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { sv, type Key, type Messages } from './sv.js'
import { en } from './en.js'

// The tool in the reader's own language (A4). The infrastructure is deliberately small: a
// catalogue per language, one lookup, and a React context that says which language is on. There
// is no message framework, because the whole need is a lookup and a substitution.
//
// What a designer wrote is never translated. The tool speaks the reader's language; the game
// speaks its own.
export type Lang = 'sv' | 'en'
export const LANGS: readonly Lang[] = ['sv', 'en']
export const LANG_NAMES: Record<Lang, string> = { sv: 'Svenska', en: 'English' }

const CATALOGUES: Record<Lang, Messages> = { sv, en }

// Swedish is what a message falls back to, because Swedish is the catalogue: an English text
// that is somehow missing at runtime shows the original rather than a key.
export function translate(lang: Lang, key: Key, params?: Record<string, string | number>): string {
  const message = CATALOGUES[lang][key] ?? sv[key]
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

const LangContext = createContext<{ lang: Lang; setLang(lang: Lang): void } | null>(null)

// Without a provider the tool speaks Swedish, which is what a surface mounted on its own — a
// preview, a test — should be.
export function useLang(): { lang: Lang; setLang(lang: Lang): void } {
  return useContext(LangContext) ?? { lang: 'sv', setLang: () => undefined }
}

export function useT(): T {
  const { lang } = useLang()
  return useMemo(() => (key: Key, params?: Record<string, string | number>) => translate(lang, key, params), [lang])
}

// The language the tool speaks under this provider. Without one it is Swedish — the catalogue's
// own language — so a surface mounted on its own is never accidentally half-translated; the app
// itself passes what `detectLang` found. A switch here is remembered for the next visit.
export type LanguageProps = { lang?: Lang; children: ReactNode }
export function Language({ lang, children }: LanguageProps) {
  const [current, setCurrent] = useState<Lang>(lang ?? 'sv')
  // The address wins over what was chosen a moment ago: a link with `?lang=` is a request.
  useEffect(() => {
    if (lang) setCurrent(lang)
  }, [lang])
  const value = useMemo(
    () => ({
      lang: current,
      setLang: (next: Lang) => {
        rememberLang(next)
        setCurrent(next)
        document.documentElement.lang = next
      },
    }),
    [current],
  )
  useEffect(() => {
    document.documentElement.lang = current
  }, [current])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function LanguagePicker() {
  const { lang, setLang } = useLang()
  return (
    <select aria-label="Språk / Language" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
      {LANGS.map((l) => (
        <option key={l} value={l}>
          {LANG_NAMES[l]}
        </option>
      ))}
    </select>
  )
}

const REMEMBERED = 'byd.lang'

// What the reader chose, if they ever chose: a browser that refuses storage simply has no
// choice remembered, which is not an error.
export function chosenLang(): Lang | null {
  try {
    const held = localStorage.getItem(REMEMBERED)
    return isLang(held) ? held : null
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

// The reader's own choice first, then the address they followed, then what their browser asks
// for. Nothing else: the tool never guesses from where someone is.
export function detectLang(): Lang {
  const asked = new URLSearchParams(location.search).get('lang')
  if (isLang(asked)) return asked
  const chosen = chosenLang()
  if (chosen) return chosen
  return (navigator.languages ?? [navigator.language]).some((l) => l.toLowerCase().startsWith('sv')) ? 'sv' : 'en'
}

export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang)
export type { Key, Messages }
