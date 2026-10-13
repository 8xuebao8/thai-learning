import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { db, getMeta, setMeta } from "../data/store";
import { applyChanges, changeSchema } from "./sync";
import { takeBatch } from "./batch";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const cloud =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: false,
          persistSession: true,
        },
      })
    : null;
let authInitialization: ReturnType<typeof initializeOnce> | undefined;
export function initializeAuth() {
  return (authInitialization ??= initializeOnce());
}
async function initializeOnce() {
  if (!cloud) return null;
  const callback = new URL(location.href);
  const error = callback.searchParams.get("error_description");
  if (error) {
    history.replaceState(null, "", import.meta.env.BASE_URL);
    throw new Error("登录未完成，请重试。");
  }
  const code = callback.searchParams.get("code");
  if (code) {
    const { error } = await cloud.auth.exchangeCodeForSession(code);
    history.replaceState(null, "", import.meta.env.BASE_URL);
    if (error) throw new Error("登录回调失败，请从当前设备重新登录。");
  }
  const { data, error: authError } = await cloud.auth.getSession();
  if (authError) throw new Error("无法读取登录状态。");
  return data.session;
}
export async function signInWithEmail(email: string, password: string) {
  if (!cloud) throw new Error("请先配置 Supabase。");
  const parsed = z
    .object({ email: z.email(), password: z.string().min(1).max(4096) })
    .safeParse({ email: email.trim(), password });
  if (!parsed.success) throw new Error("请填写有效邮箱和密码。");
  const { data, error } = await cloud.auth.signInWithPassword(parsed.data);
  if (error?.code === "invalid_credentials")
    throw new Error("邮箱或密码不正确，请重新输入。");
  if (error?.code === "email_not_confirmed")
    throw new Error("邮箱尚未确认，请先完成邮箱确认。");
  if (error?.status === 429) throw new Error("登录尝试过于频繁，请稍后重试。");
  if (error || !data.session)
    throw new Error("登录未完成，请检查网络或 Supabase 项目状态。");
}
const replySchema = z.object({
  acks: z.array(z.object({ id: z.string(), version: z.number().int() })),
  eventAcks: z.array(z.string()),
  changes: z.array(changeSchema),
  cursor: z.number().int().nonnegative(),
  more: z.boolean(),
  conflicts: z.array(changeSchema),
});
const active = new Map<string, Promise<void>>();
export function syncAccount(account: string): Promise<void> {
  const running = active.get(account);
  if (running) return running;
  const operation = performSync(account).finally(() => active.delete(account));
  active.set(account, operation);
  return operation;
}
async function performSync(account: string) {
  if (!cloud || account === "guest") throw new Error("登录后才能同步。");
  const { data } = await cloud.auth.getSession();
  if (data.session?.user.id !== account)
    throw new Error("登录已失效，请重新登录。本机记录已保留。");
  let rounds = 0;
  let more = true;
  while (more && rounds++ < 500) {
    const queuedWords = (
      await db.words.where("account").equals(account).toArray()
    ).filter((w) => w.dirty);
    const pendingWords = takeBatch(queuedWords, 100, 180000);
    const queuedEvents = (
      await db.events.where("account").equals(account).toArray()
    ).filter((e) => e.pending);
    const pendingEvents = takeBatch(queuedEvents, 100, 90000);
    const config = await db.configs.get(account);
    const cursor = await getMeta<number>(`${account}:cursor`, 0);
    const records = pendingWords.map(({ account: _, ...w }) => ({
      id: w.id,
      kind: "word",
      payload: w,
      baseVersion: w.version,
      deleted: !!w.deleted,
      opId: `${w.id}:${w.updatedAt}`,
    }));
    if (config?.dirty)
      records.push({
        id: "settings",
        kind: "settings",
        payload: config.settings as any,
        baseVersion: config.version,
        deleted: false,
        opId: `settings:${JSON.stringify(config.settings)}:${config.version}`,
      });
    const before = await cloud.auth.getSession();
    if (before.data.session?.user.id !== account)
      throw new Error("登录账号已改变，同步已停止。本机数据已保留。");
    // Bind the request to the exact verified session token, not mutable SDK auth.
    const response = await fetch(`${url}/rest/v1/rpc/sync_learning`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${before.data.session.access_token}`,
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        p_records: records,
        p_events: pendingEvents.map(({ account: _, pending: __, ...e }) => e),
        p_after: cursor,
      }),
    });
    const after = await cloud.auth.getSession();
    if (after.data.session?.user.id !== account)
      throw new Error("登录账号已改变，同步已停止。本机数据已保留。");
    if (!response.ok)
      throw new Error(
        "同步未完成，请检查项目是否暂停、账号权限或网络连接。本机数据已保留。",
      );
    const reply = replySchema.parse(await response.json());
    await db.transaction("rw", db.words, db.events, db.configs, async () => {
      for (const ack of reply.acks) {
        if (ack.id === "settings") {
          const current = await db.configs.get(account);
          if (current && config)
            await db.configs.put({
              ...current,
              version: ack.version,
              dirty:
                JSON.stringify(current.settings) !==
                JSON.stringify(config.settings),
            });
        } else {
          const snapshot = pendingWords.find((w) => w.id === ack.id);
          const current = await db.words.get([account, ack.id]);
          if (current && snapshot)
            await db.words.put({
              ...current,
              version: ack.version,
              dirty: current.updatedAt !== snapshot.updatedAt,
            });
        }
      }
      for (const id of reply.eventAcks) {
        const e = await db.events.get([account, id]);
        if (e) await db.events.put({ ...e, pending: false });
      }
    });
    // Conflicts may have happened before our cursor; process them explicitly.
    await applyChanges(account, reply.conflicts, cursor);
    await applyChanges(account, reply.changes, reply.cursor);
    more =
      reply.more ||
      queuedWords.length > pendingWords.length ||
      queuedEvents.length > pendingEvents.length;
  }
  if (more) throw new Error("本次数据较多，请再次同步以继续。");
  await setMeta(`${account}:last-sync`, Date.now());
}
const draftSchema = z.object({
  thai: z.string().min(1).max(500),
  roman: z.string().min(1).max(1000),
  chinese: z.string().min(1).max(1000),
  pos: z.string().max(100),
  note: z.string().max(2000),
  example: z.object({
    thai: z.string().max(1000),
    roman: z.string().max(2000),
    chinese: z.string().max(1000),
  }),
});
export async function generateEntry(text: string) {
  if (!cloud) throw new Error("云服务尚未配置，请手动填写。");
  const { data, error } = await cloud.functions.invoke("generate-entry", {
    body: { text, requestId: crypto.randomUUID() },
  });
  if (error)
    throw new Error(
      "生成不可用：请检查登录、免费额度与模型配置。输入已保留，可手动填写。",
    );
  return draftSchema.parse(data);
}
