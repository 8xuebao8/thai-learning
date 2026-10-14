import { z } from "zod";
import { themeIdSchema, catalogSchema } from "./themes";
export const themes = ["work", "campus", "life", "personal"] as const;
export type Theme = string;
export const wordSchema = z
  .object({
    id: z.string().min(1).max(100),
    thai: z.string().trim().min(1).max(500),
    roman: z.string().trim().max(1000),
    chinese: z.string().trim().max(1000),
    theme: themeIdSchema,
    pos: z.string().max(100),
    note: z.string().max(2000),
    example: z.object({
      thai: z.string().max(1000),
      roman: z.string().max(2000),
      chinese: z.string().max(1000),
    }),
    source: z.string().max(1000),
    sentence: z
      .object({
        tokens: z
          .array(
            z.object({
              thai: z.string().trim().min(1).max(100),
              roman: z.string().trim().min(1).max(200),
            }),
          )
          .min(2)
          .max(20),
        alternatives: z
          .array(z.array(z.number().int().nonnegative()).max(20))
          .max(20),
        explanation: z.string().max(2000),
      })
      .superRefine((s, ctx) => {
        for (const a of s.alternatives)
          if (
            a.length !== s.tokens.length ||
            new Set(a).size !== a.length ||
            a.some((i) => i >= s.tokens.length)
          )
            ctx.addIssue({
              code: "custom",
              message: "替代答案必须使用每个词块一次。",
            });
      })
      .optional(),
    enrichment: z.enum(["pending", "ready"]).optional(),
    review: z.enum(["draft", "confirmed", "reviewed"]),
    version: z.number().int().nonnegative(),
    dirty: z.boolean(),
    deleted: z.boolean().optional(),
    updatedAt: z.number().nonnegative(),
  })
  .superRefine((w, ctx) => {
    if (w.enrichment !== "pending" && (!w.roman || !w.chinese))
      ctx.addIssue({ code: "custom", message: "可学习词条需要读音和含义" });
  });
export type Word = z.infer<typeof wordSchema>;
export const eventSchema = z.object({
  id: z.string().min(1).max(100),
  itemId: z.string().min(1).max(100),
  kind: z.enum(["word", "sentence"]),
  at: z.number().nonnegative().finite(),
  result: z.enum(["correct", "wrong"]),
  assisted: z.boolean(),
  mode: z.string().max(50),
  deviceId: z.string().max(100),
});
export type LearningEvent = z.infer<typeof eventSchema>;
export const longTermSchema = z.object({
  level: z.enum(["Superior", "Distinguished"]),
  wordTarget: z.number().int().min(1).max(100000),
  grammarTarget: z.number().int().min(1).max(5000),
  baselineWords: z.number().int().min(0).max(100000),
  grammar: z
    .array(
      z.object({
        id: z.string().max(100),
        title: z.string().trim().min(1).max(100),
        mastered: z.boolean(),
      }),
    )
    .max(500),
  skills: z.array(z.string().max(80)).max(20),
});
export type LongTermGoal = z.infer<typeof longTermSchema>;
export const settingsSchema = z.object({
  themes: catalogSchema.optional(),
  sentenceThemes: catalogSchema.optional(),
  goal: z.number().int().min(1).max(200),
  longTerm: longTermSchema.optional(),
  display: z.enum(["both", "roman", "thai"]),
  timezone: z.literal("Asia/Bangkok"),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = {
  goal: 10,
  display: "both",
  timezone: "Asia/Bangkok",
};
export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  words: z.array(wordSchema).max(10000),
  events: z.array(eventSchema).max(200000),
  settings: settingsSchema,
});
export type Backup = z.infer<typeof backupSchema>;
export type Tile = { id: string; token: string; thai: string; roman: string };
export type Exercise = {
  id: string;
  theme: Theme;
  prompt: string;
  thai: string;
  roman: string;
  tiles: Tile[];
  answers: string[][];
  explanation: string;
  review: "draft" | "reviewed";
};
export type Progress = {
  stage: number;
  status: "new" | "learning" | "familiar" | "mastered" | "known";
  correct: number;
  wrong: number;
  nextReview: number | null;
  due: boolean;
  lastReview: number | null;
};
