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
  bytes       bytea not null,
  created_at  timestamptz not null default now()
);
