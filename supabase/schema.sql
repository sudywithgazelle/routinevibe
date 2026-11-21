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
 if not found or g.game is null then return false; end if;
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
  'together',(select count(*) from public.study_runs where ended_at is null and is_active and mode='together' and last_heartbeat >= now()-interval '55 seconds'),
  'break_active',s.break_active,'room_open',s.room_open,
  'catalog',(select coalesce(jsonb_agg(jsonb_build_object('game',g.game,'xp_required',g.xp_required,'premium_only',g.premium_only,'players',(select count(*) from public.game_presence gp where gp.game=g.game and gp.last_seen>=now()-interval '85 seconds'))),'[]'::jsonb) from public.game_catalog g)
 ) into outp from public.app_settings s where id=true;
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
 if p_mode not in ('solo','together') or p_target_seconds not between 60 and 10800 then raise exception 'Invalid timer settings'; end if;
 select * into p from public.profiles where user_id=auth.uid();
 select * into s from public.app_settings where id=true;
 if p_mode='together' and not (p.plan='premium' or p.is_admin) then raise exception 'Premium access required'; end if;
 if p_mode='together' and not s.room_open then raise exception 'Host room is closed'; end if;
 select * into r from public.study_runs where user_id=auth.uid() and ended_at is null for update;
 if found then
  if r.mode<>p_mode or (r.mode='together' and r.room_id is distinct from s.room_id) then
    raise exception 'Finish or reset your existing study session first';
  end if;
  return jsonb_build_object('id',r.id,'active',r.is_active,'seconds',r.total_seconds);
 end if;
 insert into public.study_runs(user_id,mode,room_id,target_seconds)
 values(auth.uid(),p_mode,case when p_mode='together' then s.room_id else null end,p_target_seconds)
 returning * into r;
 return jsonb_build_object('id',r.id,'active',true,'seconds',0);
end $$;

-- RPC-only accounting. Each pulse accrues at most 45 seconds of SERVER time.
-- Browser pauses stop accrual; missed heartbeats do not yield unbounded passive XP.
create or replace function public.tick_study(p_action text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.study_runs%rowtype;s public.app_settings%rowtype; d numeric(9,3):=0; x numeric(14,6):=0; finished boolean:=false; room_valid boolean:=true;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_action not in ('pulse','pause','resume','stop','complete') then raise exception 'Invalid action'; end if;
 select * into r from public.study_runs where user_id=auth.uid() and ended_at is null for update;
 if not found then return jsonb_build_object('status','missing','seconds',0); end if;
 if r.mode='together' then
  select * into s from public.app_settings where id=true;
  room_valid := s.room_open and r.room_id=s.room_id
    and exists(select 1 from public.profiles p where p.user_id=auth.uid() and (p.plan='premium' or p.is_admin));
 end if;
 if not room_valid then
  update public.study_runs set ended_at=now(),is_active=false where id=r.id;
  return jsonb_build_object('status','room_closed','seconds',r.total_seconds);
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
  select (plan='premium' or is_admin) into ispaid from public.profiles where user_id=auth.uid();
  if not ispaid then raise exception 'Premium required for graduation avatar';end if;
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
   update public.study_runs set ended_at=now(),is_active=false where mode='together' and ended_at is null;
 elsif p_action='break_on' then update public.app_settings set break_active=true where id=true;
 elsif p_action='break_off' then update public.app_settings set break_active=false where id=true;
 elsif p_action in ('set_premium','set_free') then
   select user_id into target from public.profiles where username=lower(trim(p_username));
   if target is null then raise exception 'Username not found'; end if;
   if target=auth.uid() then raise exception 'Do not change your own plan here';end if;
   update public.profiles set plan=case when p_action='set_premium' then 'premium' else 'free' end where user_id=target;
   if p_action='set_free' then update public.study_runs set ended_at=now(),is_active=false where user_id=target and mode='together' and ended_at is null;end if;
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
begin delete from public.game_presence where user_id=auth.uid(); end $$;

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
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
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
declare theme text; p public.profiles%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(p_settings)<>'object' or length(p_settings::text)>4000 then raise exception 'Invalid preferences'; end if;
 theme:=coalesce(p_settings->>'theme','Buttercream');
 if theme not in ('Sunday','Pink Cloud','Buttercream','Lavender Kiss','Sage Garden','Vanilla',
  'Trend','Old Money','Monochrome','Midnight','Pure White','Rosewood','Terracotta','Ice Blue','Burgundy','Navy') then
  raise exception 'Unknown theme';end if;
 select * into p from public.profiles where user_id=auth.uid();
 if theme in ('Burgundy','Navy') and p.plan<>'premium' and not p.is_admin then raise exception 'Premium theme';end if;
 if (p_settings->>'focus') is not null and
   ((p_settings->>'focus') !~ '^[0-9]{1,3}$' or (p_settings->>'focus')::int not between 1 and 180) then
   raise exception 'Invalid focus'; end if;
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
