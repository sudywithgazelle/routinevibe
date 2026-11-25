-- Study With Gazelle / RoutineVibe
-- Safe-function update for an EXISTING database, generated from the supplied project schema.
--
-- IMPORTANT:
-- 1) Take a Supabase database backup first.
-- 2) Compare your live schema with the project's current supabase/schema.sql.
-- 3) Run this only if the live database has the same base tables/functions as that schema.
-- 4) This migration updates function bodies only. It does not recreate tables or delete user data.
-- 5) If your live schema has diverged, do not run this file; reconcile it first.
--
-- The full schema.sql remains a fresh-project setup file, NOT an upgrade script.

begin;


-- Updated function: gazelle_can_play
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


-- Updated function: get_app_snapshot
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


-- Updated function: start_study
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


-- Updated function: tick_study
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


-- Updated function: change_my_avatar
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


-- Updated function: set_my_badges
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


-- Updated function: admin_control
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


-- Updated function: game_leave
create or replace function public.game_leave() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 delete from public.game_presence where user_id=auth.uid();
end $$;


-- Updated function: get_game_room_scores
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


-- Updated function: save_my_preferences
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


commit;
