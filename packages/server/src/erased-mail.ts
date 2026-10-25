import type { Lang, Mail } from './auth.js'
import { bands, textFoot } from './mail-bands.js'
import { ACCOUNT_SWEEP_DAYS } from './erase.js'

// The last letter (#1280, variant A): the account is deleted, in the login mail's three bands (L72)
// and without a button, since there is nothing left to follow. It says when, which games went with
// it, what the sweep takes later and how long the backups keep anything (DRIFT §5), so that what
// the privacy policy promises is also in her inbox. The games' names are theirs in every language.

type Erased = { at: Date; games: readonly string[]; site: string | null; contact?: string | undefined }

// «A, B och C»: the games as the letter says them.
const listOf = (names: readonly string[], lang: Lang): string => new Intl.ListFormat(lang === 'en' ? 'en-GB' : 'sv-SE', { style: 'long', type: 'conjunction' }).format(names)

export function erasedMail(to: string, lang: Lang, e: Erased): Mail {
  const en = lang === 'en'
  // The box is at home in Sweden, and so is its clock.
  const locale = en ? 'en-GB' : 'sv-SE'
  const day = e.at.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Stockholm' })
  const clock = e.at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })
  // «klockan 14.06» is how Swedish writes the time in prose.
  const time = en ? clock : clock.replace(':', '.')
  const games = e.games.length === 0 ? null : listOf(e.games, lang)
  const copy = en
    ? {
        subject: 'Your Deckster account is deleted',
        hello: 'Your account is deleted',
        lead: `The account ${to} was deleted on ${day} at ${time}.`,
        games: games && `${games} ${e.games.length === 1 ? 'is' : 'are'} deleted with every version and table.`,
        later: `Images and fonts only your games used are removed within ${ACCOUNT_SWEEP_DAYS} days. The backups are kept for eight days and used only to restore the service; if something is restored from them, your account is deleted again.`,
        notYou: e.contact ? `Was it not you? Write to ${e.contact}.` : null,
        fine: 'This is the last mail you will get from Deckster.',
        contact: 'Contact',
      }
    : {
        subject: 'Ditt konto hos Deckster är raderat',
        hello: 'Ditt konto är raderat',
        lead: `Kontot ${to} raderades den ${day} klockan ${time}.`,
        games: games && `${games} är ${e.games.length === 1 ? 'borttaget' : 'borttagna'} med alla versioner och bord.`,
        later: `Bilder och typsnitt som bara dina spel använde tas bort inom ${ACCOUNT_SWEEP_DAYS} dagar. Säkerhetskopiorna sparas i åtta dagar och används bara för att återställa tjänsten; återställs något därifrån raderas ditt konto igen.`,
        notYou: e.contact ? `Var det inte du? Skriv till ${e.contact}.` : null,
        fine: 'Det här är det sista mejlet du får från Deckster.',
        contact: 'Kontakt',
      }
  const more = [copy.games, copy.later, copy.notYou].filter((p): p is string => p !== null)
  const text = `${en ? 'Hello!' : 'Hej!'}\n\n${[copy.lead, ...more].join('\n\n')}\n\n${copy.fine}${textFoot(e.site, e.contact, copy.contact)}`
  return {
    to,
    subject: copy.subject,
    text,
    html: bands({ lang, subject: copy.subject, pre: copy.lead, hello: copy.hello, lead: copy.lead, more, fine: copy.fine, ...(e.site ? { action: { site: e.site } } : {}), contactWord: copy.contact, contact: e.contact }),
  }
}
