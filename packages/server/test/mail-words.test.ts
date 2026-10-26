import { describe, expect, it } from 'vitest'
import { loginMail } from '../src/login-mail.js'
import { decisionMail, receiptMail, REPORT_SECTION } from '../src/report-mail.js'
import type { Report } from '../src/reports.js'

// What the letters say, part by part (#1374, speltestet före betan). The text part is what a reader
// of plain mail and every inbox's preview gets, so it says what the HTML says; and the line about a
// button that does not work stands only where the link is the letter's whole point, as it is for a
// login and an invitation, and not under a link that only explains.
describe('the login mail says the same in text as in HTML (#1374)', () => {
  const link = 'https://byd.example.com/auth/verify?token=abc'
  for (const [lang, hello, lead] of [
    ['sv', 'Du är på väg in.', 'Här är din länk till Deckster. Den loggar in dig; första gången skapar den ditt konto.'],
    ['en', 'You are on your way in.', 'Here is your link to Deckster. It signs you in; the first time, it creates your account.'],
  ] as const) {
    it(`in ${lang}: that the link makes the account the first time`, () => {
      const mail = loginMail('ada@example.com', link, lang)
      expect(mail.text.startsWith(`${hello}\n\n${lead}\n\n`)).toBe(true)
      expect(mail.text).toContain(link)
      expect(mail.html).toContain(lead)
      // The button's line about pasting the link stays: the link is the login itself.
      expect(mail.html).toMatch(lang === 'sv' ? /Klistra in länken i webbläsaren:/ : /Paste the link into your browser:/)
    })
  }
})

describe('the report’s letters in English (#1374)', () => {
  const report: Report = { id: 'A-0001', what: 'The picture', where: 'Forest council', why: 'Mine.', name: 'Mira', email: 'mira@example.com', lang: 'en', at: '2026-10-25T12:00:00.000Z' }
  const link = `https://byd.example.com${REPORT_SECTION}`

  it('says the receipt has been received, with the number after it, and how we handle a report', () => {
    const mail = receiptMail(report, link)
    expect(mail.subject).toBe('Your report to Deckster has been received (A-0001)')
    expect(mail.html).toContain('>How we handle a report &rarr;</a>')
    expect(mail.text).toContain(`How we handle a report: ${link}`)
    expect(mail.text).not.toMatch(/tried/)
  })

  it('has no line about a button that does not work, in either language, on the receipt and the decision', () => {
    for (const lang of ['sv', 'en'] as const) {
      for (const mail of [receiptMail({ ...report, lang }, link), decisionMail({ ...report, lang }, 'held', link)]) {
        expect(mail.html).not.toMatch(/Paste the link|Klistra in länken/)
        expect(mail.html).toContain(`href="${link}"`)
      }
    }
    expect(decisionMail(report, 'rejected', link).html).toContain('>How we handle a report &rarr;</a>')
  })

  it('leads to section 11 of the terms, the one that says how a report is handled (#1361)', () => {
    expect(REPORT_SECTION).toBe('/villkor#villkor-11')
  })
})
