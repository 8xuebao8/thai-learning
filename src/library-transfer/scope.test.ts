import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
vi.mock("../services/cloud", () => ({
  cloud: null,
  syncAccount: vi.fn(),
  withAccountLock: vi.fn(),
}));
import { clearAccount, loadData, setMeta } from "../data/store";
import {
  copyLibrary,
  prepareImport,
  confirmImport,
  pendingImport,
} from "./service";
const sentence = {
  thai: "ฉันเรียน",
  roman: "chan rian",
  chinese: "我学习",
  theme: "personal",
  pos: "句子",
  note: "主语＋动词。",
  example: { thai: "ฉันเรียน", roman: "chan rian", chinese: "我学习" },
  sentence: {
    tokens: [
      { thai: "ฉัน", roman: "chan" },
      { thai: "เรียน", roman: "rian" },
    ],
    alternatives: [],
    explanation: "主语在动词之前",
  },
};
it("separates sentence exports, enforces complete exercises and rejects the wrong entry point", async () => {
  await clearAccount("guest");
  const { snapshot, text } = await copyLibrary("guest", "sentences");
  expect(text).toContain("thai-sentence-changes");
  expect(text).toContain("内置拼句（只读参考）");
  const pack = (data: unknown) =>
    JSON.stringify({
      format: "thai-sentence-changes",
      version: 1,
      snapshotId: snapshot.id,
      operations: [{ action: "add", data }],
    });
  await expect(prepareImport("guest", pack(sentence), "words")).rejects.toThrow(
    /入口/,
  );
  const invalid = await prepareImport(
    "guest",
    pack({ thai: "测试" }),
    "sentences",
  );
  expect(invalid.rows[0].status).toBe("invalid");
  await expect(confirmImport("guest", invalid)).rejects.toThrow();
  const valid = await prepareImport("guest", pack(sentence), "sentences");
  expect(valid.rows[0].status).toBe("ready");
  await confirmImport("guest", valid);
  const exported = await copyLibrary("guest", "sentences");
  expect(exported.text).toContain("ฉันเรียน");
  const context = JSON.parse(exported.text.split("学习上下文（只读）：\n")[1]);
  expect(context.words).toEqual([]);
  const words = await copyLibrary("guest", "words");
  const wordSnapshot = JSON.parse(
    words.text
      .split("词库快照（含已删除词供restore；不含登录信息）：\n")[1]
      .split("\n\n学习上下文（只读）：\n")[0],
  );
  expect(
    wordSnapshot.words.every((w: { sentence?: unknown }) => !w.sentence),
  ).toBe(true);
  const id = (await loadData("guest")).words[0].id;
  const wrong = await prepareImport(
    "guest",
    JSON.stringify({
      format: "thai-library-changes",
      version: 1,
      snapshotId: words.snapshot.id,
      operations: [{ action: "delete", id, expectedVersion: 1 }],
    }),
    "words",
  );
  expect(wrong.rows[0].status).toBe("invalid");
});

it("keeps pre-upgrade snapshots and confirmed jobs accessible from vocabulary", async () => {
  await clearAccount("guest");
  const { snapshot } = await copyLibrary("guest");
  delete snapshot.scope;
  await setMeta(`guest:ai-snapshot:${snapshot.id}`, snapshot);
  const p = await prepareImport(
    "guest",
    JSON.stringify({
      format: "thai-library-changes",
      version: 1,
      snapshotId: snapshot.id,
      operations: [{ action: "add", data: { thai: "เก่า" } }],
    }),
    "words",
  );
  expect(p.rows[0].status).toBe("ready");
  await setMeta("guest:ai-bulk-active", p.request);
  await setMeta(`guest:ai-bulk:${p.request}`, {
    prepared: p,
    batches: [],
    completed: 0,
  });
  expect((await pendingImport("guest", "words"))?.request).toBe(p.request);
  expect(await pendingImport("guest", "sentences")).toBeNull();
});
it("rejects incomplete new sentences and mixed vocabulary/sentence packages", async () => {
  await clearAccount("guest");
  const { snapshot } = await copyLibrary("guest", "sentences");
  const p = {
    format: "thai-sentence-changes",
    version: 1,
    snapshotId: snapshot.id,
    operations: [
      {
        action: "add",
        data: {
          ...sentence,
          note: "",
          example: { thai: "", roman: "", chinese: "" },
        },
      },
    ],
  };
  const result = await prepareImport("guest", JSON.stringify(p), "sentences");
  expect(result.rows[0].status).toBe("invalid");
  await expect(
    prepareImport(
      "guest",
      JSON.stringify([p, { ...p, format: "thai-library-changes" }]),
      "sentences",
    ),
  ).rejects.toThrow(/不能混合/);
});
