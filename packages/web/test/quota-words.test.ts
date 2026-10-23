import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { translate, type Lang, type T } from '../src/i18n/index.js'
import { quotaLine, quotaWords, type QuotaDoing } from '../src/account/quota-words.js'
import type { Quota } from '../src/account/quota.js'

// How a met ceiling is said (#1198, beställarens beslut 2026-10-23: variant A, «svaret där du
// tryckte»). Every answer has three parts — what did not happen, the numbers, and what can be done —
// in the reader's words, never a status, a tier or a price. A test leader or a co-editor meeting the
// owner's ceiling hears the owner's name when the server gives one (beslut 3), and «the game's owner»
// when it does not.
const tOf = (lang: Lang): T => (key, params) => translate(lang, key, params)
const sv = tOf('sv')
const en = tOf('en')
const q = (measure: string, limit: number, used: number, rest: Partial<Quota> = {}): Quota => ({ measure, limit, used, bearer: 'you', ...rest })
const owner = (ownerName?: string): Partial<Quota> => ({ bearer: 'owner', ...(ownerName ? { ownerName } : {}) })

const card: QuotaDoing = { kind: 'edit', edit: 'card', game: 'Skogens råd', grown: 1 }
const table: QuotaDoing = { kind: 'table', rev: 4, here: 2 }

// The rolling window's date is the reader's clock (#1196): pinned, so the words are the ones read.
const zone = process.env['TZ']
beforeAll(() => {
  process.env['TZ'] = 'Europe/Stockholm'
  if (Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Europe/Stockholm') throw new Error('the zone did not change')
})
afterAll(() => {
  if (zone === undefined) delete process.env['TZ']
  else process.env['TZ'] = zone
})

describe('a met ceiling on games (#1198)', () => {
  it('says that no game was made, the numbers, and the way out, in Mina spel', () => {
    expect(quotaLine(quotaWords(q('projects', 3, 3), { kind: 'newGame' }, sv))).toBe(
      'Inget nytt spel skapades. Ditt konto rymmer 3 spel, och du har 3. Ta bort ett spel du inte behöver för att få plats. Exportera det först om du vill ha det kvar.',
    )
    expect(quotaLine(quotaWords(q('projects', 3, 3), { kind: 'newGame' }, en))).toBe(
      'No new game was made. Your account holds 3 games, and you have 3. Remove a game you no longer need to make room. Export it first if you want to keep it.',
    )
  })

  it('names the game a copy was not made of, and says the import’s own way out', () => {
    expect(quotaWords(q('projects', 3, 3), { kind: 'duplicate', game: 'Skogens råd' }, sv).what).toBe('Skogens råd duplicerades inte.')
    const imported = quotaWords(q('projects', 3, 3), { kind: 'import' }, sv)
    expect(imported.what).toBe('')
    expect(`${imported.why} ${imported.way}`).toBe('Ditt konto rymmer 3 spel, och du har 3. Ta bort ett spel först, så går zippen att importera sedan.')
  })

  it('says one game in the singular in English', () => {
    expect(quotaWords(q('projects', 1, 1), { kind: 'newGame' }, en).why).toBe('Your account holds 1 game, and you have 1.')
  })
})

describe('a met ceiling on cards, in the editor (#1198)', () => {
  it('says the card was not added, and how many the game holds, to the owner', () => {
    expect(quotaLine(quotaWords(q('cardRowsPerProject', 120, 120), card, sv))).toBe(
      'Kortet lades inte till. Skogens råd har 120 av 120 kort, så många som ett spel rymmer på ditt konto. Ta bort eller slå ihop kort för att få plats. Fler exemplar av ett kort går alltid: ändra Antal.',
    )
  })

  it('names the owner to a co-editor, and asks her to be asked', () => {
    const words = quotaWords(q('cardRowsPerProject', 120, 120, owner('Nicklas')), card, sv)
    expect(words.why).toBe('Skogens råd har 120 av 120 kort, så många som Nicklas konto rymmer per spel.')
    expect(words.way).toBe('Ta bort eller slå ihop kort, eller fråga Nicklas. Fler exemplar av ett kort går alltid: ändra Antal.')
    expect(quotaWords(q('cardRowsPerProject', 120, 120, owner('Ada')), card, en).why).toBe('Skogens råd has 120 of 120 cards, as many as Ada’s account holds per game.')
  })

  it('says «the game’s owner» when the server names nobody', () => {
    const words = quotaWords(q('cardRowsPerProject', 120, 120, owner()), card, sv)
    expect(words.why).toBe('Skogens råd har 120 av 120 kort, så många som spelets ägares konto rymmer per spel.')
    expect(words.way).toContain('eller fråga spelets ägare.')
  })

  it('says how many of a proposal fit, and the way to choose them', () => {
    const words = quotaWords(q('cardRowsPerProject', 120, 117), { kind: 'edit', edit: 'proposal', game: 'Skogens råd', grown: 6 }, sv)
    expect(quotaLine(words)).toBe('Förslaget lades inte in. Med 6 nya kort skulle Skogens råd få 123, och det rymmer 120. Välj högst 3 av korten med «Välj delar…», eller ta bort kort först.')
    const full = quotaWords(q('cardRowsPerProject', 120, 120), { kind: 'edit', edit: 'proposal', game: 'Skogens råd', grown: 6 }, sv)
    expect(full.way).toBe('Ta bort kort först. Ändrade kort i ett förslag lägger inte till något och går alltid att godta.')
  })

  it('says copies in copies', () => {
    const words = quotaWords(q('cardCopiesPerProject', 300, 300), { kind: 'edit', edit: 'other', game: 'Skogens råd', grown: 2 }, sv)
    expect(quotaLine(words)).toBe('Ändringen gjordes inte. Med 2 exemplar till skulle Skogens råd få 302, och det rymmer 300. Minska Antal eller ta bort kort för att få plats.')
  })
})

describe('a met ceiling on tables (#1198)', () => {
  it('says the table was not started, the tables open, and the way out', () => {
    expect(quotaLine(quotaWords(q('openTables', 3, 3), table, sv))).toBe(
      'Bordet startades inte. Du har 3 av 3 bord öppna, 2 av dem i det här spelet. Avsluta ett bord som ingen spelar vid, eller öppna ett som redan kör och uppdatera det till version 4.',
    )
  })

  it('says to a test leader whose tables they are, by name', () => {
    expect(quotaLine(quotaWords(q('openTables', 3, 3, owner('Nicklas')), { kind: 'table', rev: 4, here: 1 }, sv))).toBe(
      'Bordet startades inte. Nicklas har 3 av 3 bord öppna, och bord i spelet räknas mot Nicklas konto. Öppna bordet som redan kör, eller be Nicklas avsluta ett.',
    )
    expect(quotaWords(q('openTables', 3, 3, owner()), { kind: 'table', rev: 4, here: 0 }, sv).why).toBe('Spelets ägare har 3 av 3 bord öppna, och bord i spelet räknas mot spelets ägares konto.')
    expect(quotaWords(q('openTables', 3, 3, owner()), { kind: 'table', rev: 4, here: 0 }, sv).way).toBe('Be spelets ägare avsluta ett bord.')
  })

  it('says when the next table can be started, out of the rolling window', () => {
    const words = quotaWords(q('tablesPer30Days', 30, 30, { frees: '2026-10-24T12:02:00.000Z' }), table, sv)
    expect(quotaLine(words)).toBe(
      'Bordet startades inte. Du har startat 30 bord de senaste 30 dygnen, så många som ditt konto rymmer. Nästa går att starta 24 okt kl. 14:02. Ett bord som redan kör går att öppna och uppdatera till version 4, och det räknas inte som ett nytt.',
    )
    expect(quotaWords(q('tablesPer30Days', 30, 30, { frees: '2026-10-24T12:02:00.000Z' }), table, en).why).toBe(
      'You have started 30 tables in the last 30 days, as many as your account holds. The next can be started 24 Oct at 14:02.',
    )
  })
})

describe('a met ceiling on storage (#1198)', () => {
  it('says the account’s storage, the picture’s size, and that taking a picture away frees nothing', () => {
    const words = quotaWords(q('storageBytes', 500_000_000, 498_000_000), { kind: 'upload', file: 'picture', size: 4_200_000 }, sv)
    expect(words.what).toBe('')
    expect(words.why).toBe('kontots lagring är full, 498 MB av 500 MB, och bilden är 4,2 MB.')
    expect(words.way).toBe('Att ta bort en bild ur spelet frigör ingenting, eftersom historiken behåller den; ett spel som tas bort frigör sitt.')
  })

  it('says the owner’s storage to a co-editor, and to ask her', () => {
    const words = quotaWords(q('storageBytes', 500_000_000, 498_000_000, owner('Nicklas')), { kind: 'upload', file: 'picture', size: 4_200_000 }, sv)
    expect(words.why).toBe('Nicklas lagring är full, 498 MB av 500 MB, och bilden är 4,2 MB.')
    expect(words.way).toMatch(/^Fråga Nicklas\. Att ta bort en bild/)
    expect(quotaWords(q('storageBytes', 500_000_000, 498_000_000, owner()), { kind: 'upload', file: 'picture', size: 4_200_000 }, en).why).toBe(
      'the game’s owner’s storage is full, 498 MB of 500 MB, and the picture is 4.2 MB.',
    )
  })

  it('says a version that was not saved, and that the work is still here', () => {
    expect(quotaLine(quotaWords(q('storageBytes', 500_000_000, 498_000_000), { kind: 'save', game: 'Skogens råd' }, sv))).toBe(
      'Versionen sparades inte. Bilderna som lagts till sedan förra versionen får inte plats i kontots lagring: 498 MB av 500 MB används. Ta bort de bilderna eller ett spel du inte behöver. Ändringarna finns kvar här.',
    )
  })
})

describe('words that are never said (#1192, #1198)', () => {
  const all: [Quota, QuotaDoing][] = [
    [q('projects', 3, 3), { kind: 'newGame' }],
    [q('cardRowsPerProject', 120, 120, owner('Nicklas')), card],
    [q('openTables', 3, 3, owner()), table],
    [q('tablesPer30Days', 30, 30, owner('Nicklas')), table],
    [q('storageBytes', 500, 498, owner()), { kind: 'upload', file: 'picture', size: 4 }],
    [q('rendersPer30Days', 100, 100), table],
  ]
  it('never a status, a tier, a price or an upgrade', () => {
    for (const t of [sv, en]) {
      for (const [quota, doing] of all) {
        const line = quotaLine(quotaWords(quota, doing, t))
        expect(line).not.toMatch(/402|quota|nivå|tier|plan\b|pris|price|uppgrader|upgrade|\{/i)
        expect(line.length).toBeGreaterThan(20)
      }
    }
  })
})
