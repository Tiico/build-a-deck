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
  revoked_at  timestamptz
);
create index if not exists guest_tokens_session on guest_tokens (session_id);
-- A seat can have only one live admission. Revoked admissions remain as audit history, and
-- observer admissions (whose seat is null) remain unlimited.
create unique index if not exists guest_tokens_live_seat
  on guest_tokens (session_id, seat)
  where kind = 'seat' and revoked_at is null;

-- The account a project belongs to; null for projects from before accounts.
alter table projects add column if not exists owner text;
create index if not exists projects_owner on projects (owner);
