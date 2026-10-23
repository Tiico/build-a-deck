-- The log is the truth. A session is its setup plus its lines.

create table if not exists sessions (
  id          text primary key,
  version     text not null,
  setup       jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists events (
  session_id  text not null references sessions(id) on delete cascade,
  seq         integer not null,
  batch       text not null,
  at          timestamptz not null,
  by_seat     text,
  intent      jsonb not null,
  outcome     jsonb,
  primary key (session_id, seq)
);

-- The schema version a line was written under (DRIFT §7); null for lines from before versioning.
alter table events add column if not exists schema_version integer;

-- The deck the textures are compiled from (TUNN-SKIVA §5); null for sessions without one.
alter table sessions add column if not exists deck jsonb;
-- The project a table was started from, for refreshing to a newer rev (C7).
alter table sessions add column if not exists project text;

-- Projects (L4): a revisioned document until the project actor with its log exists (D3).
create table if not exists projects (
  id          text primary key,
  rev         integer not null,
  doc         jsonb not null,
  updated_at  timestamptz not null default now()
);

-- The survey after a session (G3): beside the log, tied to the version the session ended on.
create table if not exists surveys (
  id          bigserial primary key,
  session_id  text not null references sessions(id) on delete cascade,
  version     text not null,
  at          timestamptz not null,
  who         text not null,
  seat        text,
  observer    boolean not null default false,
  answers     jsonb not null
);
-- One answer per seat and per observer at a table (#1021, G3): a second one replaces the first.
-- Before the keys anyone could answer any number of times, so the answers that were given twice
-- are cut down to the latest, the one a replacing answer would have left standing.
delete from surveys older using surveys newer
  where older.session_id = newer.session_id
    and older.observer = newer.observer
    and (case when older.observer then older.who = newer.who else older.seat = newer.seat end)
    and (newer.at, newer.id) > (older.at, older.id);
create unique index if not exists surveys_seat on surveys (session_id, seat) where not observer;
create unique index if not exists surveys_observer on surveys (session_id, who) where observer;

-- Accounts for creators (G1, DRIFT §11): magic links and session cookies, no passwords.
create table if not exists accounts (
  id          bigserial primary key,
  email       text not null unique,
  created_at  timestamptz not null default now()
);
create table if not exists login_tokens (
  token_hash  text primary key,
  email       text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create table if not exists auth_sessions (
  session_hash text primary key,
  account_id   bigint not null references accounts(id) on delete cascade,
  expires_at   timestamptz not null
);
-- Admission (DRIFT §9): the room code, when it lapses, and the host key's hash. Sessions from
-- before codes have none: they cannot be reached by code or opened as the table.
alter table sessions add column if not exists code text;
alter table sessions add column if not exists code_expires_at timestamptz;
alter table sessions add column if not exists host_key_hash text;
create unique index if not exists sessions_code on sessions (code) where code is not null;
-- Guests' admissions: the token a phone or an observer connects with, hashed; a kick revokes.
create table if not exists guest_tokens (
  session_id  text not null references sessions(id) on delete cascade,
  token_hash  text primary key,
  kind        text not null check (kind in ('seat', 'observer')),
  seat        text,
  name        text not null,
  issued_at   timestamptz not null,
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
-- Existing admissions predate pending-token expiry. Preserve them until normal activation or
-- revocation rather than invalidating guests during rollout.
alter table guest_tokens add column if not exists expires_at timestamptz;
update guest_tokens set expires_at = '9999-12-31 23:59:59.999+00' where expires_at is null;
alter table guest_tokens alter column expires_at set not null;
create index if not exists guest_tokens_session on guest_tokens (session_id);
-- The account a guest claimed the session to afterwards (G1); null until then.
alter table guest_tokens add column if not exists account_id text;
create index if not exists guest_tokens_account on guest_tokens (account_id) where account_id is not null;
-- A seat can have only one live admission. Revoked admissions remain as audit history, and
-- observer admissions (whose seat is null) remain unlimited.
create unique index if not exists guest_tokens_live_seat
  on guest_tokens (session_id, seat)
  where kind = 'seat' and revoked_at is null;

-- The account a project belongs to; null for projects from before accounts.
alter table projects add column if not exists owner text;
create index if not exists projects_owner on projects (owner);

-- The account a table is borne by (A2, #1194): the one its cost is counted against. Set when the
-- table is started, to the game's owner (never the test leader who pressed) or to the account at
-- the raw door, and kept when the game is taken away. Text, as `projects.owner` is.
-- Filled in for the tables from before it out of their game's owner, while the game is there to
-- say; a table without a game, or from a game from before accounts, has nobody to be given and is
-- left without. Only empty bearers are filled, so running this again never moves one.
alter table sessions add column if not exists account_id text;
update sessions set account_id = projects.owner
  from projects
  where sessions.account_id is null and sessions.project = projects.id and projects.owner is not null;
create index if not exists sessions_account on sessions (account_id) where account_id is not null;

-- The project's images (E1, DRIFT §4): by content hash. With R2 the bytes live there under
-- assets/<hash> and `bytes` stays null; without it they stay here.
create table if not exists assets (
  hash          text primary key,
  content_type  text not null,
  size          integer not null,
  bytes         bytea,
  created_at    timestamptz not null default now()
);
-- What is drawn inside the picture (E1): the file's pixel size and the uniform border it carries
-- around its motif. A property of the bytes, so it is measured once per hash and never again.
alter table assets add column if not exists motif jsonb;

-- The project's history (B4): one row per save, never written again. A named version is a
-- milestone the designer cared about; the rest are simply what happened.
create table if not exists project_versions (
  project_id  text not null references projects(id) on delete cascade,
  rev         integer not null,
  doc         jsonb not null,
  label       text,
  -- How far the edit log had come when the version was made (D3).
  at_seq      integer,
  created_at  timestamptz not null default now(),
  primary key (project_id, rev)
);
alter table project_versions add column if not exists at_seq integer;

-- What several people did to a project between two saves (D3): committed before it is applied,
-- exactly as a table's log is.
create table if not exists project_events (
  project_id  text not null references projects(id) on delete cascade,
  seq         integer not null,
  intent      jsonb not null,
  by_account  text,
  created_at  timestamptz not null default now(),
  primary key (project_id, seq)
);

-- Who a project is shared with (D3): the owner is the project's own column, everyone else a row.
create table if not exists project_members (
  project_id  text not null references projects(id) on delete cascade,
  -- Accounts are numbered, so a member is too; the rest of the API speaks of them as text.
  account_id  bigint not null references accounts(id) on delete cascade,
  role        text not null,
  added_at    timestamptz not null default now(),
  primary key (project_id, account_id)
);

-- An invitation to a project (D3): mailed to an address, good once, and gone when it is used.
create table if not exists project_invites (
  token_hash  text primary key,
  project_id  text not null references projects(id) on delete cascade,
  email       text not null,
  role        text not null,
  invited_by  bigint references accounts(id) on delete set null,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

-- The deck of each version «Uppdatera» moved a table to (C7, #677). The session row keeps the deck
-- the table started with; a table reloaded after a refresh takes its faces from the version its
-- log says it plays.
create table if not exists session_decks (
  session_id  text not null references sessions(id) on delete cascade,
  version     text not null,
  deck        jsonb not null,
  primary key (session_id, version)
);

-- The designer's own AI key (#999, E4, DRIFT §5): one per account, sealed with AES-256-GCM under the
-- master key in the box's environment (`AI_KEY_SECRET`), which is never in this database and so never
-- in its backups. Only what the profile may show is kept beside the seal: the provider, the last four
-- characters, the chosen model (null is the provider's standard) and when the key was proved.
create table if not exists ai_keys (
  account_id   bigint primary key references accounts(id) on delete cascade,
  provider     text not null check (provider in ('anthropic', 'openai')),
  ciphertext   bytea not null,
  nonce        bytea not null,
  last4        text not null,
  model        text,
  verified_at  timestamptz not null,
  updated_at   timestamptz not null default now()
);

-- Passkeys (#1180, DRIFT §11): a convenience beside the magic link. The public key and its counter
-- are what a login is checked against; the AAGUID names the keychain it lives in and `device` the
-- browser it was saved from, which is all the profile says about it. The private key never leaves
-- the reader's device.
create table if not exists passkeys (
  id            text primary key,
  account_id    bigint not null references accounts(id) on delete cascade,
  public_key    bytea not null,
  counter       bigint not null default 0,
  transports    text[] not null default '{}',
  aaguid        text not null,
  device        text not null,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists passkeys_account on passkeys (account_id);

-- Each account's tier (#1193, A2, #1192): written by the operator today (`pnpm --filter @byd/server
-- plan`) and by Stripe later, so that paying is a way to change tier and not a new model. An account
-- without a row has the default tier of `BYD_PLANS`; a tier named here that `BYD_PLANS` lacks stops
-- the start. Which ceilings a tier has is configuration and never stored.
create table if not exists account_plans (
  account_id  bigint primary key references accounts(id) on delete cascade,
  plan        text not null,
  since       timestamptz not null default now(),
  source      text not null check (source in ('operator', 'stripe'))
);
