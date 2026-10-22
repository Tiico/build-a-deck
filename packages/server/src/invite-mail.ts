import type { Lang, Mail } from './auth.js'
import { bands, siteOf, textFoot } from './mail-bands.js'
import { roleWord, type Role } from './roles.js'

// The invitation to a game (D3, #477), in the login mail's three bands (L72, #1107): the paper says
// who invites, to which game and as what, and its one button joins. The foot (#757) is new to it.
// The game's own name is the game's, in every language.

type Asked = {
  // Who invites, by the address she signed in with; nobody signed in is «Någon».
  from?: string | undefined
  game: string
  role: Role
  link: string
  lang: Lang
  contact?: string | undefined
}

export function inviteMail(to: string, a: Asked): Mail {
  const site = siteOf(a.link)
  const role = roleWord(a.role, a.lang)
  if (a.lang === 'en') {
    const who = a.from ?? 'Someone'
    const fine = 'The link works for seven days and only once. If you were not expecting an invitation, you can ignore this mail.'
    const lead = `${who} would like to share the game ${a.game} with you as a ${role}.`
    return {
      to,
      subject: `You are invited to ${a.game}`,
      text: `Hello!\n\n${lead}\n\nClick to join: ${a.link}\n\n${fine}${textFoot(site, a.contact, 'Contact')}`,
      html: bands({ lang: 'en', subject: `You are invited to ${a.game}`, pre: 'The link works for seven days and only once.', hello: `You are invited to ${a.game}.`, lead, button: 'Join', fine, pasteIt: 'Button not working? Paste the link into your browser:', contactWord: 'Contact', link: a.link, contact: a.contact }),
    }
  }
  const who = a.from ?? 'Någon'
  const fine = 'Länken fungerar i sju dagar och bara en gång. Väntade du dig ingen inbjudan kan du ignorera det här mejlet.'
  const lead = `${who} vill dela spelet ${a.game} med dig som ${role}.`
  return {
    to,
    subject: `Du är inbjuden till ${a.game}`,
    text: `Hej!\n\n${lead}\n\nKlicka för att gå med: ${a.link}\n\n${fine}${textFoot(site, a.contact, 'Kontakt')}`,
    html: bands({ lang: 'sv', subject: `Du är inbjuden till ${a.game}`, pre: 'Länken fungerar i sju dagar och bara en gång.', hello: `Du är inbjuden till ${a.game}.`, lead, button: 'Gå med', fine, pasteIt: 'Fungerar inte knappen? Klistra in länken i webbläsaren:', contactWord: 'Kontakt', link: a.link, contact: a.contact }),
  }
}
