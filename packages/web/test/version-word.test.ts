// One word for a saved version wherever people read it (#703, beställarens beslut 2026-10-06, B4):
// «Version 3» / «version 3», and «v3» where it is tight. «rev» and the id's own «rev-5» are the
// tool's words, and the playtest found three spellings of one thing on one screen.
import { describe, expect, it } from 'vitest'
import { translate, type Lang } from '../src/i18n/index.js'
import { versionWord } from '../src/i18n/version.js'
import { svPlay } from '../src/i18n/sv.play.js'

const t = (lang: Lang) => (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) => translate(lang, key, params)

describe('the name of a version (#703)', () => {
  it('says a version id, a number or a revision in one of three forms, in the reader’s language', () => {
    const sv = t('sv')
    const en = t('en')
    expect(versionWord('rev-5', sv)).toBe('version 5')
    expect(versionWord(5, sv, 'name')).toBe('Version 5')
    expect(versionWord('rev-5', sv, 'short')).toBe('v5')
    expect(versionWord('rev-12', en)).toBe('version 12')
    expect(versionWord(12, en, 'name')).toBe('Version 12')
  })

  it('leaves alone what is not a version id', () => {
    expect(versionWord('Sal', t('sv'))).toBe('Sal')
  })
})

describe('the catalogue never says «rev» (#703)', () => {
  it('has no «rev», «rev-» or «rev {n}» in any string a person reads, in either language', async () => {
    const catalogues = await Promise.all(['sv', 'en'].flatMap((lang) => ['', '.account', '.editor', '.play', '.status'].map((part) => import(`../src/i18n/${lang}${part}.ts`).catch(() => null))))
    const strings = catalogues.flatMap((m) => (m ? Object.values(m).flatMap((cat) => (cat && typeof cat === 'object' ? Object.entries(cat as Record<string, unknown>) : [])) : []))
    // A placeholder's own name (`{rev}`) is the code's and is never read, so it is taken out first.
    const said = strings.filter(([, v]) => typeof v === 'string' && /\brev\b|\brev-/i.test((v as string).replace(/\{[^}]*\}/g, ''))).map(([k, v]) => `${k}: ${v}`)
    expect(strings.length).toBeGreaterThan(500)
    expect(said).toEqual([])
    expect(svPlay).toBeDefined()
  })
})
