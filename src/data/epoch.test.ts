import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { adoptEpoch, saveWord, saveSettings, setMeta, loadData } from "./store";
import { applyChanges } from "../services/sync";
import { courseWords } from "../content/course";
import { defaultSettings } from "../domain/model";
it("a late device response or stale form cannot restore cleared account data", async () => {
  await setMeta("epoch-test:epoch", 0);
  await saveWord("epoch-test", courseWords[0], 0);
  await adoptEpoch("epoch-test", 0, 1);
  await expect(saveWord("epoch-test", courseWords[0], 0)).rejects.toThrow(
    /初始化/,
  );
  await expect(saveSettings("epoch-test", defaultSettings, 0)).rejects.toThrow(
    /初始化/,
  );
  await applyChanges(
    "epoch-test",
    [
      {
        seq: 1,
        id: courseWords[0].id,
        kind: "word",
        payload: courseWords[0],
        version: 1,
        deleted: false,
      },
    ],
    1,
    0,
  );
  expect((await loadData("epoch-test")).words).toHaveLength(0);
  await saveWord("epoch-test", courseWords[1], 1);
  expect(await adoptEpoch("epoch-test", 0, 1)).toBe(false);
  expect((await loadData("epoch-test")).words).toHaveLength(1);
});
