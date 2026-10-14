import { it, expect } from "vitest";
import {
  catalogSchema,
  defaultCatalog,
  resolveTheme,
  activeThemes,
} from "./themes";
it("preserves defaults and resolves deleted theme chains", () => {
  const catalog = [
    ...defaultCatalog,
    { id: "custom:travel", name: "旅游", redirectTo: "personal" },
  ];
  expect(resolveTheme("custom:travel", catalog)).toBe("personal");
  expect(activeThemes(catalog).some((t) => t.id === "custom:travel")).toBe(
    false,
  );
  expect(catalogSchema.parse(catalog)).toHaveLength(5);
});
it("rejects duplicate names, broken redirects, cycles, and deleting fallback", () => {
  expect(() =>
    catalogSchema.parse([
      ...defaultCatalog,
      { id: "custom:x", name: defaultCatalog[0].name },
    ]),
  ).toThrow();
  expect(() =>
    catalogSchema.parse([
      ...defaultCatalog,
      { id: "custom:x", name: "x", redirectTo: "missing" },
    ]),
  ).toThrow();
  expect(() =>
    catalogSchema.parse([
      ...defaultCatalog,
      { id: "custom:x", name: "x", redirectTo: "custom:y" },
      { id: "custom:y", name: "y", redirectTo: "custom:x" },
    ]),
  ).toThrow();
  expect(() =>
    catalogSchema.parse(
      defaultCatalog.map((t) =>
        t.id === "personal" ? { ...t, redirectTo: "work" } : t,
      ),
    ),
  ).toThrow();
});
