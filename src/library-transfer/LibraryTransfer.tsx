import { ThemeManager } from "./ThemeManager";
import { defaultCatalog, topicName } from "../domain/themes";
import { MAX_IMPORT_BYTES, catalogAfter } from "./contract";
import { useEffect, useRef, useState } from "react";
import { useLearning } from "../app/context";
import { Modal } from "../components/common";
import type { Word } from "../domain/model";
import {
  pendingImport,
  copyLibrary,
  prepareOperations,
  prepareImport,
  confirmImport,
  type Prepared,
  type Receipt,
} from "./service";
const names = {
  theme_add: "新增主题",
  theme_rename: "重命名主题",
  theme_delete: "删除主题",
  move: "移动词语",
  add: "新增",
  update: "修改",
  delete: "删除",
  restore: "恢复",
};
const labels: Record<string, string> = {
  thai: "泰语",
  chinese: "中文",
  roman: "读音",
  theme: "分类",
  pos: "词性",
  note: "备注",
  example: "例句",
  sentence: "拼句练习",
};
function display(value: unknown) {
  return value === undefined
    ? "无"
    : typeof value === "object"
      ? JSON.stringify(value, null, 2)
      : String(value) || "（空）";
}
function Details({ word, before }: { word: Word; before?: Word }) {
  return (
    <dl className="import-fields">
      {Object.entries(labels).map(([k, label]) => {
        const value = word[k as keyof Word],
          old = before?.[k as keyof Word];
        const changed = before && JSON.stringify(value) !== JSON.stringify(old);
        return (
          <div key={k} className={changed ? "import-changed" : ""}>
            <dt>
              {label}
              {changed ? " · 已变化" : ""}
            </dt>
            <dd>
              {changed && (
                <>
                  <span className="muted">修改前</span>
                  <pre>{display(old)}</pre>
                  <span>修改后</span>
                </>
              )}
              <pre>{display(value)}</pre>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
export function LibraryTransfer() {
  const { account } = useLearning();
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [fallback, setFallback] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [pending, setPending] = useState<Prepared | null>(null);
  const [page, setPage] = useState(0);
  const running = useRef(false);
  useEffect(() => {
    let active = true;
    void pendingImport(account).then((p) => {
      if (active) setPending(p);
    });
    return () => {
      active = false;
    };
  }, [account]);
  useEffect(() => {
    setPage(0);
  }, [prepared, receipt]);
  const total = prepared?.rows.length ?? receipt?.rows.length ?? 0;
  const pagination = total > 50 && (
    <div className="button-row">
      <button disabled={page === 0} onClick={() => setPage(page - 1)}>
        上一页
      </button>
      <span>
        第 {page + 1} / {Math.ceil(total / 50)} 页 · 共 {total} 项
      </span>
      <button
        disabled={(page + 1) * 50 >= total}
        onClick={() => setPage(page + 1)}
      >
        下一页
      </button>
    </div>
  );

  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
      setPending(await pendingImport(account));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function apply(p: Prepared) {
    setPrepared(p);
    const result = await confirmImport(account, p, setProgress);
    setPending(null);
    setReceipt(result);
    setPrepared(null);
    setInput("");
  }
  async function copy() {
    await run(async () => {
      const { text } = await copyLibrary(account);
      try {
        await navigator.clipboard.writeText(text);
        setMessage("已复制词库、学习进度和提示词，可以粘贴给 AI。");
      } catch {
        setFallback(text);
      }
    });
  }
  async function preview() {
    await run(async () => {
      const p = await prepareImport(account, input);
      if (p.receipt) {
        setReceipt(p.receipt);
        setMessage("这个修改包已处理，不会重复添加。");
      } else setPrepared(p);
    });
  }
  const blocked = prepared?.rows.some(
    (r) => r.status === "invalid" || r.status === "conflict",
  );
  return (
    <section className="library-transfer">
      <div>
        <strong>用 AI 整理词库</strong>
        <p className="muted">
          复制给 AI
          讨论，再粘贴修改包。预览确认前不会改动词库；复制内容包含词条、备注、学习目标、掌握情况和练习历史，供你发给
          AI 讨论。
        </p>
      </div>
      <div className="button-row">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void copy()}
        >
          复制词库＋AI 提示词
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            setOpen(!open);
            setError("");
          }}
        >
          导入 AI 修改
        </button>
      </div>
      <ThemeManager
        busy={busy}
        onPreview={(ops) =>
          void run(async () =>
            setPrepared(await prepareOperations(account, ops)),
          )
        }
      />
      {account === "guest" && (
        <p className="muted">
          当前为临时体验：导入内容和快照刷新后消失，登录不会合并访客数据。
        </p>
      )}
      {pending && !prepared && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void run(() => apply(pending))}
        >
          继续未完成的导入
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {error && !prepared && (
        <p role="alert" className="import-error">
          {error}
        </p>
      )}
      {open && (
        <div className="import-input">
          <label>
            上传全部 JSON 文件（可多选）
            <input
              type="file"
              accept=".json,application/json"
              multiple
              disabled={busy}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                void run(async () => {
                  if (files.reduce((n, f) => n + f.size, 0) > MAX_IMPORT_BYTES)
                    throw new Error("文件总大小超过 20 MB。");
                  setInput(
                    (await Promise.all(files.map((f) => f.text()))).join("\n"),
                  );
                  setMessage(`已读取 ${files.length} 个文件，请统一预览。`);
                });
              }}
            />
          </label>
          <p className="muted">
            一次上传或粘贴全部内容，统一预览确认后自动分批。每次最多 10000
            项、20 MB，所有文件须来自同一快照。
          </p>
          <label htmlFor="ai-package">AI 修改包</label>
          <textarea
            id="ai-package"
            rows={8}
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            placeholder="粘贴 AI 最后给出的完整 JSON 修改包"
          />
          <button
            className="primary"
            disabled={busy || !input.trim()}
            onClick={() => void preview()}
          >
            {busy ? "处理中…" : "预览修改"}
          </button>
        </div>
      )}
      {fallback && (
        <Modal title="复制词库和提示词" onClose={() => setFallback("")}>
          <p>浏览器没有允许自动复制。请选择下方全部内容后复制。</p>
          <textarea
            aria-label="词库和提示词"
            rows={12}
            readOnly
            value={fallback}
            onFocus={(e) => e.target.select()}
          />
          <button className="secondary" onClick={() => setFallback("")}>
            完成
          </button>
        </Modal>
      )}
      {prepared && (
        <Modal
          title="确认词库修改"
          onClose={() => {
            if (!busy) {
              setPrepared(null);
              setError("");
            }
          }}
        >
          <p className="import-summary">
            {Object.entries(names)
              .map(
                ([a, n]) =>
                  `${n} ${prepared.rows.filter((r) => r.action === a && r.status === "ready").length}`,
              )
              .join(" · ")}{" "}
            · 跳过 {prepared.rows.filter((r) => r.status === "skip").length}
          </p>
          <p>
            请核对以下全部操作。确认前取消不会保存；确认后网页自动分批，部分成功不会回滚，中断后可继续。删除可用
            restore 恢复，学习历史保留。主题删除会迁移内容，不能用词条 restore
            恢复主题。
          </p>
          {prepared.rows.some(
            (r) =>
              r.status === "ready" &&
              r.after?.enrichment === "pending" &&
              !r.after.deleted,
          ) && (
            <p role="alert" className="import-error">
              本批有{" "}
              {
                prepared.rows.filter(
                  (r) =>
                    r.status === "ready" &&
                    r.after?.enrichment === "pending" &&
                    !r.after.deleted,
                ).length
              }{" "}
              个词缺少读音或中文，导入后只能待补全，不能进入学习测验。若要直接学习，请取消并让
              AI 补齐内容。
            </p>
          )}
          {blocked && (
            <p role="alert" className="import-error">
              有错误或冲突，本批次不会执行。请取消并修正修改包，或重新复制词库。
            </p>
          )}
          {error && (
            <p role="alert" className="import-error">
              {error}
            </p>
          )}
          {pagination}
          <div className="import-preview">
            {prepared.rows.slice(page * 50, (page + 1) * 50).map((r) => (
              <article
                key={r.index}
                className={`import-row import-${r.action}`}
              >
                <h3>
                  {r.index + 1}. {names[r.action]} · {r.thai}
                </h3>
                <p>{r.after?.chinese ?? r.before?.chinese}</p>
                {r.after?.enrichment === "pending" && !r.after.deleted && (
                  <strong className="import-error">
                    待补全 · 缺少{!r.after.roman.trim() ? "读音" : ""}
                    {!r.after.roman.trim() && !r.after.chinese.trim()
                      ? "和"
                      : ""}
                    {!r.after.chinese.trim() ? "中文" : ""}，暂不能学习
                  </strong>
                )}
                <p>{r.reason || "待确认"}</p>
                {r.themeAfter && (
                  <p>
                    {r.themeBefore?.name ?? "新主题"} →{" "}
                    {r.themeAfter.redirectTo
                      ? topicName(
                          r.themeAfter.redirectTo,
                          catalogAfter(
                            prepared.rows,
                            prepared.snapshot.themes ?? defaultCatalog,
                          ),
                        )
                      : r.themeAfter.name}
                  </p>
                )}
                {r.moved && (
                  <details open>
                    <summary>
                      迁移 {r.moved.filter((w) => w.kind === "word").length}{" "}
                      个词条、
                      {r.moved.filter((w) => w.kind === "sentence").length}{" "}
                      个拼句
                    </summary>
                    <ul>
                      {r.moved.map((w) => (
                        <li key={`${w.kind}:${w.id}`}>
                          {w.kind === "sentence" ? "拼句" : "词条"} · {w.thai} →{" "}
                          {w.destination}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {r.after && r.before && r.after.theme !== r.before.theme && (
                  <p>
                    主题：{topicName(r.before.theme, prepared.snapshot.themes)}{" "}
                    →{" "}
                    {topicName(
                      r.after.theme,
                      catalogAfter(prepared.rows, prepared.snapshot.themes),
                    )}
                  </p>
                )}
                {(r.after || r.before) && (
                  <details open={r.action === "update" || r.action === "move"}>
                    <summary>
                      {r.action === "update" ? "查看前后对比" : "查看全部字段"}
                    </summary>
                    <Details
                      word={(r.after ?? r.before)!}
                      before={
                        r.action === "update" || r.action === "move"
                          ? r.before
                          : undefined
                      }
                    />
                  </details>
                )}
              </article>
            ))}
          </div>
          {progress && <p role="status">{progress}</p>}
          <div className="button-row import-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                setPrepared(null);
                setError("");
              }}
            >
              取消
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                blocked ||
                !prepared.rows.some((r) => r.status === "ready")
              }
              onClick={() => void run(() => apply(prepared))}
            >
              {busy
                ? "正在提交…"
                : pending?.request === prepared.request
                  ? "继续已确认的导入"
                  : account === "guest"
                    ? "确认修改（临时体验）"
                    : "确认并同步"}
            </button>
          </div>
        </Modal>
      )}
      {receipt && (
        <Modal title="导入结果" onClose={() => setReceipt(null)}>
          <p>
            已完成 {receipt.applied} 项
            {receipt.cloud ? "，已提交云端。" : "，仅保留在本次体验中。"}
          </p>
          {receipt.refreshPending && (
            <p>云端已保存，网页刷新尚未完成，恢复网络后会自动同步。</p>
          )}
          {pagination}
          <div className="import-preview">
            {receipt.rows.slice(page * 50, (page + 1) * 50).map((r) => (
              <article className="import-row" key={r.index}>
                <strong>
                  {r.index + 1}. {r.thai} ·{" "}
                  {r.after?.chinese ?? r.before?.chinese}
                </strong>
                <p>
                  {r.status === "ready"
                    ? `${names[r.action]}成功${r.after?.enrichment === "pending" ? " · 待补全" : ""}`
                    : r.reason}
                </p>
                {r.status === "ready" && (
                  <small>
                    ID：{r.after?.id ?? r.themeAfter?.id}
                    {r.after?.sentence && ` · 拼句：sentence:${r.after.id}`}
                  </small>
                )}
              </article>
            ))}
          </div>
          <button className="primary" onClick={() => setReceipt(null)}>
            完成
          </button>
        </Modal>
      )}
    </section>
  );
}
