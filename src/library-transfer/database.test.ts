import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
it("applies confirmed batches atomically, fences stale previews and replays safely", async () => {
  const pg = new PGlite();
  const uid = "00000000-0000-4000-8000-000000000001";
  try {
    await pg.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;insert into auth.users values('${uid}');`,
    );
    for (const name of [
      "202610130001_learning.sql",
      "202610140001_cloud_reset.sql",
      "202610140004_library_import.sql",
      "202610140005_custom_themes.sql",
    ])
      await pg.exec(readFileSync("supabase/migrations/" + name, "utf8"));
    await pg.exec(
      `insert into public.allowed_users values('${uid}');set test.uid='${uid}';set role authenticated;`,
    );
    const records = JSON.stringify([
      {
        id: "a",
        kind: "word",
        baseVersion: 0,
        deleted: false,
        opId: "op1",
        payload: { thai: "งาน" },
      },
    ]);
    const call = (
      seq: number,
      epoch: number,
      req = "request-one",
      rs = records,
    ) =>
      pg.query<{ r: any }>(
        "select public.import_learning_changes($1,$2,$3,$4::jsonb) r",
        [epoch, seq, req, rs],
      );
    expect((await call(0, 0)).rows[0].r.acks).toHaveLength(1);
    expect((await call(0, 0)).rows[0].r.acks).toHaveLength(1);
    expect((await call(0, 0, "request-two")).rows[0].r.status).toBe("conflict");
    const mixed = JSON.stringify([
      {
        id: "b",
        kind: "word",
        baseVersion: 0,
        opId: "b",
        payload: { thai: "b" },
      },
      {
        id: "a",
        kind: "word",
        baseVersion: 0,
        opId: "a",
        payload: { thai: "a" },
      },
    ]);
    expect((await call(1, 0, "request-mixed", mixed)).rows[0].r.status).toBe(
      "conflict",
    );
    expect(
      (await pg.query("select * from public.learning_records")).rows,
    ).toHaveLength(1);
    const catalog = [
      { id: "work", name: "工作" },
      { id: "campus", name: "校园" },
      { id: "life", name: "生活" },
      { id: "personal", name: "我的词库" },
      { id: "custom:travel", name: "旅游" },
    ];
    const settings = {
      goal: 10,
      display: "both",
      timezone: "Asia/Bangkok",
      themes: catalog,
    };
    const themeRecords = JSON.stringify([
      {
        id: "settings",
        kind: "settings",
        baseVersion: 0,
        opId: "topics",
        payload: settings,
      },
    ]);
    const themesCall = (rs = themeRecords, seq = 1, req = "topics") =>
      pg.query<{ r: any }>(
        "select public.import_learning_changes_v2(0,$1,$2,$3::jsonb) r",
        [seq, req, rs],
      );
    expect((await themesCall()).rows[0].r.status).toBe("applied");
    expect((await themesCall()).rows[0].r.acks).toHaveLength(1);
    const forbidden = JSON.stringify([
      {
        id: "settings",
        kind: "settings",
        baseVersion: 1,
        opId: "forbidden",
        payload: { ...settings, goal: 20 },
      },
    ]);
    await expect(themesCall(forbidden, 2, "forbidden")).rejects.toThrow(
      "Only themes",
    );
    const malformed = JSON.stringify([
      {
        id: "settings",
        kind: "settings",
        baseVersion: 1,
        opId: "bad",
        payload: {
          ...settings,
          themes: [...catalog, { id: "custom:bad", name: "旅游" }],
        },
      },
    ]);
    await expect(themesCall(malformed, 2, "bad")).rejects.toThrow();
    const nullRedirect = JSON.stringify([
      {
        id: "settings",
        kind: "settings",
        baseVersion: 1,
        opId: "null",
        payload: {
          ...settings,
          themes: catalog.map((t) =>
            t.id === "work" ? { ...t, redirectTo: null } : t,
          ),
        },
      },
    ]);
    await expect(themesCall(nullRedirect, 2, "null")).rejects.toThrow();
    // Old cached clients must not silently erase the catalog when changing display settings.
    await pg.query("select public.sync_learning_v2($1::jsonb,'[]',2,0)", [
      JSON.stringify([
        {
          id: "settings",
          kind: "settings",
          baseVersion: 1,
          opId: "old-client",
          payload: { goal: 10, display: "thai", timezone: "Asia/Bangkok" },
        },
      ]),
    ]);
    expect(
      (
        await pg.query<{ payload: any }>(
          "select payload from public.learning_records where id='settings'",
        )
      ).rows[0].payload.themes,
    ).toEqual(catalog);
    await pg.query(
      "select public.reset_learning(0,'00000000-0000-4000-8000-000000000002')",
    );
    expect((await call(0, 0)).rows[0].r.status).toBe("account_reset");
    await pg.exec("set role anon");
    await expect(call(0, 1)).rejects.toThrow();
  } finally {
    await pg.close();
  }
}, 20000);
