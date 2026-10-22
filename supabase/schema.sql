-- MyWatchlist databaseschema
-- Plak dit in Supabase: SQL Editor -> New query -> Run.
-- Je kunt dit bestand veilig opnieuw uitvoeren na een update; bestaande gegevens blijven staan.

create table if not exists public.watchlist_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source          text not null check (source in ('tmdb', 'jikan')),
  media_type      text not null check (media_type in ('movie', 'tv', 'anime')),
  external_id     text not null,
  imdb_id         text,
  title           text not null,
  original_title  text,
  poster_url      text,
  year            integer,
  total_episodes  integer,
  seasons         jsonb,
  status          text not null default 'plan_to_watch'
                  check (status in ('watching', 'completed', 'plan_to_watch', 'on_hold', 'dropped')),
  rating          smallint check (rating between 1 and 10),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, source, media_type, external_id)
);

-- Voor databases die met een eerdere versie van dit bestand zijn gemaakt
alter table public.watchlist_items add column if not exists seasons jsonb;

create table if not exists public.watched_episodes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id         uuid not null references public.watchlist_items (id) on delete cascade,
  season_number   integer not null default 1,
  episode_number  integer not null,
  watched_at      timestamptz not null default now(),
  unique (item_id, season_number, episode_number)
);

create index if not exists watchlist_items_user_idx on public.watchlist_items (user_id, updated_at desc);
create index if not exists watched_episodes_item_idx on public.watched_episodes (item_id);

-- updated_at automatisch bijwerken
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists watchlist_items_updated_at on public.watchlist_items;
create trigger watchlist_items_updated_at
  before update on public.watchlist_items
  for each row execute function public.set_updated_at();

-- Iedere gebruiker ziet en wijzigt alleen zijn eigen gegevens
alter table public.watchlist_items enable row level security;
alter table public.watched_episodes enable row level security;

drop policy if exists "eigen items" on public.watchlist_items;
create policy "eigen items" on public.watchlist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "eigen afleveringen" on public.watched_episodes;
create policy "eigen afleveringen" on public.watched_episodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
