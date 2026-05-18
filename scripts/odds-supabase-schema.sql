create table if not exists public.odds_snapshots (
  id bigserial primary key,
  league text not null,
  event_id text not null,
  game_date date,
  commence_time timestamptz,
  home_abbr text,
  away_abbr text,
  snapshot_type text not null,
  pulled_at timestamptz not null default now(),
  locked boolean not null default false,
  odds jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league, event_id, snapshot_type)
);

create index if not exists odds_snapshots_event_idx
  on public.odds_snapshots (league, event_id, pulled_at desc);

create index if not exists odds_snapshots_game_date_idx
  on public.odds_snapshots (league, game_date);

create table if not exists public.odds_refresh_runs (
  id bigserial primary key,
  league text not null,
  slate_date date not null,
  wave_key text not null,
  pulled_at timestamptz not null default now(),
  window_from timestamptz not null,
  window_to timestamptz not null,
  game_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (league, slate_date, wave_key)
);

alter table public.odds_snapshots enable row level security;
alter table public.odds_refresh_runs enable row level security;
