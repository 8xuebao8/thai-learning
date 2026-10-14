import { SentenceLibrary } from "../components/SentenceLibrary";
import { LibraryTransfer } from "../library-transfer/LibraryTransfer";
import { activeThemes, resolveTheme, catalogFor } from "../domain/themes";
import { useEffect, useState } from "react";
import { ArrowRight, RotateCcw, Undo2, Lightbulb, Eye } from "lucide-react";
import { useLearning } from "../app/context";
import { exercises, personalExercises } from "../content/course";
import { checkAnswer, shuffle } from "../domain/learning";
import { getMeta, setMeta } from "../data/store";
import { AudioButton, Script, Empty } from "../components/common";
export function Sentences() {
  const { account, record, notify, settings, putSettings, allWords } =
    useLearning();
  const catalog = catalogFor(settings, "sentences");
  const [view, setView] = useState<"practice" | "library">("practice");
  const [theme, setTheme] = useState("work");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [assisted, setAssisted] = useState(false);
  const [result, setResult] = useState<"correct" | "wrong" | "reveal" | null>(
    null,
  );
  const [hint, setHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAssist, setShowAssist] = useState(false);
  const topics = activeThemes(catalog).map((t) => ({
    id: t.id,
    title:
      t.id === "personal" && !settings.sentenceThemes && !settings.themes
        ? "我的句子"
        : t.name,
  }));
  const list = [...exercises, ...personalExercises(allWords)].filter(
    (e) => resolveTheme(e.theme, catalog) === resolveTheme(theme, catalog),
  );
  const exercise = list[index % list.length] ?? exercises[0];
  const [bank, setBank] = useState(() => shuffle(exercise.tiles));
  useEffect(() => {
    void getMeta<{ theme: string; index: number } | null>(
      `${account}:sentence`,
      null,
    ).then((s) => {
      if (s && topics.some((u) => u.id === s.theme)) {
        setTheme(s.theme);
        setIndex(s.index);
      }
    });
  }, [account]);
  useEffect(() => {
    setBank(shuffle(exercise.tiles));
    setSelected([]);
    setAssisted(false);
    setResult(null);
    setHint(false);
    setShowAssist(false);
  }, [
    exercise.id,
    JSON.stringify(exercise.tiles),
    JSON.stringify(exercise.answers),
  ]);
  async function submit() {
    if (busy || result === "correct" || result === "reveal") return;
    setBusy(true);
    try {
      const correct = checkAnswer(exercise, selected);
      await record(exercise.id, "sentence", correct, assisted, "sentence");
      setResult(correct ? "correct" : "wrong");
    } catch {
      notify("答案记录保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  async function reveal() {
    if (busy) return;
    setBusy(true);
    try {
      await record(exercise.id, "sentence", false, true, "reveal");
      setAssisted(true);
      setResult("reveal");
    } catch {
      notify("保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  function next() {
    const n = (index + 1) % list.length;
    setIndex(n);
    void setMeta(`${account}:sentence`, { theme, index: n });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PUT YOUR WORDS TO WORK</p>
          <h1>把词语，连成你的表达。</h1>
          <p className="muted">跟着中文提示，用泰语的顺序组织句子。</p>
        </div>
      </div>
      <LibraryTransfer key={`${account}:sentences`} scope="sentences" />
      <div className="tabs" aria-label="拼句页面视图">
        <button
          className={view === "practice" ? "active" : ""}
          onClick={() => setView("practice")}
        >
          拼句练习
        </button>
        <button
          className={view === "library" ? "active" : ""}
          onClick={() => setView("library")}
        >
          管理句库（
          {exercises.length + allWords.filter((w) => w.sentence).length}）
        </button>
      </div>
      {view === "library" ? (
        <SentenceLibrary
          key={account}
          onPractice={(id, targetTheme) => {
            const nextTheme = resolveTheme(targetTheme, catalog);
            const nextList = [
              ...exercises,
              ...personalExercises(allWords),
            ].filter((e) => resolveTheme(e.theme, catalog) === nextTheme);
            const nextIndex = nextList.findIndex((e) => e.id === id);
            if (nextIndex < 0) return;
            setTheme(nextTheme);
            setIndex(nextIndex);
            setView("practice");
            void setMeta(`${account}:sentence`, {
              theme: nextTheme,
              index: nextIndex,
            });
          }}
        />
      ) : (
        <>
          <div className="sentence-toolbar">
            <div className="tabs">
              {topics.map((u) => (
                <button
                  className={
                    resolveTheme(theme, catalog) === u.id ? "active" : ""
                  }
                  key={u.id}
                  onClick={() => {
                    setTheme(u.id);
                    setIndex(0);
                    void setMeta(`${account}:sentence`, {
                      theme: u.id,
                      index: 0,
                    });
                  }}
                >
                  {u.title}
                </button>
              ))}
            </div>
            <select
              aria-label="文字显示模式"
              value={settings.display}
              onChange={(e) =>
                void putSettings({
                  ...settings,
                  display: e.target.value as typeof settings.display,
                })
              }
            >
              <option value="roman">A · 罗马音优先</option>
              <option value="both">B · 泰文与罗马音</option>
              <option value="thai">C · 泰文优先</option>
            </select>
          </div>
          {!list.length ? (
            <Empty
              title="还没有个人句子"
              detail="添加词语或短句时展开“制作拼句练习”，核对分词后即可在这里练习。"
            />
          ) : (
            <section className="sentence-panel">
              <div className="sentence-meta">
                <span className="tag">
                  句型 {(index % list.length) + 1} / {list.length}
                </span>
                <span className="muted">内容待核对</span>
              </div>
              <p className="tiny-label">用泰语表达</p>
              <h2 className="sentence-prompt">{exercise.prompt}</h2>
              <div className="answer-area" aria-label="你的答案">
                {!selected.length && (
                  <span className="answer-placeholder">
                    点击下方词块，组成一句话…
                  </span>
                )}
                {selected.map((id) => {
                  const tile = exercise.tiles.find((t) => t.id === id);
                  if (!tile) return null;
                  return (
                    <button
                      className="tile selected"
                      key={id}
                      disabled={
                        busy || result === "correct" || result === "reveal"
                      }
                      aria-label={`退回词块 ${tile.thai}`}
                      onClick={() => {
                        setSelected(selected.filter((x) => x !== id));
                        setResult(null);
                      }}
                    >
                      <Script
                        thai={tile.thai}
                        roman={tile.roman}
                        controls={false}
                        forceReveal={showAssist}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="answer-tools">
                <button
                  className="text-button"
                  disabled={
                    !selected.length ||
                    busy ||
                    result === "correct" ||
                    result === "reveal"
                  }
                  onClick={() => {
                    setSelected(selected.slice(0, -1));
                    setResult(null);
                  }}
                >
                  <Undo2 size={16} />
                  撤回
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setSelected([]);
                    setResult(null);
                    setAssisted(
                      assisted || result === "correct" || result === "reveal",
                    );
                  }}
                >
                  <RotateCcw size={16} />
                  重置
                </button>
                <button
                  className="text-button"
                  disabled={busy || result === "correct"}
                  onClick={() => {
                    setHint(true);
                    setAssisted(true);
                  }}
                >
                  <Lightbulb size={16} />
                  提示
                </button>
              </div>
              {hint && (
                <div className="hint">
                  从「
                  {
                    exercise.tiles.find(
                      (t) => t.token === exercise.answers[0][0],
                    )?.thai
                  }
                  」开始。{exercise.explanation}
                </div>
              )}
              <button
                className="text-button"
                onClick={() => setShowAssist(!showAssist)}
              >
                {showAssist ? "收起辅助文字" : "展开辅助文字"}
              </button>
              <div className="word-bank" aria-label="词块区">
                {bank.map((tile) => (
                  <button
                    key={tile.id}
                    className="tile"
                    aria-label={`词块 ${tile.thai}`}
                    disabled={
                      selected.includes(tile.id) ||
                      busy ||
                      result === "correct" ||
                      result === "reveal"
                    }
                    onClick={() => {
                      setSelected((s) =>
                        s.includes(tile.id) ? s : [...s, tile.id],
                      );
                      setResult(null);
                    }}
                  >
                    <Script
                      thai={tile.thai}
                      roman={tile.roman}
                      controls={false}
                      forceReveal={showAssist}
                    />
                  </button>
                ))}
              </div>
              <div className="sentence-bottom">
                <button
                  className="text-button"
                  disabled={busy || result === "correct" || result === "reveal"}
                  onClick={() => void reveal()}
                >
                  <Eye size={16} />
                  查看答案
                </button>
                <button
                  className="primary"
                  disabled={
                    !selected.length ||
                    busy ||
                    result === "correct" ||
                    result === "reveal"
                  }
                  onClick={() => void submit()}
                >
                  检查答案 <ArrowRight size={17} />
                </button>
              </div>
              {result && (
                <div
                  className={`feedback ${result === "correct" ? "success" : "error"}`}
                  role="status"
                >
                  <h3>
                    {result === "correct"
                      ? "顺序正确，表达很清楚。"
                      : result === "reveal"
                        ? "看看这句话是怎样组成的。"
                        : "再想一下词语之间的顺序。"}
                  </h3>
                  {(result === "correct" || result === "reveal") && (
                    <>
                      <Script thai={exercise.thai} roman={exercise.roman} />
                      <AudioButton text={exercise.thai} />
                    </>
                  )}
                  <p>{exercise.explanation}</p>
                  {assisted && (
                    <p className="muted">本次使用了辅助，不提升掌握等级。</p>
                  )}
                  <button className="secondary" onClick={next}>
                    下一句 <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </section>
          )}
          <p className="content-note">
            词块按表达单元拆分，不代表泰文通常用空格分词。合理变体按题目已收录的答案判断。
          </p>
        </>
      )}
    </>
  );
}
