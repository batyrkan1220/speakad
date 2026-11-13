-- SpeakAd: all app data, files and logs live in Supabase.
-- The app talks to Supabase only from the server (Next.js API routes on Render)
-- using the secret key, so RLS is on with no public policies.

create table if not exists public.projects (
  id          text primary key,
  name        text not null default 'New Project',
  folder      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.actors (
  id          text primary key,
  name        text not null,
  gender      text,
  age         text,
  situation   text[] not null default '{}',
  accessories text[] not null default '{}',
  emotion     text,
  image_url   text,
  voice_id    text,
  prompt      text,
  hd          boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.generations (
  id           text primary key,
  project_id   text not null references public.projects(id) on delete cascade,
  actor_id     text,
  actor_name   text,
  actor_image  text,
  script       text,
  status       text not null default 'queued'
               check (status in ('queued','voicing','rendering','done','error')),
  request_id   text,
  video_url    text,
  audio_url    text,
  error        text,
  duration     numeric,
  settings     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists generations_project_idx on public.generations (project_id, created_at desc);
create index if not exists generations_request_idx on public.generations (request_id);

-- Small key/value store for app-wide state: settings, favorites, voice overrides,
-- generated seed-actor portraits, current project.
create table if not exists public.app_state (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Server logs: every API call, its duration, and errors.
create table if not exists public.logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  level       text not null default 'info' check (level in ('debug','info','warn','error')),
  route       text,
  message     text not null,
  duration_ms integer,
  meta        jsonb not null default '{}'
);
create index if not exists logs_created_idx on public.logs (created_at desc);
create index if not exists logs_level_idx on public.logs (level, created_at desc);

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
drop trigger if exists generations_touch on public.generations;
create trigger generations_touch before update on public.generations
  for each row execute function public.touch_updated_at();

alter table public.projects    enable row level security;
alter table public.actors      enable row level security;
alter table public.generations enable row level security;
alter table public.app_state   enable row level security;
alter table public.logs        enable row level security;

-- Public bucket for videos, voice audio and actor images. Public read is needed
-- because fal.ai must fetch actor images/audio by URL and the browser plays videos.
-- Uploads happen only from the server with the secret key.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 524288000)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;
