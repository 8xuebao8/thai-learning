import "fake-indexeddb/auto";
import { it, expect, vi, afterEach } from "vitest";
const session = vi.hoisted(() => ({ id: "import-user" }));
vi.mock("../services/cloud", () => ({
  cloud: {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: session.id }, access_token: "test" } },
      }),
    },
  },
  syncAccount: async () => {},
  withAccountLock: async (
    _a: string,
    task: (sync: () => Promise<void>) => Promise<unknown>,
  ) => task(async () => {}),
}));
import { clearAccount, setMeta, db } from "../data/store";
import { copyLibrary, prepareImport, confirmImport } from "./service";
afterEach(() => vi.unstubAllGlobals());
it("recovers a committed import after a lost response without writing twice", async () => {
  const a = "import-user";
  await clearAccount(a);
  await setMeta(`${a}:epoch`, 0);
  await setMeta(`${a}:cursor`, 0);
  const { snapshot } = await copyLibrary(a);
  let receipt: any = null,
    writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("get_learning_import_receipt"))
        return new Response(JSON.stringify(receipt));
      const body = JSON.parse(init.body as string);
      writes++;
      receipt = {
        status: "applied",
        acks: body.p_records.map((r: any) => ({ id: r.id, version: 1 })),
      };
      for (const r of body.p_records)
        await db.words.put({
          ...r.payload,
          account: a,
          version: 1,
          dirty: false,
        });
      throw new Error("lost response");
    }),
  );
  const text = JSON.stringify({
    format: "thai-library-changes",
    version: 1,
    snapshotId: snapshot.id,
    operations: [{ action: "add", data: { thai: "หนึ่ง" } }],
  });
  const preview = await prepareImport(a, text);
  await expect(confirmImport(a, preview)).rejects.toThrow("lost response");
  const retry = await prepareImport(a, text);
  expect(retry.receipt?.applied).toBe(1);
  expect(writes).toBe(1);
  expect((await confirmImport(a, retry)).applied).toBe(1);
  expect(writes).toBe(1);
});

it("resumes a large theme-dependent import after a committed batch loses its response", async () => {
  const a = "import-user";
  await clearAccount(a);
  await setMeta(`${a}:epoch`, 0);
  const { snapshot } = await copyLibrary(a);
  const receipts = new Map<string, unknown>();
  const writes: any[] = [];
  let loseResponse = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (url.endsWith("get_learning_import_receipt"))
        return new Response(
          JSON.stringify(receipts.get(body.p_request) ?? null),
        );
      writes.push(body);
      const receipt = {
        status: "applied",
        acks: body.p_records.map((r: any) => ({
          id: r.id,
          version: r.baseVersion + 1,
        })),
      };
      receipts.set(body.p_request, receipt);
      for (const r of body.p_records) {
        if (r.kind === "settings")
          await db.configs.put({
            account: a,
            settings: r.payload,
            version: 1,
            dirty: false,
          });
        else
          await db.words.put({
            ...r.payload,
            account: a,
            version: r.baseVersion + 1,
            dirty: false,
          });
      }
      await setMeta(`${a}:cursor`, writes.length);
      if (writes.length === 2 && loseResponse) {
        loseResponse = false;
        throw new Error("lost bulk response");
      }
      return new Response(JSON.stringify(receipt));
    }),
  );
  const text = JSON.stringify({
    format: "thai-library-changes",
    version: 1,
    snapshotId: snapshot.id,
    operations: [
      { action: "theme_add", id: "custom:bulk", name: "批量测试" },
      ...Array.from({ length: 205 }, (_, i) => ({
        action: "add",
        data: { thai: `คำทดสอบ${i}`, theme: "custom:bulk" },
      })),
    ],
  });
  const preview = await prepareImport(a, text);
  expect(preview.rows.every((r) => r.status === "ready")).toBe(true);
  await expect(confirmImport(a, preview)).rejects.toThrow("lost bulk response");
  const { pendingImport } = await import("./service");
  expect((await pendingImport(a))?.request).toBe(preview.request);
  const retry = await prepareImport(a, text);
  expect(retry.rows).toEqual(preview.rows);
  const receipt = await confirmImport(a, retry);
  expect(receipt.applied).toBe(206);
  expect(writes.map((b) => b.p_records.length)).toEqual([1, 100, 100, 5]);
  expect(writes[0].p_records[0].kind).toBe("settings");
  expect(new Set(writes.map((b) => b.p_request)).size).toBe(4);
  expect(await pendingImport(a)).toBeNull();
  expect((await confirmImport(a, await prepareImport(a, text))).applied).toBe(
    206,
  );
  expect(writes.length).toBe(4);
});

it("stops a resumed update when another device has taken its target Thai", async () => {
  const a = "import-user";
  await clearAccount(a);
  await setMeta(`${a}:epoch`, 0);
  const { snapshot } = await copyLibrary(a);
  const original = snapshot.words[0];
  const receipts = new Map<string, unknown>();
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      if (url.endsWith("get_learning_import_receipt"))
        return new Response(
          JSON.stringify(receipts.get(body.p_request) ?? null),
        );
      writes++;
      const result = {
        status: "applied",
        acks: body.p_records.map((r: any) => ({ id: r.id, version: 1 })),
      };
      receipts.set(body.p_request, result);
      for (const r of body.p_records)
        await db.words.put({
          ...r.payload,
          account: a,
          version: 1,
          dirty: false,
        });
      throw new Error("pause");
    }),
  );
  const text = JSON.stringify({
    format: "thai-library-changes",
    version: 1,
    snapshotId: snapshot.id,
    operations: [
      ...Array.from({ length: 100 }, (_, i) => ({
        action: "add",
        data: { thai: `คำใหม่${i}` },
      })),
      {
        action: "update",
        id: original.id,
        expectedVersion: 0,
        changes: { thai: "คำซ้ำภายนอก" },
      },
    ],
  });
  const p = await prepareImport(a, text);
  await expect(confirmImport(a, p)).rejects.toThrow("pause");
  await db.words.put({
    ...original,
    id: "external-word",
    thai: "คำซ้ำภายนอก",
    account: a,
    version: 1,
    dirty: false,
  });
  await expect(confirmImport(a, await prepareImport(a, text))).rejects.toThrow(
    "已存在",
  );
  expect(writes).toBe(1);
});

it("splits by UTF-8 payload size even below one hundred words", async () => {
  const a = "import-user";
  await clearAccount(a);
  await setMeta(`${a}:epoch`, 0);
  const { snapshot } = await copyLibrary(a);
  const sizes: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("get_learning_import_receipt"))
        return new Response("null");
      const body = JSON.parse(init.body as string);
      sizes.push(
        new TextEncoder().encode(JSON.stringify(body.p_records)).length,
      );
      for (const r of body.p_records)
        await db.words.put({
          ...r.payload,
          account: a,
          version: 1,
          dirty: false,
        });
      return new Response(
        JSON.stringify({
          status: "applied",
          acks: body.p_records.map((r: any) => ({ id: r.id, version: 1 })),
        }),
      );
    }),
  );
  const p = await prepareImport(
    a,
    JSON.stringify({
      format: "thai-library-changes",
      version: 1,
      snapshotId: snapshot.id,
      operations: Array.from({ length: 80 }, (_, i) => ({
        action: "add",
        data: { thai: `ยาว${i}`, note: "ก".repeat(1900) },
      })),
    }),
  );
  expect((await confirmImport(a, p)).applied).toBe(80);
  expect(sizes.length).toBeGreaterThan(1);
  expect(sizes.every((n) => n <= 350000)).toBe(true);
});
