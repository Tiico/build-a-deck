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
-- The account's own name (#1254): what the others call the designer, null until she gives one, and
-- whether she has been asked for it. An account from before the name has not, and is asked once on
-- Mina spel. Its length is held at the door (40 characters); it goes with the account's row.
alter table accounts add column if not exists name text;
alter table accounts add column if not exists name_asked boolean not null default false;
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
-- How the people at the table sit (#1286): 'screen' or 'computer', the host's answer when the table
-- started. Tables from before the question, and from the raw door, have none.
alter table sessions add column if not exists seating text;
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

-- When a designer first opened the game's box (#1416, L91): the hero in Mina spel shows the box from
-- then on. On the game and not in its document, since opening a tab is no change to the game.
alter table projects add column if not exists box_opened_at timestamptz;

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

-- Who saved a version (#1225): the account, as text like `projects.owner`, so «Väntar på dig» can
-- say that a co-editor saved one. Null is «not known», and nothing is guessed. The column is filled
-- once, the start it is made on, and only where the answer is certain: a version saved here — it
-- has `at_seq`, which an import never writes — in a game with an owner that nobody else could ever
-- edit, since no invitation to edit it was ever accepted (one accepted and later taken back still
-- counts). There the owner saved every version. The first version is left unknown, since an import
-- writes one exactly like `create` does; so is every version of a game shared with a co-editor,
-- whose saves the log does not tell apart, and of a game from before accounts.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = current_schema() and table_name = 'project_versions' and column_name = 'saved_by') then
    alter table project_versions add column saved_by text;
    update project_versions v set saved_by = p.owner
      from projects p
      where v.project_id = p.id and p.owner is not null and v.at_seq is not null
        and not exists (select 1 from project_invites i where i.project_id = p.id and i.accepted_at is not null and i.role in ('owner', 'editor'))
        and not exists (select 1 from project_members m where m.project_id = p.id and m.role in ('owner', 'editor'));
  end if;
end $$;

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

-- What each game's versions name (#1197, #1192 question 4): one row per game and asset some version
-- of it uses, read the way `assetHashesOf` reads a document — every string anywhere in it that is
-- an `asset:<hash>`, and every hash `pictures` has an entry for — which is what an export carries.
-- Storage is what an account's games use, the sum of `assets.size` over the distinct hashes its
-- games name, and this table is only so that the sum is not a walk over every version at every
-- upload: derived from `project_versions`, written in the transaction that writes a version, and
-- gone with the game. It holds nothing the versions do not say, so it is rebuilt from them whenever
-- the script runs and finds it missing: dropped, it is made again out of every version by the next
-- start that runs the script — one after the script changes, or after its row in `schema_migrations`
-- is deleted (#1442). A name no asset
-- answers to is kept like any other, and weighs nothing until the bytes come.
do $$
begin
  if to_regclass('project_assets') is null then
    create table project_assets (
      project_id  text not null references projects(id) on delete cascade,
      hash        text not null,
      primary key (project_id, hash)
    );
    insert into project_assets (project_id, hash)
      select v.project_id, substr(s #>> '{}', 7) from project_versions v,
        jsonb_path_query(v.doc, 'strict $.** ? (@.type() == "string" && @ like_regex "^asset:[0-9a-f]{64}$")') as s
      union
      select v.project_id, k from project_versions v,
        jsonb_object_keys(case when jsonb_typeof(v.doc -> 'pictures') = 'object' then v.doc -> 'pictures' else '{}'::jsonb end) as k
      where k ~ '^[0-9a-f]{64}$';
  end if;
end $$;

-- The terms an account has accepted (#1270, F4, #1268): one row per account and version, with when,
-- and never written over. Which versions there are, and which is in force, is the register in
-- `src/terms.ts` and never stored. An account from before the terms has no row, and so has
-- accepted nothing, which is what it has done.
create table if not exists terms_acceptances (
  account_id   bigint not null references accounts(id) on delete cascade,
  version      text not null,
  accepted_at  timestamptz not null,
  primary key (account_id, version)
);

-- The erasure ledger (#1279, G6, DRIFT §5): every erasure and every masking, written in the
-- transaction that does it — what, which id, when and why, and never a name, an address or a token.
-- An admission is named by its table, its seat (null for an observer) and when it was given; a game
-- by its id. No foreign keys: an entry must outlive what it names, and must be writable after a
-- restore to a point where what it names is back, or not yet there. `erase replay` runs it again.
create table if not exists erasures (
  id          text primary key,
  at          timestamptz not null,
  kind        text not null check (kind in ('guest', 'table', 'game')),
  reason      text not null check (reason in ('request', 'retention', 'removed')),
  session_id  text,
  seat        text,
  issued_at   timestamptz,
  project_id  text
);

-- An account that deleted itself (#1280, G6) is an entry too: named by its id, which nothing else
-- in the database says afterwards, so that a restore to an earlier point deletes it again. A ledger
-- made before it checks its kinds without it; the check is replaced once, and only then.
alter table erasures add column if not exists account_id text;
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'erasures'::regclass and conname = 'erasures_kind_check'
      and pg_get_constraintdef(oid) not like '%account%'
  ) then
    alter table erasures drop constraint erasures_kind_check;
    alter table erasures add constraint erasures_kind_check check (kind in ('guest', 'table', 'game', 'account'));
  end if;
end $$;

-- What a deleted account's games named, put down for the sweep (#1280, G6, DRIFT §4): a picture or
-- a typeface by its hash (`asset`), and a rendering the account bore (`render`), each with the day
-- it may go. When the day comes it goes only if nothing still there names it; either way the row
-- goes. A hash says nothing about anybody.
create table if not exists asset_sweeps (
  hash    text not null,
  kind    text not null check (kind in ('asset', 'render')),
  due_at  timestamptz not null,
  primary key (hash, kind)
);

-- Reports (#1274, F4 beslut 12, DSA art. 16): what someone reported on `/villkor/anmal`, as they
-- wrote it, numbered in the order they came, and the operator's decision once it is made. Name and
-- address may be empty: a report of sexual content involving children needs neither.
create table if not exists reports (
  n            bigserial primary key,
  at           timestamptz not null,
  what         text not null,
  place        text not null,
  why          text not null,
  name         text not null,
  email        text not null,
  lang         text not null,
  outcome      text check (outcome in ('held', 'rejected')),
  decided_at   timestamptz
);

-- Blocks (#1274): a picture that must not be shown, by the hash of its bytes, in every game that uses
-- it. A blocked hash is treated as if it were not there (DRIFT §4); its row in `assets` and its bytes
-- stay, unless `purged` says they were taken out because the content was illegal. No foreign keys: a
-- block outlives the bytes it names, so the same bytes can never be uploaded again.
create table if not exists asset_blocks (
  hash        text primary key,
  at          timestamptz not null,
  reason      text not null check (reason in ('rights', 'illegal', 'terms')),
  report      text,
  purged      boolean not null default false
);

-- A game gone from a member's Mina spel (#1334, G6): its owner took it away (`removed`) or deleted
-- her account (`account`). Written in the transaction that takes the game, one row per member, and
-- gone when the member closes the band on Mina spel, or with her own account. It says the game's
-- name, why and when, and never who the owner was: no owner, and no game id that the ledger could
-- lead back to her by.
create table if not exists gone_games (
  id          text primary key,
  account_id  bigint not null references accounts(id) on delete cascade,
  name        text not null,
  why         text not null check (why in ('removed', 'account')),
  at          timestamptz not null
);
create index if not exists gone_games_account on gone_games (account_id);
