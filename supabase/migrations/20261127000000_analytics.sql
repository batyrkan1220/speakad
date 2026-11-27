-- FaceAd · Analytics & Automation Control Center
-- Run once in Supabase → SQL editor (or `supabase db push`). Safe to re-run.
-- All tables have RLS on with no public policies: only the server (service key) reads / writes them.

create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists ai_avatars (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  image_url text,
  persona text,
  faced_actor_id text,                 -- link to a FaceAd library actor (optional)
  created_at timestamptz not null default now()
);

create table if not exists ig_accounts (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  handle text not null,
  ig_user_id text,                      -- Instagram Business / Creator account id
  niche text,
  status text not null default 'active' check (status in ('active','paused','token_expired','error')),
  access_token text,                    -- long-lived token (store encrypted / in Vault in production)
  token_expires_at timestamptz,
  followers integer not null default 0,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, handle)
);

create table if not exists ig_account_avatars (
  account_id text not null references ig_accounts(id) on delete cascade,
  avatar_id text not null references ai_avatars(id) on delete cascade,
  primary key (account_id, avatar_id)
);

create table if not exists reels (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  account_id text not null references ig_accounts(id) on delete cascade,
  avatar_id text references ai_avatars(id) on delete set null,
  status text not null check (status in ('scheduled','published','failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  duration_sec real not null default 0,
  script_tag text,                      -- template / script family
  hook_type text,                       -- question, bold claim, story, stat, pov…
  caption text,
  permalink text,
  thumbnail_url text,
  external_ig_media_id text,
  production_cost numeric(10,4) not null default 0,
  -- latest lifetime totals (denormalised from the newest snapshot for fast lists)
  views bigint not null default 0, reach bigint not null default 0, likes bigint not null default 0,
  comments bigint not null default 0, shares bigint not null default 0, saves bigint not null default 0,
  profile_visits bigint not null default 0, link_clicks bigint not null default 0, watch_ms bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (account_id, external_ig_media_id)
);
create index if not exists reels_ws_pub on reels (workspace_id, published_at desc);
create index if not exists reels_avatar on reels (avatar_id, published_at desc);

-- cumulative metrics over time (one row per reel per sync hour → idempotent)
create table if not exists reel_metrics_snapshots (
  reel_id text not null references reels(id) on delete cascade,
  captured_at timestamptz not null,
  views bigint not null default 0, reach bigint not null default 0, likes bigint not null default 0,
  comments bigint not null default 0, shares bigint not null default 0, saves bigint not null default 0,
  profile_visits bigint not null default 0, link_clicks bigint not null default 0, watch_ms bigint not null default 0,
  primary key (reel_id, captured_at)
);

-- pre-aggregated daily increments per account × avatar (dashboards read only this for charts / KPIs)
create table if not exists daily_rollups (
  workspace_id text not null references workspaces(id) on delete cascade,
  day date not null,
  account_id text not null references ig_accounts(id) on delete cascade,
  avatar_id text not null default '-',
  reels_published integer not null default 0,
  views bigint not null default 0, reach bigint not null default 0, likes bigint not null default 0,
  comments bigint not null default 0, shares bigint not null default 0, saves bigint not null default 0,
  profile_visits bigint not null default 0, link_clicks bigint not null default 0, watch_ms bigint not null default 0,
  primary key (workspace_id, day, account_id, avatar_id)
);

create table if not exists automation_jobs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  account_id text not null references ig_accounts(id) on delete cascade,
  reel_id text references reels(id) on delete set null,
  kind text not null check (kind in ('generate','publish','sync')),
  status text not null check (status in ('scheduled','running','succeeded','failed')),
  scheduled_at timestamptz not null,
  finished_at timestamptz,
  error text
);
create index if not exists jobs_ws_time on automation_jobs (workspace_id, scheduled_at desc);

create table if not exists api_health_logs (
  id bigserial primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  account_id text references ig_accounts(id) on delete cascade,
  at timestamptz not null default now(),
  endpoint text not null,
  status_code integer not null,
  latency_ms integer not null default 0,
  quota_used_pct real,                  -- from X-Business-Use-Case-Usage
  error text
);
create index if not exists health_ws_time on api_health_logs (workspace_id, at desc);

create table if not exists conversion_events (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  at timestamptz not null,
  account_id text references ig_accounts(id) on delete set null,
  avatar_id text references ai_avatars(id) on delete set null,
  reel_id text references reels(id) on delete set null,
  kind text not null check (kind in ('click','signup','lead','purchase')),
  value numeric(12,2) not null default 0,
  utm_source text, utm_campaign text, utm_content text
);
create index if not exists conv_ws_time on conversion_events (workspace_id, at desc);

create table if not exists cost_entries (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  at timestamptz not null,
  account_id text references ig_accounts(id) on delete set null,
  avatar_id text references ai_avatars(id) on delete set null,
  reel_id text references reels(id) on delete set null,
  kind text not null check (kind in ('generation','ad_spend','tools')),
  amount numeric(12,4) not null
);
create index if not exists cost_ws_time on cost_entries (workspace_id, at desc);

alter table workspaces enable row level security;
alter table ai_avatars enable row level security;
alter table ig_accounts enable row level security;
alter table ig_account_avatars enable row level security;
alter table reels enable row level security;
alter table reel_metrics_snapshots enable row level security;
alter table daily_rollups enable row level security;
alter table automation_jobs enable row level security;
alter table api_health_logs enable row level security;
alter table conversion_events enable row level security;
alter table cost_entries enable row level security;
