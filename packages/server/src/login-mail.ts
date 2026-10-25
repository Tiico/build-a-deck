import type { Lang, Mail } from './auth.js'
import { bands, siteOf, textFoot } from './mail-bands.js'

// The login mail (G1): the first letter a creator gets from Deckster, and for many the only one.
// It went as text alone until #1098, when the beställare chose variant C «Bordet» (2026-10-22):
// the landing page's room in three bands, which `mail-bands.ts` draws for every letter. The text
// part stays beside the HTML, and it is the part the tests have always held.

type Copy = {
  subject: string
  pre: string
  hello: string
  lead: string
  button: string
  fine: string
  pasteIt: string
  contact: string
}

const COPY: Record<Lang, Copy> = {
  sv: {
    subject: 'Logga in på Deckster',
    pre: 'Länken fungerar i 15 minuter och bara en gång.',
    hello: 'Du är på väg in.',
    lead: 'Här är din länk till Deckster. Den loggar in dig; första gången skapar den ditt konto.',
    button: 'Logga in på Deckster',
    fine: 'Länken fungerar i 15 minuter och bara en gång. Har du inte bett om den kan du ignorera det här mejlet.',
    pasteIt: 'Fungerar inte knappen? Klistra in länken i webbläsaren:',
    contact: 'Kontakt',
  },
  en: {
    subject: 'Sign in to Deckster',
    pre: 'The link works for 15 minutes and only once.',
    hello: 'You are on your way in.',
    lead: 'Here is your link to Deckster. It signs you in; the first time, it creates your account.',
    button: 'Sign in to Deckster',
    fine: 'The link works for 15 minutes and only once. If you did not ask for it, you can ignore this mail.',
    pasteIt: 'Button not working? Paste the link into your browser:',
    contact: 'Contact',
  },
}

export function loginMail(to: string, link: string, lang: Lang = 'sv', contact?: string): Mail {
  const c = COPY[lang]
  const site = siteOf(link)
  const text =
    lang === 'en'
      ? `Hello!\n\nClick to sign in: ${link}\n\n${c.fine}${textFoot(site, contact, c.contact)}`
      : `Hej!\n\nKlicka för att logga in: ${link}\n\n${c.fine}${textFoot(site, contact, c.contact)}`
  return { to, subject: c.subject, text, html: bands({ lang, subject: c.subject, pre: c.pre, hello: c.hello, lead: c.lead, fine: c.fine, action: { button: c.button, pasteIt: c.pasteIt, link }, contactWord: c.contact, contact }) }
}
