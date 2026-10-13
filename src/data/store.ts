import Dexie, { type Table } from "dexie";
import {
  backupSchema,
  defaultSettings,
  wordSchema,
  eventSchema,
  settingsSchema,
  type Word,
  type LearningEvent,
  type Settings,
  type Backup,
} from "../domain/model";
export type WordRow = Word & { account: string };
export type EventRow = LearningEvent & { account: string; pending: boolean };
export type ConfigRow = {
  account: string;
  settings: Settings;
  version: number;
  dirty: boolean;
};
type Meta = { key: string; value: unknown };
class LearningDB extends Dexie {
  words!: Table<WordRow, [string, string]>;
  events!: Table<EventRow, [string, string]>;
  configs!: Table<ConfigRow, string>;
  meta!: Table<Meta, string>;
  constructor() {
    super("thai-everyday");
    this.version(1).stores({
      words: "[account+id],account",
      events: "[account+id],account",
      configs: "account",
      meta: "key",
    });
  }
}
export const db = new LearningDB();
export type Data = {
  words: Word[];
  events: LearningEvent[];
  settings: Settings;
};
export async function loadData(account: string): Promise<Data> {
  const [words, events, config] = await Promise.all([
    db.words.where("account").equals(account).toArray(),
    db.events.where("account").equals(account).toArray(),
    db.configs.get(account),
  ]);
  return {
    words: words.map(({ account: _, ...w }) => w),
    events: events.map(({ account: _, pending: __, ...e }) => e),
    settings: config?.settings ?? defaultSettings,
  };
}
export async function saveEvent(
  account: string,
  event: LearningEvent,
  continuation?: { key: string; value: unknown },
): Promise<void> {
  const e = eventSchema.parse(event);
  await db.transaction("rw", db.events, db.meta, async () => {
    if (!(await db.events.get([account, e.id])))
      await db.events.add({ ...e, account, pending: true });
    if (continuation) await db.meta.put(continuation);
  });
}
export async function saveWord(account: string, word: Word): Promise<void> {
  await db.words.put({
    ...wordSchema.parse(word),
    account,
    dirty: true,
    updatedAt: Date.now(),
  });
}
export async function saveSettings(
  account: string,
  settings: Settings,
): Promise<void> {
  const s = settingsSchema.parse(settings);
  await db.transaction("rw", db.configs, async () => {
    const c = await db.configs.get(account);
    await db.configs.put({
      account,
      settings: s,
      version: c?.version ?? 0,
      dirty: true,
    });
  });
}
export async function importBackup(
  account: string,
  input: unknown,
): Promise<void> {
  const b = backupSchema.parse(input);
  await db.transaction("rw", db.words, db.events, db.configs, async () => {
    for (const word of b.words) {
      const current = await db.words.get([account, word.id]);
      if (current) {
        if (
          JSON.stringify({
            ...current,
            account: undefined,
            dirty: undefined,
            version: undefined,
          }) !==
          JSON.stringify({ ...word, dirty: undefined, version: undefined })
        ) {
          await db.words.put({
            ...word,
            id: crypto.randomUUID(),
            source: `${word.source} · 导入副本`,
            account,
            version: 0,
            dirty: true,
            deleted: false,
          });
        }
      } else await db.words.put({ ...word, account, version: 0, dirty: true });
    }
    for (const e of b.events)
      if (!(await db.events.get([account, e.id])))
        await db.events.add({ ...e, account, pending: true });
    const c = await db.configs.get(account);
    await db.configs.put({
      account,
      settings: b.settings,
      version: c?.version ?? 0,
      dirty: true,
    });
  });
}
export async function exportBackup(account: string): Promise<Backup> {
  const data = await loadData(account);
  return { version: 1, exportedAt: new Date().toISOString(), ...data };
}
export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  return ((await db.meta.get(key))?.value as T) ?? fallback;
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}
export async function clearAccount(account: string) {
  await db.transaction(
    "rw",
    db.words,
    db.events,
    db.configs,
    db.meta,
    async () => {
      await db.words.where("account").equals(account).delete();
      await db.events.where("account").equals(account).delete();
      await db.configs.delete(account);
      await db.meta.where("key").startsWith(`${account}:`).delete();
    },
  );
}
export async function copyGuestTo(account: string) {
  const backup = await exportBackup("guest");
  await importBackup(account, backup);
}

// Only the same pending revision may accept an asynchronous model response.
export async function completePendingWord(
  account: string,
  id: string,
  thai: string,
  revision: number,
  draft: Pick<Word, "thai" | "roman" | "chinese" | "pos" | "note" | "example">,
): Promise<boolean> {
  return db.transaction("rw", db.words, async () => {
    const current = await db.words.get([account, id]);
    if (
      !current ||
      current.deleted ||
      current.enrichment !== "pending" ||
      current.thai !== thai ||
      current.updatedAt !== revision
    )
      return false;
    await db.words.put({
      ...wordSchema.parse({
        ...current,
        roman: draft.roman,
        chinese: draft.chinese,
        pos: draft.pos,
        note: draft.note,
        example: draft.example,
        thai,
        enrichment: "ready",
        review: "draft",
        source: "AI 自动补全 · 未经人工核对",
        updatedAt: Date.now(),
        dirty: true,
      }),
      account,
    });
    return true;
  });
}
