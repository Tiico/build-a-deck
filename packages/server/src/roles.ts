// What a project is shared as (D3). Permissions are a model, not a field: a route asks what the
// role may do rather than remembering the rules itself, so a new route cannot get them wrong.
//
// The owner made the game and answers for it. An editor changes it. A test leader runs playtests
// — tables, seats, the rulebook — without touching the deck. A viewer looks.
export const ROLES = ['owner', 'editor', 'tester', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value)

// Every role that exists may look; a role that does not exist may not.
export const canRead = (role: Role): boolean => (ROLES as readonly string[]).includes(role)
export const canEdit = (role: Role): boolean => role === 'owner' || role === 'editor'
export const canStartTables = (role: Role): boolean => role !== 'viewer'
// Sharing a game, taking it away, and taking someone's access back are the owner's alone.
export const canShare = (role: Role): boolean => role === 'owner'
export const canDelete = (role: Role): boolean => role === 'owner'

// An invitation lives a week: long enough to be read on a Monday, short enough to expire.
export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000

// What a role is called to the person being invited, in the language they are being written to
// in (A4). Swedish is what the tool falls back to, as everywhere else.
const ROLE_WORDS: Record<'sv' | 'en', Record<Role, string>> = {
  sv: { owner: 'ägare', editor: 'medredigerare', tester: 'testledare', viewer: 'betraktare' },
  en: { owner: 'owner', editor: 'co-editor', tester: 'test leader', viewer: 'viewer' },
}
export const roleWord = (role: Role, lang: 'sv' | 'en' = 'sv'): string => ROLE_WORDS[lang][role]
