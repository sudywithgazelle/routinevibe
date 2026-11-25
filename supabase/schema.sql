-- Study With Gazelle v2 — execute once in a NEW Supabase project's SQL Editor.
-- Sensitive writes (study time, premium, admin, host sessions) are RPC-only.
-- All timestamps / public leaderboards use UTC.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default 'Study friend',
  plan text not null default 'free' check (plan in ('free','premium')),
  is_admin boolean not null default false,
  avatar integer not null default 1 check (avatar between 1 and 8),
  selected_badges text[] not null default '{}',
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_username_lower on public.profiles(lower(username));

create table if not exists public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb
);
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 140),
  subtitle text not null default '' check(char_length(subtitle)<=160),
  note text not null default '' check(char_length(note)<=2000),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists todos_user_idx on public.todos(user_id,created_at desc);
create table if not exists public.shelf_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  url text not null check (left(url,8)='https://'),
  created_at timestamptz not null default now()
);
create table if not exists public.app_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);
create table if not exists public.app_settings (
  id boolean primary key default true check(id),
  break_active boolean not null default false,
  room_open boolean not null default false,
  room_id uuid,
  room_opened_at timestamptz
);
insert into public.app_settings(id) values (true) on conflict do nothing;
create table if not exists public.game_catalog (
  game text primary key check(game in ('crossword','sudoku','memory','jigsaw')),
  xp_required numeric(12,3) not null default 0 check(xp_required >= 0),
  premium_only boolean not null default false
);
-- Provisional XP requirements; change them in SQL/admin settings when approved.
insert into public.game_catalog(game,xp_required) values
 ('crossword',0),('sudoku',10),('memory',5),('jigsaw',15)
on conflict(game) do nothing;

create table if not exists public.study_runs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 mode text not null check(mode in ('solo','together')),
 room_id uuid,
 target_seconds integer not null check(target_seconds between 60 and 10800),
 started_at timestamptz not null default now(),
 last_heartbeat timestamptz not null default now(),
 is_active boolean not null default true,
 ended_at timestamptz,
 completed boolean not null default false,
 total_seconds numeric(14,3) not null default 0
);
create unique index if not exists one_open_run_per_user on public.study_runs(user_id) where ended_at is null;
create index if not exists study_runs_user_start on public.study_runs(user_id,started_at desc);
create table if not exists public.study_blocks (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 run_id uuid not null references public.study_runs(id) on delete cascade,
 mode text not null check(mode in ('solo','together')),
 seconds numeric(9,3) not null check(seconds > 0 and seconds <= 45.5),
 xp numeric(14,6) not null check(xp >= 0),
 created_at timestamptz not null default now()
);
create index if not exists study_blocks_user_date on public.study_blocks(user_id,created_at desc);
create index if not exists study_blocks_date on public.study_blocks(created_at desc);

create table if not exists public.game_presence (
 user_id uuid primary key references auth.users(id) on delete cascade,
 game text not null references public.game_catalog(game),
 last_seen timestamptz not null default now()
);
create table if not exists public.game_rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
 game text not null references public.game_catalog(game),
 seed integer not null,
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.game_room_scores (
 room_id uuid not null references public.game_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 duration_seconds integer not null check(duration_seconds between 1 and 86400),
 submitted_at timestamptz not null default now(),
 primary key(room_id,user_id)
);

-- Account creation is atomic: no client may supply plan or is_admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare uname text;
begin
 uname := lower(trim(coalesce(new.raw_user_meta_data->>'username','')));
 if uname !~ '^[a-z0-9_]{3,24}$' then raise exception 'Username must have 3–24 letters, numbers, or underscores'; end if;
 insert into public.profiles(user_id,username,display_name)
 values(new.id,uname,left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),uname),50));
 insert into public.preferences(user_id) values(new.id);
 return new;
end $$;
drop trigger if exists gazelle_after_auth_user on auth.users;
create trigger gazelle_after_auth_user after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.preferences enable row level security;
alter table public.todos enable row level security;
alter table public.shelf_links enable row level security;
alter table public.app_presence enable row level security;
alter table public.app_settings enable row level security;
alter table public.game_catalog enable row level security;
alter table public.study_runs enable row level security;
alter table public.study_blocks enable row level security;
alter table public.game_presence enable row level security;
alter table public.game_rooms enable row level security;
alter table public.game_room_scores enable row level security;

drop policy if exists profiles_read_own on public.profiles;
drop policy if exists preferences_read_own on public.preferences;
drop policy if exists todos_own on public.todos;
drop policy if exists shelf_own on public.shelf_links;
drop policy if exists study_runs_read_own on public.study_runs;
drop policy if exists study_blocks_read_own on public.study_blocks;
create policy profiles_read_own on public.profiles for select to authenticated using(user_id=auth.uid());
create policy preferences_read_own on public.preferences for select to authenticated using(user_id=auth.uid());
-- Preference writes go through save_my_preferences() so Premium themes are checked server-side.
create policy todos_own on public.todos for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy shelf_own on public.shelf_links for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy study_runs_read_own on public.study_runs for select to authenticated using(user_id=auth.uid());
create policy study_blocks_read_own on public.study_blocks for select to authenticated using(user_id=auth.uid());
-- No direct client modification of plans, XP, runs, global settings or game rooms.

create or replace function public.gazelle_is_admin() returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.profiles where user_id=auth.uid() and is_admin);
$$;
create or replace function public.gazelle_total_xp(p_user uuid) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(xp),0) from public.study_blocks where user_id=p_user;
$$;
create or replace function public.gazelle_can_play(p_game text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare g public.game_catalog%rowtype; p public.profiles%rowtype; b boolean;
begin
 if auth.uid() is null then return false; end if;
 select * into g from public.game_catalog where game=p_game;
 select * into p from public.profiles where user_id=auth.uid();
 select break_active into b from public.app_settings where id=true;
 if g.game is null or p.user_id is null or b is null then return false; end if;
 return (not g.premium_only or p.plan='premium' or p.is_admin)
    and (b or public.gazelle_total_xp(auth.uid()) >= g.xp_required);
end $$;

create or replace function public.get_app_snapshot() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare outp jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select jsonb_build_object(
  'registered', (select count(*) from public.profiles),
  'online', (select count(*) from public.app_presence where last_seen >= now()-interval '85 seconds'),
  'solo', (select count(*) from public.study_runs where ended_at is null and is_active and mode='solo' and last_heartbeat >= now()-interval '55 seconds'),
  'together',(select count(*) from public.study_runs r where r.ended_at is null and r.is_active and r.mode='together' and r.last_heartbeat >= now()-interval '55 seconds'
    and exists(select 1 from public.app_settings a where a.id=true and a.room_open and a.room_id=r.room_id)
    and exists(select 1 from public.profiles p where p.user_id=r.user_id and (p.plan='premium' or p.is_admin))),
  'break_active',s.break_active,'room_open',s.room_open,
  'catalog',(select coalesce(jsonb_agg(jsonb_build_object('game',g.game,'xp_required',g.xp_required,'premium_only',g.premium_only,'players',(select count(*) from public.game_presence gp where gp.game=g.game and gp.last_seen>=now()-interval '85 seconds'))),'[]'::jsonb) from public.game_catalog g)
 ) into outp from public.app_settings s where id=true;
 if not found then raise exception 'App settings are not initialized'; end if;
 return outp;
end $$;

create or replace function public.presence_ping() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.app_presence(user_id,last_seen) values(auth.uid(),now())
 on conflict(user_id) do update set last_seen=excluded.last_seen;
end $$;

create or replace function public.start_study(p_mode text,p_target_seconds integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles%rowtype;s public.app_settings%rowtype;r public.study_runs%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_mode is null or p_mode not in ('solo','together') or p_target_seconds is null or p_target_seconds not between 60 and 10800 then raise exception 'Invalid timer settings'; end if;
 select * into p from public.profiles where user_id=auth.uid();
 if p.user_id is null then raise exception 'Profile not found'; end if;
 select * into s from public.app_settings where id=true;
 if s.id is null then raise exception 'App settings are not initialized'; end if;
 if p_mode='together' and not (p.plan='premium' or p.is_admin) then raise exception 'Premium access required'; end if;
 if p_mode='together' and not s.room_open then raise exception 'Host room is closed'; end if;
 select * into r from public.study_runs where user_id=auth.uid() and ended_at is null for update;
 if found then
  if r.mode<>p_mode or (r.mode='together' and r.room_id is distinct from s.room_id) then
    raise exception 'Finish or reset your existing study session first';
  end if;
  return jsonb_build_object('id',r.id,'active',r.is_active,'seconds',r.total_seconds,'target_seconds',r.target_seconds);
 end if;
 insert into public.study_runs(user_id,mode,room_id,target_seconds)
 values(auth.uid(),p_mode,case when p_mode='together' then s.room_id else null end,p_target_seconds)
 returning * into r;
 return jsonb_build_object('id',r.id,'active',true,'seconds',0,'target_seconds',r.target_seconds);
end $$;

-- RPC-only accounting. Each pulse accrues at most 45 seconds of SERVER time.
-- Browser pauses stop accrual; missed heartbeats do not yield unbounded passive XP.
create or replace function public.tick_study(p_action text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.study_runs%rowtype;s public.app_settings%rowtype; d numeric(9,3):=0; x numeric(14,6):=0; finished boolean:=false; room_valid boolean:=true;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_action is null or p_action not in ('pulse','pause','resume','stop','complete') then raise exception 'Invalid action'; end if;
 select * into r from public.study_runs where user_id=auth.uid() and ended_at is null for update;
 if not found then return jsonb_build_object('status','missing','seconds',0); end if;
 if r.mode='together' then
  select * into s from public.app_settings where id=true;
  room_valid := coalesce(s.room_open,false) and r.room_id=s.room_id
    and exists(select 1 from public.profiles p where p.user_id=auth.uid() and (p.plan='premium' or p.is_admin));
 end if;
 if not room_valid then
  update public.study_runs set ended_at=now(),is_active=false where id=r.id;
  return jsonb_build_object('status','room_closed','seconds',r.total_seconds);
 end if;
 -- A stray pulse must never reactivate a paused run; only the explicit resume action can do that.
 if not r.is_active and p_action='pulse' then
  return jsonb_build_object('status','paused','seconds',r.total_seconds,'added_seconds',0,'added_xp',0);
 end if;
 if r.is_active and p_action <> 'resume' then
  d := round(least(greatest(extract(epoch from (now()-r.last_heartbeat)),0),45)::numeric,3);
  if d>0 then
   x := round(d / case when r.mode='together' then 180::numeric else 360::numeric end,6);
   insert into public.study_blocks(user_id,run_id,mode,seconds,xp) values(auth.uid(),r.id,r.mode,d,x);
  end if;
 end if;
 r.total_seconds := r.total_seconds+d;
 if p_action='complete' then finished:=r.total_seconds>=r.target_seconds-2; end if;
 update public.study_runs set total_seconds=r.total_seconds,last_heartbeat=now(),
   is_active=case when p_action in ('stop','complete','pause') then false else true end,
   ended_at=case when p_action in ('stop','complete') then now() else null end,
   completed=finished where id=r.id;
 return jsonb_build_object('status',case when p_action='complete' and not finished then 'incomplete' else p_action end,
    'seconds',r.total_seconds,'added_seconds',d,'added_xp',x,'completed',finished);
end $$;

create or replace function public.get_focus_leaderboard(p_period text default 'week')
returns table(username text,avatar integer,level integer,period_xp numeric,selected_badges text[])
language plpgsql security definer set search_path=public,pg_temp as $$
declare cutoff timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_period='day' then cutoff:=date_trunc('day',now() at time zone 'utc') at time zone 'utc';
 elsif p_period='week' then cutoff:=date_trunc('week',now() at time zone 'utc') at time zone 'utc';
 elsif p_period='month' then cutoff:=date_trunc('month',now() at time zone 'utc') at time zone 'utc';
 else raise exception 'Invalid period';end if;
 return query select p.username,p.avatar,
   (1+floor(coalesce(t.lifetime,0)/50))::integer,
   coalesce(q.period_xp,0)::numeric,p.selected_badges
 from public.profiles p
 join (select b.user_id,sum(b.xp) as period_xp from public.study_blocks b where b.created_at>=cutoff group by b.user_id) q on q.user_id=p.user_id
 left join (select b.user_id,sum(b.xp) as lifetime from public.study_blocks b group by b.user_id) t on t.user_id=p.user_id
 order by q.period_xp desc,p.username limit 30;
end $$;

create or replace function public.change_my_avatar(p_avatar integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare ispaid boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_avatar not between 1 and 8 then raise exception 'Invalid avatar'; end if;
 if p_avatar in (4,8) then
  select coalesce((plan='premium' or is_admin),false) into ispaid from public.profiles where user_id=auth.uid();
  if not coalesce(ispaid,false) then raise exception 'Premium required for graduation avatar';end if;
  if public.gazelle_total_xp(auth.uid())<300 then raise exception 'Earn 300 study XP to unlock graduation';end if;
 end if;
 if p_avatar not in (4,8) and public.gazelle_total_xp(auth.uid()) <
  case when p_avatar in (1,5) then 0 when p_avatar in (2,6) then 20 else 100 end
 then raise exception 'Study more to unlock this avatar'; end if;
 update public.profiles set avatar=p_avatar where user_id=auth.uid();
end $$;

create or replace function public.set_my_badges(p_badges text[]) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare badge text; secs numeric; distinct_days date[]; today_utc date := (now() at time zone 'utc')::date; streak integer:=0; best_streak integer:=0; rolling integer:=0; cursor_date date; prev_date date; xday date;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 p_badges:=coalesce(p_badges,'{}'::text[]);
 if coalesce(array_length(p_badges,1),0)>3 then raise exception 'Choose up to 3 public badges'; end if;
 select coalesce(sum(seconds),0) into secs from public.study_blocks where user_id=auth.uid();
 select array_agg(d order by d desc) into distinct_days from (select distinct (created_at at time zone 'utc')::date d from public.study_blocks where user_id=auth.uid()) s;
 cursor_date:=today_utc;
 if distinct_days is null then distinct_days:='{}';end if;
 if not cursor_date=any(distinct_days) then cursor_date:=cursor_date-1; end if;
 foreach xday in array distinct_days loop
  if prev_date is not null and xday=prev_date-1 then rolling:=rolling+1;else rolling:=1;end if;
  best_streak:=greatest(best_streak,rolling);prev_date:=xday;
 end loop;
 while cursor_date=any(distinct_days) loop
   streak:=streak+1;cursor_date:=cursor_date-1;
 end loop;
 foreach badge in array p_badges loop
   if badge not in ('streak3','streak7','streak30','hours100','hours500') then raise exception 'Unknown badge'; end if;
   if badge='streak3' and best_streak<3 or badge='streak7' and best_streak<7 or badge='streak30' and best_streak<30 or
    badge='hours100' and secs<360000 or badge='hours500' and secs<1800000 then
     raise exception 'This badge is not earned';
   end if;
 end loop;
 update public.profiles set selected_badges=p_badges where user_id=auth.uid();
end $$;

create or replace function public.admin_control(p_action text,p_username text default null,p_value text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;
begin
 if not public.gazelle_is_admin() then raise exception 'Admin only'; end if;
 if p_action='room_open' then update public.app_settings set room_open=true,room_id=gen_random_uuid(),room_opened_at=now() where id=true;
 elsif p_action='room_close' then update public.app_settings set room_open=false where id=true;
 elsif p_action='break_on' then update public.app_settings set break_active=true where id=true;
 elsif p_action='break_off' then update public.app_settings set break_active=false where id=true;
 elsif p_action in ('set_premium','set_free') then
   select user_id into target from public.profiles where username=lower(trim(p_username));
   if target is null then raise exception 'Username not found'; end if;
   if target=auth.uid() then raise exception 'Do not change your own plan here';end if;
   update public.profiles set plan=case when p_action='set_premium' then 'premium' else 'free' end where user_id=target;
   -- tick_study() ends any now-ineligible Together run on the next heartbeat.
 elsif p_action in ('game_premium','game_free') then
   update public.game_catalog set premium_only=(p_action='game_premium') where game=p_value;
   if not found then raise exception 'Unknown game';end if;
 else raise exception 'Unknown admin action';end if;
end $$;

create or replace function public.game_ping(p_game text) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if not public.gazelle_can_play(p_game) then raise exception 'Game is locked'; end if;
 insert into public.game_presence(user_id,game,last_seen) values(auth.uid(),p_game,now())
 on conflict(user_id) do update set game=excluded.game,last_seen=now();
 select count(*) into n from public.game_presence where game=p_game and last_seen>now()-interval '85 seconds';
 return n;
end $$;
create or replace function public.game_leave() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 delete from public.game_presence where user_id=auth.uid();
end $$;

create or replace function public.create_game_room(p_game text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.game_rooms%rowtype;
begin
 if not public.gazelle_can_play(p_game) then raise exception 'Game is locked';end if;
 insert into public.game_rooms(code,game,seed,created_by)
 values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),p_game,floor(random()*1000000)::int,auth.uid())
 returning * into r;
 return jsonb_build_object('id',r.id,'code',r.code,'seed',r.seed,'game',r.game);
end $$;
create or replace function public.join_game_room(p_code text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.game_rooms%rowtype;
begin
 select * into r from public.game_rooms where code=upper(trim(p_code)) and created_at > now()-interval '1 day';
 if not found then raise exception 'Room not found or expired';end if;
 if not public.gazelle_can_play(r.game) then raise exception 'Game is locked';end if;
 return jsonb_build_object('id',r.id,'code',r.code,'seed',r.seed,'game',r.game);
end $$;
create or replace function public.submit_game_result(p_room uuid,p_seconds integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare g text;
begin
 select game into g from public.game_rooms where id=p_room and created_at>now()-interval '1 day';
 if g is null or not public.gazelle_can_play(g) then raise exception 'Room unavailable';end if;
 if p_seconds not between 1 and 86400 then raise exception 'Invalid time';end if;
 insert into public.game_room_scores(room_id,user_id,duration_seconds) values(p_room,auth.uid(),p_seconds)
 on conflict(room_id,user_id) do update set duration_seconds=least(public.game_room_scores.duration_seconds,excluded.duration_seconds),submitted_at=now();
end $$;
create or replace function public.get_game_room_scores(p_room uuid)
returns table(username text,duration_seconds integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare room_game text;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select game into room_game from public.game_rooms where id=p_room and created_at>now()-interval '1 day';
 if room_game is null or not public.gazelle_can_play(room_game) then raise exception 'Room unavailable';end if;
 return query select p.username,g.duration_seconds from public.game_room_scores g join public.profiles p on g.user_id=p.user_id
 where g.room_id=p_room order by g.duration_seconds limit 15;
end $$;

create or replace function public.admin_list_users()
returns table(username text,plan text,is_admin boolean,level integer)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.gazelle_is_admin() then raise exception 'Admin only';end if;
 return query select p.username,p.plan,p.is_admin,(1+floor(coalesce(x.total_xp,0)/50))::integer
 from public.profiles p
 left join (select b.user_id,sum(b.xp) total_xp from public.study_blocks b group by b.user_id) x on p.user_id=x.user_id
 order by p.created_at desc limit 200;
end $$;

create or replace function public.save_my_preferences(p_settings jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare theme text; shape text; p public.profiles%rowtype; k text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(p_settings) is distinct from 'object' or length(p_settings::text)>4000 then raise exception 'Invalid preferences'; end if;
 for k in select jsonb_object_keys(p_settings) loop
  if k not in ('focus','short','long','rounds','autoBreak','theme','shape') then raise exception 'Unknown preference: %',k; end if;
 end loop;
 theme:=coalesce(p_settings->>'theme','Buttercream');
 if theme not in ('Sunday','Pink Cloud','Buttercream','Lavender Kiss','Sage Garden','Vanilla',
  'Trend','Old Money','Monochrome','Midnight','Pure White','Rosewood','Terracotta','Ice Blue','Burgundy','Navy') then
  raise exception 'Unknown theme';end if;
 select * into p from public.profiles where user_id=auth.uid();
 if p.user_id is null then raise exception 'Profile not found'; end if;
 if theme in ('Burgundy','Navy') and not (p.plan='premium' or p.is_admin) then raise exception 'Premium theme';end if;
 if p_settings ? 'focus' then
  if coalesce(p_settings->>'focus','') !~ '^[0-9]{1,3}$' then raise exception 'Invalid focus'; end if;
  if (p_settings->>'focus')::int not between 1 and 180 then raise exception 'Invalid focus'; end if;
 end if;
 if p_settings ? 'short' then
  if coalesce(p_settings->>'short','') !~ '^[0-9]{1,2}$' then raise exception 'Invalid short break'; end if;
  if (p_settings->>'short')::int not between 1 and 60 then raise exception 'Invalid short break'; end if;
 end if;
 if p_settings ? 'long' then
  if coalesce(p_settings->>'long','') !~ '^[0-9]{1,2}$' then raise exception 'Invalid long break'; end if;
  if (p_settings->>'long')::int not between 1 and 90 then raise exception 'Invalid long break'; end if;
 end if;
 if p_settings ? 'rounds' then
  if coalesce(p_settings->>'rounds','') !~ '^[0-9]{1,2}$' then raise exception 'Invalid long-break interval'; end if;
  if (p_settings->>'rounds')::int not between 2 and 12 then raise exception 'Invalid long-break interval'; end if;
 end if;
 if p_settings ? 'autoBreak' and jsonb_typeof(p_settings->'autoBreak') is distinct from 'boolean' then raise exception 'Invalid auto-break setting'; end if;
 if p_settings ? 'theme' and jsonb_typeof(p_settings->'theme') is distinct from 'string' then raise exception 'Invalid theme'; end if;
 shape:=coalesce(p_settings->>'shape','bubble');
 if p_settings ? 'shape' and jsonb_typeof(p_settings->'shape') is distinct from 'string' then raise exception 'Unknown timer shape'; end if;
 if shape not in ('bubble','soft','halo') then raise exception 'Unknown timer shape'; end if;
 insert into public.preferences(user_id,settings) values(auth.uid(),p_settings)
 on conflict(user_id) do update set settings=excluded.settings;
end $$;

create or replace function public.get_my_insights() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb; sec numeric;xp numeric;days date[];cursor_date date;streak int:=0;
  utc_today date:=(now() at time zone 'utc')::date;
  best_streak int:=0;rolling int:=0;prev_date date;xday date;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select coalesce(sum(seconds),0),coalesce(sum(b.xp),0) into sec,xp
 from public.study_blocks b where b.user_id=auth.uid();
 select array_agg(d order by d desc) into days from
  (select distinct (created_at at time zone 'utc')::date d from public.study_blocks where user_id=auth.uid()) q;
 cursor_date:=utc_today;
 if days is null then days:='{}';end if;
 if not cursor_date=any(days) then cursor_date:=cursor_date-1;end if;
 foreach xday in array days loop
  if prev_date is not null and xday=prev_date-1 then rolling:=rolling+1;else rolling:=1;end if;
  best_streak:=greatest(best_streak,rolling);prev_date:=xday;
 end loop;
 while cursor_date=any(days) loop streak:=streak+1;cursor_date:=cursor_date-1;end loop;
 select jsonb_build_object(
  'total_seconds',sec,'total_xp',xp,'streak',streak,'best_streak',best_streak,
  'today_seconds',coalesce(sum(b.seconds) filter(where b.created_at>=date_trunc('day',now() at time zone 'utc') at time zone 'utc'),0),
  'today_xp',coalesce(sum(b.xp) filter(where b.created_at>=date_trunc('day',now() at time zone 'utc') at time zone 'utc'),0),
  'week_seconds',coalesce(sum(b.seconds) filter(where b.created_at>=date_trunc('week',now() at time zone 'utc') at time zone 'utc'),0),
  'month_seconds',coalesce(sum(b.seconds) filter(where b.created_at>=date_trunc('month',now() at time zone 'utc') at time zone 'utc'),0),
  'year_seconds',coalesce(sum(b.seconds) filter(where b.created_at>=date_trunc('year',now() at time zone 'utc') at time zone 'utc'),0),
  'focus_rounds_today',(select count(*) from public.study_runs r where r.user_id=auth.uid() and r.completed and r.ended_at>=date_trunc('day',now() at time zone 'utc') at time zone 'utc'),
  'focus_rounds_total',(select count(*) from public.study_runs r where r.user_id=auth.uid() and r.completed),
  'week_chart',(select jsonb_agg(jsonb_build_object('date',gs.day_value::date::text,'seconds',coalesce(q.ss,0)) order by gs.day_value)
    from generate_series((utc_today-6)::timestamp,utc_today::timestamp,'1 day'::interval) gs(day_value)
    left join (select (created_at at time zone 'utc')::date d,sum(seconds) ss from public.study_blocks where user_id=auth.uid() and created_at>=now()-interval '8 days' group by 1) q on q.d=gs.day_value::date)
  ) into v
 from public.study_blocks b where b.user_id=auth.uid();
 return v;
end $$;

-- Restrict all SECURITY DEFINER RPCs to signed-in clients only.
revoke execute on all functions in schema public from public,anon;
grant execute on function public.gazelle_can_play(text) to authenticated;
grant execute on function public.get_app_snapshot() to authenticated;
grant execute on function public.presence_ping() to authenticated;
grant execute on function public.start_study(text,integer) to authenticated;
grant execute on function public.tick_study(text) to authenticated;
grant execute on function public.get_focus_leaderboard(text) to authenticated;
grant execute on function public.change_my_avatar(integer) to authenticated;
grant execute on function public.set_my_badges(text[]) to authenticated;
grant execute on function public.admin_control(text,text,text) to authenticated;
grant execute on function public.game_ping(text) to authenticated;
grant execute on function public.game_leave() to authenticated;
grant execute on function public.create_game_room(text) to authenticated;
grant execute on function public.join_game_room(text) to authenticated;
grant execute on function public.submit_game_result(uuid,integer) to authenticated;
grant execute on function public.get_game_room_scores(uuid) to authenticated;
-- Newly-created functions in future migrations should be explicitly privilege-reviewed.

grant execute on function public.save_my_preferences(jsonb) to authenticated;
grant execute on function public.get_my_insights() to authenticated;
grant execute on function public.admin_list_users() to authenticated;


-- Feature upgrade also applied by the migration file for existing projects.
-- Routine Vibe feature upgrade (safe for the existing project; no user rows are dropped).
-- Run once in Supabase SQL Editor. Existing study history remains intact.

begin;

-- 1) Backwards-compatible data fields.
alter table public.study_runs add column if not exists subject text;
alter table public.study_blocks add column if not exists subject text;
alter table public.todos add column if not exists repeat_count integer not null default 1;
alter table public.todos add column if not exists completed_repeats integer not null default 0;

update public.todos
set completed_repeats = case when done then repeat_count else 0 end
where completed_repeats = 0 and done = true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'todos_repeat_count_range'
      and conrelid = 'public.todos'::regclass
  ) then
    alter table public.todos add constraint todos_repeat_count_range
      check (repeat_count between 1 and 99 and completed_repeats between 0 and repeat_count);
  end if;
end $$;

create index if not exists study_blocks_user_subject_date
  on public.study_blocks(user_id, subject, created_at desc);

-- 2) Signup avatar choice: only the two approved starter avatars are accepted.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uname text;
  chosen_avatar integer := 1;
begin
  uname := lower(trim(coalesce(new.raw_user_meta_data->>'username','')));
  if uname !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Username must have 3–24 letters, numbers, or underscores';
  end if;
  if coalesce(new.raw_user_meta_data->>'avatar','') in ('1','5') then
    chosen_avatar := (new.raw_user_meta_data->>'avatar')::integer;
  end if;
  insert into public.profiles(user_id,username,display_name,avatar)
  values(new.id,uname,left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),uname),50),chosen_avatar);
  insert into public.preferences(user_id) values(new.id);
  return new;
end $$;

-- 3) Username availability helper for a clear signup error (no profile data is exposed).
create or replace function public.is_username_available(p_username text)
returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select case
    when lower(trim(coalesce(p_username,''))) !~ '^[a-z0-9_]{3,24}$' then false
    else not exists (
      select 1 from public.profiles p
      where lower(p.username)=lower(trim(p_username))
    )
  end;
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- 4) New start RPC: same checks as start_study, with a private optional subject.
create or replace function public.start_study_with_subject(
  p_mode text,
  p_target_seconds integer,
  p_subject text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p public.profiles%rowtype;
  s public.app_settings%rowtype;
  r public.study_runs%rowtype;
  subject_value text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_mode is null or p_mode not in ('solo','together')
     or p_target_seconds is null or p_target_seconds not between 60 and 10800 then
    raise exception 'Invalid timer settings';
  end if;
  subject_value := nullif(left(trim(coalesce(p_subject,'')),60),'');
  select * into p from public.profiles where user_id=auth.uid();
  if p.user_id is null then raise exception 'Profile not found'; end if;
  select * into s from public.app_settings where id=true;
  if s.id is null then raise exception 'App settings are not initialized'; end if;
  if p_mode='together' and not (p.plan='premium' or p.is_admin) then raise exception 'Premium access required'; end if;
  if p_mode='together' and not s.room_open then raise exception 'Host room is closed'; end if;

  select * into r from public.study_runs
  where user_id=auth.uid() and ended_at is null for update;
  if found then
    if r.mode<>p_mode or (r.mode='together' and r.room_id is distinct from s.room_id) then
      raise exception 'Finish or reset your existing study session first';
    end if;
    if subject_value is not null and not r.is_active then
      update public.study_runs set subject=subject_value where id=r.id;
    end if;
    return jsonb_build_object('id',r.id,'active',r.is_active,'seconds',r.total_seconds,
      'target_seconds',r.target_seconds,'subject',coalesce(subject_value,r.subject));
  end if;

  insert into public.study_runs(user_id,mode,room_id,target_seconds,subject)
  values(auth.uid(),p_mode,case when p_mode='together' then s.room_id else null end,
    p_target_seconds,subject_value)
  returning * into r;
  return jsonb_build_object('id',r.id,'active',true,'seconds',0,
    'target_seconds',r.target_seconds,'subject',r.subject);
end $$;

-- 5) Keep the original heartbeat accounting and attach each recorded block to its subject.
create or replace function public.tick_study(p_action text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  r public.study_runs%rowtype;
  s public.app_settings%rowtype;
  d numeric(9,3):=0;
  x numeric(14,6):=0;
  finished boolean:=false;
  room_valid boolean:=true;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_action is null or p_action not in ('pulse','pause','resume','stop','complete') then
    raise exception 'Invalid action';
  end if;
  select * into r from public.study_runs
  where user_id=auth.uid() and ended_at is null for update;
  if not found then return jsonb_build_object('status','missing','seconds',0); end if;

  if r.mode='together' then
    select * into s from public.app_settings where id=true;
    room_valid := coalesce(s.room_open,false) and r.room_id=s.room_id
      and exists(select 1 from public.profiles p where p.user_id=auth.uid() and (p.plan='premium' or p.is_admin));
  end if;
  if not room_valid then
    update public.study_runs set ended_at=now(),is_active=false where id=r.id;
    return jsonb_build_object('status','room_closed','seconds',r.total_seconds);
  end if;
  if not r.is_active and p_action='pulse' then
    return jsonb_build_object('status','paused','seconds',r.total_seconds,'added_seconds',0,'added_xp',0);
  end if;
  if r.is_active and p_action <> 'resume' then
    d := round(least(greatest(extract(epoch from (now()-r.last_heartbeat)),0),45)::numeric,3);
    if d>0 then
      x := round(d / case when r.mode='together' then 180::numeric else 360::numeric end,6);
      insert into public.study_blocks(user_id,run_id,mode,seconds,xp,subject)
      values(auth.uid(),r.id,r.mode,d,x,r.subject);
    end if;
  end if;
  r.total_seconds := r.total_seconds+d;
  if p_action='complete' then finished:=r.total_seconds>=r.target_seconds-2; end if;
  update public.study_runs set total_seconds=r.total_seconds,last_heartbeat=now(),
    is_active=case when p_action in ('stop','complete','pause') then false else true end,
    ended_at=case when p_action in ('stop','complete') then now() else null end,
    completed=finished where id=r.id;
  return jsonb_build_object('status',case when p_action='complete' and not finished then 'incomplete' else p_action end,
    'seconds',r.total_seconds,'added_seconds',d,'added_xp',x,'completed',finished);
end $$;

-- 6) Leaderboard now returns period study time and a live-study flag as well as XP.
drop function if exists public.get_focus_leaderboard(text);
create function public.get_focus_leaderboard(p_period text default 'week')
returns table(
  username text,
  avatar integer,
  level integer,
  period_xp numeric,
  period_seconds numeric,
  is_studying boolean,
  selected_badges text[]
)
language plpgsql security definer set search_path=public,pg_temp as $$
declare cutoff timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_period='day' then cutoff:=date_trunc('day',now() at time zone 'utc') at time zone 'utc';
  elsif p_period='week' then cutoff:=date_trunc('week',now() at time zone 'utc') at time zone 'utc';
  elsif p_period='month' then cutoff:=date_trunc('month',now() at time zone 'utc') at time zone 'utc';
  else raise exception 'Invalid period'; end if;

  return query
  select p.username,p.avatar,
    (1+floor(coalesce(lifetime.total_xp,0)/50))::integer,
    coalesce(periods.period_xp,0)::numeric,
    coalesce(periods.period_seconds,0)::numeric,
    exists(
      select 1 from public.study_runs r
      where r.user_id=p.user_id and r.ended_at is null and r.is_active
        and r.last_heartbeat>=now()-interval '55 seconds'
    ),
    p.selected_badges
  from public.profiles p
  join (
    select b.user_id,sum(b.xp) period_xp,sum(b.seconds) period_seconds
    from public.study_blocks b where b.created_at>=cutoff group by b.user_id
  ) periods on periods.user_id=p.user_id
  left join (
    select b.user_id,sum(b.xp) total_xp from public.study_blocks b group by b.user_id
  ) lifetime on lifetime.user_id=p.user_id
  order by periods.period_xp desc,periods.period_seconds desc,p.username
  limit 30;
end $$;

-- 7) Session bars for the simple 24-hour study-record timeline (last N days).
create or replace function public.get_my_study_records(p_days integer default 7)
returns table(started_at timestamptz,ended_at timestamptz,seconds numeric,subject text)
language sql stable security definer set search_path=public,pg_temp as $$
  with base as (
    select b.run_id,b.created_at,b.seconds,
      coalesce(nullif(btrim(b.subject),''),'Unspecified') as subject,
      lag(b.created_at) over(partition by b.run_id order by b.created_at) as prev_at
    from public.study_blocks b
    where b.user_id=auth.uid()
      and b.created_at >= now()-make_interval(days=>least(greatest(coalesce(p_days,7),1),365))
  ), marked as (
    select *,sum(case when prev_at is null or created_at-prev_at>interval '75 seconds'
      then 1 else 0 end) over(partition by run_id order by created_at) as session_no
    from base
  )
  select min(created_at)-(min(seconds)::double precision*interval '1 second'),
    max(created_at),sum(seconds),subject
  from marked
  group by run_id,session_no,subject
  order by min(created_at) desc
  limit 250;
$$;

-- 8) Compact subject donut + period bar chart data. All durations come from recorded study blocks.
create or replace function public.get_my_study_analytics(p_period text default 'week')
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  cutoff timestamptz;
  v_subjects jsonb:='[]'::jsonb;
  v_buckets jsonb:='[]'::jsonb;
  v_total numeric:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_period not in ('day','week','month','year') then raise exception 'Invalid period'; end if;
  if p_period='day' then cutoff:=date_trunc('day',now());
  elsif p_period='week' then cutoff:=date_trunc('week',now());
  elsif p_period='month' then cutoff:=date_trunc('month',now());
  else cutoff:=date_trunc('year',now()); end if;

  select coalesce(jsonb_agg(jsonb_build_object('subject',subject,'seconds',seconds) order by seconds desc),'[]'::jsonb)
    into v_subjects
  from (
    select coalesce(nullif(btrim(b.subject),''),'Unspecified') subject,sum(b.seconds) seconds
    from public.study_blocks b
    where b.user_id=auth.uid() and b.created_at>=cutoff
    group by 1
  ) q;

  select coalesce(sum(b.seconds),0) into v_total
  from public.study_blocks b where b.user_id=auth.uid() and b.created_at>=cutoff;

  if p_period='day' then
    select coalesce(jsonb_agg(jsonb_build_object('label',lpad(g.h::text,2,'0')||':00','seconds',coalesce(q.seconds,0)) order by g.h),'[]'::jsonb)
      into v_buckets
    from generate_series(0,23) as g(h)
    left join lateral (
      select sum(b.seconds) seconds from public.study_blocks b
      where b.user_id=auth.uid()
        and b.created_at>=date_trunc('day',now())+g.h*interval '1 hour'
        and b.created_at<date_trunc('day',now())+(g.h+1)*interval '1 hour'
    ) q on true;
  elsif p_period='week' then
    select coalesce(jsonb_agg(jsonb_build_object('label',to_char(g.bucket,'Dy'),'seconds',coalesce(q.seconds,0)) order by g.bucket),'[]'::jsonb)
      into v_buckets
    from generate_series(date_trunc('week',now()),date_trunc('week',now())+interval '6 days',interval '1 day') as g(bucket)
    left join lateral (
      select sum(b.seconds) seconds from public.study_blocks b
      where b.user_id=auth.uid() and b.created_at>=g.bucket and b.created_at<g.bucket+interval '1 day'
    ) q on true;
  elsif p_period='month' then
    select coalesce(jsonb_agg(jsonb_build_object('label',to_char(g.bucket,'DD'),'seconds',coalesce(q.seconds,0)) order by g.bucket),'[]'::jsonb)
      into v_buckets
    from generate_series(date_trunc('month',now()),date_trunc('day',now()),interval '1 day') as g(bucket)
    left join lateral (
      select sum(b.seconds) seconds from public.study_blocks b
      where b.user_id=auth.uid() and b.created_at>=g.bucket and b.created_at<g.bucket+interval '1 day'
    ) q on true;
  else
    select coalesce(jsonb_agg(jsonb_build_object('label',to_char(g.bucket,'Mon'),'seconds',coalesce(q.seconds,0)) order by g.bucket),'[]'::jsonb)
      into v_buckets
    from generate_series(date_trunc('year',now()),date_trunc('month',now()),interval '1 month') as g(bucket)
    left join lateral (
      select sum(b.seconds) seconds from public.study_blocks b
      where b.user_id=auth.uid() and b.created_at>=g.bucket and b.created_at<g.bucket+interval '1 month'
    ) q on true;
  end if;

  return jsonb_build_object('period',p_period,'period_seconds',v_total,
    'subjects',v_subjects,'buckets',v_buckets);
end $$;

create or replace function public.get_my_subject_count() returns integer
language sql stable security definer set search_path=public,pg_temp as $$
  select count(distinct nullif(btrim(subject),''))::integer
  from public.study_blocks where user_id=auth.uid();
$$;

-- 9) Twelve achievements; all are checked again server-side before public selection.
create or replace function public.set_my_badges(p_badges text[]) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  badge text;
  secs numeric:=0;
  best_streak integer:=0;
  rounds integer:=0;
  subjects integer:=0;
  earned boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  p_badges:=coalesce(p_badges,'{}'::text[]);
  if coalesce(array_length(p_badges,1),0)>3 then raise exception 'Choose up to 3 public badges'; end if;

  select coalesce(sum(seconds),0) into secs from public.study_blocks where user_id=auth.uid();
  select count(*) into rounds from public.study_runs where user_id=auth.uid() and completed;
  select count(distinct nullif(btrim(subject),'')) into subjects
    from public.study_blocks where user_id=auth.uid();
  with days as (
    select distinct (created_at at time zone 'utc')::date d
    from public.study_blocks where user_id=auth.uid()
  ), numbered as (
    select d,d-(row_number() over(order by d))::integer as grp from days
  ), streaks as (
    select count(*)::integer n from numbered group by grp
  )
  select coalesce(max(n),0) into best_streak from streaks;

  foreach badge in array p_badges loop
    earned := case badge
      when 'first_focus' then rounds>=1
      when 'streak3' then best_streak>=3
      when 'streak7' then best_streak>=7
      when 'streak30' then best_streak>=30
      when 'hours10' then secs>=36000
      when 'hours25' then secs>=90000
      when 'hours100' then secs>=360000
      when 'hours500' then secs>=1800000
      when 'rounds10' then rounds>=10
      when 'rounds50' then rounds>=50
      when 'rounds100' then rounds>=100
      when 'subject5' then subjects>=5
      else false
    end;
    if not earned then raise exception 'Achievement is not earned: %',badge; end if;
  end loop;
  update public.profiles set selected_badges=p_badges where user_id=auth.uid();
end $$;

-- 10) Explicit grants. Service role needs table SELECT for the username-login Edge Function.
grant select on public.profiles to service_role;
revoke all on function public.start_study_with_subject(text,integer,text) from public,anon;
revoke all on function public.get_my_study_records(integer) from public,anon;
revoke all on function public.get_my_study_analytics(text) from public,anon;
revoke all on function public.get_my_subject_count() from public,anon;
revoke all on function public.set_my_badges(text[]) from public,anon;
revoke all on function public.get_focus_leaderboard(text) from public,anon;
grant execute on function public.start_study_with_subject(text,integer,text) to authenticated;
grant execute on function public.get_my_study_records(integer) to authenticated;
grant execute on function public.get_my_study_analytics(text) to authenticated;
grant execute on function public.get_my_subject_count() to authenticated;
grant execute on function public.set_my_badges(text[]) to authenticated;
grant execute on function public.tick_study(text) to authenticated;
grant execute on function public.get_focus_leaderboard(text) to authenticated;

notify pgrst, 'reload schema';
commit;
