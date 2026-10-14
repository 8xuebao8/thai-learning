import { z } from "zod";
export const themeIdSchema = z
  .string()
  .regex(/^(work|campus|life|personal|custom:[a-zA-Z0-9_-]{1,64})$/);
export const themeSchema = z
  .object({
    id: themeIdSchema,
    name: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .transform((s) => s.normalize("NFC")),
    redirectTo: themeIdSchema.optional(),
  })
  .strict();
export type Topic = z.infer<typeof themeSchema>;
export const defaultCatalog: Topic[] = [
  { id: "work", name: "工作与商务" },
  { id: "campus", name: "大学与课堂" },
  { id: "life", name: "生活办事" },
  { id: "personal", name: "我的词库" },
];
export function resolveTheme(
  id: string,
  catalog: Topic[] = defaultCatalog,
): string {
  const seen = new Set<string>();
  while (!seen.has(id)) {
    seen.add(id);
    const t = catalog.find((t) => t.id === id);
    if (!t) return "personal";
    if (!t.redirectTo) return id;
    id = t.redirectTo;
  }
  return "personal";
}
export const activeThemes = (catalog: Topic[] = defaultCatalog) =>
  catalog.filter((t) => !t.redirectTo);
export const topicName = (id: string, catalog: Topic[] = defaultCatalog) =>
  catalog.find((t) => t.id === resolveTheme(id, catalog))?.name ?? "我的词库";
export const catalogSchema = z
  .array(themeSchema)
  .min(4)
  .max(200)
  .superRefine((ts, ctx) => {
    const fail = () =>
      ctx.addIssue({
        code: "custom",
        message: "主题目录有重复名称、缺少默认主题或无效迁移目标。",
      });
    if (
      new Set(ts.map((t) => t.id)).size !== ts.length ||
      new Set(activeThemes(ts).map((t) => t.name.toLocaleLowerCase())).size !==
        activeThemes(ts).length
    )
      fail();
    if (
      defaultCatalog.some((t) => !ts.some((x) => x.id === t.id)) ||
      ts.find((t) => t.id === "personal")?.redirectTo
    )
      fail();
    for (const t of ts) {
      let current: Topic | undefined = t;
      const seen = new Set<string>();
      while (current?.redirectTo) {
        if (seen.has(current.id)) {
          fail();
          break;
        }
        seen.add(current.id);
        current = ts.find((x) => x.id === current!.redirectTo);
        if (!current) {
          fail();
          break;
        }
      }
    }
  });

// Preserve the legacy catalog as the initial value for each independent library.
export function catalogFor(
  settings: { themes?: Topic[]; sentenceThemes?: Topic[] },
  scope: "words" | "sentences" | "all" = "words",
): Topic[] {
  return scope === "sentences"
    ? (settings.sentenceThemes ?? settings.themes ?? defaultCatalog)
    : (settings.themes ?? defaultCatalog);
}
export function replaceCatalog<
  T extends { themes?: Topic[]; sentenceThemes?: Topic[] },
>(settings: T, scope: "words" | "sentences" | "all", catalog: Topic[]): T {
  return {
    ...settings,
    themes: structuredClone(
      scope === "sentences" ? catalogFor(settings, "words") : catalog,
    ),
    sentenceThemes: structuredClone(
      scope === "sentences" ? catalog : catalogFor(settings, "sentences"),
    ),
  };
}
