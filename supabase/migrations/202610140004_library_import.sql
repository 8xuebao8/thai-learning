-- User-confirmed imports use the same account lock as ordinary sync and reset.
create table public.learning_import_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 epoch integer not null, request_id text not null, body_hash text not null,
 result jsonb not null, primary key(user_id,epoch,request_id)
);
alter table public.learning_import_receipts enable row level security;
revoke all on public.learning_import_receipts from public,anon,authenticated;
create function public.import_learning_changes(p_epoch integer,p_seq bigint,p_request text,p_records jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); generation integer; current_seq bigint; saved public.learning_import_receipts%rowtype;
 r jsonb; v integer; reply jsonb; body_hash text:=md5(p_records::text);
begin
 if uid is null or not exists(select 1 from public.allowed_users where user_id=uid) then raise exception 'Account not allowed' using errcode='42501';end if;
 if p_request is null or length(p_request) not between 1 and 100 or jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Invalid import';end if;
 if jsonb_array_length(p_records) not between 1 and 100 or octet_length(p_records::text)>450000 then raise exception 'Batch limit exceeded';end if;
 insert into public.learning_cursors(user_id) values(uid) on conflict do nothing;
 select epoch,seq into generation,current_seq from public.learning_cursors where user_id=uid for update;
 if p_epoch is distinct from generation then return jsonb_build_object('status','account_reset');end if;
 select * into saved from public.learning_import_receipts where user_id=uid and epoch=generation and request_id=p_request;
 if found then
  if saved.body_hash<>body_hash then raise exception 'Request content changed';end if;
  return saved.result;
 end if;
 if p_seq is distinct from current_seq then return jsonb_build_object('status','conflict');end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_records))<>jsonb_array_length(p_records) then raise exception 'Repeated ID';end if;
 for r in select value from jsonb_array_elements(p_records) loop
  if r->>'kind' is distinct from 'word' or r->>'id'='settings' then raise exception 'Only vocabulary changes allowed';end if;
  select version into v from public.learning_records where user_id=uid and id=r->>'id';
  if coalesce(v,0) is distinct from (r->>'baseVersion')::integer then return jsonb_build_object('status','conflict');end if;
 end loop;
 reply:=public.sync_learning_internal(p_records,'[]'::jsonb,current_seq);
 if jsonb_array_length(reply->'conflicts')<>0 then raise exception 'Unexpected import conflict';end if;
 reply:=jsonb_build_object('status','applied','acks',reply->'acks');
 insert into public.learning_import_receipts values(uid,generation,p_request,body_hash,reply);
 return reply;
end $$;
revoke all on function public.import_learning_changes(integer,bigint,text,jsonb) from public,anon;
grant execute on function public.import_learning_changes(integer,bigint,text,jsonb) to authenticated;

create function public.get_learning_import_receipt(p_epoch integer,p_request text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); generation integer; result jsonb;
begin
 if uid is null or not exists(select 1 from public.allowed_users where user_id=uid) then raise exception 'Account not allowed' using errcode='42501';end if;
 select epoch into generation from public.learning_cursors where user_id=uid for share;
 if p_epoch is distinct from generation then return null;end if;
 select r.result into result from public.learning_import_receipts r where r.user_id=uid and r.epoch=p_epoch and r.request_id=p_request;
 return result;
end $$;
revoke all on function public.get_learning_import_receipt(integer,text) from public,anon;
grant execute on function public.get_learning_import_receipt(integer,text) to authenticated;
