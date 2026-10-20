// The replay corpus's one door into other people's tables (#1011, DRIFT §7).
//
// The corpus is real sessions, anonymised (#540), and a session's export is otherwise read only by
// its own project's test leaders (#524). A beta designer's tables reach it when she said yes in the
// mail that invited her (beställaren 2026-10-18): consent is given there, not in the product, and
// is written down on the box as her address in `BYD_CORPUS_ACCOUNTS`. The one who may then read
// those tables' exports — and nothing else of theirs — is the operator, `BYD_OPERATOR`.
//
// Both are read once, at start: an address taken off the list is shut out at the next restart.
export type Corpus = { operator: string; accounts: readonly string[] }

// An address as the login stores it (`/auth/login` trims it and lowers its case), so a list typed
// by hand matches the accounts it names.
const address = (raw: string): string => raw.trim().toLowerCase()

// Nothing unless both are named: without an operator there is nobody to let in, and without an
// account there is nothing to let them into.
export function corpusFromEnv(env: Record<string, string | undefined>): Corpus | undefined {
  const operator = address(env['BYD_OPERATOR'] ?? '')
  const accounts = (env['BYD_CORPUS_ACCOUNTS'] ?? '').split(',').map(address).filter((a) => a !== '')
  return operator !== '' && accounts.length > 0 ? { operator, accounts } : undefined
}
