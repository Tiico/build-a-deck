import type { Lang, Mail } from './auth.js'
import { bands, siteOf, textFoot } from './mail-bands.js'
import { roleWord, type Role } from './roles.js'

// The invitation to a game (D3, #477), in the login mail's three bands (L72, #1107): the paper says
// who invites, to which game and as what, and its one button joins. The foot (#757) is new to it.
// The game's own name is the game's, in every language.

type Asked = {
  // Who invites, by the address she signed in with; nobody signed in is «Någon».
  from?: string | undefined
  // The name she gave her account (#1254), said with the address in brackets: the name is what she
  // wrote and could be anything, and the address is what the reader can trust. The subject carries
  // it too (beslut 3). Without one the letter is the one it was.
  fromName?: string | null | undefined
  game: string
  role: Role
  link: string
  lang: Lang
  contact?: string | undefined
}

export function inviteMail(to: string, a: Asked): Mail {
  const site = siteOf(a.link)
  const role = roleWord(a.role, a.lang)
  const named = a.fromName && a.from ? a.fromName : null
  if (a.lang === 'en') {
    const who = named ? `${named} (${a.from})` : (a.from ?? 'Someone')
    const fine = 'The link works for seven days and only once. If you were not expecting an invitation, you can ignore this mail.'
    const lead = `${who} would like to share the game ${a.game} with you as a ${role}.`
    const subject = named ? `${named} invites you to ${a.game}` : `You are invited to ${a.game}`
    return {
      to,
      subject,
      text: `Hello!\n\n${lead}\n\nClick to join: ${a.link}\n\n${fine}${textFoot(site, a.contact, 'Contact')}`,
      html: bands({ lang: 'en', subject, pre: 'The link works for seven days and only once.', hello: `You are invited to ${a.game}.`, lead, action: { button: 'Join', pasteIt: 'Button not working? Paste the link into your browser:', link: a.link }, fine, contactWord: 'Contact', contact: a.contact }),
    }
  }
  const who = named ? `${named} (${a.from})` : (a.from ?? 'Någon')
  const fine = 'Länken fungerar i sju dagar och bara en gång. Väntade du dig ingen inbjudan kan du ignorera det här mejlet.'
  const lead = `${who} vill dela spelet ${a.game} med dig som ${role}.`
  const subject = named ? `${named} bjuder in dig till ${a.game}` : `Du är inbjuden till ${a.game}`
  return {
    to,
    subject,
    text: `Hej!\n\n${lead}\n\nKlicka för att gå med: ${a.link}\n\n${fine}${textFoot(site, a.contact, 'Kontakt')}`,
    html: bands({ lang: 'sv', subject, pre: 'Länken fungerar i sju dagar och bara en gång.', hello: `Du är inbjuden till ${a.game}.`, lead, action: { button: 'Gå med', pasteIt: 'Fungerar inte knappen? Klistra in länken i webbläsaren:', link: a.link }, fine, contactWord: 'Kontakt', contact: a.contact }),
  }
}
