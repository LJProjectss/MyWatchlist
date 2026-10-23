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
  -- Bij series met seizoenscijfers is dit het gemiddelde, daarom met één decimaal
  rating          numeric(3, 1) check (rating between 1 and 10),
  -- Cijfer per seizoen, bijv. {"1": 8, "2": 9}
  season_ratings  jsonb,
  notes           text,
  -- Eigen labels, bijv. {"met vrienden", "favoriet"}
  tags            text[] not null default '{}',
  -- Prioriteit voor de Wil ik zien-lijst: 1 = hoog, 2 = normaal, 3 = laag
  priority        smallint check (priority between 1 and 3),
  -- Welke kijkbeurt nu loopt; bij herkijken gaat dit omhoog en blijft oude voortgang bewaard
  current_watch   integer not null default 1,
  -- Volgende uitzending en status van de serie, periodiek ververst uit TMDB/Jikan
  next_air        jsonb,
  show_status     text,
  info_refreshed_at timestamptz,
  -- Speelduur in minuten: van de film, of van één aflevering
  runtime         integer,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, source, media_type, external_id)
);

-- Voor databases die met een eerdere versie van dit bestand zijn gemaakt
alter table public.watchlist_items add column if not exists seasons jsonb;
alter table public.watchlist_items add column if not exists season_ratings jsonb;
alter table public.watchlist_items alter column rating type numeric(3, 1);
alter table public.watchlist_items add column if not exists tags text[] not null default '{}';
alter table public.watchlist_items add column if not exists priority smallint check (priority between 1 and 3);
alter table public.watchlist_items add column if not exists current_watch integer not null default 1;
alter table public.watchlist_items add column if not exists next_air jsonb;
alter table public.watchlist_items add column if not exists show_status text;
alter table public.watchlist_items add column if not exists info_refreshed_at timestamptz;
alter table public.watchlist_items add column if not exists runtime integer;
-- Notitie per seizoen, bijv. {"1": "Sterk begin"}
alter table public.watchlist_items add column if not exists season_notes jsonb;
-- Waarom je gestopt of gepauzeerd bent, en wanneer de app je eraan herinnert
alter table public.watchlist_items add column if not exists pause_reason text;
alter table public.watchlist_items add column if not exists paused_at timestamptz;
alter table public.watchlist_items add column if not exists remind_at date;
alter table public.watchlist_items add column if not exists reminder_pushed_at timestamptz;

create table if not exists public.watched_episodes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id         uuid not null references public.watchlist_items (id) on delete cascade,
  -- Bij welke kijkbeurt (zie watchlist_items.current_watch) deze aflevering hoort
  watch_number    integer not null default 1,
  season_number   integer not null default 1,
  episode_number  integer not null,
  watched_at      timestamptz not null default now()
);

alter table public.watched_episodes add column if not exists watch_number integer not null default 1;
alter table public.watched_episodes drop constraint if exists watched_episodes_item_id_season_number_episode_number_key;
create unique index if not exists watched_episodes_unique_idx
  on public.watched_episodes (item_id, watch_number, season_number, episode_number);

-- Eén rij per keer dat je een film of serie helemaal hebt gezien
create table if not exists public.watch_history (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id         uuid not null references public.watchlist_items (id) on delete cascade,
  watched_on      date not null default current_date,
  created_at      timestamptz not null default now()
);

create index if not exists watchlist_items_user_idx on public.watchlist_items (user_id, updated_at desc);
create index if not exists watched_episodes_item_idx on public.watched_episodes (item_id);
create index if not exists watch_history_item_idx on public.watch_history (item_id);

-- updated_at automatisch bijwerken, behalve als alleen automatisch ververste gegevens veranderen
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
declare
  auto_fields text[] := array['seasons', 'total_episodes', 'next_air', 'show_status', 'info_refreshed_at', 'runtime', 'reminder_pushed_at', 'updated_at'];
begin
  if (to_jsonb(new) - auto_fields) = (to_jsonb(old) - auto_fields) then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
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
alter table public.watch_history enable row level security;

drop policy if exists "eigen items" on public.watchlist_items;
create policy "eigen items" on public.watchlist_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "eigen afleveringen" on public.watched_episodes;
create policy "eigen afleveringen" on public.watched_episodes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "eigen kijkgeschiedenis" on public.watch_history;
create policy "eigen kijkgeschiedenis" on public.watch_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cijfer en notitie per aflevering
create table if not exists public.episode_reviews (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id         uuid not null references public.watchlist_items (id) on delete cascade,
  season_number   integer not null default 1,
  episode_number  integer not null,
  rating          smallint check (rating between 1 and 10),
  note            text,
  updated_at      timestamptz not null default now(),
  unique (item_id, season_number, episode_number)
);
alter table public.episode_reviews enable row level security;
drop policy if exists "eigen recensies" on public.episode_reviews;
create policy "eigen recensies" on public.episode_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Apparaten die pushmeldingen willen ontvangen
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  created_at      timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "eigen meldingen" on public.push_subscriptions;
create policy "eigen meldingen" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Alleen voor de server (niet bereikbaar via de app): sleutels voor pushmeldingen
-- en welke afleveringen al gemeld zijn
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.push_keys (
  id              integer primary key default 1 check (id = 1),
  public_key      text not null,
  private_key     text not null
);
create table if not exists private.push_sent (
  item_id         uuid not null references public.watchlist_items (id) on delete cascade,
  season_number   integer not null,
  episode_number  integer not null,
  sent_at         timestamptz not null default now(),
  primary key (item_id, season_number, episode_number)
);

-- Openbare links om je lijst of top 10 te delen
create table if not exists public.shares (
  token           text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('list', 'top10')),
  name            text,
  created_at      timestamptz not null default now(),
  unique (user_id, kind)
);
alter table public.shares enable row level security;
drop policy if exists "eigen deellinks" on public.shares;
create policy "eigen deellinks" on public.shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Wat iemand zonder account via een deellink ziet: geen notities of labels
create or replace function public.shared_list(share_token text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'kind', s.kind,
    'name', s.name,
    'items', coalesce((
      select json_agg(row_to_json(t)) from (
        select i.title, i.original_title, i.media_type, i.poster_url, i.year, i.status, i.rating
        from public.watchlist_items i
        where i.user_id = s.user_id and (s.kind = 'list' or i.rating is not null)
        order by i.rating desc nulls last, i.updated_at desc
        limit case when s.kind = 'top10' then 10 end
      ) t
    ), '[]'::json)
  )
  from public.shares s
  where s.token = share_token
$$;
revoke all on function public.shared_list(text) from public;
grant execute on function public.shared_list(text) to anon, authenticated;

-- Versie van dit schema; de app meldt het als de database achterloopt
create table if not exists public.app_meta (
  key   text primary key,
  value text not null
);
alter table public.app_meta enable row level security;
drop policy if exists "iedereen mag lezen" on public.app_meta;
create policy "iedereen mag lezen" on public.app_meta for select using (true);
insert into public.app_meta (key, value) values ('schema_version', '6')
  on conflict (key) do update set value = excluded.value;

-- Supabase de nieuwe kolommen direct laten zien (anders soms "schema cache"-fouten)
notify pgrst, 'reload schema';
