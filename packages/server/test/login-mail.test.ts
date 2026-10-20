import { describe, expect, it } from 'vitest'
import { loginMail } from '../src/auth.js'

// The login mail says who sent it (#757, beställarens beslut): it had neither the service's name nor
// an address, and a beta tester who had not asked for it had nowhere to turn. Its foot names the
// service and the site it came from, and the contact when the box was given one.
describe('the foot of the login mail (#757)', () => {
  const link = 'https://byd.example.com/auth/verify?token=abc'

  it('names the service, the site and the contact, in the reader’s language', () => {
    expect(loginMail('a@b.se', link, 'sv', 'beta@example.com').text).toMatch(/\n\n— \nbuild-your-deck · https:\/\/byd\.example\.com\nKontakt: beta@example\.com$/)
    expect(loginMail('a@b.se', link, 'en', 'beta@example.com').text).toMatch(/\n\n— \nbuild-your-deck · https:\/\/byd\.example\.com\nContact: beta@example\.com$/)
  })

  it('leaves the contact out when the box was given none', () => {
    const text = loginMail('a@b.se', link, 'sv').text
    expect(text).toMatch(/build-your-deck · https:\/\/byd\.example\.com$/)
    expect(text).not.toMatch(/Kontakt/)
  })

  it('leaves the site out, rather than failing, when the link is a path on this site', () => {
    const text = loginMail('a@b.se', '/auth/verify?token=abc', 'sv', 'beta@example.com').text
    expect(text).toMatch(/\n\n— \nbuild-your-deck\nKontakt: beta@example\.com$/)
  })
})
