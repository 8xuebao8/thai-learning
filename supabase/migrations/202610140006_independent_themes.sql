begin;
-- Separate word and sentence catalogs without rewriting any account data.
-- Theme catalog and vocabulary are committed in one account-scoped transaction.
create function public.import_learning_changes_v3(p_epoch integer,p_seq bigint,p_request text,p_records jsonb,p_scope text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); generation integer; current_seq bigint; saved public.learning_import_receipts%rowtype;
 catalog_key text; old_catalog jsonb; old_words jsonb; old_sentences jsonb; defaults jsonb:='[{"id":"work","name":"工作与商务"},{"id":"campus","name":"大学与课堂"},{"id":"life","name":"生活办事"},{"id":"personal","name":"我的词库"}]'::jsonb; r jsonb; old_settings jsonb; catalog jsonb; t jsonb; target text; seen text[]; v integer; reply jsonb; body_hash text:=md5(p_scope || chr(10) || p_records::text);
begin
 if uid is null or not exists(select 1 from public.allowed_users where user_id=uid) then raise exception 'Account not allowed' using errcode='42501';end if;
 if p_scope is null or p_scope not in ('words','sentences') then raise exception 'Invalid theme scope';end if;
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
    if ((r->'payload')-'themes'-'sentenceThemes') is distinct from (old_settings-'themes'-'sentenceThemes') or coalesce((r->>'deleted')::boolean,false) then raise exception 'Only theme catalogs may change in imported settings';end if;
    old_words:=coalesce(old_settings->'themes',defaults);
    old_sentences:=coalesce(old_settings->'sentenceThemes',old_settings->'themes',defaults);
    if (p_scope='words' and r->'payload'->'sentenceThemes' is distinct from old_sentences) or (p_scope='sentences' and r->'payload'->'themes' is distinct from old_words) then raise exception 'Unrelated theme catalog must remain unchanged';end if;
    foreach catalog_key in array array['themes','sentenceThemes'] loop
    catalog:=r->'payload'->catalog_key;
    old_catalog:=case when catalog_key='themes' then old_words else old_sentences end;
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
    if exists(select 1 from jsonb_array_elements(old_catalog) old where not exists(select 1 from jsonb_array_elements(catalog) n where n->>'id'=old->>'id')) then raise exception 'Deleted themes require redirects';end if;
    end loop;
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
revoke all on function public.import_learning_changes_v3(integer,bigint,text,jsonb,text) from public,anon;
grant execute on function public.import_learning_changes_v3(integer,bigint,text,jsonb,text) to authenticated;



-- Keep legacy receipts replayable; new theme edits require a scoped request.
-- Theme catalog and vocabulary are committed in one account-scoped transaction.
create or replace function public.import_learning_changes_v2(p_epoch integer,p_seq bigint,p_request text,p_records jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); generation integer; current_seq bigint; saved public.learning_import_receipts%rowtype;
 r jsonb; v integer; reply jsonb; body_hash text:=md5(p_records::text);
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
    raise exception 'Theme changes require the updated application';
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



-- Ordinary sync may update preferences, but catalogs use the atomic scoped import.
create or replace function public.sync_learning_v2(p_records jsonb default '[]',p_events jsonb default '[]',p_after bigint default 0,p_epoch integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); generation integer; reply jsonb; r jsonb; safe_records jsonb:='[]'; saved_settings jsonb; saved_version integer; saved_themes jsonb; saved_sentences jsonb; defaults jsonb:='[{"id":"work","name":"工作与商务"},{"id":"campus","name":"大学与课堂"},{"id":"life","name":"生活办事"},{"id":"personal","name":"我的词库"}]'::jsonb;
begin
 if uid is null or not exists(select 1 from public.allowed_users where user_id=uid) then raise exception 'Account not allowed' using errcode='42501';end if;
 insert into public.learning_cursors(user_id) values(uid) on conflict do nothing;
 select epoch into generation from public.learning_cursors where user_id=uid for update;
 if p_epoch is distinct from generation then
   return jsonb_build_object('epoch',generation,'reset',true,'acks','[]'::jsonb,'eventAcks','[]'::jsonb,'changes','[]'::jsonb,'conflicts','[]'::jsonb,'cursor',0,'more',false);
 end if;
 select payload,version into saved_settings,saved_version from public.learning_records where user_id=uid and id='settings';
 if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Invalid records';end if;
 if (select count(*) from jsonb_array_elements(p_records) where value->>'kind'='settings')>1 then raise exception 'Repeated settings record';end if;
 for r in select value from jsonb_array_elements(p_records) loop
   if r->>'kind'='settings' then
     saved_themes:=coalesce(saved_settings->'themes',defaults);
     saved_sentences:=coalesce(saved_settings->'sentenceThemes',saved_settings->'themes',defaults);
     -- Stale devices must receive a normal conflict and still upload their events.
     if coalesce(saved_version,0)=(r->>'baseVersion')::integer and (coalesce((r->>'deleted')::boolean,false) or
       ((r->'payload' ? 'themes') and r->'payload'->'themes' is distinct from saved_themes) or
       ((r->'payload' ? 'sentenceThemes') and r->'payload'->'sentenceThemes' is distinct from saved_sentences)) then
       raise exception 'Theme changes require the updated application';
     end if;
     -- Only materialize missing fields when stored: old devices must not erase either catalog.
     if saved_settings ? 'themes' and not (r->'payload' ? 'themes') then
       r:=jsonb_set(r,'{payload,themes}',saved_themes);
     end if;
     if saved_settings ? 'sentenceThemes' and not (r->'payload' ? 'sentenceThemes') then
       r:=jsonb_set(r,'{payload,sentenceThemes}',saved_sentences);
     end if;
   end if;
   safe_records:=safe_records||jsonb_build_array(r);
 end loop;
 reply:=public.sync_learning_internal(safe_records,p_events,p_after);
 return reply||jsonb_build_object('epoch',generation,'reset',false);
end $$;
revoke all on function public.sync_learning_v2(jsonb,jsonb,bigint,integer) from public,anon;
grant execute on function public.sync_learning_v2(jsonb,jsonb,bigint,integer) to authenticated;


notify pgrst, 'reload schema';
commit;
