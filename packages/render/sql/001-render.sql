-- The render queue and its outputs (DRIFT §6). One row per content hash.

create table if not exists render_jobs (
  hash          text primary key,
  kind          jsonb not null,
  priority      text not null check (priority in ('texture', 'print', 'screen')),
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

-- Screening (F4, #1271) is the third priority, after textures and prints. A queue made before it
-- holds its priorities to a check without it; the check is replaced once, and only then, since
-- replacing it reads the whole table.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'render_jobs'::regclass and conname = 'render_jobs_priority_check'
      and pg_get_constraintdef(oid) not like '%screen%'
  ) then
    alter table render_jobs drop constraint render_jobs_priority_check;
    alter table render_jobs add constraint render_jobs_priority_check check (priority in ('texture', 'print', 'screen'));
  end if;
end $$;

-- One result per picture, classifier and version (F4: the same picture is screened once): the
-- scores per category, the perceptual hash, and when, in ms as the queue's clocks are. A new
-- version of a classifier screens a picture again; an old version's result stays as it was.
create table if not exists screenings (
  asset_hash   text not null,
  classifier   text not null,
  version      text not null,
  scores       jsonb not null,
  image_hash   jsonb not null,
  screened_at  bigint not null,
  primary key (asset_hash, classifier, version)
);
