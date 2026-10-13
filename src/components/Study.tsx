import { useSpeech } from "../services/speech";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Shuffle,
  Check,
  X,
} from "lucide-react";
import { useLearning } from "../app/context";
import { shuffle, deriveProgress } from "../domain/learning";
import { getMeta, setMeta } from "../data/store";
import type { Word } from "../domain/model";
import { AudioButton, Script } from "./common";
export type Session = {
  ids: string[];
  index: number;
  mode: "cards" | "quiz";
  review: boolean;
};
export function Study({
  session,
  onClose,
  onQuiz,
}: {
  session: Session;
  onClose: () => void;
  onQuiz: (words: Word[]) => void;
}) {
  const { allWords, events, record, account, notify } = useLearning();
  const [ids, setIds] = useState(
    session.ids.filter(
      (id) =>
        allWords.some((w) => w.id === id && w.enrichment !== "pending") &&
        deriveProgress(events, id).status !== "known",
    ),
  );
  const [index, setIndex] = useState(
    Math.min(
      session.ids.slice(0, session.index).filter((id) => ids.includes(id))
        .length,
      Math.max(0, ids.length - 1),
    ),
  );
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [scores, setScores] = useState<{ id: string; correct: boolean }[]>([]);
  const word = allWords.find((w) => w.id === ids[index]);
  useEffect(() => {
    void setMeta(`${account}:session`, {
      ids,
      index,
      mode: session.mode,
      review: session.review,
    });
    setRevealed(false);
  }, [account, ids, index, session.mode, session.review]);
  async function mark(correct: boolean) {
    if (!word || busy) return;
    setBusy(true);
    try {
      const nextIds = correct ? ids.filter((id) => id !== word.id) : ids;
      const nextIndex = correct
        ? Math.min(index, Math.max(0, nextIds.length - 1))
        : index + 1;
      const finished = correct
        ? index >= nextIds.length
        : nextIndex >= ids.length;
      await record(
        word.id,
        "word",
        correct,
        false,
        correct ? "known" : "flashcard",
        {
          key: `${account}:session`,
          value: finished
            ? null
            : {
                ids: nextIds,
                index: nextIndex,
                mode: session.mode,
                review: session.review,
              },
        },
      );
      setScores((s) => [...s, { id: word.id, correct }]);
      if (finished) {
        setDone(true);
        await setMeta(`${account}:session`, null);
      } else {
        setIds(nextIds);
        setIndex(nextIndex);
        setRevealed(false);
      }
    } catch {
      notify("保存失败，本题未跳过，请重试。");
    } finally {
      setBusy(false);
    }
  }
  const difficultIds = [
    ...new Set(scores.filter((s) => !s.correct).map((s) => s.id)),
  ].filter(
    (id) =>
      allWords.some((w) => w.id === id && w.enrichment !== "pending") &&
      deriveProgress(events, id).status !== "known",
  );
  function finish() {
    notify(
      `本次学习完成 ${scores.length} 次回忆，${scores.filter((s) => s.correct).length} 次认识，${scores.filter((s) => !s.correct).length} 次需要多练。`,
    );
    onClose();
  }
  if (done || !word)
    return (
      <div className="study-overlay">
        <div className="study-summary">
          <span className="summary-icon">
            <Check size={38} />
          </span>
          <p className="eyebrow">ONE STEP FURTHER</p>
          <h1>今天，又多懂了一点。</h1>
          <p>
            本次完成 {scores.length} 次回忆 ·{" "}
            {scores.filter((s) => s.correct).length} 次认识
          </p>
          <p className="muted">
            难词会继续安排复习；标记认识的词不再自动出现，可在词库中恢复学习。
          </p>
          <div className="button-row">
            {difficultIds.length > 0 && (
              <button
                className="secondary"
                onClick={() => {
                  setIds(difficultIds);
                  setIndex(0);
                  setDone(false);
                  setScores([]);
                }}
              >
                再练难词
              </button>
            )}
            <button
              className="primary"
              onClick={() =>
                onQuiz(
                  ids
                    .map((id) => allWords.find((w) => w.id === id)!)
                    .filter(Boolean),
                )
              }
            >
              进入测验
            </button>
            <button className="secondary" onClick={finish}>
              完成并返回
            </button>
          </div>
        </div>
      </div>
    );
  return (
    <div className="study-overlay">
      <header className="study-header">
        <button className="text-button" onClick={finish} disabled={busy}>
          <ArrowLeft size={18} />
          结束本次学习
        </button>
        <span>
          {session.review ? "到期复习" : "词汇卡片"} · {index + 1} /{" "}
          {ids.length}
        </span>
        <button
          className="icon-button"
          aria-label="打乱卡片"
          onClick={() => {
            setIds(shuffle(ids));
            setIndex(0);
          }}
        >
          <Shuffle size={20} />
        </button>
      </header>
      <div className="study-progress">
        <span style={{ width: `${((index + 1) / ids.length) * 100}%` }} />
      </div>
      <main className="study-main">
        <p className="eyebrow">LOOK · RECALL · REMEMBER</p>
        <article className="flashcard">
          <div className="flashcard-top">
            <span className="tag">
              {word.pos} ·{" "}
              {word.review === "draft" ? "读音待核对" : "个人已确认"}
            </span>
            <AudioButton text={word.thai} compact />
          </div>
          <Script
            thai={word.thai}
            roman={word.roman}
            className="flash-script"
          />
          {!revealed ? (
            <button className="reveal-button" onClick={() => setRevealed(true)}>
              揭示中文 <RotateCcw size={16} />
            </button>
          ) : (
            <div className="revealed-content">
              <h2>{word.chinese}</h2>
              <p className="pronunciation-note">{word.note}</p>
              {word.example.thai && (
                <div className="example">
                  <span className="tiny-label">放进句子里</span>
                  <p lang="th">{word.example.thai}</p>
                  <p className="roman">{word.example.roman}</p>
                  <p>{word.example.chinese}</p>
                  <AudioButton text={word.example.thai} compact />
                </div>
              )}
              <details>
                <summary>内容来源</summary>
                <p>{word.source}</p>
              </details>
            </div>
          )}
        </article>
        <div className="card-actions">
          <button
            className="secondary"
            disabled={!revealed || busy}
            onClick={() => void mark(false)}
          >
            <RotateCcw size={18} />
            需要多练
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void mark(true)}
          >
            <Check size={18} />
            我认识
          </button>
        </div>
        <div className="card-pagination">
          <button
            disabled={index === 0 || busy}
            onClick={() => setIndex(index - 1)}
          >
            <ArrowLeft size={16} />
            上一张
          </button>
          <span>已认识可直接跳过，不再自动复习。</span>
          <button
            disabled={index === ids.length - 1 || busy}
            onClick={() => setIndex(index + 1)}
          >
            下一张
            <ArrowRight size={16} />
          </button>
        </div>
      </main>
    </div>
  );
}
type QuizMode = "meaning" | "roman" | "listen" | "spelling" | "fill";
const modeNames: Record<QuizMode, string> = {
  meaning: "罗马音 → 中文",
  roman: "中文 → 罗马音",
  listen: "听音辨词",
  spelling: "罗马音 → 泰文",
  fill: "句子填空",
};
export function Quiz({
  words,
  onClose,
}: {
  words: Word[];
  onClose: () => void;
}) {
  const { record, notify } = useLearning();
  const speech = useSpeech();
  const [mode, setMode] = useState<QuizMode>("meaning");
  const [order] = useState(() => shuffle(words));
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const word = order[index];
  const value = (w: Word) =>
    mode === "roman"
      ? w.roman
      : mode === "spelling" || mode === "fill"
        ? w.thai
        : w.chinese;
  const [options, setOptions] = useState<string[]>([]);
  useEffect(() => {
    if (word) {
      const other = [
        ...new Set(words.filter((w) => w.id !== word.id).map(value)),
      ].filter((v) => v !== value(word));
      setOptions(shuffle([value(word), ...shuffle(other).slice(0, 3)]));
      setSelected(null);
    }
  }, [index, mode]);
  if (!word || finished)
    return (
      <div className="study-overlay">
        <div className="study-summary">
          <span className="summary-icon">
            <Check size={38} />
          </span>
          <h1>测验完成</h1>
          <p>
            {score} / {order.length} 题答对
          </p>
          <p className="muted">答错的内容已记入复习记录。</p>
          <button className="primary" onClick={onClose}>
            完成并返回
          </button>
        </div>
      </div>
    );
  async function choose(answer: string) {
    if (selected !== null || busy) return;
    setBusy(true);
    try {
      const correct = answer === value(word);
      await record(word.id, "word", correct, false, mode);
      setSelected(answer);
      if (correct) setScore((s) => s + 1);
    } catch {
      notify("保存失败，请重新选择答案。");
    } finally {
      setBusy(false);
    }
  }
  function next() {
    if (index + 1 === order.length) setFinished(true);
    else setIndex(index + 1);
  }
  const hasVoice = speech.supported && speech.voices.length > 0;
  return (
    <div className="study-overlay">
      <header className="study-header">
        <button className="text-button" onClick={onClose}>
          <X size={18} />
          结束测验
        </button>
        <span>
          {index + 1} / {order.length}
        </span>
        <select
          aria-label="测验题型"
          value={mode}
          disabled={selected !== null || busy}
          onChange={(e) => setMode(e.target.value as QuizMode)}
        >
          {Object.entries(modeNames).map(([id, name]) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </select>
      </header>
      <main className="quiz-main">
        <p className="eyebrow">A MOMENT TO RECALL</p>
        <h1>
          {mode === "listen"
            ? "听一听，选出词义"
            : mode === "fill"
              ? "补全这个句子"
              : "选出对应的表达"}
        </h1>
        <section className="quiz-prompt">
          {mode === "roman" ? (
            <h2>{word.chinese}</h2>
          ) : mode === "listen" ? (
            <>
              <AudioButton text={word.thai} />
              {!hasVoice && (
                <p className="muted">当前无泰语语音，请切换其他题型或跳过。</p>
              )}
            </>
          ) : mode === "fill" ? (
            <>
              <p>{word.example.chinese || word.chinese}</p>
              <p lang="th">
                {word.example.thai.includes(word.thai)
                  ? word.example.thai.replace(word.thai, " ______ ")
                  : "______"}
              </p>
            </>
          ) : (
            <h2 className="roman">{word.roman}</h2>
          )}
        </section>
        <div className="quiz-options">
          {options.map((option, i) => (
            <button
              key={option}
              disabled={
                selected !== null || busy || (mode === "listen" && !hasVoice)
              }
              className={`quiz-option ${selected !== null ? (option === value(word) ? "correct" : option === selected ? "incorrect" : "") : ""}`}
              onClick={() => void choose(option)}
            >
              <span>{i + 1}</span>
              {option}
            </button>
          ))}
        </div>
        {selected !== null && (
          <div
            className={`feedback ${selected === value(word) ? "success" : "error"}`}
          >
            <h3>
              {selected === value(word)
                ? "记住了，很好。"
                : "再记一次，下次会更熟悉。"}
            </h3>
            <p>
              {word.thai} · {word.roman} · {word.chinese}
            </p>
            <p>{word.note}</p>
            <button className="primary" onClick={next}>
              下一题 <ArrowRight size={17} />
            </button>
          </div>
        )}
        {mode === "listen" && !hasVoice && selected === null && (
          <button className="secondary" onClick={next}>
            跳过听力题
          </button>
        )}
      </main>
    </div>
  );
}
export async function savedSession(account: string): Promise<Session | null> {
  return getMeta<Session | null>(`${account}:session`, null);
}
