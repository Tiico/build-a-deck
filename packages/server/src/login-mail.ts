import type { Lang, Mail } from './auth.js'

// The login mail (G1): the first letter a creator gets from Deckster, and for many the only one.
// It went as text alone until #1098, when the beställare chose variant C «Bordet» (2026-10-22):
// the landing page's room in three bands — the wood with the hand and the name, the paper with
// the promise and the button, and the white with the link written out and the foot (#757).
//
// Mail is not the web. The HTML is tables and inline style, the hand is a PNG the site serves
// (a mail client strips <svg> and rotates nothing), no font is loaded, and the mail is whole
// without a single picture: the name stands in text beside the hand. The text part stays beside
// the HTML for whoever reads mail as text, and it is the part the tests have always held.

const FONT = `-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

// The hand on its wood: `scripts/brand-icons.ts` writes it from the one drawing (A6), at twice
// the size the mail shows it.
const MARK = '/mark-128.png'

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

// A link that is a path on this site (no public origin was set) names no site: the foot then says
// the service alone, and the mail shows no hand, rather than failing the login or pointing at nowhere.
const siteOf = (link: string): string | null => (URL.canParse(link) ? new URL(link).origin : null)

// The link carries `&next=`, and the contact is whatever the box was given: both are text here and
// never markup.
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const textFoot = (site: string | null, contact: string | undefined, label: string): string =>
  `\n\n— \nDeckster${site ? ` · ${site}` : ''}${contact ? `\n${label}: ${contact}` : ''}`

function html(lang: Lang, c: Copy, link: string, site: string | null, contact: string | undefined): string {
  const href = esc(link)
  const hand = site ? `<img src="${esc(site)}${MARK}" width="64" height="64" alt="" style="display:block;border:0;margin:0 auto">` : ''
  const foot =
    `<p style="margin:0;font:13px/1.6 ${FONT};color:#7a7568">Deckster` +
    (site ? ` · <a href="${esc(site)}" style="color:#5b574c;text-decoration:none">${esc(site.replace(/^https?:\/\//, ''))}</a>` : '') +
    (contact ? `<br>${c.contact}: <a href="mailto:${esc(contact)}" style="color:#5b574c;text-decoration:none">${esc(contact)}</a>` : '') +
    `</p>`
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${c.subject}</title>
<style>
  @media (max-width: 480px) {
    .byd-room { padding: 0 !important; }
    .byd-card { border-radius: 0 !important; }
    .byd-button { width: 100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#ffffff;opacity:0">${c.pre}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff"><tr><td align="center" class="byd-room" style="padding:24px 12px">
  <table role="presentation" align="center" width="100%" cellspacing="0" cellpadding="0" border="0" class="byd-card" style="max-width:560px;margin:0 auto;border-radius:18px;overflow:hidden">
    <tr><td align="center" bgcolor="#17120f" style="padding:34px 24px 28px;background:#17120f;background-image:radial-gradient(120% 80% at 70% 10%, #2f2722 0%, #17120f 55%, #0d0b0a 100%)">
      ${hand}
      <p style="margin:12px 0 0;font:800 24px/1 ${FONT};color:#f3e9d6;letter-spacing:-.01em">Deckster</p>
    </td></tr>
    <tr><td bgcolor="#f4ead8" style="padding:30px 28px 32px;background:#f4ead8;text-align:left">
      <h1 style="margin:0 0 8px;font:800 26px/1.15 ${FONT};color:#1f1b12;letter-spacing:-.02em">${c.hello}</h1>
      <p style="margin:0;font:16px/1.55 ${FONT};color:#3a3528">${c.lead}</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="byd-button" style="margin:24px 0 0"><tr><td align="center" style="border-radius:999px;background:#f0b64a">
        <a href="${href}" style="display:block;padding:15px 26px;font:700 16px/1 ${FONT};color:#1f1b12;text-decoration:none;border-radius:999px">${c.button} &rarr;</a>
      </td></tr></table>
      <p style="margin:22px 0 0;font:13px/1.6 ${FONT};color:#5b574c">${c.fine}</p>
    </td></tr>
    <tr><td style="padding:20px 28px 24px;background:#ffffff;text-align:left;border:1px solid #e5e2d8;border-top:0;border-radius:0 0 18px 18px">
      <p style="margin:0;font:13px/1.6 ${FONT};color:#5b574c">${c.pasteIt}<br><a href="${href}" style="color:#1a0dab;word-break:break-all">${href}</a></p>
      <div style="margin-top:16px">${foot}</div>
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>
`
}

export function loginMail(to: string, link: string, lang: Lang = 'sv', contact?: string): Mail {
  const c = COPY[lang]
  const site = siteOf(link)
  const text =
    lang === 'en'
      ? `Hello!\n\nClick to sign in: ${link}\n\n${c.fine}${textFoot(site, contact, c.contact)}`
      : `Hej!\n\nKlicka för att logga in: ${link}\n\n${c.fine}${textFoot(site, contact, c.contact)}`
  return { to, subject: c.subject, text, html: html(lang, c, link, site, contact) }
}
