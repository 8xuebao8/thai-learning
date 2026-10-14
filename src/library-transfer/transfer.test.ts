import { describe, it, expect } from "vitest";
import { courseWords } from "../content/course";
import { parsePackage, previewPackage, exportPrompt } from "./contract";
const snapshot = { id: "test-snapshot", epoch: 0, words: [courseWords[0]] };
const pack = (operations: unknown[]) => ({
  format: "thai-library-changes",
  version: 1,
  snapshotId: snapshot.id,
  operations,
});
describe("AI changes", () => {
  it("exports workflow and complete library without account credentials", () => {
    const out = exportPrompt(snapshot);
    expect(out).toContain("test-snapshot");
    expect(out).toContain(courseWords[0].thai);
    expect(out).toContain("delete");
    expect(out).toContain("sentence");
  });
  it("previews additions, preserves originals and skips duplicate Thai", () => {
    const p = parsePackage(
      JSON.stringify(
        pack([
          { action: "add", data: { thai: " ใหม่ " } },
          { action: "add", data: { thai: courseWords[0].thai } },
        ]),
      ),
    );
    const rows = previewPackage(p, snapshot, snapshot.words);
    expect(rows[0].after?.enrichment).toBe("pending");
    expect(rows[1].status).toBe("skip");
    expect(snapshot.words).toHaveLength(1);
  });
  it("rejects unknown commands and protected fields", () => {
    expect(() =>
      parsePackage(JSON.stringify(pack([{ action: "reset" }]))),
    ).toThrow();
    expect(() =>
      parsePackage(
        JSON.stringify(
          pack([{ action: "add", data: { thai: "x", review: "reviewed" } }]),
        ),
      ),
    ).toThrow();
  });
  it("marks stale edits as conflicts, never changes a stale record", () => {
    const p = parsePackage(
      JSON.stringify(
        pack([
          {
            action: "delete",
            id: courseWords[0].id,
            expectedVersion: courseWords[0].version,
          },
        ]),
      ),
    );
    const rows = previewPackage(p, snapshot, [
      { ...courseWords[0], chinese: "新内容" },
    ]);
    expect(rows[0].status).toBe("conflict");
    expect(rows[0].after).toBeUndefined();
  });
  it("validates sentence alignment and preserves identity for updates", () => {
    const p = parsePackage(
      JSON.stringify(
        pack([
          {
            action: "add",
            data: {
              thai: "กข",
              roman: "a b",
              chinese: "示例",
              sentence: {
                tokens: [
                  { thai: "ก", roman: "a" },
                  { thai: "ค", roman: "b" },
                ],
                alternatives: [],
                explanation: "",
              },
            },
          },
        ]),
      ),
    );
    expect(previewPackage(p, snapshot, snapshot.words)[0].status).toBe(
      "invalid",
    );
    const u = parsePackage(
      JSON.stringify(
        pack([
          {
            action: "update",
            id: courseWords[0].id,
            expectedVersion: courseWords[0].version,
            changes: { chinese: "会议" },
          },
        ]),
      ),
    );
    expect(previewPackage(u, snapshot, snapshot.words)[0].after).toMatchObject({
      id: courseWords[0].id,
      chinese: "会议",
      review: "draft",
    });
  });
  it("rejects multiple commands on one ID and restores soft-deleted words", () => {
    const d = { ...courseWords[0], deleted: true };
    const s = { ...snapshot, words: [d] };
    const p = parsePackage(
      JSON.stringify(
        pack([{ action: "restore", id: d.id, expectedVersion: d.version }]),
      ),
    );
    expect(previewPackage(p, s, [d])[0].after?.deleted).toBe(false);
    const twice = parsePackage(
      JSON.stringify(
        pack([
          { action: "delete", id: d.id, expectedVersion: d.version },
          { action: "restore", id: d.id, expectedVersion: d.version },
        ]),
      ),
    );
    expect(
      previewPackage(twice, s, [d]).every((r) => r.status === "invalid"),
    ).toBe(true);
  });
});
it("guides direct complete generation in small paste-ready batches", () => {
  const out = exportPrompt(snapshot);
  expect(out).toContain("同一条回复一次生成全部请求内容");
  expect(out).toContain("每包最多100项操作");
  expect(out).not.toContain("每批默认20个");
  expect(out).not.toContain("每条回复只给一个");
  expect(out).toContain("输出格式");
  expect(out).toContain("不能只给下载链接");
  expect(out).toContain("待核实清单");
  expect(out).not.toContain("不确定读音或含义留空");
  expect(out).toContain("不能把字段齐全说成内容完整");
});
