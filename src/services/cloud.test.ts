import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
import { db, saveWord } from "../data/store";
const fake = vi.hoisted(() => ({ user: "account-a", calls: 0 }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: fake.user },
            access_token: `token-${fake.user}`,
          },
        },
      }),
    },
    rpc: async () => {
      fake.calls++;
      fake.user = "account-b";
      return {
        data: {
          acks: [],
          eventAcks: [],
          changes: [],
          cursor: 0,
          more: true,
          conflicts: [],
        },
        error: null,
      };
    },
  }),
}));
it("stops synchronization when the session switches accounts during a request", async () => {
  let sentToken = "";
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    sentToken = (init.headers as Record<string, string>).Authorization;
    fake.calls++;
    fake.user = "account-b";
    return new Response(
      JSON.stringify({
        acks: [],
        eventAcks: [],
        changes: [],
        cursor: 0,
        more: true,
        conflicts: [],
      }),
    );
  });
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public");
  const { syncAccount } = await import("./cloud");
  await saveWord("account-a", {
    id: "private",
    thai: "งาน",
    roman: "ngaan¹",
    chinese: "私人内容",
    pos: "名词",
    theme: "personal",
    note: "",
    example: { thai: "", roman: "", chinese: "" },
    review: "confirmed",
    source: "个人",
    version: 0,
    dirty: true,
    updatedAt: 1,
  });
  await expect(syncAccount("account-a")).rejects.toThrow(/登录/);
  expect(fake.calls).toBe(1);
  expect(sentToken).toBe("Bearer token-account-a");
  expect((await db.words.get(["account-a", "private"]))?.dirty).toBe(true);
  expect(await db.words.get(["account-b", "private"])).toBeUndefined();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
