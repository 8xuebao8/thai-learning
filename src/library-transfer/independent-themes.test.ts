import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
vi.mock("../services/cloud", () => ({
  cloud: null,
  syncAccount: vi.fn(),
  withAccountLock: vi.fn(),
}));
import { clearAccount, loadData, saveSettings } from "../data/store";
import { copyLibrary, prepareImport, confirmImport } from "./service";
import { defaultSettings } from "../domain/model";
import { defaultCatalog, catalogFor } from "../domain/themes";
it("freezes the previous shared catalog and changes only the selected library", async () => {
  await clearAccount("guest");
  await saveSettings("guest", {
    ...defaultSettings,
    themes: defaultCatalog.map((t) =>
      t.id === "work" ? { ...t, name: "旧工作" } : t,
    ),
  });
  const apply = async (scope: "words" | "sentences", operations: unknown[]) => {
    const { snapshot } = await copyLibrary("guest", scope);
    const p = await prepareImport(
      "guest",
      JSON.stringify({
        format:
          scope === "words" ? "thai-library-changes" : "thai-sentence-changes",
        version: 1,
        snapshotId: snapshot.id,
        operations,
      }),
      scope,
    );
    await confirmImport("guest", p);
    return p;
  };
  await apply("words", [
    { action: "theme_rename", id: "work", name: "词汇工作" },
  ]);
  let data = await loadData("guest");
  expect(catalogFor(data.settings, "words")[0].name).toBe("词汇工作");
  expect(catalogFor(data.settings, "sentences")[0].name).toBe("旧工作");
  const p = await apply("sentences", [
    { action: "theme_delete", id: "work", moveTo: "personal" },
  ]);
  expect(p.rows[0].moved?.every((w) => w.kind === "sentence")).toBe(true);
  data = await loadData("guest");
  expect(catalogFor(data.settings, "words")[0].redirectTo).toBeUndefined();
  expect(catalogFor(data.settings, "sentences")[0].redirectTo).toBe("personal");
});
