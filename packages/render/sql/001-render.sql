-- The render queue and its outputs (DRIFT §6). One row per content hash.

create table if not exists render_jobs (
  hash          text primary key,
  kind          jsonb not null,
  priority      text not null check (priority in ('texture', 'print')),
  compiled      jsonb not null,
  requested_at  bigint not null,
  state         text not null check (state in ('queued', 'running', 'done', 'failed')),
  error         text,
  started_at    bigint
);

create index if not exists render_jobs_queue on render_jobs (priority, requested_at) where state = 'queued';

create table if not exists render_outputs (
  hash        text primary key,
  bytes       bytea,
  created_at  timestamptz not null default now()
);
-- Outputs moved to the object store (DRIFT §4): a row without bytes is one that lives there.
alter table render_outputs alter column bytes drop not null;
-- What a texture's smallest text was fitted to (#523), in pt; null for no words, and for every
-- output made before it was kept.
alter table render_outputs add column if not exists smallest_pt real;

-- The render log (#1197, A2, #1192): one line per job the queue answered `queued` for, on the
-- account that bears it — the table's bearer for its textures and «Uppdatera», the game's owner for
-- a print, an export and a rulebook. A rendering is content-addressed and `render_jobs` keeps no
-- owner, so who caused one cannot be worked out afterwards; it is written in the transaction that
-- queues the job. `requested_at` is the job's own clock, in ms. Text, as `sessions.account_id` is.
create table if not exists render_log (
  id            bigserial primary key,
  account_id    text not null,
  hash          text not null,
  priority      text not null check (priority in ('texture', 'print')),
  requested_at  bigint not null
);
create index if not exists render_log_account on render_log (account_id, requested_at);
