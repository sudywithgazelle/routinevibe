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
