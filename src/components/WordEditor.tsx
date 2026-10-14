import { activeThemes, resolveTheme, catalogFor } from "../domain/themes";
import { useState, useRef, useEffect } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { Modal } from "./common";
import { useLearning } from "../app/context";
import { wordSchema, type Word } from "../domain/model";
import { getWord, completePendingWord } from "../data/store";
import { generateEntry, cloud } from "../services/cloud";
export function WordEditor({
  word,
  onClose,
}: {
  word?: Word;
  onClose: () => void;
}) {
  const { putWord, notify, account, allWords, settings } = useLearning();
  const initialCatalog = catalogFor(
    settings,
    word?.sentence ? "sentences" : "words",
  );
  const [form, setForm] = useState({
    theme: resolveTheme(word?.theme ?? "personal", initialCatalog),
    thai: word?.thai ?? "",
    roman: word?.roman ?? "",
    chinese: word?.chinese ?? "",
    pos: word?.pos ?? "词语",
    note: word?.note ?? "",
    example: word?.example ?? { thai: "", roman: "", chinese: "" },
  });
  const [manual, setManual] = useState(!!word && word.enrichment !== "pending");
  const pendingId = useRef(word?.id ?? crypto.randomUUID());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState(false);
  const [tileThai, setTileThai] = useState(
    word?.sentence?.tokens.map((t) => t.thai).join(" | ") ?? "",
  );
  const [tileRoman, setTileRoman] = useState(
    word?.sentence?.tokens.map((t) => t.roman).join(" | ") ?? "",
  );
  const [tileConfirmed, setTileConfirmed] = useState(!!word?.sentence);
  const catalog = catalogFor(settings, tileConfirmed ? "sentences" : "words");
  const [alternatives, setAlternatives] = useState(
    word?.sentence?.alternatives
      .map((a) => a.map((i) => i + 1).join(" "))
      .join("\n") ?? "",
  );
  const [explanation, setExplanation] = useState(
    word?.sentence?.explanation ?? "",
  );
  async function save() {
    setBusy(true);
    setError("");
    try {
      let sentence: Word["sentence"];
      if (tileThai.trim() || tileRoman.trim()) {
        const thai = tileThai.split("|").map((t) => t.trim());
        const roman = tileRoman.split("|").map((t) => t.trim());
        if (
          !tileConfirmed ||
          thai.length !== roman.length ||
          thai.length < 2 ||
          thai.some((t) => !t) ||
          roman.some((t) => !t) ||
          thai.join("").replace(/\s/g, "") !== form.thai.replace(/\s/g, "")
        ) {
          setError(
            "请逐一匹配泰文与罗马音词块，确保合起来是原句，并确认分词顺序。",
          );
          return;
        }
        sentence = {
          tokens: thai.map((t, i) => ({ thai: t, roman: roman[i] })),
          alternatives: alternatives.trim()
            ? alternatives
                .trim()
                .split("\n")
                .map((a) =>
                  a
                    .trim()
                    .split(/\s+/)
                    .map((n) => Number(n) - 1),
                )
            : [],
          explanation,
        };
      }
      const current = await getWord(account, pendingId.current);
      const w = wordSchema.parse({
        ...form,
        sentence,
        enrichment: "ready",
        id: pendingId.current,
        theme: resolveTheme(
          form.theme,
          catalogFor(settings, sentence ? "sentences" : "words"),
        ),
        source: generated
          ? `${word?.source ?? "个人词库"} · AI 辅助草稿，经用户确认`
          : (word?.source ?? "个人录入；用户确认"),
        review: "confirmed",
        version: current?.version ?? word?.version ?? 0,
        updatedAt: Date.now(),
        dirty: true,
      });
      await putWord(w);
      notify("已保存到词库，并加入学习队列。");
      onClose();
    } catch (e) {
      setError(
        e instanceof Error && e.name === "ZodError"
          ? "请填写泰文、罗马音和中文含义，并检查文本长度。"
          : "保存失败，请重试。",
      );
    } finally {
      setBusy(false);
    }
  }
  async function collect() {
    if (inFlight.current) return;
    const thai = form.thai.trim().normalize("NFC");
    if (!thai || !/[ก-๙]/.test(thai)) {
      setError("请输入泰语原词或短句。");
      return;
    }
    const existing = allWords.find(
      (w) =>
        w.thai.trim().normalize("NFC") === thai && w.id !== pendingId.current,
    );
    if (existing) {
      setError("这个原词已经在词库中，请搜索后编辑已有词条。");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const raw = wordSchema.parse({
        ...form,
        thai,
        roman: "",
        chinese: "",
        id: pendingId.current,
        theme: resolveTheme(form.theme, catalog),
        source: "泰语原词收录，等待自动补全",
        review: "draft",
        enrichment: "pending",
        version: word?.version ?? 0,
        updatedAt: Date.now(),
        dirty: true,
      });
      const previous = await getWord(account, raw.id);
      if (previous && previous.enrichment !== "pending")
        throw new Error("词条已经补全");
      await putWord({ ...raw, version: previous?.version ?? raw.version });
      const revision = (await getWord(account, raw.id))!.updatedAt;
      try {
        const draft = await generateEntry(thai);
        if (draft.thai.trim().normalize("NFC") !== thai)
          throw new Error("生成结果改变了原词，请重试。");
        if (
          !(await completePendingWord(account, raw.id, thai, revision, draft))
        )
          throw new Error("词条已被修改，未覆盖更新。");
        if (mounted.current) {
          notify("已自动收录到词库，读音和含义标为待核对，可随时编辑。");
          onClose();
        }
      } catch (e) {
        setError(
          `原词已收录，尚待补全。${e instanceof Error ? e.message : "请稍后重试。"}`,
        );
      }
    } catch {
      setError("原词保存失败，请重试。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function generate() {
    setBusy(true);
    setError("");
    try {
      const draft = await generateEntry(form.thai);
      setGenerated(true);
      setForm((f) => ({ ...f, ...draft }));
      notify("已生成草稿，请检查读音、含义和例句后保存。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败，已保留你的输入。");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!word || !confirm("删除这个词语？已同步的删除也会传到其他设备。"))
      return;
    setBusy(true);
    try {
      await putWord({ ...word, deleted: true });
      onClose();
    } catch {
      setError("删除失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={word ? "编辑词语" : "添加你的词语"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void (manual ? save() : collect());
        }}
      >
        <p className="muted">把真正遇到的表达，变成自己的学习内容。</p>
        <label>
          泰文原文
          <input
            required
            disabled={busy}
            maxLength={500}
            value={form.thai}
            onChange={(e) => setForm({ ...form, thai: e.target.value })}
            lang="th"
            placeholder="输入词语或短句"
          />
        </label>
        <label>
          所属主题
          <select
            value={resolveTheme(form.theme, catalog)}
            disabled={busy}
            onChange={(e) => setForm({ ...form, theme: e.target.value })}
          >
            {activeThemes(catalog).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {!manual && (
          <>
            <p className="muted">
              只填泰语即可。系统先收录原词，再自动补全中文、读音和例句；生成内容标为待核对。
            </p>
            <p className="small-text">
              补全时会把原词发送到已配置的模型服务。未配置或额度不足时，原词保留为待补全，不进入测验。
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setManual(true)}
              >
                手动填写
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "收录并补全中…" : "自动收录"}
              </button>
            </div>
          </>
        )}
        {manual && (
          <>
            <div className="generation-box">
              <button
                type="button"
                className="secondary small"
                disabled={
                  busy || !form.thai.trim() || !cloud || account === "guest"
                }
                onClick={() => void generate()}
              >
                <Sparkles size={16} />
                生成草稿
              </button>
              <span>
                {!cloud
                  ? "云服务尚未配置，可以先手动填写。"
                  : account === "guest"
                    ? "登录后使用免费生成。"
                    : "会将原文发送给配置的模型服务，请勿输入敏感材料。"}
              </span>
            </div>
            <div className="form-grid">
              <label>
                罗马音
                <input
                  required
                  maxLength={1000}
                  value={form.roman}
                  onChange={(e) => setForm({ ...form, roman: e.target.value })}
                  placeholder="例如 ngaan¹"
                />
              </label>
              <label>
                中文含义
                <input
                  required
                  maxLength={1000}
                  value={form.chinese}
                  onChange={(e) =>
                    setForm({ ...form, chinese: e.target.value })
                  }
                  placeholder="这个词的意思"
                />
              </label>
            </div>
            <label>
              词性
              <input
                value={form.pos}
                maxLength={100}
                onChange={(e) => setForm({ ...form, pos: e.target.value })}
              />
            </label>
            <label>
              发音与使用说明
              <textarea
                maxLength={2000}
                rows={2}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
            <details>
              <summary>添加例句（可选）</summary>
              <label>
                例句泰文
                <input
                  maxLength={1000}
                  value={form.example.thai}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      example: { ...form.example, thai: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                例句罗马音
                <input
                  maxLength={2000}
                  value={form.example.roman}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      example: { ...form.example, roman: e.target.value },
                    })
                  }
                />
              </label>
              <label>
                例句中文
                <input
                  maxLength={1000}
                  value={form.example.chinese}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      example: { ...form.example, chinese: e.target.value },
                    })
                  }
                />
              </label>
            </details>
            <details>
              <summary>制作拼句练习（可选）</summary>
              <p className="muted">
                用于整句。按正确顺序手动划分词块，使用 |
                分隔；不要自动把每个泰文字母当作词语。
              </p>
              <label>
                泰文词块
                <input
                  maxLength={2500}
                  value={tileThai}
                  onChange={(e) => {
                    setTileThai(e.target.value);
                    setTileConfirmed(false);
                  }}
                  placeholder="ฉัน | มี | งาน"
                />
              </label>
              <label>
                词块罗马音
                <input
                  maxLength={4500}
                  value={tileRoman}
                  onChange={(e) => {
                    setTileRoman(e.target.value);
                    setTileConfirmed(false);
                  }}
                  placeholder="chan⁵ | mii¹ | ngaan¹"
                />
              </label>
              <label>
                其他正确顺序
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={alternatives}
                  onChange={(e) => {
                    setAlternatives(e.target.value);
                    setTileConfirmed(false);
                  }}
                  placeholder="按词块序号填写，每行一个答案，例如 3 1 2"
                />
              </label>
              <label>
                语序说明
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={tileConfirmed}
                  onChange={(e) => setTileConfirmed(e.target.checked)}
                />
                我已核对分词和正确顺序
              </label>
            </details>
            <p className="form-note">
              保存表示你已检查内容。用户确认与专业审核会分别标记。
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              {word && (
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  <Trash2 size={16} />
                  删除词语
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={onClose}
                disabled={busy}
              >
                取消
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "处理中…" : "确认并保存"}
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
