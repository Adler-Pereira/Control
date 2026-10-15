-- =====================================================================
-- Control Critic - esquema do banco (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma única vez).
-- Depois rode supabase/seed.sql para carregar categorias e jogos.
-- =====================================================================

-- ---------- Perfis ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null check (char_length(username) between 3 and 30),
  avatar_url  text,
  bio         text check (char_length(bio) <= 300),
  role        text not null default 'user' check (role in ('user','moderator','admin')),
  xp          integer not null default 0,
  banned      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- Funções de permissão ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','moderator'));
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and not banned);
$$;

-- ---------- Catálogo ----------
create table if not exists public.categories (
  id    serial primary key,
  name  text not null unique,
  slug  text not null unique
);

create table if not exists public.games (
  id             serial primary key,
  slug           text not null unique,
  title          text not null,
  description    text,
  cover_url      text,
  release_year   integer,
  category_id    integer references public.categories(id) on delete set null,
  featured       boolean not null default false,
  store_ps       text,
  store_xbox     text,
  store_steam    text,
  store_nintendo text,
  avg_rating     numeric(3,2) not null default 0,
  reviews_count  integer not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.reviews (
  id          bigserial primary key,
  game_id     integer not null references public.games(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  body        text check (char_length(body) <= 2000),
  status      text not null default 'published' check (status in ('published','hidden')),
  created_at  timestamptz not null default now(),
  unique (game_id, user_id)
);

create table if not exists public.news (
  id            bigserial primary key,
  title         text not null,
  body          text not null,
  cover_url     text,
  game_id       integer references public.games(id) on delete set null,
  published     boolean not null default false,
  author_id     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------- Comunidades ----------
create table if not exists public.communities (
  id             bigserial primary key,
  name           text not null check (char_length(name) between 3 and 60),
  description    text check (char_length(description) <= 500),
  game_id        integer references public.games(id) on delete set null,
  owner_id       uuid references public.profiles(id) on delete set null,
  discord_invite text check (discord_invite is null or discord_invite ~ '^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]+$'),
  discord_guild_id text check (discord_guild_id is null or discord_guild_id ~ '^[0-9]{15,22}$'),
  members_count  integer not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id  bigint not null references public.communities(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.posts (
  id            bigserial primary key,
  community_id  bigint not null references public.communities(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  status        text not null default 'published' check (status in ('published','hidden')),
  created_at    timestamptz not null default now()
);

-- ---------- Contato ----------
create table if not exists public.contact_messages (
  id          bigserial primary key,
  name        text not null,
  email       text not null,
  age         integer check (age between 13 and 120),
  message     text not null check (char_length(message) <= 3000),
  status      text not null default 'novo' check (status in ('novo','lido','respondido')),
  created_at  timestamptz not null default now()
);

create index if not exists reviews_game_idx on public.reviews(game_id);
create index if not exists posts_comm_idx on public.posts(community_id, created_at desc);
create index if not exists games_cat_idx on public.games(category_id);

-- =====================================================================
-- AUTOMAÇÕES (triggers)
-- =====================================================================

-- 1) Cria o perfil automaticamente quando alguém se cadastra
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base) < 3 then base := 'jogador'; end if;
  base := left(base, 24);
  candidate := base;
  while exists (select 1 from profiles where username = candidate) loop
    n := n + 1; candidate := base || n;
  end loop;
  insert into profiles (id, username) values (new.id, candidate);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Usuário comum não pode mudar o próprio papel, XP ou banimento
-- (sem security definer: auth.uid() só é nulo no SQL Editor / service_role, que podem tudo)
create or replace function public.protect_profile_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    new.role := old.role; new.xp := old.xp; new.banned := old.banned;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 3) XP: +10 por avaliação, +5 por post, +20 por criar comunidade
create or replace function public.add_xp(uid uuid, amount int) returns void
language sql security definer set search_path = public as $$
  update profiles set xp = greatest(0, xp + amount) where id = uid;
$$;
revoke execute on function public.add_xp(uuid,int) from public, anon, authenticated;

-- 4) Recalcula média e total de avaliações do jogo
create or replace function public.refresh_game_rating(gid int) returns void
language sql security definer set search_path = public as $$
  update games g set
    avg_rating    = coalesce((select round(avg(rating)::numeric, 2) from reviews where game_id = gid and status = 'published'), 0),
    reviews_count = (select count(*) from reviews where game_id = gid and status = 'published')
  where g.id = gid;
$$;

create or replace function public.reviews_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform add_xp(new.user_id, 10);
    perform refresh_game_rating(new.game_id);
  elsif tg_op = 'UPDATE' then
    perform refresh_game_rating(new.game_id);
  elsif tg_op = 'DELETE' then
    perform add_xp(old.user_id, -10);
    perform refresh_game_rating(old.game_id);
  end if;
  return null;
end $$;

drop trigger if exists reviews_changed on public.reviews;
create trigger reviews_changed after insert or update or delete on public.reviews
  for each row execute function public.reviews_after_change();

-- 5) Posts dão XP
create or replace function public.posts_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform add_xp(new.user_id, 5); return null; end $$;

drop trigger if exists posts_inserted on public.posts;
create trigger posts_inserted after insert on public.posts
  for each row execute function public.posts_after_insert();

-- 6) Contador de membros
create or replace function public.members_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid bigint := coalesce(new.community_id, old.community_id);
begin
  update communities set members_count = (select count(*) from community_members where community_id = cid) where id = cid;
  return null;
end $$;

drop trigger if exists members_changed on public.community_members;
create trigger members_changed after insert or delete on public.community_members
  for each row execute function public.members_after_change();

-- 7) Quem cria a comunidade vira dono e membro automaticamente
create or replace function public.communities_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.owner_id := auth.uid(); new.members_count := 0; return new; end $$;

create or replace function public.communities_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null then
    insert into community_members (community_id, user_id) values (new.id, new.owner_id) on conflict do nothing;
    perform add_xp(new.owner_id, 20);
  end if;
  return null;
end $$;

drop trigger if exists communities_bi on public.communities;
create trigger communities_bi before insert on public.communities
  for each row execute function public.communities_before_insert();
drop trigger if exists communities_ai on public.communities;
create trigger communities_ai after insert on public.communities
  for each row execute function public.communities_after_insert();

-- 7b) Dono não altera contador nem transfere a comunidade (só a equipe)
create or replace function public.communities_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_staff() then
    new.owner_id := old.owner_id; new.members_count := old.members_count;
  end if;
  return new;
end $$;
drop trigger if exists communities_bu on public.communities;
create trigger communities_bu before update on public.communities
  for each row execute function public.communities_before_update();

-- 8) Autor da notícia preenchido automaticamente
create or replace function public.news_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin new.author_id := auth.uid(); return new; end $$;
drop trigger if exists news_bi on public.news;
create trigger news_bi before insert on public.news
  for each row execute function public.news_before_insert();

-- 9) Estatísticas para o painel de admin
create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'acesso negado'; end if;
  return json_build_object(
    'users',        (select count(*) from profiles),
    'users_7d',     (select count(*) from profiles where created_at > now() - interval '7 days'),
    'games',        (select count(*) from games),
    'reviews',      (select count(*) from reviews),
    'reviews_7d',   (select count(*) from reviews where created_at > now() - interval '7 days'),
    'communities',  (select count(*) from communities),
    'posts',        (select count(*) from posts),
    'messages_new', (select count(*) from contact_messages where status = 'novo'),
    'top_games',    (select coalesce(json_agg(t), '[]'::json) from (
                       select title, avg_rating, reviews_count from games
                       where reviews_count > 0 order by avg_rating desc, reviews_count desc limit 5) t)
  );
end $$;

-- =====================================================================
-- SEGURANÇA (Row Level Security)
-- =====================================================================
alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.games             enable row level security;
alter table public.reviews           enable row level security;
alter table public.news              enable row level security;
alter table public.communities       enable row level security;
alter table public.community_members enable row level security;
alter table public.posts             enable row level security;
alter table public.contact_messages  enable row level security;

-- Perfis: todos leem; cada um edita o seu; admin edita todos
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());

-- Categorias e jogos: leitura pública, escrita só admin
drop policy if exists categories_read on public.categories;
create policy categories_read on public.categories for select using (true);
drop policy if exists categories_admin on public.categories;
create policy categories_admin on public.categories for all using (is_admin()) with check (is_admin());

drop policy if exists games_read on public.games;
create policy games_read on public.games for select using (true);
drop policy if exists games_admin on public.games;
create policy games_admin on public.games for all using (is_admin()) with check (is_admin());

-- Avaliações
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select
  using (status = 'published' or user_id = auth.uid() or is_staff());
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert
  with check (user_id = auth.uid() and is_active_user() and status = 'published');
drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update
  using (user_id = auth.uid() and status = 'published') with check (user_id = auth.uid() and status = 'published');
drop policy if exists reviews_staff on public.reviews;
create policy reviews_staff on public.reviews for update using (is_staff()) with check (is_staff());
drop policy if exists reviews_delete on public.reviews;
create policy reviews_delete on public.reviews for delete using (user_id = auth.uid() or is_staff());

-- Notícias
drop policy if exists news_read on public.news;
create policy news_read on public.news for select using (published or is_staff());
drop policy if exists news_staff on public.news;
create policy news_staff on public.news for all using (is_staff()) with check (is_staff());

-- Comunidades
drop policy if exists communities_read on public.communities;
create policy communities_read on public.communities for select using (true);
drop policy if exists communities_insert on public.communities;
create policy communities_insert on public.communities for insert with check (auth.uid() is not null and is_active_user());
drop policy if exists communities_update on public.communities;
create policy communities_update on public.communities for update
  using (owner_id = auth.uid() or is_staff()) with check (owner_id = auth.uid() or is_staff());
drop policy if exists communities_delete on public.communities;
create policy communities_delete on public.communities for delete using (owner_id = auth.uid() or is_staff());

drop policy if exists members_read on public.community_members;
create policy members_read on public.community_members for select using (true);
drop policy if exists members_join on public.community_members;
create policy members_join on public.community_members for insert with check (user_id = auth.uid() and is_active_user());
drop policy if exists members_leave on public.community_members;
create policy members_leave on public.community_members for delete using (user_id = auth.uid() or is_staff());

-- Posts: só membros publicam
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select using (status = 'published' or user_id = auth.uid() or is_staff());
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert with check (
  user_id = auth.uid() and is_active_user() and status = 'published'
  and exists (select 1 from community_members m where m.community_id = posts.community_id and m.user_id = auth.uid()));
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete using (user_id = auth.uid() or is_staff());
drop policy if exists posts_staff on public.posts;
create policy posts_staff on public.posts for update using (is_staff()) with check (is_staff());

-- Contato: qualquer um envia, só a equipe lê
drop policy if exists contact_insert on public.contact_messages;
create policy contact_insert on public.contact_messages for insert with check (status = 'novo');
drop policy if exists contact_staff on public.contact_messages;
create policy contact_staff on public.contact_messages for all using (is_staff()) with check (is_staff());

-- =====================================================================
-- STORAGE: bucket público para capas e avatares
-- =====================================================================
insert into storage.buckets (id, name, public) values ('media', 'media', true)
  on conflict (id) do nothing;

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select using (bucket_id = 'media');
drop policy if exists media_admin on storage.objects;
create policy media_admin on storage.objects for all
  using (bucket_id = 'media' and is_admin()) with check (bucket_id = 'media' and is_admin());
drop policy if exists media_avatar on storage.objects;
create policy media_avatar on storage.objects for insert
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars'
              and (storage.foldername(name))[2] = auth.uid()::text);
drop policy if exists media_avatar_update on storage.objects;
create policy media_avatar_update on storage.objects for update
  using (bucket_id = 'media' and (storage.foldername(name))[1] = 'avatars'
         and (storage.foldername(name))[2] = auth.uid()::text);

-- =====================================================================
-- NOTÍCIAS AUTOMÁTICAS, PROMOÇÕES E RECOMENDAÇÕES
-- =====================================================================
alter table public.games    add column if not exists steam_appid integer;
alter table public.news     add column if not exists source text;          -- ex.: 'PlayStation Blog' (null = escrita pela equipe)
alter table public.news     add column if not exists source_url text unique;
alter table public.news     add column if not exists summary text;
alter table public.profiles add column if not exists fav_categories integer[] not null default '{}';

create table if not exists public.deals (
  id             bigserial primary key,
  game_id        integer not null references public.games(id) on delete cascade,
  store          text not null check (store in ('steam','playstation','xbox','nintendo','outra')),
  price_cents    integer,
  original_cents integer,
  discount_pct   integer not null default 0 check (discount_pct between 0 and 100),
  url            text,
  ends_at        timestamptz,
  auto           boolean not null default false,   -- true = atualizada pelo robô
  updated_at     timestamptz not null default now(),
  unique (game_id, store)
);
alter table public.deals enable row level security;
drop policy if exists deals_read on public.deals;
create policy deals_read on public.deals for select using (true);
drop policy if exists deals_admin on public.deals;
create policy deals_admin on public.deals for all using (is_staff()) with check (is_staff());

-- Configurações do robô (editáveis no painel de admin)
create table if not exists public.settings (
  key   text primary key,
  value jsonb not null
);
alter table public.settings enable row level security;
drop policy if exists settings_staff on public.settings;
create policy settings_staff on public.settings for all using (is_admin()) with check (is_admin());
insert into public.settings (key, value) values
  ('auto_publish_news', 'true'::jsonb),
  ('feeds', '[
     {"name":"PlayStation Blog","url":"https://blog.br.playstation.com/feed/"},
     {"name":"Xbox Wire","url":"https://news.xbox.com/pt-br/feed/"}
   ]'::jsonb),
  ('last_sync', 'null'::jsonb)
on conflict (key) do nothing;

-- Recomendações: jogos das categorias favoritas e das que o usuário avaliou bem,
-- excluindo os que ele já avaliou. Sem dados, cai nos mais bem avaliados.
create or replace function public.recommend_games(lim int default 8)
returns setof public.games
language sql stable security definer set search_path = public as $$
  with gostos as (
    select unnest(fav_categories) as cat, 3 as peso from profiles where id = auth.uid()
    union all
    select g.category_id, r.rating - 2 from reviews r join games g on g.id = r.game_id
     where r.user_id = auth.uid() and r.rating >= 4 and g.category_id is not null
  ), pontos as (
    select cat, sum(peso) as score from gostos group by cat
  )
  select g.* from games g
  left join pontos p on p.cat = g.category_id
  where not exists (select 1 from reviews r where r.game_id = g.id and r.user_id = auth.uid())
  order by coalesce(p.score, 0) desc, g.avg_rating desc, g.reviews_count desc, g.id
  limit lim;
$$;

-- Posts aparecem em tempo real nas comunidades
do $$ begin
  alter publication supabase_realtime add table public.posts;
exception when duplicate_object then null; end $$;

-- =====================================================================
-- PERFIL: banner e contas de jogo (rode de novo este arquivo para aplicar)
-- =====================================================================
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists psn_id text check (psn_id is null or char_length(psn_id) <= 30);
alter table public.profiles add column if not exists xbox_gamertag text check (xbox_gamertag is null or char_length(xbox_gamertag) <= 30);
alter table public.profiles add column if not exists discord_user text check (discord_user is null or char_length(discord_user) <= 40);
alter table public.profiles add column if not exists steam_profile text check (steam_profile is null or steam_profile ~ '^https://steamcommunity\.com/(id|profiles)/[A-Za-z0-9_-]+/?$');

-- =====================================================================
-- CATÁLOGO COMPLETO (IGDB) — importação em massa e busca sob demanda
-- =====================================================================
alter table public.games add column if not exists igdb_id bigint unique;
alter table public.games add column if not exists platforms text[] not null default '{}';
alter table public.games add column if not exists igdb_rating numeric(5,2);
alter table public.games add column if not exists igdb_rating_count integer not null default 0;
alter table public.games add column if not exists steam_checked_at timestamptz;   -- última consulta de preço na Steam
alter table public.games add column if not exists added_by uuid references public.profiles(id) on delete set null;

create index if not exists games_popular_idx on public.games(igdb_rating_count desc);
create index if not exists games_steam_check_idx on public.games(steam_checked_at nulls first) where steam_appid is not null;
create index if not exists games_title_idx on public.games(lower(title));
-- A busca sob demanda (Netlify, com a chave secreta) dá XP a quem adiciona um jogo
grant execute on function public.add_xp(uuid,int) to service_role;
