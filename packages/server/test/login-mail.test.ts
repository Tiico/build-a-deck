import { describe, expect, it } from 'vitest'
import { loginMail } from '../src/auth.js'

// The login mail says who sent it (#757, beställarens beslut): it had neither the service's name nor
// an address, and a beta tester who had not asked for it had nowhere to turn. Its foot names the
// service and the site it came from, and the contact when the box was given one.
describe('the foot of the login mail (#757)', () => {
  const link = 'https://byd.example.com/auth/verify?token=abc'

  it('names the service, the site and the contact, in the reader’s language', () => {
    expect(loginMail('a@b.se', link, 'sv', 'beta@example.com').text).toMatch(/\n\n— \nDeckster · https:\/\/byd\.example\.com\nKontakt: beta@example\.com$/)
    expect(loginMail('a@b.se', link, 'en', 'beta@example.com').text).toMatch(/\n\n— \nDeckster · https:\/\/byd\.example\.com\nContact: beta@example\.com$/)
  })

  it('leaves the contact out when the box was given none', () => {
    const text = loginMail('a@b.se', link, 'sv').text
    expect(text).toMatch(/Deckster · https:\/\/byd\.example\.com$/)
    expect(text).not.toMatch(/Kontakt/)
  })

  it('leaves the site out, rather than failing, when the link is a path on this site', () => {
    const text = loginMail('a@b.se', '/auth/verify?token=abc', 'sv', 'beta@example.com').text
    expect(text).toMatch(/\n\n— \nDeckster\nKontakt: beta@example\.com$/)
  })
})

// The mail as HTML (#1098, beställarens beslut 2026-10-22, variant C «Bordet»): three bands, the
// wood with the hand and the name, the paper with the button, and the white with the link written
// out and the foot. The text part stays beside it, for whoever reads mail as text.
describe('the HTML of the login mail (#1098)', () => {
  const link = 'https://byd.example.com/auth/verify?token=abc&next=%2F'

  it('keeps the text part, and sends the same link, the same foot and the same promise in HTML', () => {
    const mail = loginMail('a@b.se', link, 'sv', 'beta@example.com')
    expect(mail.text).toContain(link)
    const html = mail.html ?? ''
    // The link is an attribute value and a visible line, and in both the & is an entity.
    expect(html).toContain(`href="${link.replace('&', '&amp;')}"`)
    expect(html).not.toContain('&next=')
    expect(html).toContain('Länken fungerar i 15 minuter och bara en gång.')
    expect(html).toMatch(/Deckster · <a[^>]*>byd\.example\.com<\/a>/)
    expect(html).toMatch(/Kontakt: <a[^>]*>beta@example\.com<\/a>/)
  })

  it('speaks the reader’s language, in the subject, the bands and the foot', () => {
    const en = loginMail('a@b.se', link, 'en', 'beta@example.com')
    expect(en.subject).toBe('Sign in to Deckster')
    expect(en.html).toContain('You are on your way in.')
    expect(en.html).toContain('Sign in to Deckster')
    expect(en.html).toMatch(/Contact: <a[^>]*>beta@example\.com<\/a>/)
    expect(en.html).not.toContain('Kontakt')
    const sv = loginMail('a@b.se', link, 'sv')
    expect(sv.html).toContain('Du är på väg in.')
    expect(sv.html).not.toContain('Kontakt')
  })

  it('shows the hand from the site the link leads to, and names Deckster in text beside it', () => {
    const html = loginMail('a@b.se', link, 'sv').html ?? ''
    expect(html).toMatch(/<img src="https:\/\/byd\.example\.com\/mark-128\.png" width="64" height="64" alt=""/)
    expect(html).toContain('>Deckster<')
  })

  it('leaves the hand out, rather than pointing at nowhere, when the link is a path on this site', () => {
    const html = loginMail('a@b.se', '/auth/verify?token=abc', 'sv').html ?? ''
    expect(html).not.toContain('<img')
    expect(html).toContain('>Deckster<')
  })

  it('is read without pictures: nothing the reader needs is in an image, and the first line is the promise', () => {
    const html = loginMail('a@b.se', link, 'sv').html ?? ''
    // The preheader is what the inbox shows after the subject.
    expect(html.indexOf('Länken fungerar i 15 minuter')).toBeLessThan(html.indexOf('<table'))
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('transform')
  })
})
