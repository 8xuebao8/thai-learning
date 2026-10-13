-- Serialize resets and writes on the same account row. An epoch fences stale devices.
alter table public.learning_cursors add column epoch integer not null default 0;
alter table public.learning_cursors add column reset_request uuid;
alter function public.sync_learning(jsonb,jsonb,bigint) rename to sync_learning_internal;
revoke all on function public.sync_learning_internal(jsonb,jsonb,bigint) from public,anon,authenticated;

create function public.sync_learning_v2(p_records jsonb default '[]',p_events jsonb default '[]',p_after bigint default 0,p_epoch integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); generation integer; reply jsonb;
begin
 if uid is null or not exists(select 1 from public.allowed_users where user_id=uid) then raise exception 'Account not allowed' using errcode='42501';end if;
 insert into public.learning_cursors(user_id) values(uid) on conflict do nothing;
 select epoch into generation from public.learning_cursors where user_id=uid for update;
 if p_epoch is distinct from generation then
   return jsonb_build_object('epoch',generation,'reset',true,'acks','[]'::jsonb,'eventAcks','[]'::jsonb,'changes','[]'::jsonb,'conflicts','[]'::jsonb,'cursor',0,'more',false);
 end if;
 reply:=public.sync_learning_internal(p_records,p_events,p_after);
 return reply||jsonb_build_object('epoch',generation,'reset',false);
end $$;
revoke all on function public.sync_learning_v2(jsonb,jsonb,bigint,integer) from public,anon;
grant execute on function public.sync_learning_v2(jsonb,jsonb,bigint,integer) to authenticated;

-- Old cached clients cannot bypass epoch checks or resurrect cleared records.
create function public.sync_learning(p_records jsonb default '[]',p_events jsonb default '[]',p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Please refresh the application to save data';end $$;
revoke all on function public.sync_learning(jsonb,jsonb,bigint) from public,anon;
grant execute on function public.sync_learning(jsonb,jsonb,bigint) to authenticated;

create function public.reset_learning(p_epoch integer,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); generation integer; previous uuid;
begin
 if uid is null or not exists(select 1 from public.allowed_users where user_id=uid) then raise exception 'Account not allowed' using errcode='42501';end if;
 if p_request is null or p_epoch is null then raise exception 'Confirmation required';end if;
 insert into public.learning_cursors(user_id) values(uid) on conflict do nothing;
 select epoch,reset_request into generation,previous from public.learning_cursors where user_id=uid for update;
 if previous=p_request then return jsonb_build_object('epoch',generation);end if;
 if p_epoch<>generation then raise exception 'Account data changed; refresh before resetting';end if;
 delete from public.learning_changes where user_id=uid;
 delete from public.learning_events where user_id=uid;
 delete from public.learning_records where user_id=uid;
 -- Keep quota counters: resetting learning must not bypass free service limits.
 delete from public.generation_requests where user_id=uid;
 update public.learning_cursors set seq=0,epoch=generation+1,reset_request=p_request where user_id=uid;
 return jsonb_build_object('epoch',generation+1);
end $$;
revoke all on function public.reset_learning(integer,uuid) from public,anon;
grant execute on function public.reset_learning(integer,uuid) to authenticated;
