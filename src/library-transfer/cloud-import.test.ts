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
