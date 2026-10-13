-- Run in Supabase SQL Editor, or apply with supabase db push.
create table public.allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.allowed_users enable row level security;
create policy own_allowlist on public.allowed_users for select to authenticated using (user_id = auth.uid());
revoke all on public.allowed_users from anon, authenticated;
grant select on public.allowed_users to authenticated;

create table public.learning_cursors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seq bigint not null default 0
);
create table public.learning_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 100),
  kind text not null check (kind in ('word','settings')),
  payload jsonb not null,
  version integer not null default 1,
  deleted boolean not null default false,
  last_op text not null,
  primary key(user_id,id)
);
create table public.learning_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 100),
  payload jsonb not null,
  primary key(user_id,id)
);
create table public.learning_changes (
  user_id uuid not null references auth.users(id) on delete cascade,
  seq bigint not null,
  kind text not null check (kind in ('word','settings','event')),
  id text not null,
  payload jsonb not null,
  version integer not null,
  deleted boolean not null,
  primary key(user_id,seq)
);
alter table public.learning_cursors enable row level security;
alter table public.learning_records enable row level security;
alter table public.learning_events enable row level security;
alter table public.learning_changes enable row level security;
revoke all on public.learning_cursors,public.learning_records,public.learning_events,public.learning_changes from anon,authenticated;
grant select on public.learning_records,public.learning_events to authenticated;
create policy read_own_records on public.learning_records for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.allowed_users a where a.user_id=auth.uid()));
create policy read_own_events on public.learning_events for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.allowed_users a where a.user_id=auth.uid()));

create or replace function public.sync_learning(p_records jsonb default '[]', p_events jsonb default '[]', p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); current_seq bigint; after_seq bigint;
  r jsonb; e jsonb; old public.learning_records%rowtype;
  v integer; inserted integer; new_seq bigint;
  acks jsonb := '[]'; event_acks jsonb := '[]'; conflicts jsonb := '[]'; changes jsonb;
begin
  if uid is null or not exists(select 1 from public.allowed_users where user_id=uid) then
    raise exception 'Account not allowed' using errcode='42501';
  end if;
  if jsonb_typeof(p_records) is distinct from 'array' or jsonb_typeof(p_events) is distinct from 'array' then raise exception 'Invalid batch'; end if;
  if jsonb_array_length(p_records)>101 or jsonb_array_length(p_events)>100 or octet_length(p_records::text)+octet_length(p_events::text)>500000 or p_after<0 then raise exception 'Batch limit exceeded'; end if;
  insert into public.learning_cursors(user_id) values(uid) on conflict do nothing;
  -- The per-user row lock serializes writes AND cursor allocation through commit.
  select seq into current_seq from public.learning_cursors where user_id=uid for update;
  for r in select value from jsonb_array_elements(p_records) loop
    if coalesce(r->>'id','')='' or length(r->>'id')>100 or coalesce(r->>'kind','') not in ('word','settings') or jsonb_typeof(r->'payload') is distinct from 'object' or coalesce(r->>'opId','')='' or length(r->>'opId')>2000 or coalesce((r->>'baseVersion')::integer,-1)<0 then raise exception 'Invalid record'; end if;
    if (r->>'kind'='settings')<>(r->>'id'='settings') then raise exception 'Reserved record ID'; end if;
    select * into old from public.learning_records where user_id=uid and id=r->>'id';
    if found and old.last_op=r->>'opId' then
      acks:=acks||jsonb_build_array(jsonb_build_object('id',old.id,'version',old.version));continue;
    end if;
    if coalesce(old.version,0)<>(r->>'baseVersion')::integer then
      if old.id is not null then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('seq',current_seq,'id',old.id,'kind',old.kind,'payload',old.payload,'version',old.version,'deleted',old.deleted)); end if;
      continue;
    end if;
    v:=coalesce(old.version,0)+1;
    insert into public.learning_records(user_id,id,kind,payload,version,deleted,last_op)
      values(uid,r->>'id',r->>'kind',r->'payload',v,coalesce((r->>'deleted')::boolean,false),r->>'opId')
      on conflict(user_id,id) do update set payload=excluded.payload,version=excluded.version,deleted=excluded.deleted,last_op=excluded.last_op;
    current_seq:=current_seq+1;
    insert into public.learning_changes values(uid,current_seq,r->>'kind',r->>'id',r->'payload',v,coalesce((r->>'deleted')::boolean,false));
    acks:=acks||jsonb_build_array(jsonb_build_object('id',r->>'id','version',v));
  end loop;
  for e in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(e) is distinct from 'object' or coalesce(e->>'id','')='' or length(e->>'id')>100 or coalesce(e->>'itemId','')='' or length(e->>'itemId')>100 or coalesce(e->>'kind','') not in ('word','sentence') or coalesce(e->>'result','') not in ('correct','wrong') or jsonb_typeof(e->'at') is distinct from 'number' or jsonb_typeof(e->'assisted') is distinct from 'boolean' then raise exception 'Invalid event'; end if;
    if (e->>'at')::numeric<0 or (e->>'at')::numeric > extract(epoch from now())*1000+300000 then raise exception 'Invalid event time'; end if;
    insert into public.learning_events values(uid,e->>'id',e) on conflict do nothing;
    get diagnostics inserted=row_count;
    if inserted>0 then current_seq:=current_seq+1;insert into public.learning_changes values(uid,current_seq,'event',e->>'id',e,1,false);end if;
    event_acks:=event_acks||jsonb_build_array(e->>'id');
  end loop;
  update public.learning_cursors set seq=current_seq where user_id=uid;
  after_seq:=least(p_after,current_seq);
  select coalesce(jsonb_agg(jsonb_build_object('seq',c.seq,'id',c.id,'kind',c.kind,'payload',c.payload,'version',c.version,'deleted',c.deleted) order by c.seq),'[]'),coalesce(max(c.seq),after_seq)
    into changes,new_seq from (select * from public.learning_changes where user_id=uid and seq>after_seq order by seq limit 200)c;
  return jsonb_build_object('acks',acks,'eventAcks',event_acks,'conflicts',conflicts,'changes',changes,'cursor',new_seq,'more',new_seq<current_seq);
end $$;
revoke all on function public.sync_learning(jsonb,jsonb,bigint) from public,anon;
grant execute on function public.sync_learning(jsonb,jsonb,bigint) to authenticated;

-- Server-side generation limits and idempotency. No client can edit these tables.
create table public.generation_usage(user_id uuid not null references auth.users(id) on delete cascade, day date not null, count integer not null,primary key(user_id,day));
create table public.generation_requests(user_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,status text not null,response jsonb,created_at timestamptz not null default now(),primary key(user_id,request_id));
alter table public.generation_usage enable row level security;
alter table public.generation_requests enable row level security;
revoke all on public.generation_usage,public.generation_requests from anon,authenticated;

create or replace function public.reserve_generation(p_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); n integer; saved public.generation_requests%rowtype;
begin
 if uid is null or not exists(select 1 from public.allowed_users where user_id=uid) then raise exception 'Account not allowed' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 update public.generation_requests set status='failed' where user_id=uid and status='pending' and created_at<now()-interval '2 minutes';
 select * into saved from public.generation_requests where user_id=uid and request_id=p_request;
 if found then return jsonb_build_object('status',saved.status,'response',saved.response);end if;
 if exists(select 1 from public.generation_requests where user_id=uid and status='pending') then raise exception 'A generation request is already running';end if;
 insert into public.generation_usage values(uid,current_date,1) on conflict(user_id,day)do update set count=public.generation_usage.count+1 returning count into n;
 if n>20 then raise exception 'Daily generation quota exceeded';end if;
 insert into public.generation_requests values(uid,p_request,'pending',null);
 return jsonb_build_object('status','new');
end $$;
revoke all on function public.reserve_generation(uuid) from public,anon;
grant execute on function public.reserve_generation(uuid) to authenticated;
