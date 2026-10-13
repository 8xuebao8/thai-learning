import { expect, it } from "vitest";
import { settingsSchema, defaultSettings } from "./model";
it("preserves adjustable targets and named grammar mastery through sync parsing", () => {
  const longTerm = {
    level: "Superior",
    wordTarget: 5000,
    grammarTarget: 100,
    baselineWords: 200,
    grammar: [{ id: "g1", title: "条件句", mastered: true }],
    skills: ["Superior:listening"],
  };
  expect(
    (settingsSchema.parse({ ...defaultSettings, longTerm }) as any).longTerm,
  ).toEqual(longTerm);
  expect(
    settingsSchema.safeParse({
      ...defaultSettings,
      longTerm: { ...longTerm, wordTarget: 0 },
    }).success,
  ).toBe(false);
  expect(settingsSchema.parse(defaultSettings).goal).toBe(10);
});
