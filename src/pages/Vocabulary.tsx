import { useState } from "react";
import { Search, ArrowUpRight, Pencil, Plus, Layers } from "lucide-react";
import { useLearning } from "../app/context";
import { units, themeName } from "../content/course";
import { deriveProgress } from "../domain/learning";
import { AudioButton, Empty } from "../components/common";
import type { Word } from "../domain/model";
export const statusName = {
  new: "新词",
  learning: "学习中",
  familiar: "熟悉",
  mastered: "已掌握",
};
export function Vocabulary({
  study,
  quiz,
  onEdit,
}: {
  study: (w: Word[]) => void;
  quiz: (w: Word[]) => void;
  onEdit: (w?: Word) => void;
}) {
  const { allWords, events } = useLearning();
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState("all");
  const [filter, setFilter] = useState("all");
  const words = allWords.filter(
    (w) =>
      (theme === "all" ||
        (theme === "personal"
          ? !w.id.startsWith("course:")
          : w.theme === theme)) &&
      `${w.thai} ${w.roman} ${w.chinese}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "due"
          ? deriveProgress(events, w.id).due
          : deriveProgress(events, w.id).status === filter)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORDS THAT STAY WITH YOU</p>
          <h1>一个词，连接一种表达。</h1>
          <p className="muted">认识、回忆，再把它用进生活里。</p>
        </div>
        <button className="primary" onClick={() => onEdit()}>
          <Plus size={17} />
          添加词语
        </button>
      </div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            placeholder="搜索泰文、罗马音或中文"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="词汇状态"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部状态</option>
          <option value="due">到期复习</option>
          {Object.entries(statusName).map(([s, label]) => (
            <option key={s} value={s}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="tabs">
        {[
          { id: "all", title: "全部词汇" },
          ...units,
          { id: "personal", title: "我的词库" },
        ].map((t) => (
          <button
            key={t.id}
            className={theme === t.id ? "active" : ""}
            onClick={() => setTheme(t.id)}
          >
            {t.title}
          </button>
        ))}
      </div>
      <div className="list-heading">
        <p>
          {words.length} 个词语{" "}
          <span className="muted">· 泰文与罗马音一起记</span>
        </p>
        <div className="button-row">
          <button
            className="secondary small"
            disabled={!words.length}
            onClick={() => study(words)}
          >
            <Layers size={16} />
            学习卡片
          </button>
          <button
            className="primary small"
            disabled={words.length < 2}
            onClick={() => quiz(words)}
          >
            开始测验 <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
      {!words.length ? (
        <Empty
          title="这里还没有词语"
          detail="换个筛选条件，或添加你刚遇到的新词。"
        />
      ) : (
        <div className="word-grid">
          {words.map((w) => {
            const p = deriveProgress(events, w.id);
            return (
              <article className="word-card" key={w.id}>
                <div className="word-card-top">
                  <span className={`status ${p.due ? "due" : p.status}`}>
                    {p.due ? "待复习" : statusName[p.status]}
                  </span>
                  <AudioButton text={w.thai} compact />
                </div>
                <button className="word-learn" onClick={() => study([w])}>
                  <span lang="th">{w.thai}</span>
                  <span className="word-roman">{w.roman}</span>
                  <span className="word-meaning">{w.chinese}</span>
                </button>
                <footer>
                  <span>
                    {themeName(w.theme)}
                    {w.review === "draft" ? " · 待核对" : ""}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`编辑 ${w.thai}`}
                    onClick={() => onEdit(w)}
                  >
                    <Pencil size={16} />
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
