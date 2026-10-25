import type { Lang, Mail } from './auth.js'
import { bands, siteOf, textFoot } from './mail-bands.js'
import type { BlockReason, Report, ReportOutcome } from './reports.js'

// The letters a report sends (#1274, DSA art. 16–17), in the login mail's three bands (L72): the
// receipt to whoever reported, with the report repeated; the note to the operator, as plain text to
// Kontakt; the decision to whoever reported; and the reasons to every owner whose game uses a picture
// that has been blocked. What somebody wrote is text in every one of them and never markup.
//
// The promise is two working days (RUNBOOK §8), for a report and for an objection, and the operator
// is who tries an objection: there is one operator in the beta (beslut 3).

const facts = (r: Report, lang: Lang): [string, string][] =>
  lang === 'en'
    ? [
        ['What', r.what],
        ['Where', r.where],
        ['Why', r.why],
        ['Who', [r.name, r.email].filter((s) => s !== '').join(', ') || 'Not given'],
        ['Good faith', `Yes, ${r.at.slice(0, 10)}`],
      ]
    : [
        ['Vad', r.what],
        ['Var', r.where],
        ['Varför', r.why],
        ['Vem', [r.name, r.email].filter((s) => s !== '').join(', ') || 'Inte angivet'],
        ['God tro', `Ja, ${r.at.slice(0, 10)}`],
      ]
const asText = (list: [string, string][]): string => list.map(([k, v]) => `${k}: ${v}`).join('\n')

/** The receipt (DSA art. 16.4): what was reported, as it was written, and what happens next. */
export function receiptMail(r: Report, link: string, contact?: string): Mail {
  const site = siteOf(link)
  const list = facts(r, r.lang)
  if (r.lang === 'en') {
    const subject = `Your report to Deckster is received, ${r.id}`
    const lead = 'A person at Deckster reads it within two working days and mails you the decision. This is what you reported:'
    const fine = `The report is called ${r.id}. Reply to this mail if you want to add anything.`
    return {
      to: r.email,
      subject,
      text: `The report is received.\n\n${lead}\n\n${asText(list)}\n\nHow a report is tried: ${link}\n\n${fine}${textFoot(site, contact, 'Contact')}`,
      html: bands({ lang: 'en', subject, pre: 'Read within two working days.', hello: 'The report is received', lead, facts: list, button: 'How a report is tried', fine, pasteIt: 'Button not working? Paste the link into your browser:', contactWord: 'Contact', link, contact }),
    }
  }
  const subject = `Din anmälan till Deckster är mottagen, ${r.id}`
  const lead = 'En människa på Deckster läser den inom två arbetsdagar och mejlar dig beslutet. Så här löd den:'
  const fine = `Anmälan heter ${r.id}. Svara på det här mejlet om du vill lägga till något.`
  return {
    to: r.email,
    subject,
    text: `Anmälan är mottagen.\n\n${lead}\n\n${asText(list)}\n\nSå prövas en anmälan: ${link}\n\n${fine}${textFoot(site, contact, 'Kontakt')}`,
    html: bands({ lang: 'sv', subject, pre: 'Läses inom två arbetsdagar.', hello: 'Anmälan är mottagen', lead, facts: list, button: 'Så prövas en anmälan', fine, pasteIt: 'Fungerar inte knappen? Klistra in länken i webbläsaren:', contactWord: 'Kontakt', link, contact }),
  }
}

/** To Kontakt: a report has come, and how to answer it (RUNBOOK §8). Plain text; the operator reads it. */
export function operatorMail(to: string, r: Report): Mail {
  return {
    to,
    subject: `Anmälan ${r.id}`,
    text: `${asText(facts(r, 'sv'))}\n\nSvara inom två arbetsdagar (RUNBOOK §8):\n  pnpm --filter @byd/server report show ${r.id}`,
  }
}

const decided: Record<ReportOutcome, Record<Lang, { hello: string; lead: string }>> = {
  held: {
    sv: { hello: 'Anmälan höll', lead: 'Deckster har prövat din anmälan och spärrat det du anmälde. Den som laddade upp det har fått veta varför och kan invända.' },
    en: { hello: 'The report held', lead: 'Deckster has tried your report and blocked what you reported. Whoever uploaded it has been told why and may object.' },
  },
  rejected: {
    sv: { hello: 'Anmälan höll inte', lead: 'Deckster har prövat din anmälan och låter det du anmälde stå kvar. Svara på det här mejlet om du vill att anmälan prövas igen.' },
    en: { hello: 'The report did not hold', lead: 'Deckster has tried your report and leaves what you reported where it is. Reply to this mail if you want the report tried again.' },
  },
}

/** The decision to whoever reported (DSA art. 16.5), with the way on when it went against them. */
export function decisionMail(r: Report, outcome: ReportOutcome, link: string, contact?: string): Mail {
  const site = siteOf(link)
  const words = decided[outcome][r.lang]
  if (r.lang === 'en') {
    const subject = `Your report ${r.id}: ${words.hello.toLowerCase()}`
    const fine = 'You may also turn to a court.'
    return { to: r.email, subject, text: `${words.hello}.\n\n${words.lead}\n\n${fine}${textFoot(site, contact, 'Contact')}`, html: bands({ lang: 'en', subject, pre: words.hello, hello: words.hello, lead: words.lead, button: 'How a report is tried', fine, pasteIt: 'Button not working? Paste the link into your browser:', contactWord: 'Contact', link, contact }) }
  }
  const subject = `Din anmälan ${r.id}: ${words.hello.toLowerCase()}`
  const fine = 'Du kan också vända dig till allmän domstol.'
  return { to: r.email, subject, text: `${words.hello}.\n\n${words.lead}\n\n${fine}${textFoot(site, contact, 'Kontakt')}`, html: bands({ lang: 'sv', subject, pre: words.hello, hello: words.hello, lead: words.lead, button: 'Så prövas en anmälan', fine, pasteIt: 'Fungerar inte knappen? Klistra in länken i webbläsaren:', contactWord: 'Kontakt', link, contact }) }
}

const why: Record<BlockReason, string> = {
  rights: 'Intrång i någon annans rätt (villkoren, avsnitt 4 och 7). Den som äger rätten anmälde bilden.',
  illegal: 'Olagligt innehåll (villkoren, avsnitt 7).',
  terms: 'Innehåll som aldrig får finnas i Deckster (villkoren, avsnitt 7).',
}

/**
 * To every owner whose game uses a picture that has been blocked (DSA art. 17, beslut 4): which
 * picture, why, how it was decided, what it means, and how to object, which is to reply (beslut 1).
 * Swedish: the beta's terms are, and an account keeps no language.
 */
export function ownerMail(to: string, a: { game: string; cards: readonly string[]; reason: BlockReason; at: string; purged: boolean; link: string; contact?: string | undefined }): Mail {
  const site = siteOf(a.link)
  const shown = a.cards.slice(0, 3).join(', ')
  const list: [string, string][] = [
    ['Bilden', a.cards.length === 0 ? `En bild i ${a.game}.` : `Den står på ${a.cards.length} ${a.cards.length === 1 ? 'kort' : 'kort'} i ${a.game}: ${shown}${a.cards.length > 3 ? ' med flera' : ''}.`],
    ['Skälet', why[a.reason]],
    ['Så beslutades det', `Av en människa på Deckster, ${a.at.slice(0, 10)}, efter en anmälan. Ingen automatik.`],
    ['Det här händer', a.purged ? 'Bilden är borttagen ur Deckster för gott. Korten står kvar utan den, i alla versioner.' : 'Bilden syns inte i spelet, på borden, i trycket eller i exporten, och korten står kvar utan den. Den ligger kvar hos Deckster och kommer tillbaka om invändningen håller.'],
    ['Vill du invända?', 'Svara på det här mejlet och berätta varför, till exempel att du har licens till bilden. Deckster prövar beslutet igen inom två arbetsdagar.'],
  ]
  const subject = `En bild i ${a.game} är spärrad`
  const hello = 'En bild i ditt spel är spärrad'
  const lead = 'Efter en anmälan har Deckster spärrat en bild i ditt spel. Allt annat i spelet är som förut.'
  const fine = 'Du kan också vända dig till allmän domstol. Den som gör intrång upprepade gånger får sitt konto stängt (villkoren, avsnitt 11).'
  return {
    to,
    subject,
    text: `${hello}.\n\n${lead}\n\n${asText(list)}\n\nÖppna ${a.game}: ${a.link}\n\n${fine}${textFoot(site, a.contact, 'Kontakt')}`,
    html: bands({ lang: 'sv', subject, pre: 'Svara på mejlet för att invända.', hello, lead, facts: list, button: `Öppna ${a.game}`, fine, pasteIt: 'Fungerar inte knappen? Klistra in länken i webbläsaren:', contactWord: 'Kontakt', link: a.link, contact: a.contact }),
  }
}
