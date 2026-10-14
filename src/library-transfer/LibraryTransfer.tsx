import { useRef, useState } from "react";
import { useLearning } from "../app/context";
import { Modal } from "../components/common";
import type { Word } from "../domain/model";
import {
  copyLibrary,
  prepareImport,
  confirmImport,
  type Prepared,
  type Receipt,
} from "./service";
const names = { add: "新增", update: "修改", delete: "删除", restore: "恢复" };
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
  const running = useRef(false);
  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function copy() {
    await run(async () => {
      const { text } = await copyLibrary(account);
      try {
        await navigator.clipboard.writeText(text);
        setMessage("已复制词库和提示词，可以粘贴给 AI。");
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
          讨论，再粘贴修改包。预览确认前不会改动词库；复制内容包含你的词条与备注。
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
      {account === "guest" && (
        <p className="muted">
          当前为临时体验：导入内容和快照刷新后消失，登录不会合并访客数据。
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && !prepared && (
        <p role="alert" className="import-error">
          {error}
        </p>
      )}
      {open && (
        <div className="import-input">
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
            请核对以下全部操作。取消不会保存；删除可用 restore
            恢复，学习历史保留。
          </p>
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
          <div className="import-preview">
            {prepared.rows.map((r) => (
              <article
                key={r.index}
                className={`import-row import-${r.action}`}
              >
                <h3>
                  {r.index + 1}. {names[r.action]} · {r.thai}
                </h3>
                <p>{r.after?.chinese ?? r.before?.chinese}</p>
                <p>{r.reason || "待确认"}</p>
                {(r.after || r.before) && (
                  <details open={r.action === "update"}>
                    <summary>
                      {r.action === "update" ? "查看前后对比" : "查看全部字段"}
                    </summary>
                    <Details
                      word={(r.after ?? r.before)!}
                      before={r.action === "update" ? r.before : undefined}
                    />
                  </details>
                )}
              </article>
            ))}
          </div>
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
              onClick={() =>
                void run(async () => {
                  const result = await confirmImport(account, prepared);
                  setReceipt(result);
                  setPrepared(null);
                  setInput("");
                })
              }
            >
              {busy
                ? "正在提交…"
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
          <div className="import-preview">
            {receipt.rows.map((r) => (
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
                    ID：{r.after?.id}
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
