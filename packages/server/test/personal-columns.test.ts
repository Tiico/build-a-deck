import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COLUMNS } from './column-map.js'

// The database's columns, classed in `column-map.ts` the way the map in #1269 classes what Deckster
// keeps (#1276). A column added to either schema without being classed there turns this red, so the
// map follows the schema instead of ageing beside it. The fields of a log line inside `events.intent`
// have their own list, `PERSONAL_FIELDS` in `@byd/protocol`.
const root = join(import.meta.dirname, '../../..')
const SCHEMAS = ['packages/server/sql/001-init.sql', 'packages/render/sql/001-render.sql'].map((p) => readFileSync(join(root, p), 'utf8'))

// Every column a schema makes, as `table.column`: in a `create table`, and in an `alter table … add
// column`. A constraint line in a table is not a column.
function columnsOf(sql: string): string[] {
  const out: string[] = []
  const text = sql.replace(/--[^\n]*/g, '')
  for (const [, table, body] of text.matchAll(/create table (?:if not exists )?(\w+)\s*\(([\s\S]*?)\n\s*\);/g)) {
    for (const line of body!.split('\n')) {
      const column = /^\s*(\w+)\s+\w/.exec(line)?.[1]
      if (column && !['primary', 'constraint', 'unique', 'check', 'foreign'].includes(column)) out.push(`${table}.${column}`)
    }
  }
  for (const [, table, column] of text.matchAll(/alter table (\w+) add column (?:if not exists )?(\w+)/g)) out.push(`${table}.${column}`)
  return [...new Set(out)]
}
const unclassed = (sqls: readonly string[]) => sqls.flatMap(columnsOf).filter((c) => !(c in COLUMNS))

describe('the columns of the database, classed (#1276, #1269)', () => {
  it('reads every table of both schemas, the personal ones #1269 found among them', () => {
    const columns = SCHEMAS.flatMap(columnsOf)
    for (const known of ['terms_acceptances.accepted_at', 'accounts.email', 'login_tokens.email', 'project_invites.email', 'guest_tokens.name', 'surveys.who', 'surveys.answers', 'events.intent', 'sessions.account_id', 'project_versions.saved_by', 'render_log.account_id']) expect(columns).toContain(known)
  })

  it('classes every column there is, and nothing that is not there', () => {
    expect(unclassed(SCHEMAS)).toEqual([])
    const columns = new Set(SCHEMAS.flatMap(columnsOf))
    expect(Object.keys(COLUMNS).filter((c) => !columns.has(c))).toEqual([])
  })

  it('falls for a new column nobody classed, in a table or added to one', () => {
    const grown = [SCHEMAS[0] + '\nalter table accounts add column if not exists nickname text;\ncreate table if not exists addresses (\n  account_id bigint not null,\n  street text not null,\n  primary key (account_id)\n);\n', SCHEMAS[1]!]
    expect(unclassed(grown)).toEqual(['addresses.account_id', 'addresses.street', 'accounts.nickname'])
  })
})
