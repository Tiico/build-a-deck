import { describe, expect, it } from 'vitest'
import { inviteMail } from '../src/invite-mail.js'

// The invitation in the login mail's form (#1107, L72): the wood with the hand and the name, the
// paper with who invites, to which game and as what, and the button, and the white with the link
// written out and the foot (#757), which the invitation had never had. The text part stays.
describe('the invitation mail (#1107)', () => {
  const link = 'https://byd.example.com/invites/abc_DEF-123'
  const asked = { from: 'ada@example.com', game: 'Skogens herrar', role: 'editor', link, contact: 'beta@example.com' } as const

  it('keeps the text part, now with the foot, in the reader’s language', () => {
    const sv = inviteMail('bo@example.com', { ...asked, lang: 'sv' })
    expect(sv.subject).toBe('Du är inbjuden till Skogens herrar')
    expect(sv.text).toContain('ada@example.com vill dela spelet Skogens herrar med dig som medredigerare.')
    expect(sv.text).toContain(`Klicka för att gå med: ${link}`)
    expect(sv.text).toMatch(/\n\n— \nDeckster · https:\/\/byd\.example\.com\nKontakt: beta@example\.com$/)
    const en = inviteMail('bo@example.com', { ...asked, lang: 'en' })
    expect(en.subject).toBe('You are invited to Skogens herrar')
    expect(en.text).toContain('as a co-editor')
    expect(en.text).toMatch(/\n\n— \nDeckster · https:\/\/byd\.example\.com\nContact: beta@example\.com$/)
  })

  it('says in HTML who invites, to which game and as what, with «Gå med» and the seven days', () => {
    const html = inviteMail('bo@example.com', { ...asked, lang: 'sv' }).html ?? ''
    expect(html).toContain('Du är inbjuden till Skogens herrar.')
    expect(html).toContain('ada@example.com vill dela spelet Skogens herrar med dig som medredigerare.')
    expect(html).toMatch(/<a href="https:\/\/byd\.example\.com\/invites\/abc_DEF-123"[^>]*>Gå med &rarr;<\/a>/)
    expect(html).toContain('Länken fungerar i sju dagar och bara en gång.')
    // The link written out under the button, and the foot after it.
    expect(html).toMatch(/Klistra in länken i webbläsaren:<br><a[^>]*>https:\/\/byd\.example\.com\/invites\/abc_DEF-123<\/a>/)
    expect(html).toMatch(/Deckster · <a[^>]*>byd\.example\.com<\/a>/)
    expect(html).toMatch(/Kontakt: <a[^>]*>beta@example\.com<\/a>/)
    const en = inviteMail('bo@example.com', { ...asked, lang: 'en' }).html ?? ''
    expect(en).toContain('>Join &rarr;</a>')
    expect(en).toContain('The link works for seven days and only once.')
    expect(en).not.toContain('Kontakt')
  })

  it('wears the hand from the site the link leads to, and leaves it out for a path', () => {
    expect(inviteMail('bo@example.com', { ...asked, lang: 'sv' }).html).toMatch(/<img src="https:\/\/byd\.example\.com\/mark-128\.png" width="64" height="64" alt=""/)
    const bare = inviteMail('bo@example.com', { ...asked, link: '/invites/abc', lang: 'sv' })
    expect(bare.html).not.toContain('<img')
    expect(bare.html).toContain('>Deckster<')
    expect(bare.text).toMatch(/\n\n— \nDeckster\nKontakt: beta@example\.com$/)
  })

  // A game's name and an address are whatever somebody typed: in the HTML they are text, never markup.
  it('writes the game’s name and the address as text', () => {
    const html = inviteMail('bo@example.com', { ...asked, from: '<b>x</b>@example.com', game: 'Ess & <i>Kung</i>', lang: 'sv' }).html ?? ''
    expect(html).toContain('Ess &amp; &lt;i&gt;Kung&lt;/i&gt;')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;@example.com')
    expect(html).not.toContain('<i>Kung</i>')
  })

  // The name the one who invites gave her account (#1254, beslut 3): the name to know her by, and the
  // address in brackets, which is what the reader can trust; the subject carries the name.
  it('names who invites by her own name, with her address in brackets, and in the subject', () => {
    const sv = inviteMail('bo@example.com', { ...asked, fromName: 'Ada Lovelace', lang: 'sv' })
    expect(sv.subject).toBe('Ada Lovelace bjuder in dig till Skogens herrar')
    expect(sv.text).toContain('Ada Lovelace (ada@example.com) vill dela spelet Skogens herrar med dig som medredigerare.')
    expect(sv.html).toContain('Ada Lovelace (ada@example.com) vill dela spelet Skogens herrar med dig som medredigerare.')
    expect(sv.html).toContain('<title>Ada Lovelace bjuder in dig till Skogens herrar</title>')
    // The paper's heading stays the invitation's own.
    expect(sv.html).toContain('Du är inbjuden till Skogens herrar.')
    const en = inviteMail('bo@example.com', { ...asked, fromName: 'Ada Lovelace', lang: 'en' })
    expect(en.subject).toBe('Ada Lovelace invites you to Skogens herrar')
    expect(en.text).toContain('Ada Lovelace (ada@example.com) would like to share the game Skogens herrar with you as a co-editor.')
    // A name is whatever she typed, so it is text in the HTML as the address is.
    expect(inviteMail('bo@example.com', { ...asked, fromName: '<b>Ada</b>', lang: 'sv' }).html).toContain('&lt;b&gt;Ada&lt;/b&gt; (ada@example.com)')
    // Without a name the letter is the one it was: the address alone.
    expect(inviteMail('bo@example.com', { ...asked, fromName: null, lang: 'sv' }).subject).toBe('Du är inbjuden till Skogens herrar')
  })

  it('says who invites when nobody signed in did', () => {
    expect(inviteMail('bo@example.com', { ...asked, from: undefined, lang: 'sv' }).text).toContain('Någon vill dela spelet')
    expect(inviteMail('bo@example.com', { ...asked, from: undefined, lang: 'en' }).text).toContain('Someone would like to share')
  })

  it('is read without pictures, and the inbox’s second line is the seven days', () => {
    const html = inviteMail('bo@example.com', { ...asked, lang: 'sv' }).html ?? ''
    expect(html.indexOf('Länken fungerar i sju dagar')).toBeLessThan(html.indexOf('<table'))
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('transform')
  })
})
