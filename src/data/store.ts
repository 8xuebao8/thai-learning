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
  epoch?: number;
};
let guest: Data = { words: [], events: [], settings: defaultSettings };
const guestMeta = new Map<string, unknown>();
const guestListeners = new Set<() => void>();
export function watchGuest(listener: () => void) {
  guestListeners.add(listener);
  return () => {
    guestListeners.delete(listener);
  };
}
function guestChanged() {
  guestListeners.forEach((fn) => fn());
}
export async function getWord(account: string, id: string) {
  return account === "guest"
    ? guest.words.find((w) => w.id === id)
    : db.words.get([account, id]);
}
export async function checkEpoch(account: string, expected?: number) {
  if (
    account !== "guest" &&
    expected !== undefined &&
    (await getMeta(`${account}:epoch`, -1)) !== expected
  )
    throw new Error("账号数据已初始化，请在新页面继续。 ");
}
export async function loadData(account: string): Promise<Data> {
  if (account === "guest") return structuredClone(guest);
  const [words, events, config] = await Promise.all([
    db.words.where("account").equals(account).toArray(),
    db.events.where("account").equals(account).toArray(),
    db.configs.get(account),
  ]);
  return {
    words: words.map(({ account: _, ...w }) => w),
    events: events.map(({ account: _, pending: __, ...e }) => e),
    settings: config?.settings ?? defaultSettings,
    epoch: await getMeta<number>(`${account}:epoch`, -1),
  };
}
export async function saveEvent(
  account: string,
  event: LearningEvent,
  continuation?: { key: string; value: unknown },
  epoch?: number,
): Promise<void> {
  const e = eventSchema.parse(event);
  if (account === "guest") {
    if (!guest.events.some((x) => x.id === e.id)) guest.events.push(e);
    if (continuation) guestMeta.set(continuation.key, continuation.value);
    guestChanged();
    return;
  }
  await db.transaction("rw", db.events, db.meta, async () => {
    await checkEpoch(account, epoch);
    if (!(await db.events.get([account, e.id])))
      await db.events.add({ ...e, account, pending: true });
    if (continuation) await db.meta.put(continuation);
  });
}
export async function saveWord(
  account: string,
  word: Word,
  epoch?: number,
): Promise<void> {
  const w = { ...wordSchema.parse(word), dirty: true, updatedAt: Date.now() };
  if (account === "guest") {
    guest.words = [...guest.words.filter((x) => x.id !== w.id), w];
    guestChanged();
    return;
  }
  await db.transaction("rw", db.words, db.meta, async () => {
    await checkEpoch(account, epoch);
    await db.words.put({ ...w, account });
  });
}
export async function saveSettings(
  account: string,
  settings: Settings,
  epoch?: number,
): Promise<void> {
  const s = settingsSchema.parse(settings);
  if (account === "guest") {
    guest.settings = s;
    guestChanged();
    return;
  }
  await db.transaction("rw", db.configs, db.meta, async () => {
    await checkEpoch(account, epoch);
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
  if (account === "guest") {
    for (const w of b.words) await saveWord(account, w);
    for (const e of b.events) await saveEvent(account, e);
    await saveSettings(account, b.settings);
    return;
  }
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
  if (key.startsWith("guest:")) return (guestMeta.get(key) as T) ?? fallback;
  return ((await db.meta.get(key))?.value as T) ?? fallback;
}
export async function setMeta(key: string, value: unknown) {
  if (key.startsWith("guest:")) {
    guestMeta.set(key, value);
    return;
  }
  await db.meta.put({ key, value });
}
export async function clearAccount(account: string) {
  if (account === "guest") {
    guest = { words: [], events: [], settings: defaultSettings };
    guestMeta.clear();
    guestChanged();
  }
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
// Only the same pending revision may accept an asynchronous model response.
export async function completePendingWord(
  account: string,
  id: string,
  thai: string,
  revision: number,
  draft: Pick<Word, "thai" | "roman" | "chinese" | "pos" | "note" | "example">,
): Promise<boolean> {
  if (account === "guest") {
    const current = guest.words.find((w) => w.id === id);
    if (
      !current ||
      current.deleted ||
      current.enrichment !== "pending" ||
      current.thai !== thai ||
      current.updatedAt !== revision
    )
      return false;
    await saveWord(account, {
      ...current,
      ...draft,
      id,
      enrichment: "ready",
      review: "draft",
    });
    return true;
  }
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

// Compare before clearing: a late response must never clear a newer reset generation.
export async function adoptEpoch(
  account: string,
  expected: number,
  next: number,
) {
  return db.transaction(
    "rw",
    db.words,
    db.events,
    db.configs,
    db.meta,
    async () => {
      const current = await getMeta<number>(`${account}:epoch`, -1);
      if (current !== expected || next < current) return false;
      await clearAccount(account);
      await setMeta(`${account}:epoch`, next);
      return true;
    },
  );
}
