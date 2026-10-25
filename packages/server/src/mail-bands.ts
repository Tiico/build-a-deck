import type { Lang } from './auth.js'

// The letters Deckster sends, in the form the beställare chose for the login mail (L72, #1098,
// variant C «Bordet»): the landing page's room in three bands — the wood with the hand and the
// name, the paper with what the letter is about and its one button, and the white with the link
// written out and the foot (#757). The login mail and the invitation (#1107) share these bands
// rather than each keeping a copy.
//
// Mail is not the web. The HTML is tables and inline style, the hand is a PNG the site serves
// (a mail client strips <svg> and rotates nothing), no font is loaded, and the letter is whole
// without a single picture: the name stands in text beside the hand. Each letter keeps a text part
// beside the HTML for whoever reads mail as text.

const FONT = `-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

// The hand on its wood: `scripts/brand-icons.ts` writes it from the one drawing (A6), at twice
// the size the mail shows it.
const MARK = '/mark-128.png'

// A link that is a path on this site (no public origin was set) names no site: the foot then says
// the service alone, and the letter shows no hand, rather than failing or pointing at nowhere.
export const siteOf = (link: string): string | null => (URL.canParse(link) ? new URL(link).origin : null)

// A link carries `&`, and a game's name, an address and the contact are whatever somebody typed:
// all of them are text here and never markup.
export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The foot of the text part (#757): the service, the site it came from, and the contact. */
export const textFoot = (site: string | null, contact: string | undefined, label: string): string =>
  `\n\n— \nDeckster${site ? ` · ${site}` : ''}${contact ? `\n${label}: ${contact}` : ''}`

/** What one letter says in the bands, as plain text; the bands escape it. */
export type Letter = {
  lang: Lang
  subject: string
  // The inbox's second line, after the subject.
  pre: string
  hello: string
  lead: string
  button: string
  fine: string
  pasteIt: string
  // The word before the contact in the foot, in the reader's language.
  contactWord: string
  link: string
  contact?: string | undefined
  // What the letter is about, said as a list under the lead (#1274): a report repeated to whoever
  // made it, a block's reasons to the owner. Each is a label and what somebody wrote or what was
  // decided, and both are text.
  facts?: readonly (readonly [string, string])[] | undefined
}

// The list under the lead, on a lighter paper inside the paper band, one label over what it says.
// A line break somebody wrote is kept as a line break and nothing else.
const factsOf = (facts: readonly (readonly [string, string])[]): string =>
  `      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0 0;background:#fffaf0;border-radius:12px"><tr><td style="padding:14px 16px;font:14px/1.55 ${FONT};color:#3a3528;text-align:left">` +
  facts.map(([label, text], i) => `<p style="margin:${i === 0 ? '0' : '10px'} 0 0"><b style="color:#1f1b12">${esc(label)}</b><br>${esc(text).replace(/\r?\n/g, '<br>')}</p>`).join('') +
  `</td></tr></table>\n`

export function bands(l: Letter): string {
  const site = siteOf(l.link)
  const href = esc(l.link)
  const hand = site ? `<img src="${esc(site)}${MARK}" width="64" height="64" alt="" style="display:block;border:0;margin:0 auto">` : ''
  const foot =
    `<p style="margin:0;font:13px/1.6 ${FONT};color:#7a7568">Deckster` +
    (site ? ` · <a href="${esc(site)}" style="color:#5b574c;text-decoration:none">${esc(site.replace(/^https?:\/\//, ''))}</a>` : '') +
    (l.contact ? `<br>${esc(l.contactWord)}: <a href="mailto:${esc(l.contact)}" style="color:#5b574c;text-decoration:none">${esc(l.contact)}</a>` : '') +
    `</p>`
  return `<!doctype html>
<html lang="${l.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(l.subject)}</title>
<style>
  @media (max-width: 480px) {
    .byd-room { padding: 0 !important; }
    .byd-card { border-radius: 0 !important; }
    .byd-button { width: 100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#ffffff;opacity:0">${esc(l.pre)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff"><tr><td align="center" class="byd-room" style="padding:24px 12px">
  <table role="presentation" align="center" width="100%" cellspacing="0" cellpadding="0" border="0" class="byd-card" style="max-width:560px;margin:0 auto;border-radius:18px;overflow:hidden">
    <tr><td align="center" bgcolor="#17120f" style="padding:34px 24px 28px;background:#17120f;background-image:radial-gradient(120% 80% at 70% 10%, #2f2722 0%, #17120f 55%, #0d0b0a 100%)">
      ${hand}
      <p style="margin:12px 0 0;font:800 24px/1 ${FONT};color:#f3e9d6;letter-spacing:-.01em">Deckster</p>
    </td></tr>
    <tr><td bgcolor="#f4ead8" style="padding:30px 28px 32px;background:#f4ead8;text-align:left">
      <h1 style="margin:0 0 8px;font:800 26px/1.15 ${FONT};color:#1f1b12;letter-spacing:-.02em">${esc(l.hello)}</h1>
      <p style="margin:0;font:16px/1.55 ${FONT};color:#3a3528">${esc(l.lead)}</p>
${l.facts && l.facts.length > 0 ? factsOf(l.facts) : ''}      <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="byd-button" style="margin:24px 0 0"><tr><td align="center" style="border-radius:999px;background:#f0b64a">
        <a href="${href}" style="display:block;padding:15px 26px;font:700 16px/1 ${FONT};color:#1f1b12;text-decoration:none;border-radius:999px">${esc(l.button)} &rarr;</a>
      </td></tr></table>
      <p style="margin:22px 0 0;font:13px/1.6 ${FONT};color:#5b574c">${esc(l.fine)}</p>
    </td></tr>
    <tr><td style="padding:20px 28px 24px;background:#ffffff;text-align:left;border:1px solid #e5e2d8;border-top:0;border-radius:0 0 18px 18px">
      <p style="margin:0;font:13px/1.6 ${FONT};color:#5b574c">${esc(l.pasteIt)}<br><a href="${href}" style="color:#1a0dab;word-break:break-all">${href}</a></p>
      <div style="margin-top:16px">${foot}</div>
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>
`
}
