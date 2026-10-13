import { LongTermGoals } from "../components/LongTermGoals";
import { useState, useEffect } from "react";
import { Cloud, BookOpen, Flame, CheckCheck } from "lucide-react";
import { useLearning } from "../app/context";
import { deriveProgress, dateKey, streak } from "../domain/learning";
import { ResetAccount } from "../components/ResetAccount";
import { statusName } from "./Vocabulary";
import { exercises, personalExercises } from "../content/course";
import { cloud } from "../services/cloud";
export function Progress({ onLogin }: { onLogin: () => void }) {
  const { allWords, events, settings, putSettings, account, notify } =
    useLearning();
  const [goal, setGoal] = useState(String(settings.goal));
  useEffect(() => setGoal(String(settings.goal)), [settings.goal]);
  const stats = allWords.map((w) => deriveProgress(events, w.id));
  const learned = stats.filter((p) => p.status !== "new").length;
  const mastered = stats.filter((p) => p.status === "mastered").length;
  const correct = events.filter(
    (e) =>
      e.result === "correct" &&
      !e.assisted &&
      !["known", "restore"].includes(e.mode),
  ).length;
  const days = Array.from(
    { length: 7 },
    (_, i) => Date.now() - (6 - i) * 86400000,
  );
  const counts = days.map(
    (day) => events.filter((e) => dateKey(e.at) === dateKey(day)).length,
  );
  const max = Math.max(5, ...counts);
  async function saveGoal() {
    const n = Number(goal);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      notify("每日目标请输入 1 到 200 之间的整数。");
      setGoal(String(settings.goal));
      return;
    }
    try {
      await putSettings({ ...settings, goal: n });
    } catch {
      notify("目标保存失败。");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVERY SMALL STEP COUNTS</p>
          <h1>看见你的积累。</h1>
          <p className="muted">学习不是一条直线，持续回来就有进步。</p>
        </div>
      </div>
      <div className="stats-row progress-stats">
        <div className="stat-card">
          <span className="stat-icon sage">
            <BookOpen />
          </span>
          <div>
            <span className="stat-number">
              {learned}
              <small> 个</small>
            </span>
            <p>学习过的词语</p>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon peach">
            <Flame />
          </span>
          <div>
            <span className="stat-number">
              {streak(events)}
              <small> 天</small>
            </span>
            <p>连续学习</p>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon lavender">
            <CheckCheck />
          </span>
          <div>
            <span className="stat-number" data-testid="attempt-total">
              {events.length}
            </span>
            <p>有效练习记录</p>
          </div>
        </div>
      </div>
      <LongTermGoals />
      <div className="progress-layout">
        <section className="panel">
          <h2>过去 7 天</h2>
          <p className="muted">每次回忆，都是一次积累。</p>
          <div className="bar-chart" aria-label="过去七天练习次数">
            {days.map((day, i) => (
              <div className="bar-column" key={i}>
                <span>{counts[i]}</span>
                <div className="bar-space">
                  <div
                    className={i === 6 ? "today" : ""}
                    style={{
                      height: `${Math.max(3, (counts[i] / max) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {i === 6
                    ? "今天"
                    : new Intl.DateTimeFormat("zh-CN", {
                        weekday: "short",
                        timeZone: "Asia/Bangkok",
                      }).format(day)}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>词汇掌握情况</h2>
          <div className="mastery-line">
            {Object.entries(statusName).map(([key, label]) => {
              const n = stats.filter((p) => p.status === key).length;
              return (
                <div key={key}>
                  <span className={`status ${key}`}>{label}</span>
                  <b>{n}</b>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${allWords.length ? (n / allWords.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="muted">
            已掌握 {mastered} 个 · 独立答对 {correct} 次
          </p>
        </section>
        <section className="panel">
          <h2>句型单独积累</h2>
          <p className="muted">单词熟悉了，还要练习把它们连起来。</p>
          <div className="pattern-list">
            {[...exercises, ...personalExercises(allWords)].map((ex) => {
              const p = deriveProgress(events, ex.id);
              return (
                <div key={ex.id}>
                  <span>{ex.prompt}</span>
                  <span className={`status ${p.status}`}>
                    {statusName[p.status]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel settings-panel">
          <h2>按你的节奏学习</h2>
          <label>
            每日学习目标
            <input
              aria-label="每日学习目标"
              type="number"
              min="1"
              max="200"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onBlur={() => void saveGoal()}
            />
          </label>
          <p className="muted small-text">
            按每天练习过的不同词语和句型计数，随时可改。
          </p>
          <label>
            默认文字显示
            <select
              value={settings.display}
              onChange={(e) =>
                void putSettings({
                  ...settings,
                  display: e.target.value as typeof settings.display,
                })
              }
            >
              <option value="both">泰文与罗马音并列</option>
              <option value="roman">罗马音优先</option>
              <option value="thai">泰文优先</option>
            </select>
          </label>
          <p className="muted small-text">
            学习日期按泰国时间计算。复习间隔：1、3、7、14、30、60 天。
          </p>
        </section>
      </div>
      <section className="panel sync-panel">
        <div>
          <h2>
            <Cloud size={21} />
            账号与数据
          </h2>
          <p className="muted">
            {account === "guest"
              ? "当前是临时体验：刷新就清空。登录后直接加载云端记录，不会合并体验数据。"
              : "词库、学习记录与目标自动保存到云端。请留意页面顶部的保存状态；断网时尚未保存成功。"}
          </p>
        </div>
        {account === "guest" ? (
          <button className="primary" onClick={onLogin}>
            使用邮箱登录
          </button>
        ) : (
          <div className="button-row">
            <button
              className="secondary"
              onClick={() => void cloud?.auth.signOut()}
            >
              退出登录
            </button>
            <ResetAccount />
          </div>
        )}
      </section>
    </>
  );
}
