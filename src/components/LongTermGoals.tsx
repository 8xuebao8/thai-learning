import { useEffect, useState } from "react";
import { useLearning } from "../app/context";
import { deriveProgress } from "../domain/learning";
import { longTermSchema, type LongTermGoal } from "../domain/model";
const initial: LongTermGoal = {
  level: "Superior",
  wordTarget: 5000,
  grammarTarget: 100,
  baselineWords: 0,
  grammar: [],
  skills: [],
};
const tasks = {
  Superior: [
    "听懂熟悉专业领域的长篇讨论并概括论点",
    "就抽象话题持续表达、解释理由并回应追问",
    "阅读较复杂文章，区分主旨、细节与作者态度",
    "写出结构清楚的论述，使用合适的连接与语体",
  ],
  Distinguished: [
    "理解复杂语境中的隐含意义、修辞与立场",
    "根据对象灵活调整语体，精准表达细微差别",
    "理解不同文体与文化背景下的复杂文本",
    "面向不同读者写作，准确表达复杂论证与语气",
  ],
};
const skills = ["listening", "speaking", "reading", "writing"];
const labels = ["听力", "口语", "阅读", "写作"];
export function LongTermGoals() {
  const { settings, putSettings, allWords, events, notify, account } =
    useLearning();
  const [draft, setDraft] = useState<LongTermGoal>(
    settings.longTerm ?? initial,
  );
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(settings.longTerm ?? initial);
  }, [settings.longTerm, dirty]);
  const patch = (p: Partial<LongTermGoal>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  };
  const tracked = new Set(
    allWords
      .filter(
        (w) =>
          w.enrichment !== "pending" &&
          ["known", "mastered"].includes(deriveProgress(events, w.id).status),
      )
      .map((w) => w.thai.trim().normalize("NFC")),
  ).size;
  const words = tracked + draft.baselineWords;
  const grammar = new Set(
    draft.grammar
      .filter((g) => g.mastered)
      .map((g) => g.title.trim().normalize("NFC")),
  ).size;
  async function save() {
    setBusy(true);
    try {
      const valid = longTermSchema.parse(draft);
      await putSettings({ ...settings, longTerm: valid });
      setDirty(false);
      notify("总目标已保存，可随时调整。");
    } catch {
      notify("请检查目标数字与语法条目，未保存修改。");
    } finally {
      setBusy(false);
    }
  }
  function add() {
    const clean = title.trim();
    if (!clean) return;
    if (
      draft.grammar.some(
        (g) => g.title.trim().normalize("NFC") === clean.normalize("NFC"),
      )
    ) {
      notify("这个语法点已在清单中。");
      return;
    }
    if (draft.grammar.length >= 500) {
      notify("语法清单最多 500 项。");
      return;
    }
    patch({
      grammar: [
        ...draft.grammar,
        { id: crypto.randomUUID(), title: clean, mastered: false },
      ],
    });
    setTitle("");
  }
  return (
    <section className="panel long-term-goals">
      <p className="eyebrow">YOUR LONG-TERM PLAN</p>
      <h2>我的总目标</h2>
      <p className="muted">
        参考 CU-TFL
        的等级方向制定个人计划。词汇与语法数量是你设定的学习目标，不是官方等级门槛；达到数量不代表通过考试。
      </p>
      <a
        href="https://www.sti.chula.ac.th/operation-service/thai-test/thai-test-for-non-native/cu-tfl-th/"
        target="_blank"
        rel="noreferrer"
      >
        查看 CU-TFL 官方等级说明
      </a>
      <div className="form-grid">
        <label>
          目标等级
          <select
            aria-label="目标等级"
            value={draft.level}
            onChange={(e) =>
              patch({ level: e.target.value as LongTermGoal["level"] })
            }
          >
            <option>Superior</option>
            <option>Distinguished</option>
          </select>
        </label>
        <label>
          词汇总目标
          <input
            aria-label="词汇总目标"
            type="number"
            min="1"
            max="100000"
            value={draft.wordTarget}
            onChange={(e) => patch({ wordTarget: Number(e.target.value) })}
          />
        </label>
        <label>
          语法总目标
          <input
            aria-label="语法总目标"
            type="number"
            min="1"
            max="5000"
            value={draft.grammarTarget}
            onChange={(e) => patch({ grammarTarget: Number(e.target.value) })}
          />
        </label>
        <label>
          站外已认识词汇（自估）
          <input
            aria-label="站外已认识词汇"
            type="number"
            min="0"
            max="100000"
            value={draft.baselineWords}
            onChange={(e) => patch({ baselineWords: Number(e.target.value) })}
          />
        </label>
      </div>
      <p className="muted small-text">
        首次填写的 5000 词、100
        个语法点只是可修改的计划示例，两种等级均不自动套用数量门槛。站外数量请排除本词库已计入的词，避免重复。
      </p>
      <div className="goal-meters">
        <div>
          <strong>
            词汇进度 {words} / {draft.wordTarget}
          </strong>
          <progress
            aria-label="词汇总目标进度"
            max={Math.max(1, draft.wordTarget)}
            value={Math.min(words, draft.wordTarget)}
          />
          <p className="small-text">
            站内已认识／已掌握 {tracked} 词 + 站外自估 {draft.baselineWords}{" "}
            词。相同泰语原词去重，待补全词不计入。
          </p>
        </div>
        <div>
          <strong>
            语法进度 {grammar} / {draft.grammarTarget}
          </strong>
          <progress
            aria-label="语法总目标进度"
            max={Math.max(1, draft.grammarTarget)}
            value={Math.min(grammar, draft.grammarTarget)}
          />
          <p className="small-text">
            按下方不同语法点的“已掌握”自评计数；练习句子数量不等于语法数量。
          </p>
        </div>
      </div>
      <h3>语法清单</h3>
      <div className="button-row">
        <input
          aria-label="新增语法点"
          placeholder="例如：ถ้า…ก็… 条件句"
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button className="secondary" onClick={add}>
          添加语法点
        </button>
      </div>
      {!draft.grammar.length && (
        <p className="muted">添加你要掌握的语法点，学会后勾选。</p>
      )}
      <div className="grammar-checklist">
        {draft.grammar.map((g) => (
          <div key={g.id}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={g.mastered}
                onChange={(e) =>
                  patch({
                    grammar: draft.grammar.map((x) =>
                      x.id === g.id ? { ...x, mastered: e.target.checked } : x,
                    ),
                  })
                }
              />
              {g.title}
            </label>
            <button
              className="text-button"
              aria-label={`移除语法点 ${g.title}`}
              onClick={() =>
                patch({ grammar: draft.grammar.filter((x) => x.id !== g.id) })
              }
            >
              移除
            </button>
          </div>
        ))}
      </div>
      <h3>{draft.level} 能力自评</h3>
      <p className="muted small-text">
        应用提供的练习方向，不是官方评分表，也不自动判定等级。不同等级分别保存勾选。
      </p>
      {tasks[draft.level].map((task, i) => {
        const id = `${draft.level}:${skills[i]}`;
        return (
          <label className="checkbox-label goal-skill" key={id}>
            <input
              type="checkbox"
              checked={draft.skills.includes(id)}
              onChange={(e) =>
                patch({
                  skills: e.target.checked
                    ? [...draft.skills, id]
                    : draft.skills.filter((x) => x !== id),
                })
              }
            />
            <span>
              <b>{labels[i]}：</b>
              {task}
            </span>
          </label>
        );
      })}
      <div className="button-row">
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? "保存中…" : "保存总目标"}
        </button>
        <span className="muted">
          {dirty
            ? "有未保存修改"
            : account === "guest"
              ? "仅本次体验有效，刷新清空"
              : "保存后自动上传云端"}
        </span>
      </div>
    </section>
  );
}
