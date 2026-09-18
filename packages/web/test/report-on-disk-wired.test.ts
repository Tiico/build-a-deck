import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPORT_FILE, reporting } from '../../../test-support/report.js'

// Vad en fallande körning lämnar efter sig (#111).
//
// #111 heter "detaljen finns inte kvar", och det är inte en gissning om en orsak utan en
// iakttagelse om en körning: sviten föll, utskriften var pipad genom `tail -12`, och därmed var
// det enda som fanns kvar `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`. Ingen visste vilket test det var,
// och därför gick det inte att avgöra om det var koden eller maskinen. Samma sak hände igen
// 2026-09-15, då med `grep`: fem namn räddades av en slump och inte ett enda meddelande.
//
// En konsolutskrift är det enda som pipas bort. Så körningen skriver sitt eget protokoll till
// disk också, och det överlever varje `tail`, `grep` och `head` någon råkar sätta efter den.
// Det lagar inte flakan — den gick inte att återskapa på femtio försök — men det gör nästa fall
// till en diagnos i stället för ett nytt issue.
//
// Skrivet som en grind och inte som en vana, av samma skäl som maskinlåsets egen grind
// (`machine-lock-wired`): kostnaden för att glömma bär inte den som glömmer.
const ROOT = join(import.meta.dirname, '..', '..', '..')

const packages = readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => existsSync(join(ROOT, 'packages', name, 'test')))

// Ett paket kör antingen vitest eller Playwright, och båda har en config att koppla protokollet
// i. Vilken det är spelar ingen roll för det grinden vaktar: att en fallen körning lämnar sitt
// eget protokoll på disk, eftersom konsolen är det enda som pipas bort.
const configOf = (name: string): string | undefined =>
  ['vite.config.ts', 'vitest.config.ts', 'playwright.config.ts'].map((f) => join(ROOT, 'packages', name, f)).find(existsSync)

describe('varje paket som har tester', () => {
  it('hittas över huvud taget, så grinden inte kan gå igenom genom att matcha ingenting', () => {
    expect(packages).toEqual(expect.arrayContaining(['web', 'server', 'engine']))
  })

  it.each(packages)('låter %s skriva sitt protokoll till disk', (name) => {
    const config = configOf(name)
    expect(config, `${name} har tester men ingen config att koppla protokollet i — se test-support/report.ts`).toBeTypeOf('string')
    const source = readFileSync(config!, 'utf8')
    expect(source.includes('test-support/report'), `${name}: dess config behöver ...reporting() ur test-support/report.ts — se den filen för vad som går förlorat utan det`).toBe(true)
  })
})

describe('protokollet självt', () => {
  it('namnger både den vanliga utskriften och filen, så att en körning syns och sparas på en gång', () => {
    const asked = reporting()
    expect(asked.reporters[0]).toBe('default')
    expect(JSON.stringify(asked.reporters)).toContain(REPORT_FILE)
  })
})
