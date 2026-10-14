import { z } from "zod";
import { defaultCatalog } from "../domain/themes";
import { exportScopedPrompt, scopedLearningContext } from "./scoped-export";
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
  catalogAfter,
  previewPackage,
  type LibraryScope,
  stable,
  fingerprint,
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
      events: data.events,
      settings: data.settings,
      configVersion:
        account === "guest"
          ? 0
          : ((await db.configs.get(account))?.version ?? 0),
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
    p.snapshot.themes ?? defaultCatalog,
  );
  // Return only actions whose IDs the server actually acknowledged.
  const acked = new Set(result.acks.map((a) => a.id));
  return {
    applied: rows.filter(
      (r) =>
        r.status === "ready" &&
        acked.has(r.themeAfter ? "settings" : (r.after?.id ?? "")),
    ).length,
    cloud: true,
    rows: rows.map((r) =>
      acked.has(r.themeAfter ? "settings" : (r.after?.id ?? ""))
        ? r
        : { ...r, status: "skip", reason: "未在成功回执中，未执行。" },
    ),
  };
}

export async function copyLibrary(
  account: string,
  scope: LibraryScope = "all",
) {
  if (account !== "guest") await syncAccount(account);
  const data = await current(account);
  const snapshot: Snapshot = {
    scope,
    id: crypto.randomUUID(),
    epoch: data.epoch,
    words: data.words,
    themes: data.settings.themes ?? defaultCatalog,
  };
  await setMeta(`${account}:ai-snapshot:${snapshot.id}`, snapshot);
  return {
    snapshot,
    text:
      exportScopedPrompt(snapshot) +
      "\n\n学习上下文（只读）：\n" +
      JSON.stringify(
        scopedLearningContext(data.words, data.events, data.settings, scope),
        null,
        2,
      ),
  };
}
export async function prepareImport(
  account: string,
  text: string,
  scope: LibraryScope = "all",
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
  if (
    scope !== "all" &&
    s.scope !== scope &&
    !(scope === "words" && (!s.scope || s.scope === "all"))
  )
    throw new Error("快照属于另一入口，请在对应页面重新复制资料和提示词。");
  if (
    p.format !==
    (s.scope === "sentences" ? "thai-sentence-changes" : "thai-library-changes")
  )
    throw new Error("修改包类型不匹配，请使用词库或句库的对应入口。");
  const data = await current(account);
  if (data.epoch !== s.epoch) throw new Error("账号已初始化，请重新复制词库。");
  const request = await digest(p);
  const receipt = await getMeta<Receipt | undefined>(
    `${account}:ai-receipt:${s.epoch}:${request}`,
    undefined,
  );
  const pending = await getMeta<BulkJob | null>(
    `${account}:ai-bulk:${request}`,
    null,
  );
  if (pending) return pending.prepared;
  const rows = previewPackage(
    p,
    s,
    data.words,
    request,
    data.settings.themes ?? defaultCatalog,
  );
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
  onProgress?: (value: string) => void,
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
    const pending = await getMeta<BulkJob | null>(
      `${account}:ai-bulk:${p.request}`,
      null,
    );
    if (pending) return executeBulk(account, pending, sync!, onProgress);
    const remote = await remoteReceipt(account, p);
    if (remote) {
      await setMeta(receiptKey, remote);
      return remote;
    }
    if (
      stable(
        previewPackage(
          p.package,
          s,
          data.words,
          p.request,
          data.settings.themes ?? defaultCatalog,
        ),
      ) !== stable(p.rows)
    )
      throw new Error("词库在预览后已变化，请重新预览。");
    const ready = p.rows.filter((r) => r.status === "ready");
    const records = ready
      .filter((r) => r.after)
      .map((r) => ({
        id: r.after!.id,
        kind: "word",
        baseVersion: r.before?.version ?? 0,
        deleted: !!r.after!.deleted,
        opId: `ai:${p.request}:${r.index}`,
        payload: { ...r.after!, updatedAt: Date.now(), dirty: false },
      }));
    // Payload timestamps must be stable for a retry after a lost response.
    records.forEach((r) => (r.payload.updatedAt = 0));
    const nextSettings = ready.some((r) => r.themeAfter)
      ? {
          ...data.settings,
          themes: catalogAfter(ready, data.settings.themes ?? defaultCatalog),
        }
      : undefined;
    const cloudRecords: {
      id: string;
      kind: string;
      baseVersion: number;
      deleted: boolean;
      opId: string;
      payload: unknown;
    }[] = [...records];
    if (nextSettings)
      cloudRecords.push({
        id: "settings",
        kind: "settings",
        baseVersion: data.configVersion,
        deleted: false,
        opId: `ai:${p.request}:themes`,
        payload: nextSettings,
      });
    if (
      account !== "guest" &&
      (cloudRecords.length > 100 ||
        new TextEncoder().encode(JSON.stringify(cloudRecords)).length > 350000)
    ) {
      const ordered = [
        ...cloudRecords.filter((r) => r.kind === "settings"),
        ...cloudRecords.filter((r) => r.kind !== "settings"),
      ];
      const batches: CloudRecord[][] = [];
      let chunk: CloudRecord[] = [];
      for (const record of ordered) {
        if (
          chunk.length &&
          (chunk[0].kind === "settings" ||
            chunk.length >= 100 ||
            new TextEncoder().encode(JSON.stringify([...chunk, record]))
              .length > 350000)
        ) {
          batches.push(chunk);
          chunk = [];
        }
        if (new TextEncoder().encode(JSON.stringify([record])).length > 350000)
          throw new Error("单条内容过大，请缩短后重新预览。");
        chunk.push(record);
      }
      if (chunk.length) batches.push(chunk);
      const job: BulkJob = { prepared: p, batches, completed: 0 };
      await setMeta(`${account}:ai-bulk:${p.request}`, job);
      await setMeta(`${account}:ai-bulk-active`, p.request);
      await setMeta(
        `${account}:ai-bulk-active:${p.snapshot.scope ?? "all"}`,
        p.request,
      );
      return executeBulk(account, job, sync!, onProgress);
    }
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
        nextSettings,
      );
    else if (cloudRecords.length) {
      if (!cloud) throw new Error("请先配置云服务。");
      const { data: auth } = await cloud.auth.getSession();
      if (auth.session?.user.id !== account)
        throw new Error("账号已变化，请重新登录。");
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/import_learning_changes_v2`,
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
            p_records: cloudRecords,
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
        result.acks?.length !== cloudRecords.length ||
        cloudRecords.some((r) => !result.acks?.some((a) => a.id === r.id))
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

export async function prepareOperations(
  account: string,
  operations: ChangePackage["operations"],
) {
  const { snapshot } = await copyLibrary(account);
  return prepareImport(
    account,
    JSON.stringify({
      format: "thai-library-changes",
      version: 1,
      snapshotId: snapshot.id,
      operations,
    }),
  );
}

type CloudRecord = {
  id: string;
  kind: string;
  baseVersion: number;
  deleted: boolean;
  opId: string;
  payload: unknown;
};
type BulkJob = {
  prepared: Prepared;
  batches: CloudRecord[][];
  completed: number;
};
export async function pendingImport(
  account: string,
  scope: LibraryScope = "all",
): Promise<Prepared | null> {
  const id =
    (await getMeta<string | null>(
      `${account}:ai-bulk-active:${scope}`,
      null,
    )) ?? (await getMeta<string | null>(`${account}:ai-bulk-active`, null));
  if (!id) return null;
  const job = await getMeta<BulkJob | null>(`${account}:ai-bulk:${id}`, null);
  return job &&
    (scope === "all" ||
      job.prepared.snapshot.scope === scope ||
      (scope === "words" &&
        (!job.prepared.snapshot.scope ||
          job.prepared.snapshot.scope === "all")))
    ? job.prepared
    : null;
}
async function executeBulk(
  account: string,
  job: BulkJob,
  sync: () => Promise<void>,
  progress?: (value: string) => void,
): Promise<Receipt> {
  const p = job.prepared;
  const finalCatalog = catalogAfter(
    p.rows,
    p.snapshot.themes ?? defaultCatalog,
  );
  for (let i = job.completed; i < job.batches.length; i++) {
    progress?.(
      `已完成 ${i}/${job.batches.length} 批，正在处理第 ${i + 1} 批。失败后可继续，已完成的批次不会回滚。`,
    );
    await sync();
    const data = await current(account);
    if (data.epoch !== p.snapshot.epoch)
      throw new Error("账号已初始化，导入任务已停止。");
    const { data: auth } = await cloud!.auth.getSession();
    if (auth.session?.user.id !== account)
      throw new Error("账号已变化，请重新登录。");
    const headers = {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${auth.session.access_token}`,
    };
    const request = `${p.request}:b:${i}`;
    const call = async (rpc: string, body: unknown) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/${rpc}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok)
        throw new Error(`第 ${i + 1} 批尚未确认，恢复网络后可继续。`);
      return response.json();
    };
    const records = job.batches[i];
    let result = await call("get_learning_import_receipt", {
      p_epoch: p.snapshot.epoch,
      p_request: request,
    });
    if (!result) {
      const expectedCatalog =
        i === 0 ? (p.snapshot.themes ?? defaultCatalog) : finalCatalog;
      if (
        stable(data.settings.themes ?? defaultCatalog) !==
        stable(expectedCatalog)
      )
        throw new Error(
          "主题目录已变化，剩余操作停止；请复制最新词库重新生成。",
        );
      for (const record of records.filter((r) => r.kind === "word")) {
        const row = p.rows.find((r) => r.after?.id === record.id)!;
        const word = data.words.find((w) => w.id === record.id);
        if (
          row.before
            ? !word || fingerprint(word) !== fingerprint(row.before)
            : !!word
        )
          throw new Error(
            `词条 ${row.thai} 已变化，剩余操作停止，请重新生成。`,
          );
        if (
          (!row.before ||
            row.before.deleted ||
            row.before.thai !== row.after!.thai) &&
          !row.after!.deleted &&
          data.words.some(
            (w) =>
              w.id !== record.id &&
              !w.deleted &&
              w.thai.normalize("NFC").trim() ===
                row.after!.thai.normalize("NFC").trim(),
          )
        )
          throw new Error(
            `词条 ${row.thai} 已存在，剩余操作停止，请重新生成。`,
          );
      }
      result = await call("import_learning_changes_v2", {
        p_epoch: p.snapshot.epoch,
        p_seq: data.seq,
        p_request: request,
        p_records: records,
      });
    }
    const parsed = z
      .object({
        status: z.literal("applied"),
        acks: z.array(z.object({ id: z.string(), version: z.number() })),
      })
      .safeParse(result);
    if (
      !parsed.success ||
      parsed.data.acks.length !== records.length ||
      records.some((r) => !parsed.data.acks.some((a) => a.id === r.id))
    )
      throw new Error(
        `第 ${i + 1} 批未获完整成功回执；已完成 ${i} 批。可重试核实，冲突时请重新生成。`,
      );
    job.completed = i + 1;
    await setMeta(`${account}:ai-bulk:${p.request}`, job);
  }
  const receipt: Receipt = {
    applied: p.rows.filter((r) => r.status === "ready").length,
    rows: p.rows,
    cloud: true,
  };
  await setMeta(
    `${account}:ai-receipt:${p.snapshot.epoch}:${p.request}`,
    receipt,
  );
  await setMeta(`${account}:ai-bulk:${p.request}`, null);
  if ((await getMeta(`${account}:ai-bulk-active`, null)) === p.request)
    await setMeta(`${account}:ai-bulk-active`, null);
  const scopeKey = `${account}:ai-bulk-active:${p.snapshot.scope ?? "all"}`;
  if ((await getMeta(scopeKey, null)) === p.request)
    await setMeta(scopeKey, null);
  try {
    await sync();
  } catch {
    receipt.refreshPending = true;
  }
  progress?.("全部批次已完成。");
  return receipt;
}
