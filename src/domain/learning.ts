import type { LearningEvent, Progress, Tile } from "./model";
const day = 86400000;
const intervals = [1, 3, 7, 14, 30, 60];
export function deriveProgress(
  events: LearningEvent[],
  id: string,
  now = Date.now(),
): Progress {
  const unique = [
    ...new Map(
      events.filter((e) => e.itemId === id).map((e) => [e.id, e]),
    ).values(),
  ].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  let stage = -1,
    correct = 0,
    wrong = 0,
    nextReview: number | null = null,
    lastReview: number | null = null;
  for (const e of unique) {
    lastReview = e.at;
    if (e.result === "wrong") {
      wrong++;
      stage = 0;
      nextReview = e.at + day;
    } else {
      correct++;
      if (!e.assisted) {
        if (stage < 0) {
          stage = 0;
          nextReview = e.at + day;
        } else if (nextReview !== null && e.at >= nextReview) {
          stage = Math.min(5, stage + 1);
          nextReview = e.at + intervals[stage] * day;
        }
      }
    }
  }
  return {
    stage,
    status:
      stage < 0
        ? "new"
        : stage < 2
          ? "learning"
          : stage < 4
            ? "familiar"
            : "mastered",
    correct,
    wrong,
    nextReview,
    due: nextReview !== null && nextReview <= now,
    lastReview,
  };
}
export function checkAnswer(
  exercise: { tiles: Pick<Tile, "id" | "token">[]; answers: string[][] },
  ids: string[],
): boolean {
  if (new Set(ids).size !== ids.length) return false;
  const tokens = ids.map(
    (id) => exercise.tiles.find((t) => t.id === id)?.token,
  );
  if (tokens.some((t) => t === undefined)) return false;
  return exercise.answers.some(
    (answer) =>
      answer.length === tokens.length &&
      answer.every((t, i) => t === tokens[i]),
  );
}
export function mergeRecords<
  T extends { id: string; version: number; dirty: boolean; deleted?: boolean },
>(local: T[], remote: T[]): { records: T[]; conflicts: T[] } {
  const map = new Map(local.map((r) => [r.id, r]));
  const conflicts: T[] = [];
  for (const r of remote) {
    const l = map.get(r.id);
    if (l?.dirty && r.version > l.version) {
      conflicts.push(l);
      map.set(r.id, r);
    } else if (!l || (!l.dirty && r.version >= l.version)) map.set(r.id, r);
  }
  return { records: [...map.values()], conflicts };
}
export function shuffle<T>(values: T[]): T[] {
  const a = [...values];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function dateKey(at: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}
export function streak(events: LearningEvent[], now = Date.now()): number {
  const dates = new Set(events.map((e) => dateKey(e.at)));
  let count = 0,
    at = now;
  if (!dates.has(dateKey(at))) at -= day;
  while (dates.has(dateKey(at))) {
    count++;
    at -= day;
  }
  return count;
}
