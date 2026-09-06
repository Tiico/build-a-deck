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
