import { resolveTheme, topicName, catalogFor } from "../domain/themes";
import { exercises, personalExercises } from "../content/course";
import { deriveProgress, streak } from "../domain/learning";
import type { LearningEvent, Settings, Word } from "../domain/model";

/** Read-only context; never accepted as an import operation. */
export function learningContext(
  words: Word[],
  events: LearningEvent[],
  settings: Settings,
  now = Date.now(),
) {
  const history = [...new Map(events.map((e) => [e.id, e])).values()].sort(
    (a, b) => a.at - b.at || a.id.localeCompare(b.id),
  );
  const practice = history.filter(
    (e) => !["known", "restore"].includes(e.mode),
  );
  const correct = practice.filter((e) => e.result === "correct").length;
  const activeWords = words.filter((w) => !w.deleted);
  return {
    exportedAt: new Date(now).toISOString(),
    timezone: "Asia/Bangkok",
    readOnly: true,
    legend: {
      status: {
        new: "尚未形成复习进度",
        learning: "学习中",
        familiar: "熟悉",
        mastered: "按应用复习规则已掌握",
        known: "用户标记我认识，跳过复习",
      },
      timestamps:
        "at、lastReview、nextReview 为 Unix 毫秒；null 表示无记录或未安排",
      counts:
        "练习次数和正确率排除我认识/恢复操作；正确率包含辅助答题，另列独立答对次数。连续天数沿用网页口径，包含我认识/恢复操作。词条数包含句子词条。",
      limitations:
        "无学习时长记录；历史仅保存题目、结果、模式和是否辅助，不保存用户具体错误答案。目标为个人规划，不代表 CU-TFL 官方认证。",
    },
    settings,
    summary: {
      activeWords: activeWords.length,
      practiceAttempts: practice.length,
      correct,
      wrong: practice.length - correct,
      accuracy: practice.length ? correct / practice.length : null,
      independentCorrect: practice.filter(
        (e) => e.result === "correct" && !e.assisted,
      ).length,
      streakDays: streak(history, now),
    },
    words: activeWords.map((w) => ({
      id: w.id,
      thai: w.thai,
      theme: resolveTheme(
        w.theme,
        catalogFor(settings, w.sentence ? "sentences" : "words"),
      ),
      themeName: topicName(
        w.theme,
        catalogFor(settings, w.sentence ? "sentences" : "words"),
      ),
      progress: deriveProgress(history, w.id, now),
    })),
    sentences: [...exercises, ...personalExercises(words)].map((e) => ({
      id: e.id,
      thai: e.thai,
      theme: resolveTheme(e.theme, catalogFor(settings, "sentences")),
      themeName: topicName(e.theme, catalogFor(settings, "sentences")),
      chinese: e.prompt,
      progress: deriveProgress(history, e.id, now),
    })),
    history: history.map(({ itemId, kind, at, result, assisted, mode }) => ({
      itemId,
      kind,
      at,
      result,
      assisted,
      mode,
    })),
  };
}
