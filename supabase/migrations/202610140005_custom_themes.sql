-- Theme catalog and vocabulary are committed in one account-scoped transaction.
create function public.import_learning_changes_v2(p_epoch integer,p_seq bigint,p_request text,p_records jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); generation integer; current_seq bigint; saved public.learning_import_receipts%rowtype;
 r jsonb; old_settings jsonb; catalog jsonb; t jsonb; target text; seen text[]; v integer; reply jsonb; body_hash text:=md5(p_records::text);
begin
 if uid is null or not exists(select 1 from public.allowed_users where user_id=uid) then raise exception 'Account not allowed' using errcode='42501';end if;
 if p_request is null or length(p_request) not between 1 and 100 or jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Invalid import';end if;
 if jsonb_array_length(p_records) not between 1 and 101 or octet_length(p_records::text)>450000 then raise exception 'Batch limit exceeded';end if;
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
  if r->>'kind'='settings' and r->>'id'='settings' then
    select payload into old_settings from public.learning_records where user_id=uid and id='settings';
    old_settings:=coalesce(old_settings,'{"goal":10,"display":"both","timezone":"Asia/Bangkok"}'::jsonb);
    if ((r->'payload')-'themes') is distinct from (old_settings-'themes') or coalesce((r->>'deleted')::boolean,false) then raise exception 'Only themes may change in imported settings';end if;
    catalog:=r->'payload'->'themes';
    if jsonb_typeof(catalog) is distinct from 'array' then raise exception 'Invalid theme catalog';end if;
    if jsonb_array_length(catalog) not between 4 and 200 then raise exception 'Theme limit exceeded';end if;
    if (select count(distinct value->>'id') from jsonb_array_elements(catalog))<>jsonb_array_length(catalog) then raise exception 'Duplicate theme ID';end if;
    if (select count(*) from jsonb_array_elements(catalog) where value->>'id' in ('work','campus','life','personal'))<>4 then raise exception 'Missing built-in themes';end if;
    if exists(select 1 from jsonb_array_elements(catalog) where value->>'id'='personal' and value ? 'redirectTo') then raise exception 'Cannot delete fallback';end if;
    if (select count(distinct lower(btrim(value->>'name'))) from jsonb_array_elements(catalog) where not value ? 'redirectTo')<>(select count(*) from jsonb_array_elements(catalog) where not value ? 'redirectTo') then raise exception 'Duplicate theme name';end if;
    for t in select value from jsonb_array_elements(catalog) loop
      if jsonb_typeof(t) is distinct from 'object' or coalesce(t->>'id','') !~ '^(work|campus|life|personal|custom:[a-zA-Z0-9_-]{1,64})$' or jsonb_typeof(t->'name') is distinct from 'string' or length(btrim(t->>'name')) not between 1 and 60 or (t - 'id' - 'name' - 'redirectTo')<>'{}'::jsonb then raise exception 'Invalid theme';end if;
      if t ? 'redirectTo' and (jsonb_typeof(t->'redirectTo') is distinct from 'string' or coalesce(t->>'redirectTo','') !~ '^(work|campus|life|personal|custom:[a-zA-Z0-9_-]{1,64})$') then raise exception 'Invalid redirect target';end if;
      target:=t->>'id'; seen:='{}';
      loop
        if target=any(seen) then raise exception 'Cyclic theme redirect';end if;
        seen:=array_append(seen,target);
        select value->>'redirectTo' into target from jsonb_array_elements(catalog) where value->>'id'=target;
        if not found then raise exception 'Missing redirect target';end if;
        exit when target is null;
      end loop;
    end loop;
    if exists(select 1 from jsonb_array_elements(coalesce(old_settings->'themes','[]')) old where not exists(select 1 from jsonb_array_elements(catalog) n where n->>'id'=old->>'id')) then raise exception 'Deleted themes require redirects';end if;
  elsif r->>'kind' is distinct from 'word' or r->>'id'='settings' then raise exception 'Only vocabulary and theme changes allowed';end if;
  select version into v from public.learning_records where user_id=uid and id=r->>'id';
  if coalesce(v,0) is distinct from (r->>'baseVersion')::integer then return jsonb_build_object('status','conflict');end if;
 end loop;
 reply:=public.sync_learning_internal(p_records,'[]'::jsonb,current_seq);
 if jsonb_array_length(reply->'conflicts')<>0 then raise exception 'Unexpected import conflict';end if;
 reply:=jsonb_build_object('status','applied','acks',reply->'acks');
 insert into public.learning_import_receipts values(uid,generation,p_request,body_hash,reply);
 return reply;
end $$;
revoke all on function public.import_learning_changes_v2(integer,bigint,text,jsonb) from public,anon;
grant execute on function public.import_learning_changes_v2(integer,bigint,text,jsonb) to authenticated;


-- Older clients preserve the new catalog when updating unrelated settings.
create or replace function public.sync_learning_v2(p_records jsonb default '[]',p_events jsonb default '[]',p_after bigint default 0,p_epoch integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); generation integer; reply jsonb; r jsonb; safe_records jsonb:='[]'; saved_themes jsonb;
begin
 if uid is null or not exists(select 1 from public.allowed_users where user_id=uid) then raise exception 'Account not allowed' using errcode='42501';end if;
 insert into public.learning_cursors(user_id) values(uid) on conflict do nothing;
 select epoch into generation from public.learning_cursors where user_id=uid for update;
 if p_epoch is distinct from generation then
   return jsonb_build_object('epoch',generation,'reset',true,'acks','[]'::jsonb,'eventAcks','[]'::jsonb,'changes','[]'::jsonb,'conflicts','[]'::jsonb,'cursor',0,'more',false);
 end if;
 select payload->'themes' into saved_themes from public.learning_records where user_id=uid and id='settings';
 if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Invalid records';end if;
 for r in select value from jsonb_array_elements(p_records) loop
   if r->>'kind'='settings' and saved_themes is not null and not (r->'payload' ? 'themes') then
     r:=jsonb_set(r,'{payload,themes}',saved_themes);
   end if;
   safe_records:=safe_records||jsonb_build_array(r);
 end loop;
 reply:=public.sync_learning_internal(safe_records,p_events,p_after);
 return reply||jsonb_build_object('epoch',generation,'reset',false);
end $$;
revoke all on function public.sync_learning_v2(jsonb,jsonb,bigint,integer) from public,anon;
grant execute on function public.sync_learning_v2(jsonb,jsonb,bigint,integer) to authenticated;

