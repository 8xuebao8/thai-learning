import { it, expect } from "vitest";
import { courseWords } from "../content/course";
import { defaultCatalog } from "../domain/themes";
import { packageSchema, previewPackage } from "./contract";
const snapshot = {
  id: "snapshot",
  epoch: 0,
  words: [{ ...courseWords[0], version: 0 }],
  themes: defaultCatalog,
};
const preview = (operations: unknown[], catalog = defaultCatalog) =>
  previewPackage(
    packageSchema.parse({
      format: "thai-library-changes",
      version: 1,
      snapshotId: snapshot.id,
      operations,
    }),
    snapshot,
    snapshot.words,
    "scope",
    catalog,
  );
it("creates a topic and moves a word without modifying content or learning identity", () => {
  const rows = preview([
    { action: "theme_add", id: "custom:travel", name: "旅游" },
    {
      action: "move",
      id: courseWords[0].id,
      expectedVersion: 0,
      theme: "custom:travel",
    },
  ]);
  expect(rows.map((r) => r.status)).toEqual(["ready", "ready"]);
  expect(rows[1].after).toMatchObject({
    id: courseWords[0].id,
    theme: "custom:travel",
    source: courseWords[0].source,
    review: courseWords[0].review,
  });
});
it("deletion previews affected words; broken targets and stale catalogs block", () => {
  const rows = preview([
    { action: "theme_delete", id: "work", moveTo: "personal" },
  ]);
  expect(rows[0].moved?.some((w) => w.id === courseWords[0].id)).toBe(true);
  expect(
    preview([{ action: "theme_delete", id: "personal", moveTo: "work" }])[0]
      .status,
  ).toBe("invalid");
  expect(
    preview([
      { action: "theme_delete", id: "work", moveTo: "custom:missing" },
    ])[0].status,
  ).toBe("invalid");
  expect(
    preview(
      [{ action: "theme_rename", id: "work", name: "职场" }],
      defaultCatalog.map((t) => (t.id === "life" ? { ...t, name: "日常" } : t)),
    )[0].status,
  ).toBe("conflict");
});
it("rejects nonexistent and deleted targets for word changes", () => {
  expect(
    preview([
      { action: "add", data: { thai: "ใหม่", theme: "custom:missing" } },
    ])[0].status,
  ).toBe("invalid");
  expect(
    preview([
      { action: "theme_delete", id: "work", moveTo: "personal" },
      {
        action: "move",
        id: courseWords[0].id,
        expectedVersion: 0,
        theme: "work",
      },
    ])[1].status,
  ).toBe("invalid");
});
it("deletion preview respects explicit moves in the same package", () => {
  const rows = preview([
    { action: "theme_delete", id: "work", moveTo: "personal" },
    {
      action: "move",
      id: courseWords[0].id,
      expectedVersion: 0,
      theme: "life",
    },
  ]);
  expect(
    rows[0].moved?.find((w) => w.id === courseWords[0].id)?.destination,
  ).toBe("生活办事");
});
it("a new topic may be referenced by a new word in the same batch", () => {
  const rows = preview([
    { action: "theme_add", id: "custom:travel", name: "旅游" },
    { action: "add", data: { thai: "ใหม่", theme: "custom:travel" } },
  ]);
  expect(rows.map((r) => r.status)).toEqual(["ready", "ready"]);
  expect(rows[1].after?.theme).toBe("custom:travel");
});
