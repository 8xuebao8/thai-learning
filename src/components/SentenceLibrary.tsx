import { useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { useLearning } from "../app/context";
import { exercises } from "../content/course";
import {
  activeThemes,
  catalogFor,
  resolveTheme,
  topicName,
} from "../domain/themes";
import type { Word } from "../domain/model";
import { AudioButton, Empty } from "./common";
import { WordEditor } from "./WordEditor";

export function SentenceLibrary({
  onPractice,
}: {
  onPractice: (id: string, theme: string) => void;
}) {
  const { allWords, settings } = useLearning();
  const catalog = catalogFor(settings, "sentences");
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState("all");
  const [source, setSource] = useState("all");
  const [editing, setEditing] = useState<Word | "new" | null>(null);
  const entries = [
    ...exercises.map((e) => ({
      id: e.id,
      thai: e.thai,
      roman: e.roman,
      chinese: e.prompt,
      theme: e.theme,
      word: undefined as Word | undefined,
    })),
    ...allWords
      .filter((w) => w.sentence)
      .map((w) => ({
        id: `sentence:${w.id}`,
        thai: w.thai,
        roman: w.roman,
        chinese: w.chinese,
        theme: w.theme,
        word: w,
      })),
  ];
  const visible = entries.filter(
    (e) =>
      (theme === "all" ||
        resolveTheme(e.theme, catalog) === resolveTheme(theme, catalog)) &&
      (source === "all" || (source === "personal" ? !!e.word : !e.word)) &&
      `${e.thai} ${e.roman} ${e.chinese}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <section aria-label="句库管理">
      <div className="list-heading">
        <div>
          <h2>全部句子</h2>
          <p className="muted">
            共 {entries.length} 句 · 个人 {entries.filter((e) => e.word).length}{" "}
            句 · 内置 {exercises.length} 句
          </p>
        </div>
        <button className="primary" onClick={() => setEditing("new")}>
          <Plus size={17} />
          添加句子
        </button>
      </div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            aria-label="搜索句库"
            placeholder="搜索句子的泰文、罗马音或中文"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="句子来源"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="all">全部来源</option>
          <option value="personal">个人句子</option>
          <option value="builtin">内置示例</option>
        </select>
      </div>
      <div className="tabs">
        {[{ id: "all", name: "全部主题" }, ...activeThemes(catalog)].map(
          (t) => (
            <button
              key={t.id}
              className={
                (theme === "all" ? theme : resolveTheme(theme, catalog)) ===
                t.id
                  ? "active"
                  : ""
              }
              onClick={() => setTheme(t.id)}
            >
              {t.name}
            </button>
          ),
        )}
      </div>
      <p className="muted">
        当前显示 {visible.length}{" "}
        句。个人句子可编辑、删除；内置示例仅供查看和练习。
      </p>
      {!visible.length ? (
        <Empty
          title="没有符合条件的句子"
          detail="试试全部主题、全部来源，或添加新的句子。"
        />
      ) : (
        <div className="word-grid">
          {visible.map((e) => (
            <article className="word-card sentence-library-card" key={e.id}>
              <div className="word-card-top">
                <span className="tag">
                  {e.word ? "个人句子" : "内置示例 · 只读"}
                </span>
                <AudioButton text={e.thai} compact />
              </div>
              <h3 lang="th">{e.thai}</h3>
              <p className="word-roman">{e.roman || "读音待补全"}</p>
              <p>{e.chinese || "中文待补全"}</p>
              <p className="muted">{topicName(e.theme, catalog)}</p>
              <div className="button-row">
                <button
                  className="secondary small"
                  disabled={e.word?.enrichment === "pending"}
                  onClick={() => onPractice(e.id, e.theme)}
                >
                  练习这句
                </button>
                {e.word && (
                  <button
                    className="text-button"
                    aria-label={`编辑句子 ${e.thai}`}
                    onClick={() => setEditing(e.word!)}
                  >
                    <Pencil size={16} />
                    编辑 / 删除
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <WordEditor
          sentenceOnly
          word={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
