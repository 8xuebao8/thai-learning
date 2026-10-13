/// <reference types="node" />
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
const sql = readFileSync(
  "supabase/migrations/202610130001_learning.sql",
  "utf8",
);
describe("database authentication, synchronization and quota", () => {
  const pg = new PGlite();
  const owner = "00000000-0000-4000-8000-000000000001";
  const other = "00000000-0000-4000-8000-000000000002";
  beforeAll(async () => {
    await pg.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${owner}'),('${other}');`,
    );
    await pg.exec(sql);
    await pg.exec(`insert into public.allowed_users values('${owner}');`);
  }, 20000);
  afterAll(() => pg.close());
  it("rejects users who are not allowed even when they call RPC directly", async () => {
    await pg.exec(`set test.uid='${other}';set role authenticated;`);
    await expect(
      pg.query(`select public.sync_learning('[]','[]',0)`),
    ).rejects.toThrow(/Account not allowed/);
    await pg.exec("reset role");
  });
  it("deduplicates events and detects stale offline edits", async () => {
    await pg.exec(`set test.uid='${owner}';set role authenticated;`);
    const records = [
      {
        id: "one",
        kind: "word",
        baseVersion: 0,
        opId: "one:1",
        payload: { thai: "งาน" },
        deleted: false,
      },
    ];
    const events = [
      {
        id: "e1",
        itemId: "one",
        kind: "word",
        at: 1000,
        result: "correct",
        assisted: false,
        mode: "quiz",
        deviceId: "d",
      },
    ];
    const first = await pg.query<{ reply: any }>(
      "select public.sync_learning($1::jsonb,$2::jsonb,0) as reply",
      [JSON.stringify(records), JSON.stringify(events)],
    );
    expect(first.rows[0].reply.acks).toEqual([{ id: "one", version: 1 }]);
    expect(first.rows[0].reply.changes).toHaveLength(2);
    const repeat = await pg.query<{ reply: any }>(
      "select public.sync_learning($1::jsonb,$2::jsonb,2) as reply",
      [JSON.stringify(records), JSON.stringify(events)],
    );
    expect(repeat.rows[0].reply.changes).toHaveLength(0);
    const conflict = await pg.query<{ reply: any }>(
      "select public.sync_learning($1::jsonb,'[]',2) as reply",
      [JSON.stringify([{ ...records[0], opId: "one:2" }])],
    );
    expect(conflict.rows[0].reply.conflicts).toHaveLength(1);
    await pg.exec("reset role");
  });
  it("forbids direct writes and does not expose another user records", async () => {
    await pg.exec(`set test.uid='${owner}';set role authenticated;`);
    await expect(pg.exec(`delete from public.learning_events`)).rejects.toThrow(
      /permission denied/,
    );
    await pg.exec(`reset role;set test.uid='${other}';set role authenticated;`);
    expect(
      (await pg.query("select * from public.learning_records")).rows,
    ).toHaveLength(0);
    await pg.exec("reset role");
  });
  it("enforces daily generation quota on the server", async () => {
    await pg.exec(`set test.uid='${owner}';set role authenticated;`);
    for (let i = 0; i < 20; i++) {
      const request = `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`;
      await pg.query("select public.reserve_generation($1::uuid)", [request]);
      await pg.exec("reset role");
      await pg.exec(
        `update public.generation_requests set status='complete';set role authenticated;`,
      );
    }
    await expect(
      pg.query(
        `select public.reserve_generation('00000000-0000-4000-9000-999999999999')`,
      ),
    ).rejects.toThrow(/quota/);
    await pg.exec("reset role");
  });
  it("allows recovery after a crashed generation lease expires", async () => {
    await pg.exec(
      `delete from public.generation_usage;insert into public.generation_requests values('${owner}','00000000-0000-4000-9000-888888888888','pending',null);set test.uid='${owner}';`,
    );
    await pg.exec(
      `update public.generation_requests set created_at=now()-interval '10 minutes' where request_id='00000000-0000-4000-9000-888888888888';set role authenticated;`,
    );
    const r = await pg.query<{ reply: any }>(
      `select public.reserve_generation('00000000-0000-4000-9000-777777777777') as reply`,
    );
    expect(r.rows[0].reply.status).toBe("new");
    await pg.exec("reset role");
  });
});
