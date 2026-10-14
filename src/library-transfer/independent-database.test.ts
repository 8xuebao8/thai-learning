import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { defaultCatalog } from "../domain/themes";

it("isolates catalogs, fences old clients, and preserves import authorization and receipts", async () => {
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
      "202610140006_independent_themes.sql",
    ]) {
      const path = "supabase/migrations/" + name;
      await pg.exec(readFileSync(path, "utf8"));
    }
    await pg.exec(
      `insert into public.allowed_users values('${uid}');set test.uid='${uid}';set role authenticated;`,
    );
    const words = [...defaultCatalog, { id: "custom:word", name: "词主题" }];
    const sentences = [
      ...defaultCatalog,
      { id: "custom:sentence", name: "句主题" },
    ];
    const settings = {
      goal: 10,
      display: "both",
      timezone: "Asia/Bangkok",
      themes: words,
      sentenceThemes: defaultCatalog,
    };
    const rec = (payload: any, baseVersion = 0) => [
      {
        id: "settings",
        kind: "settings",
        opId: "settings-" + baseVersion,
        baseVersion,
        payload,
      },
    ];
    const call = async (
      records: any,
      seq = 0,
      req = "first",
      scope = "words",
      epoch = 0,
    ) =>
      (
        await pg.query<{ r: any }>(
          "select public.import_learning_changes_v3($1,$2,$3,$4::jsonb,$5) r",
          [epoch, seq, req, JSON.stringify(records), scope],
        )
      ).rows[0].r;
    expect((await call(rec(settings))).status).toBe("applied");
    expect((await call(rec(settings))).status).toBe("applied");
    await expect(call(rec(settings), 0, "first", "sentences")).rejects.toThrow(
      "Request content changed",
    );
    expect((await call(rec(settings), 0, "stale")).status).toBe("conflict");
    await expect(
      call(rec({ ...settings, sentenceThemes: sentences }, 1), 1, "cross"),
    ).rejects.toThrow("Unrelated theme catalog");
    await expect(
      call(rec({ ...settings, goal: 20 }, 1), 1, "goal"),
    ).rejects.toThrow("Only theme catalogs");
    expect(
      (
        await call(
          rec({ ...settings, sentenceThemes: sentences }, 0),
          1,
          "cas",
          "sentences",
        )
      ).status,
    ).toBe("conflict");
    expect(
      (
        await call(
          rec({ ...settings, sentenceThemes: sentences }, 1),
          1,
          "sentences",
          "sentences",
        )
      ).status,
    ).toBe("applied");
    await expect(
      pg.query("select public.import_learning_changes_v2(0,2,$1,$2::jsonb)", [
        "old-import",
        JSON.stringify(rec({ ...settings, themes: defaultCatalog }, 2)),
      ]),
    ).rejects.toThrow("Theme changes require");
    const sync = async (payload: any) =>
      pg.query("select public.sync_learning_v2($1::jsonb,'[]',2,0)", [
        JSON.stringify(rec(payload, 2)),
      ]);
    await expect(
      sync({
        goal: 10,
        display: "thai",
        timezone: "Asia/Bangkok",
        themes: defaultCatalog,
      }),
    ).rejects.toThrow("Theme changes require");
    await sync({
      goal: 10,
      display: "thai",
      timezone: "Asia/Bangkok",
      themes: words,
    });
    const saved = (
      await pg.query<{ payload: any }>(
        "select payload from public.learning_records where id='settings'",
      )
    ).rows[0].payload;
    expect(saved).toEqual({
      ...settings,
      display: "thai",
      sentenceThemes: sentences,
    });
    const minimal = [
      {
        id: "minimal",
        kind: "word",
        opId: "m",
        baseVersion: 0,
        payload: { thai: "งาน" },
      },
    ];
    expect((await call(minimal, 3, "minimal")).status).toBe("applied");
    // A stale device must receive the newer catalogs without blocking its events.
    await expect(
      pg.query("select public.sync_learning_v2($1::jsonb,'[]',0,0)", [
        JSON.stringify([
          { ...rec(saved, 3)[0], opId: "first-duplicate" },
          {
            ...rec({ ...saved, themes: defaultCatalog }, 4)[0],
            opId: "second-duplicate",
          },
        ]),
      ]),
    ).rejects.toThrow("Repeated settings record");
    const staleSettings = rec(
      { ...settings, goal: 20, themes: defaultCatalog },
      0,
    );
    staleSettings[0].opId = "stale-device";
    const event = {
      id: "stale-event",
      itemId: "minimal",
      kind: "word",
      result: "correct",
      at: 1,
      assisted: false,
    };
    const staleReply = (
      await pg.query<{ r: any }>(
        "select public.sync_learning_v2($1::jsonb,$2::jsonb,0,0) r",
        [JSON.stringify(staleSettings), JSON.stringify([event])],
      )
    ).rows[0].r;
    expect(staleReply.conflicts).toHaveLength(1);
    expect(staleReply.conflicts[0].payload).toEqual(saved);
    expect(staleReply.eventAcks).toContain("stale-event");
    expect(
      staleReply.changes.some(
        (change: any) =>
          change.id === "settings" &&
          change.payload.sentenceThemes.length === sentences.length,
      ),
    ).toBe(true);
    const staleDelete = {
      ...staleSettings[0],
      opId: "stale-delete",
      deleted: true,
    };
    expect(
      (
        await pg.query<{ r: any }>(
          "select public.sync_learning_v2($1::jsonb,'[]',0,0) r",
          [JSON.stringify([staleDelete])],
        )
      ).rows[0].r.conflicts,
    ).toHaveLength(1);
    await expect(
      pg.query("select public.sync_learning_v2($1::jsonb,'[]',0,0)", [
        JSON.stringify([{ ...staleDelete, baseVersion: 3 }]),
      ]),
    ).rejects.toThrow("Theme changes require");
    expect(
      (
        await pg.query<{ payload: any }>(
          "select payload from public.learning_records where id='settings'",
        )
      ).rows[0].payload,
    ).toEqual(saved);
    expect((await call(minimal, 4, "reset", "words", 1)).status).toBe(
      "account_reset",
    );
    await pg.exec("set test.uid='00000000-0000-4000-8000-000000000099'");
    await expect(call(minimal, 4, "forbidden")).rejects.toThrow(
      "Account not allowed",
    );
    await pg.exec("set role anon");
    await expect(call(minimal)).rejects.toThrow();
  } finally {
    await pg.close();
  }
}, 20000);

it("replays pre-upgrade v2 receipts and retains custom IDs in each catalog", async () => {
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
    const oldCatalog = [
      ...defaultCatalog,
      { id: "custom:old", name: "原主题" },
    ];
    const base = { goal: 10, display: "both", timezone: "Asia/Bangkok" };
    const rec = (payload: any, version = 0) =>
      JSON.stringify([
        {
          id: "settings",
          kind: "settings",
          baseVersion: version,
          opId: "s" + version,
          payload,
        },
      ]);
    const legacy = rec({ ...base, themes: oldCatalog });
    const v2 = async (records = legacy, seq = 0, request = "old") =>
      (
        await pg.query<{ r: any }>(
          "select public.import_learning_changes_v2(0,$1,$2,$3::jsonb) r",
          [seq, request, records],
        )
      ).rows[0].r;
    expect((await v2()).status).toBe("applied");
    await pg.exec("reset role");
    await pg.exec(
      readFileSync(
        "supabase/migrations/202610140006_independent_themes.sql",
        "utf8",
      ),
    );
    await pg.exec("set role authenticated");
    expect((await v2()).status).toBe("applied");
    const v3 = async (payload: any, request: string) =>
      (
        await pg.query<{ r: any }>(
          "select public.import_learning_changes_v3(0,1,$1,$2::jsonb,'sentences') r",
          [request, rec(payload, 1)],
        )
      ).rows[0].r;
    await expect(
      v3(
        { ...base, themes: oldCatalog, sentenceThemes: defaultCatalog },
        "removed",
      ),
    ).rejects.toThrow("Deleted themes require redirects");
    await expect(
      v3(
        {
          ...base,
          themes: oldCatalog,
          sentenceThemes: [
            ...oldCatalog,
            { id: "custom:duplicate", name: "原主题" },
          ],
        },
        "duplicate",
      ),
    ).rejects.toThrow("Duplicate theme name");
    await expect(
      v3(
        {
          ...base,
          themes: oldCatalog,
          sentenceThemes: oldCatalog.map((t) =>
            t.id === "custom:old" ? { ...t, redirectTo: "custom:missing" } : t,
          ),
        },
        "missing",
      ),
    ).rejects.toThrow("Missing redirect target");
    const sentences = oldCatalog.map((t) =>
      t.id === "custom:old" ? { ...t, redirectTo: "personal" } : t,
    );
    expect(
      (
        await v3(
          { ...base, themes: oldCatalog, sentenceThemes: sentences },
          "redirect",
        )
      ).status,
    ).toBe("applied");
    const words = JSON.stringify([
      {
        id: "word",
        kind: "word",
        baseVersion: 0,
        opId: "word",
        payload: { thai: "งาน" },
      },
    ]);
    expect((await v2(words, 2, "word")).status).toBe("applied");
    expect((await v2(words, 2, "word")).status).toBe("applied");
    await expect(
      pg.query(
        "select public.import_learning_changes_v3(0,3,'bad','[]','all')",
      ),
    ).rejects.toThrow("Invalid theme scope");
  } finally {
    await pg.close();
  }
}, 20000);
