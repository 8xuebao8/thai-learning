import { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync } from "node:fs";
import { it, expect } from "vitest";
it("reset is atomic, repeat-safe, isolated, and rejects stale and legacy writes", async () => {
 const pg=new PGlite(); const uid="00000000-0000-4000-8000-000000000001", other="00000000-0000-4000-8000-000000000002";
 try {
 await pg.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${uid}'),('${other}');`);
 await pg.exec(readFileSync("supabase/migrations/202610130001_learning.sql","utf8"));
 const migration="supabase/migrations/202610140001_cloud_reset.sql";
 if(existsSync(migration)) await pg.exec(readFileSync(migration,"utf8"));
 await pg.exec(`insert into public.allowed_users values('${uid}'),('${other}');set test.uid='${uid}';set role authenticated;`);
 const word=JSON.stringify([{id:"one",kind:"word",payload:{thai:"งาน"},baseVersion:0,opId:"w1"}]);
 const event=JSON.stringify([{id:"e1",itemId:"one",kind:"word",at:1,result:"correct",assisted:false}]);
 await pg.query("select public.sync_learning_v2($1::jsonb,$2::jsonb,0,0)",[word,event]);
 const reset=await pg.query<{r:any}>("select public.reset_learning(0,'00000000-0000-4000-9000-000000000001') r");
 expect(reset.rows[0].r.epoch).toBe(1);
 expect((await pg.query("select * from public.learning_records")).rows).toHaveLength(0);
 expect((await pg.query("select * from public.learning_events")).rows).toHaveLength(0);
 const repeated=await pg.query<{r:any}>("select public.reset_learning(0,'00000000-0000-4000-9000-000000000001') r");
 expect(repeated.rows[0].r.epoch).toBe(1);
 const stale=await pg.query<{r:any}>("select public.sync_learning_v2($1::jsonb,$2::jsonb,0,0) r",[word,event]);
 expect(stale.rows[0].r.reset).toBe(true);
 expect((await pg.query("select * from public.learning_records")).rows).toHaveLength(0);
 await expect(pg.query("select public.sync_learning($1::jsonb,'[]',0)",[word])).rejects.toThrow();
 await pg.exec(`reset role;set test.uid='${other}';set role authenticated;`);
 const separate=await pg.query<{r:any}>("select public.sync_learning_v2($1::jsonb,'[]',0,0) r",[word]);
 expect(separate.rows[0].r.acks).toHaveLength(1);
 await pg.exec(`reset role;set test.uid='${uid}';set role authenticated;`);
 expect((await pg.query("select * from public.learning_records")).rows).toHaveLength(0);
 await expect(pg.query("select public.reset_learning(0,'00000000-0000-4000-9000-000000000002')")).rejects.toThrow(/changed/);
 } finally { await pg.close(); }
},20000);
