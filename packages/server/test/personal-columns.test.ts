import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The database's columns, classed the way the map in #1269 classes what Deckster keeps (#1276):
// a person's own data, an id that points at one without saying who, or nothing about anybody. A
// column added to either schema without being classed here turns this red, so the map follows the
// schema instead of ageing beside it. The fields of a log line inside `events.intent` have their
// own list, `PERSONAL_FIELDS` in `@byd/protocol`.
type Class = 'personal' | 'pseudonymous' | 'none'
const COLUMNS: Readonly<Record<string, Class>> = {
  // The tables (karta 1).
  'sessions.id': 'pseudonymous',
  'sessions.version': 'none',
  'sessions.setup': 'none',
  'sessions.created_at': 'none',
  'sessions.deck': 'none',
  'sessions.project': 'pseudonymous',
  'sessions.code': 'none',
  'sessions.code_expires_at': 'none',
  'sessions.host_key_hash': 'none',
  // How the people at it sit, 'screen' or 'computer' (#1286): about the table, not about anybody.
  'sessions.seating': 'none',
  'sessions.account_id': 'pseudonymous',
  'events.session_id': 'pseudonymous',
  'events.seq': 'none',
  'events.batch': 'none',
  'events.at': 'none',
  'events.by_seat': 'none',
  // The names and the words of the people at the table, as `PERSONAL_FIELDS` lists them.
  'events.intent': 'personal',
  // A rewind's table is zones and components and no seat (`redact.test.ts` in `@byd/engine`).
  'events.outcome': 'none',
  'events.schema_version': 'none',
  'surveys.id': 'none',
  'surveys.session_id': 'pseudonymous',
  'surveys.version': 'none',
  'surveys.at': 'none',
  'surveys.who': 'personal',
  'surveys.seat': 'none',
  'surveys.observer': 'none',
  'surveys.answers': 'personal',
  'guest_tokens.session_id': 'pseudonymous',
  'guest_tokens.token_hash': 'none',
  'guest_tokens.kind': 'none',
  'guest_tokens.seat': 'none',
  'guest_tokens.name': 'personal',
  'guest_tokens.issued_at': 'none',
  'guest_tokens.expires_at': 'none',
  'guest_tokens.revoked_at': 'none',
  'guest_tokens.account_id': 'pseudonymous',
  'session_decks.session_id': 'pseudonymous',
  'session_decks.version': 'none',
  'session_decks.deck': 'none',
  // The accounts (karta 2).
  'accounts.id': 'pseudonymous',
  'accounts.email': 'personal',
  'accounts.created_at': 'none',
  // The name the designer gave her account (#1254), and whether she has been asked for one.
  'accounts.name': 'personal',
  'accounts.name_asked': 'none',
  'login_tokens.token_hash': 'none',
  'login_tokens.email': 'personal',
  'login_tokens.expires_at': 'none',
  'login_tokens.used_at': 'none',
  'auth_sessions.session_hash': 'none',
  'auth_sessions.account_id': 'pseudonymous',
  'auth_sessions.expires_at': 'none',
  'ai_keys.account_id': 'pseudonymous',
  'ai_keys.provider': 'none',
  'ai_keys.ciphertext': 'personal',
  'ai_keys.nonce': 'none',
  'ai_keys.last4': 'personal',
  'ai_keys.model': 'none',
  'ai_keys.verified_at': 'none',
  'ai_keys.updated_at': 'none',
  'passkeys.id': 'pseudonymous',
  'passkeys.account_id': 'pseudonymous',
  'passkeys.public_key': 'pseudonymous',
  'passkeys.counter': 'none',
  'passkeys.transports': 'none',
  'passkeys.aaguid': 'none',
  'passkeys.device': 'personal',
  'passkeys.created_at': 'none',
  'passkeys.last_used_at': 'none',
  // What she agreed to and when (#1270): about her, and hers in an extract (art. 15, #1280).
  'terms_acceptances.account_id': 'pseudonymous',
  'terms_acceptances.version': 'none',
  'terms_acceptances.accepted_at': 'personal',
  'account_plans.account_id': 'pseudonymous',
  'account_plans.plan': 'none',
  'account_plans.since': 'none',
  'account_plans.source': 'none',
  // The games: the designer's own content, and who may open it.
  'projects.id': 'pseudonymous',
  'projects.rev': 'none',
  'projects.doc': 'none',
  'projects.updated_at': 'none',
  'projects.owner': 'pseudonymous',
  'project_versions.project_id': 'pseudonymous',
  'project_versions.rev': 'none',
  'project_versions.doc': 'none',
  'project_versions.label': 'none',
  'project_versions.at_seq': 'none',
  'project_versions.created_at': 'none',
  'project_versions.saved_by': 'pseudonymous',
  'project_events.project_id': 'pseudonymous',
  'project_events.seq': 'none',
  'project_events.intent': 'none',
  'project_events.by_account': 'pseudonymous',
  'project_events.created_at': 'none',
  'project_members.project_id': 'pseudonymous',
  'project_members.account_id': 'pseudonymous',
  'project_members.role': 'none',
  'project_members.added_at': 'none',
  // A third person's address (karta 2).
  'project_invites.token_hash': 'none',
  'project_invites.project_id': 'pseudonymous',
  'project_invites.email': 'personal',
  'project_invites.role': 'none',
  'project_invites.invited_by': 'pseudonymous',
  'project_invites.expires_at': 'none',
  'project_invites.accepted_at': 'none',
  'project_invites.created_at': 'none',
  'project_assets.project_id': 'pseudonymous',
  'project_assets.hash': 'none',
  'assets.hash': 'none',
  'assets.content_type': 'none',
  'assets.size': 'none',
  'assets.bytes': 'none',
  'assets.created_at': 'none',
  'assets.motif': 'none',
  // The erasure ledger (#1279, DRIFT §5): what was erased, which and when, and never whose words.
  'erasures.id': 'none',
  'erasures.at': 'none',
  'erasures.kind': 'none',
  'erasures.reason': 'none',
  'erasures.session_id': 'pseudonymous',
  'erasures.seat': 'none',
  'erasures.issued_at': 'none',
  'erasures.project_id': 'pseudonymous',
  // The render queue (`packages/render/sql`).
  'render_jobs.hash': 'none',
  'render_jobs.kind': 'none',
  'render_jobs.priority': 'none',
  'render_jobs.compiled': 'none',
  'render_jobs.requested_at': 'none',
  'render_jobs.state': 'none',
  'render_jobs.error': 'none',
  'render_jobs.started_at': 'none',
  'render_outputs.hash': 'none',
  'render_outputs.bytes': 'none',
  'render_outputs.created_at': 'none',
  'render_outputs.smallest_pt': 'none',
  'render_log.id': 'none',
  'render_log.account_id': 'pseudonymous',
  'render_log.hash': 'none',
  'render_log.priority': 'none',
  'render_log.requested_at': 'none',
  // A picture's screening (#1271): what a classifier made of an asset, by its hash, and when. It
  // says nothing about who uploaded it, as `assets` does not.
  'screenings.asset_hash': 'none',
  'screenings.classifier': 'none',
  'screenings.version': 'none',
  'screenings.scores': 'none',
  'screenings.image_hash': 'none',
  'screenings.screened_at': 'none',
  // The reference list (#1273): PDQ hashes of pictures that must not be printed, and where each came
  // from in the operator's words — a takedown and its date, or the list it came in. A hash says
  // nothing about who uploaded a picture, and the source names a list or a takedown, never a person.
  'screening_references.algorithm': 'none',
  'screening_references.bits': 'none',
  'screening_references.quality': 'none',
  'screening_references.source': 'none',
  'screening_references.added_at': 'none',
}

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
