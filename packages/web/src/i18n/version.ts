import type { T } from './index.js'

// What a saved version is called where a person reads it (#703, beställarens beslut 2026-10-06, B4):
// «version 3» inside a sentence, «Version 3» where it starts one or stands alone, and «v3» where
// there is no room. The server's id for it, «rev-3», is the tool's word and is never shown; a
// number is the same version said by its revision.
export type VersionForm = 'word' | 'name' | 'short'
const KEY = { word: 'version.word', name: 'version.name', short: 'version.short' } as const

export function versionWord(version: string | number, t: T, form: VersionForm = 'word'): string {
  const n = typeof version === 'number' ? version : /^rev-(\d+)$/.exec(version)?.[1]
  return n === undefined ? String(version) : t(KEY[form], { n })
}
