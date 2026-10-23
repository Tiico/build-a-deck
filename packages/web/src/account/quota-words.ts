import type { Key, T } from '../i18n/index.js'
import { Said } from '../i18n/said.js'
import type { Quota } from './quota.js'

// How a met ceiling is said (#1198, beställarens beslut 2026-10-23: variant A, «svaret där du
// tryckte»). The answer comes where the press was, in the place that surface already says what
// could not happen, and it has three parts: what did not happen, the numbers, and what can be done.
// No sentence says a status, a tier, a price or «upgrade»: the account «holds» so many (#1192).
//
// The way out is always one that exists today — remove a game, remove or merge cards, change the
// count, choose parts of a proposal, end or update a table (L65), or ask the game's owner — since
// a ceiling locks nothing and only stops growth (#1192, beslut 5).
//
// A test leader or a co-editor meeting the owner's ceiling is told it is the owner's, by the name
// the server gives (beslut 3), and «the game's owner» when it gives none; never the address.

// What was being done when the ceiling was met, and what the sentence needs to know about it.
// `grown` is how much the refused edit would have added to the measure; `here` how many of the
// reader's visible tables of this game are running; `rev` the version a running table can be
// updated to.
export type QuotaDoing =
  | { kind: 'newGame' }
  | { kind: 'import' }
  | { kind: 'duplicate'; game: string }
  | { kind: 'edit'; edit: 'card' | 'proposal' | 'cards' | 'restore' | 'other'; game: string; grown: number }
  | { kind: 'save'; game: string }
  | { kind: 'table'; rev: number; here: number }
  | { kind: 'upload'; file: 'picture' | 'font' | 'file'; size: number }

// `what` is empty where the surface already says what did not happen in its own words — the
// import's dialog, an upload's «… kunde inte laddas upp och har tagits bort igen:» — and `why` is
// then the rest of that sentence.
export type QuotaWords = { what: string; why: string; way: string }

// The three parts as one line, for a place that holds one string.
export const quotaLine = (words: QuotaWords): string => [words.what, words.why, words.way].filter((part) => part !== '').join(' ')

// A met ceiling already in the reader's words, thrown where a surface catches a `Said`: its message is
// the whole line, and a surface that draws the parts apart — the lead set off, the way under it —
// reads them from `words`.
export class QuotaSaid extends Said {
  constructor(readonly words: QuotaWords) {
    super(quotaLine(words))
  }
}

const EDIT_WHAT: Record<Extract<QuotaDoing, { kind: 'edit' }>['edit'], Key> = {
  card: 'quota.what.card',
  proposal: 'quota.what.proposal',
  cards: 'quota.what.cards',
  restore: 'quota.what.restore',
  other: 'quota.what.edit',
}
const FILE_WORD: Record<Extract<QuotaDoing, { kind: 'upload' }>['file'], Key> = { picture: 'quota.file.picture', font: 'quota.file.font', file: 'quota.file.file' }

export function quotaWords(quota: Quota, doing: QuotaDoing, t: T): QuotaWords {
  const mine = quota.bearer === 'you'
  // Who the owner is in the sentence: her name, or the tool's words for her, in two cases — mid
  // sentence and at its start. A possessive is asked of the catalogue (`{owner:s}`).
  const owner = quota.ownerName ?? t('quota.owner')
  const Owner = quota.ownerName ?? t('quota.owner.start')
  const n = { limit: num(quota.limit, t), used: num(quota.used, t), owner, Owner }
  const what = whatOf(doing, t)
  switch (quota.measure) {
    case 'projects':
      return {
        what,
        why: t(quota.limit === 1 ? 'quota.projects.why.one' : 'quota.projects.why.other', n),
        way: t(doing.kind === 'import' ? 'quota.projects.way.import' : 'quota.projects.way'),
      }
    case 'cardRowsPerProject':
    case 'cardCopiesPerProject': {
      const rows = quota.measure === 'cardRowsPerProject'
      const m = rows ? 'rows' : 'copies'
      if (doing.kind !== 'edit') return { what, why: t(`quota.${m}.born`, n), way: doing.kind === 'newGame' ? '' : t(`quota.${m}.born.way`) }
      const grown = Math.max(1, doing.grown)
      const params = { ...n, game: doing.game, n: num(grown, t), total: num(quota.used + grown, t), copies: t('table.field.antal') }
      // At the ceiling and one more: what the game has. Past it, or several at once: what the game would get.
      const full = quota.used === quota.limit && grown === 1
      const why = full ? t(`quota.${m}.full.${mine ? 'you' : 'owner'}`, params) : t(`quota.${m}.grow.${mine ? 'you' : 'owner'}.${grown === 1 ? 'one' : 'other'}`, params)
      if (rows && doing.edit === 'proposal') {
        const room = quota.limit - quota.used
        return { what, why, way: room > 0 ? t('quota.rows.way.proposal', { room: num(room, t), choose: t('ai.proposal.choose') }) : t('quota.rows.way.proposal.none') }
      }
      return { what, why, way: t(`quota.${m}.way.${mine ? 'you' : 'owner'}`, params) }
    }
    case 'storageBytes': {
      const s = { ...n, limit: bytes(quota.limit, t), used: bytes(quota.used, t, quota.limit) }
      if (doing.kind === 'upload') {
        // Full only when it is; with room left, the room is what is said, in the ceiling's unit.
        const full = quota.used >= quota.limit
        const words = { ...s, free: bytes(Math.max(0, quota.limit - quota.used), t, quota.limit), file: t(FILE_WORD[doing.file]), size: bytes(doing.size, t) }
        return {
          what,
          why: t(`quota.storage.upload.${mine ? 'you' : 'owner'}${full ? '' : '.room'}` as const, words),
          way: t(mine ? 'quota.storage.way.you' : 'quota.storage.way.owner', s),
        }
      }
      if (doing.kind === 'save' || doing.kind === 'edit') return { what, why: t(mine ? 'quota.storage.save.you' : 'quota.storage.save.owner', s), way: t(mine ? 'quota.storage.save.way.you' : 'quota.storage.save.way.owner', s) }
      return { what, why: t('quota.storage.born', s), way: t(doing.kind === 'import' ? 'quota.projects.way.import' : 'quota.projects.way') }
    }
    case 'openTables': {
      const here = doing.kind === 'table' ? doing.here : 0
      const rev = doing.kind === 'table' ? doing.rev : 0
      if (mine) return { what, why: t(here > 0 ? 'quota.open.you.here' : 'quota.open.you', { ...n, here: num(here, t) }), way: t('quota.open.way.you', { rev }) }
      return { what, why: t('quota.open.owner', n), way: t(here === 0 ? 'quota.open.way.owner.none' : here === 1 ? 'quota.open.way.owner.one' : 'quota.open.way.owner.other', n) }
    }
    case 'tablesPer30Days': {
      const rev = doing.kind === 'table' ? doing.rev : 0
      const frees = quota.frees ? ` ${t('quota.month.frees', { when: moment(quota.frees, t) })}` : ''
      return { what, why: `${t(mine ? 'quota.month.you' : 'quota.month.owner', n)}${frees}`, way: t('quota.month.way', { rev }) }
    }
    default:
      // A measure this page does not know yet — a newer server — is still a ceiling and not a fault.
      return { what, why: t(mine ? 'quota.other.you' : 'quota.other.owner', n), way: '' }
  }
}

function whatOf(doing: QuotaDoing, t: T): string {
  switch (doing.kind) {
    case 'newGame':
      return t('quota.what.newGame')
    case 'duplicate':
      return t('quota.what.duplicate', { game: doing.game })
    case 'edit':
      return t(EDIT_WHAT[doing.edit])
    case 'save':
      return t('quota.what.save')
    case 'table':
      return t('quota.what.table')
    case 'import':
    case 'upload':
      return ''
  }
}

// A number as the reader's language writes it.
const num = (n: number, t: T): string => new Intl.NumberFormat(t('quota.locale')).format(n)

// Bytes as a designer reads a file's size: in decimal megabytes, the way a file manager says them,
// with one decimal under ten and none above; kilobytes under one, gigabytes from a thousand.
// `scale` picks the unit, so that what is used is said in the ceiling's: «0,9 MB av 1 MB», never
// «900 kB av 1 MB».
export function bytes(n: number, t: T, scale = n): string {
  const say = (value: number, unit: Key) => t(unit, { n: new Intl.NumberFormat(t('quota.locale'), { maximumFractionDigits: value !== 0 && value < 10 ? 1 : 0 }).format(value) })
  if (scale >= 1e9) return say(n / 1e9, 'quota.bytes.gb')
  if (scale >= 1e6 || scale === 0) return say(n / 1e6, 'quota.bytes.mb')
  return say(n === 0 ? 0 : Math.max(1, Math.round(n / 1e3)), 'quota.bytes.kb')
}

// When something frees, on the reader's clock: the day, the month short, and the minute, since a
// rolling window frees at a moment and not at the start of a day.
function moment(iso: string, t: T): string {
  const at = new Date(iso)
  const locale = t('quota.locale')
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at).replace(/\.$/, '')
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(at)
  return t('quota.when', { date, time })
}
