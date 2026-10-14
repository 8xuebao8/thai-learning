import { z } from "zod";
import { courseWords } from "../content/course";
import {
  db,
  loadData,
  getMeta,
  setMeta,
  applyGuestImport,
} from "../data/store";
import { cloud, syncAccount, withAccountLock } from "../services/cloud";
import {
  parsePackage,
  previewPackage,
  exportPrompt,
  stable,
  type Snapshot,
  type ChangePackage,
  type PreviewRow,
} from "./contract";
export type Receipt = {
  applied: number;
  rows: PreviewRow[];
  cloud: boolean;
  refreshPending?: boolean;
};
export type Prepared = {
  snapshot: Snapshot;
  package: ChangePackage;
  rows: PreviewRow[];
  request: string;
  seq: number;
  receipt?: Receipt;
};
async function current(account: string) {
  const read = async () => {
    const data = await loadData(account);
    return {
      epoch: data.epoch ?? 0,
      seq: await getMeta<number>(`${account}:cursor`, 0),
      words: [
        ...courseWords
          .filter((w) => !data.words.some((v) => v.id === w.id))
          .map((w) => ({ ...w, version: 0 })),
        ...data.words,
      ],
    };
  };
  return account === "guest"
    ? read()
    : db.transaction("r", db.words, db.events, db.configs, db.meta, read);
}
async function digest(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(stable(value)),
      ),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

async function remoteReceipt(
  account: string,
  p: Prepared,
): Promise<Receipt | null> {
  if (account === "guest" || !cloud) return null;
  const { data: auth } = await cloud.auth.getSession();
  if (auth.session?.user.id !== account)
    throw new Error("账号已变化，请重新登录。");
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/get_learning_import_receipt`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${auth.session.access_token}`,
      },
      body: JSON.stringify({ p_epoch: p.snapshot.epoch, p_request: p.request }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error("无法核实导入记录，请检查网络或导入服务是否已部署。");
  const result = z
    .object({
      status: z.literal("applied"),
      acks: z.array(z.object({ id: z.string(), version: z.number() })),
    })
    .nullable()
    .parse(await response.json());
  if (!result) return null;
  const rows = previewPackage(
    p.package,
    p.snapshot,
    p.snapshot.words,
    p.request,
  );
  // Return only actions whose IDs the server actually acknowledged.
  const acked = new Set(result.acks.map((a) => a.id));
  return {
    applied: acked.size,
    cloud: true,
    rows: rows.map((r) =>
      acked.has(r.after?.id ?? "")
        ? r
        : { ...r, status: "skip", reason: "未在成功回执中，未执行。" },
    ),
  };
}

export async function copyLibrary(account: string) {
  if (account !== "guest") await syncAccount(account);
  const data = await current(account);
  const snapshot: Snapshot = { id: crypto.randomUUID(), ...data };
  await setMeta(`${account}:ai-snapshot:${snapshot.id}`, snapshot);
  return { snapshot, text: exportPrompt(snapshot) };
}
export async function prepareImport(
  account: string,
  text: string,
): Promise<Prepared> {
  const p = parsePackage(text);
  if (account !== "guest") await syncAccount(account);
  const s = await getMeta<Snapshot | null>(
    `${account}:ai-snapshot:${p.snapshotId}`,
    null,
  );
  if (!s)
    throw new Error(
      "本浏览器没有这份词库快照，请先复制词库给 AI；访客刷新后快照会失效。",
    );
  const data = await current(account);
  if (data.epoch !== s.epoch) throw new Error("账号已初始化，请重新复制词库。");
  const request = await digest(p);
  const receipt = await getMeta<Receipt | undefined>(
    `${account}:ai-receipt:${s.epoch}:${request}`,
    undefined,
  );
  const rows = previewPackage(p, s, data.words, request);
  const prepared: Prepared = {
    snapshot: s,
    package: p,
    rows,
    request,
    seq: data.seq,
    receipt,
  };
  if (!receipt)
    prepared.receipt = (await remoteReceipt(account, prepared)) ?? undefined;
  return prepared;
}
export async function confirmImport(
  account: string,
  p: Prepared,
): Promise<Receipt> {
  if (p.receipt) return p.receipt;
  if (p.rows.some((r) => r.status === "invalid" || r.status === "conflict"))
    throw new Error("请先修正错误或冲突，再重新预览。");
  const execute = async (sync?: () => Promise<void>) => {
    if (sync) await sync();
    const s = await getMeta<Snapshot | null>(
      `${account}:ai-snapshot:${p.snapshot.id}`,
      null,
    );
    const data = await current(account);
    if (!s || data.epoch !== p.snapshot.epoch)
      throw new Error("账号或快照已变化，请重新复制词库。");
    const receiptKey = `${account}:ai-receipt:${s.epoch}:${p.request}`;
    const old = await getMeta<Receipt | null>(receiptKey, null);
    if (old) return old;
    const remote = await remoteReceipt(account, p);
    if (remote) {
      await setMeta(receiptKey, remote);
      return remote;
    }
    if (
      stable(previewPackage(p.package, s, data.words, p.request)) !==
      stable(p.rows)
    )
      throw new Error("词库在预览后已变化，请重新预览。");
    const ready = p.rows.filter((r) => r.status === "ready");
    const records = ready.map((r) => ({
      id: r.after!.id,
      kind: "word",
      baseVersion: r.before?.version ?? 0,
      deleted: !!r.after!.deleted,
      opId: `ai:${p.request}:${r.index}`,
      payload: { ...r.after!, updatedAt: Date.now(), dirty: false },
    }));
    // Payload timestamps must be stable for a retry after a lost response.
    records.forEach((r) => (r.payload.updatedAt = 0));
    let receipt: Receipt = {
      applied: ready.length,
      rows: p.rows,
      cloud: account !== "guest",
    };
    if (account === "guest")
      applyGuestImport(
        records.map((r) => ({
          ...r.payload,
          version: (r.baseVersion ?? 0) + 1,
        })),
      );
    else if (records.length) {
      if (!cloud) throw new Error("请先配置云服务。");
      const { data: auth } = await cloud.auth.getSession();
      if (auth.session?.user.id !== account)
        throw new Error("账号已变化，请重新登录。");
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/import_learning_changes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${auth.session.access_token}`,
          },
          body: JSON.stringify({
            p_epoch: s.epoch,
            p_seq: p.seq,
            p_request: p.request,
            p_records: records,
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok)
        throw new Error(
          "云端尚未确认：请检查网络或导入服务是否已部署；可以重试相同修改包。",
        );
      const result = z
        .object({
          status: z.enum(["applied", "conflict", "account_reset"]),
          acks: z
            .array(z.object({ id: z.string(), version: z.number() }))
            .optional(),
        })
        .parse(await response.json());
      if (result.status !== "applied")
        throw new Error(
          "云端数据已变化，未执行本批修改。请重新复制词库并预览。",
        );
      if (
        result.acks?.length !== records.length ||
        records.some((r) => !result.acks?.some((a) => a.id === r.id))
      )
        throw new Error("云端回执不完整，请重试相同修改包核实结果。");
    }
    await setMeta(receiptKey, receipt);
    if (sync) {
      try {
        await sync();
      } catch {
        receipt = { ...receipt, refreshPending: true };
      }
    }
    return receipt;
  };
  return account === "guest" ? execute() : withAccountLock(account, execute);
}
